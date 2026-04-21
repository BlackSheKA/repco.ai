-- =============================================================================
-- Migration: 00014_phase10_linkedin_limits_and_credits.sql
-- Purpose:   Add LinkedIn connection request daily limits and update the
--            check_and_increment_limit RPC to support connection_request.
-- Depends on: 00006_phase3_action_engine.sql (check_and_increment_limit)
--             00011_phase6_linkedin.sql (connection_request enum value)
-- =============================================================================

-- 1. Add daily_connection_limit column to social_accounts
--    Default 20: stays well below LinkedIn's ~100-pending-invites soft cap
--    even over a rolling week; randomized delays (ABAN-03) spread them further.
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS daily_connection_limit integer NOT NULL DEFAULT 20;

COMMENT ON COLUMN public.social_accounts.daily_connection_limit IS
  'Max LinkedIn connection requests per day per account. Default 20.';

-- 2. Add connection_count column to action_counts
--    Tracks daily connection requests sent; enforced by check_and_increment_limit.
ALTER TABLE public.action_counts
  ADD COLUMN IF NOT EXISTS connection_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.action_counts.connection_count IS
  'Number of LinkedIn connection requests sent today for this account.';

-- 3. Replace check_and_increment_limit to handle connection_request
--    Uses CREATE OR REPLACE — safe to re-run; existing callers unaffected.
CREATE OR REPLACE FUNCTION check_and_increment_limit(
  p_account_id uuid,
  p_action_type text
)
RETURNS boolean AS $$
DECLARE
  v_current integer;
  v_limit   integer;
  v_column  text;
BEGIN
  -- Map action type to the tracking column
  IF p_action_type IN ('like', 'follow') THEN
    v_column := 'engage_count';
  ELSIF p_action_type = 'public_reply' THEN
    v_column := 'reply_count';
  ELSIF p_action_type IN ('dm', 'followup_dm') THEN
    v_column := 'dm_count';
  ELSIF p_action_type = 'connection_request' THEN
    v_column := 'connection_count';
  ELSE
    RETURN false;
  END IF;

  -- Upsert today's row (now includes connection_count)
  INSERT INTO public.action_counts (account_id, date, dm_count, engage_count, reply_count, connection_count)
  VALUES (p_account_id, CURRENT_DATE, 0, 0, 0, 0)
  ON CONFLICT (account_id, date) DO NOTHING;

  -- Check limit and increment atomically
  IF v_column = 'dm_count' THEN
    SELECT dm_count INTO v_current
    FROM public.action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_dm_limit INTO v_limit
    FROM public.social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE public.action_counts SET dm_count = dm_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;

  ELSIF v_column = 'engage_count' THEN
    SELECT engage_count INTO v_current
    FROM public.action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_engage_limit INTO v_limit
    FROM public.social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE public.action_counts SET engage_count = engage_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;

  ELSIF v_column = 'reply_count' THEN
    SELECT reply_count INTO v_current
    FROM public.action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_reply_limit INTO v_limit
    FROM public.social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE public.action_counts SET reply_count = reply_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;

  ELSIF v_column = 'connection_count' THEN
    SELECT connection_count INTO v_current
    FROM public.action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_connection_limit INTO v_limit
    FROM public.social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE public.action_counts SET connection_count = connection_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
