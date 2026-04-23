-- =============================================================================
-- Migration: 00017_phase13_linkedin_expansion.sql
-- Purpose:   Phase 13 v1.1 LinkedIn Action Expansion - schema scaffold
-- Depends on: 00014 (daily_connection_limit), 00016 (connected pipeline status)
-- =============================================================================

-- 1. Extend pipeline_status_type with 'unreachable' (per LNKD-06)
--    ALTER TYPE ADD VALUE must run in its own transaction; Supabase migration
--    runner commits each file separately so subsequent DDL sees the new value.
ALTER TYPE public.pipeline_status_type ADD VALUE IF NOT EXISTS 'unreachable';

-- 2. Prospect prescreen columns
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS last_prescreen_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS unreachable_reason text;

COMMENT ON COLUMN public.prospects.last_prescreen_attempt_at IS
  'Last time linkedin-prescreen cron visited this prospect profile.';
COMMENT ON COLUMN public.prospects.unreachable_reason IS
  'Populated ONLY when pipeline_status=unreachable. Values: profile_unreachable, creator_mode_no_connect, security_checkpoint. Must NOT be set when pipeline_status=connected (use prescreen telemetry in job_logs for the already_connected case instead).';

-- 3. social_accounts per-action daily limits (LinkedIn-specific defaults)
--    daily_dm_limit already exists (Phase 3, default 8); retained as-is.
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS daily_follow_limit integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS daily_like_limit integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS daily_comment_limit integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.social_accounts.daily_follow_limit IS 'Default 15. LinkedIn Follow actions per day.';
COMMENT ON COLUMN public.social_accounts.daily_like_limit   IS 'Default 25. LinkedIn Like reactions per day.';
COMMENT ON COLUMN public.social_accounts.daily_comment_limit IS 'Default 10. LinkedIn Comment (public_reply on linkedin) per day.';

-- 4. action_counts per-action counter columns
ALTER TABLE public.action_counts
  ADD COLUMN IF NOT EXISTS follow_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.action_counts.follow_count IS 'LinkedIn follow actions count today (Reddit still uses engage_count).';
COMMENT ON COLUMN public.action_counts.like_count   IS 'LinkedIn like reactions count today (Reddit still uses engage_count).';
COMMENT ON COLUMN public.action_counts.comment_count IS 'LinkedIn comment count today (public_reply on linkedin).';

-- 5. Replace check_and_increment_limit to route per (platform, action_type)
--    Column identifiers passed to format(%I) come ONLY from a fixed IF/ELSIF
--    whitelist — never from user input. Safe against SQL injection (T-13-05-02).
CREATE OR REPLACE FUNCTION public.check_and_increment_limit(
  p_account_id uuid,
  p_action_type text
)
RETURNS boolean AS $$
DECLARE
  v_current integer;
  v_limit   integer;
  v_column  text;
  v_limit_column text;
  v_platform text;
BEGIN
  SELECT platform INTO v_platform FROM public.social_accounts WHERE id = p_account_id;

  IF v_platform = 'linkedin' THEN
    -- LinkedIn: per-action counter columns + per-action limit columns
    IF    p_action_type = 'like'               THEN v_column := 'like_count';       v_limit_column := 'daily_like_limit';
    ELSIF p_action_type = 'follow'             THEN v_column := 'follow_count';     v_limit_column := 'daily_follow_limit';
    ELSIF p_action_type = 'public_reply'       THEN v_column := 'comment_count';    v_limit_column := 'daily_comment_limit';
    ELSIF p_action_type IN ('dm','followup_dm') THEN v_column := 'dm_count';        v_limit_column := 'daily_dm_limit';
    ELSIF p_action_type = 'connection_request' THEN v_column := 'connection_count'; v_limit_column := 'daily_connection_limit';
    ELSE RETURN false;
    END IF;
  ELSE
    -- Reddit (legacy behavior — engage_count lumps like+follow)
    IF    p_action_type IN ('like','follow')   THEN v_column := 'engage_count';    v_limit_column := 'daily_engage_limit';
    ELSIF p_action_type = 'public_reply'       THEN v_column := 'reply_count';     v_limit_column := 'daily_reply_limit';
    ELSIF p_action_type IN ('dm','followup_dm') THEN v_column := 'dm_count';       v_limit_column := 'daily_dm_limit';
    ELSE RETURN false;
    END IF;
  END IF;

  INSERT INTO public.action_counts (account_id, date, dm_count, engage_count, reply_count, connection_count, follow_count, like_count, comment_count)
  VALUES (p_account_id, CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0)
  ON CONFLICT (account_id, date) DO NOTHING;

  EXECUTE format(
    'SELECT %I FROM public.action_counts WHERE account_id = $1 AND date = CURRENT_DATE FOR UPDATE',
    v_column
  ) INTO v_current USING p_account_id;

  EXECUTE format(
    'SELECT %I FROM public.social_accounts WHERE id = $1',
    v_limit_column
  ) INTO v_limit USING p_account_id;

  IF v_current IS NULL OR v_limit IS NULL THEN RETURN false; END IF;
  IF v_current >= v_limit THEN RETURN false; END IF;

  EXECUTE format(
    'UPDATE public.action_counts SET %I = %I + 1 WHERE account_id = $1 AND date = CURRENT_DATE',
    v_column, v_column
  ) USING p_account_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 6. Index for prescreen batch claim
CREATE INDEX IF NOT EXISTS idx_prospects_linkedin_prescreen
  ON public.prospects (platform, pipeline_status, last_prescreen_attempt_at)
  WHERE platform = 'linkedin' AND pipeline_status = 'new';
