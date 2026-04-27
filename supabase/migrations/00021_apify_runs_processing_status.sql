-- =============================================================================
-- Migration: 00021_apify_runs_processing_status.sql
-- Purpose: Extend apify_runs.status check constraint with 'processing' so the
--          webhook handler can atomically claim a row with a conditional
--          UPDATE before running ingest. Without this, two concurrent webhook
--          deliveries can both pass the SELECT-then-UPDATE pattern and double-
--          ingest / double-classify.
-- =============================================================================

ALTER TABLE apify_runs DROP CONSTRAINT apify_runs_status_chk;

ALTER TABLE apify_runs ADD CONSTRAINT apify_runs_status_chk
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired'));
