-- =============================================================================
-- Migration: 00027_free_tier_signup.sql
-- Purpose: Phase 19 — free-tier ENUMs, per-plan credit columns, signup_audit
--          table, rewritten handle_new_user trigger granting 250 cr with no
--          trial.
-- Depends on: 00002 (users), 00004 (auth trigger DDL), 00010 (credit_transactions),
--             00015 (previous handle_new_user body — replaced here).
-- Closes: PRIC-04, PRIC-05, PRIC-14
--
-- Phase 19 is ADDITIVE ONLY. Phase 21 owns dropping legacy columns
-- (trial_ends_at, subscription_active, billing_period).
--
-- Note: filename uses 00027 because 00025 (browserbase_columns) and
-- 00026 (phase_18_cookies_preflight) were applied in earlier waves
-- (plan referenced 00025 by name; renumber documented in 19-01-SUMMARY.md).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 1 — New ENUMs (D-01, D-02)
-- -----------------------------------------------------------------------------

CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE public.billing_cycle    AS ENUM ('monthly', 'annual');

-- -----------------------------------------------------------------------------
-- Section 2 — Add new columns + change existing defaults (D-04)
-- credits_included_monthly already exists from 00002 with DEFAULT 500 — only
-- the default is changed here; values are backfilled in Section 3.
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN subscription_plan public.subscription_plan NOT NULL DEFAULT 'free',
  ADD COLUMN billing_cycle     public.billing_cycle,
  ADD COLUMN credits_balance_cap integer NOT NULL DEFAULT 500;

ALTER TABLE public.users ALTER COLUMN credits_included_monthly SET DEFAULT 250;
ALTER TABLE public.users ALTER COLUMN credits_balance         SET DEFAULT 250;

-- Conditional NOT NULL via CHECK (D-02 + RESEARCH Pitfall 2)
ALTER TABLE public.users
  ADD CONSTRAINT users_billing_cycle_required_for_pro
    CHECK (subscription_plan = 'free' OR billing_cycle IS NOT NULL);

-- -----------------------------------------------------------------------------
-- Section 3 — Backfill existing rows (D-06)
-- Pre-launch test data per CLAUDE.md memory project_users_are_test_data.
-- -----------------------------------------------------------------------------

UPDATE public.users
SET
  subscription_plan = 'free',
  billing_cycle = NULL,
  credits_balance_cap = 500,
  credits_included_monthly = 250,
  updated_at = NOW()
WHERE TRUE;

-- -----------------------------------------------------------------------------
-- Section 4 — public.normalize_email() SQL function (D-10, RESEARCH Pattern 5)
-- LANGUAGE sql IMMUTABLE: gmail/googlemail dot+plus normalization.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN split_part(lower(p_email), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '')
           || '@gmail.com'
    ELSE lower(p_email)
  END;
$$;

-- -----------------------------------------------------------------------------
-- Section 5 — public.signup_audit table + RLS (D-10, D-11, RESEARCH Pattern 4)
-- RLS enabled with ZERO policies → all client roles denied.
-- service_role bypasses RLS; trigger writes via SECURITY DEFINER.
-- -----------------------------------------------------------------------------

CREATE TABLE public.signup_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  ip               inet,
  duplicate_flag   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_audit_email_ip
  ON public.signup_audit (email_normalized, ip);

ALTER TABLE public.signup_audit ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: deny-by-default to authenticated/anon roles.

-- -----------------------------------------------------------------------------
-- Section 6 — Replace handle_new_user body (D-07, D-09, D-12)
-- Atomic 3-INSERT trigger: users + credit_transactions + signup_audit.
-- Legacy columns (trial_ends_at, subscription_active, billing_period) are
-- explicitly written to NULL/false/NULL per D-12 (Phase 21 owns drops).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ip         inet := NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet;
  v_normalized text := public.normalize_email(NEW.email);
BEGIN
  -- 1. user row (free plan, 250 cr, NO trial)
  INSERT INTO public.users (
    id, email,
    subscription_plan, billing_cycle,
    credits_balance, credits_balance_cap, credits_included_monthly,
    trial_ends_at, subscription_active, billing_period,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    'free', NULL,
    250, 500, 250,
    NULL, false, NULL,
    NOW(), NOW()
  );

  -- 2. atomic ledger row (double-entry invariant from 00010 / 00015)
  INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
  VALUES (NEW.id, 'monthly_grant', 250, 'Free tier signup grant', NOW());

  -- 3. audit row (PRIC-14). duplicate_flag set if same (email_normalized, ip)
  -- seen before; skipped when ip IS NULL to avoid false positives on OAuth
  -- signups that haven't reached /auth/callback yet.
  INSERT INTO public.signup_audit (user_id, email_normalized, ip, duplicate_flag, created_at)
  VALUES (
    NEW.id,
    v_normalized,
    v_ip,
    EXISTS (
      SELECT 1 FROM public.signup_audit prev
      WHERE prev.email_normalized = v_normalized
        AND prev.ip = v_ip
        AND v_ip IS NOT NULL
        AND prev.user_id <> NEW.id
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;
