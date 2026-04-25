-- =============================================================================
-- Migration: 00020_apify_runs.sql
-- Purpose: Track in-flight Apify actor runs so the monitor crons can fire-and-
--          forget. The async webhook /api/webhooks/apify uses this table to
--          (a) authorize incoming events (only known runIds are honored) and
--          (b) recover zombie runs that Apify never resolved.
-- =============================================================================

CREATE TABLE apify_runs (
  run_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ingested_at TIMESTAMPTZ,
  signal_count INTEGER,
  error TEXT,
  metadata JSONB,

  CONSTRAINT apify_runs_status_chk
    CHECK (status IN ('pending', 'completed', 'failed', 'expired'))
);

CREATE INDEX apify_runs_pending_idx
  ON apify_runs (started_at)
  WHERE status = 'pending';

CREATE INDEX apify_runs_user_idx ON apify_runs (user_id, started_at DESC);

ALTER TABLE apify_runs ENABLE ROW LEVEL SECURITY;

-- Service-role only; no app/user access needed. The webhook + crons run with
-- the service role, and end users never read this table directly.
