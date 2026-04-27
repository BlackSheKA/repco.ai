-- Phase 18 — Cookies Persistence + Preflight + Ban Detection
-- 1. Extend health_status_type ENUM with two new values (logged-out + captcha paths)
-- 2. Extend job_type ENUM with 'account_warning_email' (used by send-account-warning debounce)
-- 3. Add browser_profiles.cookies_jar JSONB (backup/audit; Browserbase contexts auto-persist
--    cookies post Phase 17.5, so this column is now optional storage for backup/audit only)
-- 4. Add social_accounts.last_preflight_at + last_preflight_status (1h cache for Reddit about.json preflight)
--
-- Sequence note: Plan referenced 00025 but Phase 17.5 already took 00025_browserbase_columns.sql;
-- this migration is renumbered to 00026.
--
-- ALTER TYPE ADD VALUE notes (per RESEARCH §5 + L-2):
-- - Supabase migration runner commits each migration file separately, so the new
--   ENUM values are referenceable from runtime code after this migration ships.
-- - DO NOT add any UPDATE/INSERT in this same file that references the new values.

-- 1. health_status_type — add 'needs_reconnect' and 'captcha_required'
ALTER TYPE public.health_status_type ADD VALUE IF NOT EXISTS 'needs_reconnect';
ALTER TYPE public.health_status_type ADD VALUE IF NOT EXISTS 'captcha_required';

-- 2. job_type — add 'account_warning_email' for the 24h email-debounce dedup query
ALTER TYPE public.job_type ADD VALUE IF NOT EXISTS 'account_warning_email';

-- 3. browser_profiles.cookies_jar — full Chromium-format cookie array, NULL = never saved
--    Post Phase 17.5 (Browserbase): cookies are owned by the Browserbase context
--    (browserSettings.context.persist=true). This column is retained for optional
--    backup/audit snapshots; runtime cookie restore is handled by Browserbase contexts.
ALTER TABLE public.browser_profiles
  ADD COLUMN IF NOT EXISTS cookies_jar JSONB DEFAULT NULL;

COMMENT ON COLUMN public.browser_profiles.cookies_jar IS
  'Optional backup/audit snapshot of browser cookies. Runtime cookie persistence is handled by Browserbase contexts (browserSettings.context.persist=true) post Phase 17.5. NULL = no snapshot.';

-- 4. social_accounts preflight cache (1h TTL — see CONTEXT.md D-08)
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS last_preflight_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_preflight_status TEXT;

COMMENT ON COLUMN public.social_accounts.last_preflight_at IS
  'Timestamp of last reddit-preflight (about.json) check. Worker skips fetch when last_preflight_at > now() - interval ''1 hour'' AND last_preflight_status = ''ok''.';

COMMENT ON COLUMN public.social_accounts.last_preflight_status IS
  'Result of last reddit-preflight check: ''ok'' | ''banned'' | ''transient''. Drives the 1h cache short-circuit in worker.ts.';
