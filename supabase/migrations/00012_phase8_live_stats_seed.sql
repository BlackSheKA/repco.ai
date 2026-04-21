-- Phase 8: Seed the single live_stats row used by /api/cron/refresh-live-stats
-- The cron always UPSERTs on this fixed id so the table never grows beyond one row.
-- /api/live reads with .order("updated_at", desc).limit(1) — compatible with single row.

INSERT INTO live_stats (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
