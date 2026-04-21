-- =============================================================================
-- Migration: 00011_phase6_linkedin.sql
-- Purpose: Add LinkedIn-specific columns to intent_signals and introduce
--          the connection_request action_type for the two-step outreach flow.
-- Depends on: 00005_phase2_extensions.sql, 00006_phase3_action_engine.sql
-- Plan name: 00008_phase6_linkedin (renumbered to 00011 to avoid collision
--            with existing 00008-00010 migrations on disk at execution time).
-- =============================================================================

-- 1. Extend intent_signals with LinkedIn fields (all nullable; Reddit rows keep NULL)
ALTER TABLE intent_signals
  ADD COLUMN author_headline text,
  ADD COLUMN author_company text,
  ADD COLUMN post_type text,
  ADD COLUMN apify_run_id text;

COMMENT ON COLUMN intent_signals.author_headline IS 'LinkedIn professional headline (e.g., "VP Engineering at Acme"). NULL for Reddit.';
COMMENT ON COLUMN intent_signals.author_company IS 'LinkedIn author company. NULL for Reddit.';
COMMENT ON COLUMN intent_signals.post_type IS 'LinkedIn post type: post or article. NULL for Reddit.';
COMMENT ON COLUMN intent_signals.apify_run_id IS 'Apify run ID for audit correlation (LinkedIn only).';

-- 2. Extend action_type enum with connection_request (Phase 6 two-step LinkedIn flow).
--    Enum ALTER must be outside a transaction on some Postgres versions; Supabase
--    migration runner handles this.
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'connection_request';
