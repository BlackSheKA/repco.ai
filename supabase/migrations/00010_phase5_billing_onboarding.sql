-- =============================================================================
-- Migration: 00010_phase5_billing_onboarding.sql
-- Purpose: Phase 5 billing + onboarding + growth groundwork
--          - Add onboarding_completed_at + avg_deal_value to users
--          - Add account_burn to credit_type enum
--          - deduct_credits / add_credits RPC functions
--          - conversion_rate column on live_stats
-- Depends on: 00001_enums.sql, 00002_initial_schema.sql
-- Note: Numbered 00010 (not 00007 as originally in plan) because migrations
--       00007-00009 were already applied by earlier phases.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add new columns to users table
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_deal_value integer;

-- ---------------------------------------------------------------------------
-- 2. Add 'account_burn' to credit_type enum
--    Note: ALTER TYPE ADD VALUE must run in its own transaction in some
--    Postgres versions; kept simple here as Supabase applies each statement.
-- ---------------------------------------------------------------------------
ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'account_burn';

-- ---------------------------------------------------------------------------
-- 3. deduct_credits RPC: atomic credit deduction
--    Returns new balance on success, -1 on insufficient funds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_type credit_type,
  p_description text
) RETURNS integer AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE users
  SET credits_balance = credits_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id
    AND credits_balance >= p_amount
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  INSERT INTO credit_transactions (user_id, type, amount, description)
  VALUES (p_user_id, p_type, -p_amount, p_description);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. add_credits RPC: credit pack purchases and monthly grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id uuid,
  p_amount integer,
  p_type credit_type,
  p_description text,
  p_stripe_payment_id text DEFAULT NULL,
  p_pack_size integer DEFAULT NULL
) RETURNS integer AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE users
  SET credits_balance = credits_balance + p_amount,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  INSERT INTO credit_transactions (user_id, type, amount, description, stripe_payment_id, pack_size)
  VALUES (p_user_id, p_type, p_amount, p_description, p_stripe_payment_id, p_pack_size);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 5. Grant execute on RPC functions
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION deduct_credits TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_credits TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Add conversion_rate column to live_stats (for /live public dashboard)
-- ---------------------------------------------------------------------------
ALTER TABLE live_stats ADD COLUMN IF NOT EXISTS conversion_rate numeric(5,2) DEFAULT 0;
