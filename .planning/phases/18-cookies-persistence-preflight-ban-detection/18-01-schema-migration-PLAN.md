---
phase: 18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/00025_phase_18_cookies_preflight.sql
autonomous: true
requirements:
  - BPRX-07
  - BPRX-08
must_haves:
  truths:
    - "browser_profiles has a nullable cookies_jar JSONB column"
    - "social_accounts has nullable last_preflight_at TIMESTAMPTZ and last_preflight_status TEXT columns"
    - "health_status_type ENUM contains 'needs_reconnect' and 'captcha_required' in addition to existing values"
    - "job_type ENUM contains 'account_warning_email'"
    - "Migration applied to dev branch effppfiphrykllkpkdbv with all DDL committed"
  artifacts:
    - path: "supabase/migrations/00025_phase_18_cookies_preflight.sql"
      provides: "All Phase 18 schema changes (columns + ENUM extensions)"
      contains: "ALTER TYPE health_status_type ADD VALUE IF NOT EXISTS 'needs_reconnect'"
  key_links:
    - from: "Phase 18 runtime code (Plans 02 + 03)"
      to: "new ENUM values + columns"
      via: "DB column reads/writes after migration commits on dev branch"
      pattern: "health_status='needs_reconnect'|health_status='captcha_required'|cookies_jar|last_preflight_"
---

<objective>
Apply the single Phase 18 schema migration that lands cookies persistence storage, the Reddit preflight cache columns, and the new ENUM values consumed by Plans 02 and 03.

Purpose: Plans 02 and 03 cannot compile (TypeScript types regenerate from migration files but runtime queries fail without applied DDL) without these columns and ENUM values existing in the dev database.

Output: One migration file `00025_phase_18_cookies_preflight.sql` committed to disk AND applied to the dev branch `effppfiphrykllkpkdbv`. All ENUM ranges and column lists verified by post-apply SQL probes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-CONTEXT.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md

<interfaces>
<!-- Existing schema this migration extends -->

From supabase/migrations/00001_enums.sql:10:
```sql
CREATE TYPE health_status_type AS ENUM ('warmup', 'healthy', 'warning', 'cooldown', 'banned');
```

From supabase/migrations/00001_enums.sql:28:
```sql
CREATE TYPE job_type AS ENUM ('monitor', 'action', 'reply_check');
```

From supabase/migrations/00023_browser_profiles.sql (Phase 15) — `browser_profiles` table already exists with `(id uuid PK, user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name, created_at)` and RLS enabled.

`social_accounts` already references `browser_profile_id` FK (Phase 15) and has existing `health_status` column of type `health_status_type`.

Analog for ALTER TYPE pattern — supabase/migrations/00017_phase13_linkedin_expansion.sql:7-10:
```sql
-- ALTER TYPE ADD VALUE must run in its own transaction; Supabase migration
-- runner commits each file separately so subsequent DDL sees the new value.
ALTER TYPE public.pipeline_status_type ADD VALUE IF NOT EXISTS 'unreachable';
```

Analog for ADD COLUMN + COMMENT pattern — supabase/migrations/00017_phase13_linkedin_expansion.sql:12-20:
```sql
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS last_prescreen_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS unreachable_reason text;

COMMENT ON COLUMN public.prospects.last_prescreen_attempt_at IS
  'Last time linkedin-prescreen cron visited this prospect profile.';
```
</interfaces>

<critical_constraints>
- Migration file number is `00025` — `00024` is taken by Phase 16-01 mechanism_costs (verified via `ls supabase/migrations/`).
- L-2 (RESEARCH §12): NO `UPDATE` or `INSERT` statements that USE the new ENUM values in the same migration file. ALTER TYPE values become referenceable only after the migration commits.
- CLAUDE.md §Environments: dev branch first; never destructive SQL on prod. Dev branch ref: `effppfiphrykllkpkdbv`.
- CLAUDE.md §Critical Rules: dev branch must NOT be deleted/recreated (memory `feedback_dev_branch_no_touch`).
- Use `--ssl-no-revoke` with curl on Windows when calling Supabase Management API (memory `reference_supabase_management_api`).
- ENUM name is `job_type` (NOT `job_type_enum`) — verified via grep of `00001_enums.sql:28`. RESEARCH §10 left this open; this plan locks `job_type`.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author migration 00025_phase_18_cookies_preflight.sql</name>
  <read_first>
    - supabase/migrations/00001_enums.sql (confirm existing health_status_type values + job_type values)
    - supabase/migrations/00017_phase13_linkedin_expansion.sql (ALTER TYPE + ADD COLUMN pattern reference, lines 7-20)
    - supabase/migrations/00023_browser_profiles.sql (browser_profiles table shape — column we're adding to)
    - supabase/migrations/00024_mechanism_costs.sql (confirms 00024 taken; next is 00025)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §5, §6, §10 (ENUM + sequencing + job_type extension rationale)
  </read_first>
  <files>supabase/migrations/00025_phase_18_cookies_preflight.sql</files>
  <action>
Create exactly this file content. Use kebab-case `IF NOT EXISTS` clauses so the migration is idempotent on re-apply.

```sql
-- Phase 18 — Cookies Persistence + Preflight + Ban Detection
-- 1. Extend health_status_type ENUM with two new values (logged-out + captcha paths)
-- 2. Extend job_type ENUM with 'account_warning_email' (used by send-account-warning debounce)
-- 3. Add browser_profiles.cookies_jar JSONB (saved at end of every worker session)
-- 4. Add social_accounts.last_preflight_at + last_preflight_status (1h cache for Reddit about.json preflight)
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
ALTER TABLE public.browser_profiles
  ADD COLUMN IF NOT EXISTS cookies_jar JSONB DEFAULT NULL;

COMMENT ON COLUMN public.browser_profiles.cookies_jar IS
  'GoLogin browser cookie jar saved via GET /browser/{id}/cookies after every worker session. Restored via POST /browser/{id}/cookies before connectToProfile on next session. NULL = never saved (fresh-login required).';

-- 4. social_accounts preflight cache (1h TTL — see CONTEXT.md D-08)
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS last_preflight_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_preflight_status TEXT;

COMMENT ON COLUMN public.social_accounts.last_preflight_at IS
  'Timestamp of last reddit-preflight (about.json) check. Worker skips fetch when last_preflight_at > now() - interval ''1 hour'' AND last_preflight_status = ''ok''.';

COMMENT ON COLUMN public.social_accounts.last_preflight_status IS
  'Result of last reddit-preflight check: ''ok'' | ''banned'' | ''transient''. Drives the 1h cache short-circuit in worker.ts.';
```

Do not add a CREATE INDEX, RLS change, or any UPDATE in this file. RLS on `browser_profiles` and `social_accounts` already enforced via Phase 15.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('supabase/migrations/00025_phase_18_cookies_preflight.sql','utf8');const checks=[/ALTER TYPE public\.health_status_type ADD VALUE IF NOT EXISTS 'needs_reconnect'/, /ALTER TYPE public\.health_status_type ADD VALUE IF NOT EXISTS 'captcha_required'/, /ALTER TYPE public\.job_type ADD VALUE IF NOT EXISTS 'account_warning_email'/, /ADD COLUMN IF NOT EXISTS cookies_jar JSONB/, /ADD COLUMN IF NOT EXISTS last_preflight_at TIMESTAMPTZ/, /ADD COLUMN IF NOT EXISTS last_preflight_status TEXT/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}if(/UPDATE\s+|INSERT\s+INTO/i.test(s)){console.error('FORBIDDEN UPDATE/INSERT in migration');process.exit(1);}console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - File `supabase/migrations/00025_phase_18_cookies_preflight.sql` exists
    - Contains exactly three `ALTER TYPE ... ADD VALUE IF NOT EXISTS` statements (`'needs_reconnect'`, `'captcha_required'`, `'account_warning_email'`)
    - Contains `ADD COLUMN IF NOT EXISTS cookies_jar JSONB DEFAULT NULL` on `browser_profiles`
    - Contains `ADD COLUMN IF NOT EXISTS last_preflight_at TIMESTAMPTZ` and `ADD COLUMN IF NOT EXISTS last_preflight_status TEXT` on `social_accounts`
    - Contains NO `UPDATE` or `INSERT INTO` statements (per RESEARCH L-2)
    - `pnpm typecheck` continues to pass (this file is .sql, not TS, so no compile impact)
  </acceptance_criteria>
  <done>Migration file exists on disk with all six DDL statements and zero UPDATE/INSERT statements; verify command exits 0.</done>
</task>

<task type="auto">
  <name>Task 2 [BLOCKING]: Apply migration 00025 to dev branch effppfiphrykllkpkdbv via Supabase Management API</name>
  <read_first>
    - supabase/migrations/00025_phase_18_cookies_preflight.sql (the file just authored)
    - CLAUDE.md §Environments + §Critical Rules
    - Memory `reference_supabase_management_api` (curl recipe + Windows --ssl-no-revoke flag)
    - Memory `feedback_dev_branch_no_touch` (do NOT delete/recreate the dev branch)
  </read_first>
  <files>supabase/migrations/00025_phase_18_cookies_preflight.sql</files>
  <action>
Apply the migration to dev branch `effppfiphrykllkpkdbv` via the Supabase Management API (PAT in `SUPABASE_ACCESS_TOKEN` env var; on Windows use curl with `--ssl-no-revoke`).

Step 1 — Apply migration. Use the Management API `query` endpoint to execute the migration body (each ALTER TYPE statement runs cleanly because Supabase commits per-file). Reference recipe: `reference_supabase_management_api` memory.

```bash
# Read SQL file content into a JSON-safe payload, then POST to:
# https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query
# Body: { "query": "<full sql>" }
# Header: Authorization: Bearer $SUPABASE_ACCESS_TOKEN
# Header: Content-Type: application/json
```

Step 2 — Probe ENUM range:
```sql
SELECT enum_range(NULL::health_status_type);
-- expect: {warmup,healthy,warning,cooldown,banned,needs_reconnect,captcha_required}
SELECT enum_range(NULL::job_type);
-- expect: {monitor,action,reply_check,account_warning_email}
```

Step 3 — Probe column existence:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='browser_profiles' AND column_name='cookies_jar';
-- expect 1 row, jsonb

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='social_accounts'
  AND column_name IN ('last_preflight_at','last_preflight_status');
-- expect 2 rows
```

DO NOT apply to production. DO NOT delete or recreate the dev branch — only apply DDL on top of the existing branch.

If the API returns an error mentioning the value already exists, that's tolerated (idempotent IF NOT EXISTS clauses) — re-run the probes to confirm state.
  </action>
  <verify>
    <automated>echo "Probe 1 — health_status_type ENUM range" && curl -sS --ssl-no-revoke -X POST "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"SELECT enum_range(NULL::health_status_type)::text AS r"}' | grep -E 'needs_reconnect.*captcha_required' && echo "Probe 2 — job_type ENUM range" && curl -sS --ssl-no-revoke -X POST "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"SELECT enum_range(NULL::job_type)::text AS r"}' | grep 'account_warning_email' && echo "Probe 3 — cookies_jar column" && curl -sS --ssl-no-revoke -X POST "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_schema=''public'' AND table_name=''browser_profiles'' AND column_name=''cookies_jar''"}' | grep cookies_jar && echo "Probe 4 — last_preflight columns" && curl -sS --ssl-no-revoke -X POST "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_schema=''public'' AND table_name=''social_accounts'' AND column_name IN (''last_preflight_at'',''last_preflight_status'')"}' | grep -E 'last_preflight_(at|status)'</automated>
  </verify>
  <acceptance_criteria>
    - `enum_range(NULL::health_status_type)` returns 7 values including `needs_reconnect` and `captcha_required`
    - `enum_range(NULL::job_type)` returns 4 values including `account_warning_email`
    - `information_schema.columns` shows `browser_profiles.cookies_jar` of type `jsonb`
    - `information_schema.columns` shows BOTH `social_accounts.last_preflight_at` (timestamptz) and `social_accounts.last_preflight_status` (text)
    - All four curl probes exit 0 and grep matches
    - Dev branch `effppfiphrykllkpkdbv` still exists (was not destroyed)
  </acceptance_criteria>
  <done>All four probes pass. Plans 02 and 03 can now run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local dev → Supabase Management API | PAT-authenticated DDL push to dev branch |
| Migration file → live database | DDL applied via service-role API; impacts both prod (via subsequent merge) and dev directly |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-18-01-01 | Tampering | Migration file in git | mitigate | Migration is idempotent (`IF NOT EXISTS`); tampering would surface as a divergent dev/prod schema during the next prod deploy review |
| T-18-01-02 | Information Disclosure | `cookies_jar` JSONB | mitigate | RLS on `browser_profiles` already enforced (Phase 15); column inherits row-level access. No new RLS policy authored — verified existing policy denies read by non-owner |
| T-18-01-03 | Denial of Service | ALTER TYPE locks the type briefly | accept | Type is referenced by `social_accounts.health_status` only; brief AccessExclusiveLock during ADD VALUE is sub-millisecond. No active prod traffic on dev branch. |
| T-18-01-04 | Elevation of Privilege | `SUPABASE_ACCESS_TOKEN` exposure | mitigate | PAT lives in user-env (per memory), never echoed in shell, never committed; curl uses env-substituted bearer header |
| T-18-01-05 | Repudiation | Unaudited DDL on dev branch | accept | Migration file checked into git is the audit trail; Supabase admin log captures the API call timestamp |
</threat_model>

<verification>
After both tasks pass:

1. `supabase/migrations/00025_phase_18_cookies_preflight.sql` exists and the structural verify in Task 1 passes
2. The four probe queries in Task 2 all return expected values from dev branch `effppfiphrykllkpkdbv`
3. `pnpm typecheck && pnpm lint` from project root still passes (no TS code touched)
4. Dev branch is not destroyed (probe `https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv` returns 200)
</verification>

<success_criteria>
- Migration file committed to git
- All six DDL statements applied successfully to dev branch
- ENUM ranges include all new values
- Both new column sets exist on their respective tables
- Plans 02 and 03 can begin (Wave 2)
</success_criteria>

<output>
After completion, create `.planning/phases/18-cookies-persistence-preflight-ban-detection/18-01-SUMMARY.md` recording: ENUM ranges before vs after, new column DDL summary, dev-branch apply timestamp, any idempotency tolerations encountered.
</output>
