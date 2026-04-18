-- =============================================================================
-- Migration: 00006_phase3_action_engine.sql
-- Purpose: Phase 3 action engine: expired enum, claim_action RPC,
--          daily limit RPC, target isolation, cooldown tracking, realtime
-- Depends on: 00001_enums.sql, 00002_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add 'expired' value to action_status_type enum
-- ---------------------------------------------------------------------------
ALTER TYPE action_status_type ADD VALUE IF NOT EXISTS 'expired';

-- ---------------------------------------------------------------------------
-- 2. Target isolation: unique index on prospects
--    (assigned_account_id column already exists from 00002)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_target_isolation
  ON prospects (user_id, handle, platform)
  WHERE assigned_account_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Add daily_reply_limit column to social_accounts (needed for ACTN-09)
-- ---------------------------------------------------------------------------
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS daily_reply_limit integer DEFAULT 5;

-- ---------------------------------------------------------------------------
-- 4. Add cooldown_until column to social_accounts (ABAN-07)
-- ---------------------------------------------------------------------------
ALTER TABLE social_accounts
  ADD COLUMN IF NOT EXISTS cooldown_until timestamptz;

-- ---------------------------------------------------------------------------
-- 5. Add screenshot_url column to actions (ACTN-07)
-- ---------------------------------------------------------------------------
ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS screenshot_url text;

-- ---------------------------------------------------------------------------
-- 6. claim_action RPC: atomic action claiming with FOR UPDATE SKIP LOCKED
--    (ACTN-06)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_action(p_action_id uuid)
RETURNS SETOF actions AS $$
  UPDATE actions
  SET status = 'executing', executed_at = now()
  WHERE id = (
    SELECT id FROM actions
    WHERE id = p_action_id
    AND status = 'approved'
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- ---------------------------------------------------------------------------
-- 7. check_and_increment_limit RPC: atomic daily limit checking (ACTN-09)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_and_increment_limit(
  p_account_id uuid,
  p_action_type text
)
RETURNS boolean AS $$
DECLARE
  v_current integer;
  v_limit integer;
  v_column text;
BEGIN
  -- Determine which column to check
  IF p_action_type IN ('like', 'follow') THEN
    v_column := 'engage_count';
  ELSIF p_action_type = 'public_reply' THEN
    v_column := 'reply_count';
  ELSIF p_action_type IN ('dm', 'followup_dm') THEN
    v_column := 'dm_count';
  ELSE
    RETURN false;
  END IF;

  -- Upsert today's row
  INSERT INTO action_counts (account_id, date, dm_count, engage_count, reply_count)
  VALUES (p_account_id, CURRENT_DATE, 0, 0, 0)
  ON CONFLICT (account_id, date) DO NOTHING;

  -- Check limit and increment if within bounds
  IF v_column = 'dm_count' THEN
    SELECT dm_count INTO v_current
    FROM action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_dm_limit INTO v_limit
    FROM social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE action_counts SET dm_count = dm_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;
  ELSIF v_column = 'engage_count' THEN
    SELECT engage_count INTO v_current
    FROM action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_engage_limit INTO v_limit
    FROM social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE action_counts SET engage_count = engage_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;
  ELSIF v_column = 'reply_count' THEN
    SELECT reply_count INTO v_current
    FROM action_counts
    WHERE account_id = p_account_id AND date = CURRENT_DATE
    FOR UPDATE;
    SELECT daily_reply_limit INTO v_limit
    FROM social_accounts WHERE id = p_account_id;
    IF v_current >= v_limit THEN RETURN false; END IF;
    UPDATE action_counts SET reply_count = reply_count + 1
    WHERE account_id = p_account_id AND date = CURRENT_DATE;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ---------------------------------------------------------------------------
-- 8. Enable Supabase Realtime for actions table
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE actions;
