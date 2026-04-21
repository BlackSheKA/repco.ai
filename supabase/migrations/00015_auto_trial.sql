-- =============================================================================
-- Migration: 00015_auto_trial.sql
-- Purpose: Auto-activate 3-day free trial on signup via DB trigger + backfill
--          existing users who never received a trial
-- Depends on: 00004_auth_trigger.sql (handle_new_user trigger already exists),
--             00010_phase5_billing_onboarding.sql (trial_ends_at, credits_balance,
--             credit_transactions table)
-- Closes: BILL-01 — trial_ends_at was never set for users who skipped /billing
-- =============================================================================

-- =============================================================================
-- Part 1: Replace handle_new_user() to atomically provision free trial on signup
-- The trigger on_auth_user_created already exists (created in 00004) and
-- continues to fire on auth.users INSERT — only the function body is replaced.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Insert the user row with trial_ends_at and credits_balance set atomically
  INSERT INTO public.users (id, email, trial_ends_at, credits_balance, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NOW() + INTERVAL '3 days',
    500,
    NOW(),
    NOW()
  );

  -- Insert matching credit_transactions row so the ledger stays consistent
  -- (double-entry: users.credits_balance + credit_transactions row together)
  INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
  VALUES (
    NEW.id,
    'monthly_grant',
    500,
    'Free trial credits',
    NOW()
  );

  RETURN NEW;
END;
$$;

-- =============================================================================
-- Part 2: One-time backfill UPDATE for existing users who never received a trial
-- Targets only users with trial_ends_at IS NULL and subscription_active = false.
-- Uses GREATEST to avoid lowering any balance that was manually granted.
-- =============================================================================

UPDATE public.users
SET
  trial_ends_at = NOW() + INTERVAL '3 days',
  credits_balance = GREATEST(credits_balance, 500),
  updated_at = NOW()
WHERE trial_ends_at IS NULL
  AND subscription_active = false;

-- =============================================================================
-- Part 3: Insert credit_transactions rows for the backfilled users
-- Matches the same set touched by Part 2 via a narrow updated_at window.
-- ON CONFLICT DO NOTHING makes this idempotent on re-runs.
-- =============================================================================

INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
SELECT id, 'monthly_grant', 500, 'Trial backfill', NOW()
FROM public.users
WHERE trial_ends_at IS NOT NULL
  AND subscription_active = false
  AND updated_at >= NOW() - INTERVAL '5 seconds'
ON CONFLICT DO NOTHING;
