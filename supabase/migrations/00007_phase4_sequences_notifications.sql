-- Phase 4: Sequences + Reply Detection + Notifications

-- 1. Add 'cancelled' to action_status_type enum
ALTER TYPE action_status_type ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Add sequence tracking columns to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sequence_stopped boolean DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_snippet text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS replied_detected_at timestamptz;

-- 3. Add auto-send preference to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_send_followups boolean DEFAULT false;

-- 4. Add timezone to users (for daily digest scheduling)
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- 5. Add inbox check tracking to social_accounts
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS last_inbox_check_at timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS consecutive_inbox_failures integer DEFAULT 0;

-- 6. Enable Supabase Realtime for prospects table (for reply events)
ALTER PUBLICATION supabase_realtime ADD TABLE prospects;

-- 7. Index for follow-up scheduler queries
CREATE INDEX IF NOT EXISTS idx_prospects_sequence_active
  ON prospects (user_id, pipeline_status)
  WHERE pipeline_status = 'contacted' AND sequence_stopped = false;

-- 8. Index for follow-up actions by prospect
CREATE INDEX IF NOT EXISTS idx_actions_prospect_followup
  ON actions (prospect_id, action_type, status)
  WHERE action_type = 'followup_dm';
