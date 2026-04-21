-- Phase 8: Add per-user idempotency guard for daily digest
-- Prevents duplicate digests if cron fires multiple times within the same hour-8 window
-- (e.g. Vercel retry on transient failure).
-- Value is set to today's date in user's local TZ after each successful digest send.
-- NULL means the user has never received a digest or digest was not sent today.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL;
