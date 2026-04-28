-- =============================================================================
-- Migration: 00022_monitoring_signals_unique.sql
-- Purpose: Enforce uniqueness of (user_id, signal_type, value) for active
--          monitoring sources at the DB level. The settings-actions dedup
--          SELECT can silently fail (RLS, network, schema drift); without
--          a UNIQUE constraint a duplicate INSERT would succeed and the
--          cron would burn 2x Apify quota on the same source.
-- =============================================================================

-- Partial index so soft-deleted (active=false) rows don't block re-adding.
CREATE UNIQUE INDEX monitoring_signals_user_type_value_unique
  ON monitoring_signals (user_id, signal_type, value)
  WHERE active = true;
