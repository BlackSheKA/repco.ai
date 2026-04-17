-- =============================================================================
-- Migration: 00005_phase2_extensions.sql
-- Purpose: Add columns needed for Phase 2 intent feed display and soft-dismiss
-- Depends on: 00002_initial_schema.sql (intent_signals table)
-- =============================================================================

ALTER TABLE intent_signals
  ADD COLUMN subreddit text,
  ADD COLUMN dismissed_at timestamptz,
  ADD COLUMN classification_status text NOT NULL DEFAULT 'completed';
-- classification_status values: 'completed', 'pending', 'failed'

COMMENT ON COLUMN intent_signals.subreddit IS 'Display name of the subreddit (e.g., r/SaaS)';
COMMENT ON COLUMN intent_signals.dismissed_at IS 'Soft dismiss timestamp; NULL means visible in feed';
COMMENT ON COLUMN intent_signals.classification_status IS 'Sonnet classification status: pending, completed, failed';
