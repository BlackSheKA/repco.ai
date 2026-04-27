---
phase: 19
plan: 19-00-wave-0-test-harness
type: execute
wave: 0
depends_on: []
files_modified:
  - scripts/test-trigger-19.mjs
  - .env.local
autonomous: true
requirements: [PRIC-14]
must_haves:
  truths:
    - "A single Node script can run all Phase 19 trigger/migration smoke checks against the dev Supabase branch (effppfiphrykllkpkdbv)"
    - "Subcommand interface lets later tasks reference targeted checks (--enums, --columns, --plan-config, --audit-table, --signup, --normalize, --duplicate, --quick)"
    - "Script cleans up created auth.users rows after each scenario so re-runs are idempotent"
  artifacts:
    - path: "scripts/test-trigger-19.mjs"
      provides: "Trigger integration + migration smoke harness for Phase 19"
      contains: "subcommand dispatcher with --enums --columns --plan-config --audit-table --signup --normalize --duplicate --quick"
  key_links:
    - from: "scripts/test-trigger-19.mjs"
      to: "Supabase dev branch effppfiphrykllkpkdbv"
      via: "@supabase/supabase-js service-role client + Management API SQL endpoint"
      pattern: "SUPABASE_SERVICE_ROLE_KEY|effppfiphrykllkpkdbv"
---

<objective>
Create the Wave 0 test harness that all Phase 19 verification commands depend on.

Purpose: Phase 19 has no existing trigger-integration test framework. Per VALIDATION.md, every later task verifies via `node scripts/test-trigger-19.mjs --<subcommand>`. This plan creates that script as a one-shot Node ESM module using the project-standard Supabase service-role client pattern, plus a Management API SQL helper for migration smoke checks. The script must be runnable BEFORE the Phase 19 migration is applied (so subcommands gracefully report "not yet applied") and AFTER application (asserts pass).

Output: `scripts/test-trigger-19.mjs` with 8 subcommands wired and an idempotent cleanup helper.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/19-free-tier-enum-signup-flow/19-CONTEXT.md
@.planning/phases/19-free-tier-enum-signup-flow/19-RESEARCH.md
@.planning/phases/19-free-tier-enum-signup-flow/19-VALIDATION.md
@CLAUDE.md

<interfaces>
Dev branch (NEVER touch prod):
- Supabase project ref: effppfiphrykllkpkdbv
- API URL: https://effppfiphrykllkpkdbv.supabase.co
- Management API base: https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv

Env vars expected in .env.local (already present per CLAUDE.md "Environments"):
- NEXT_PUBLIC_SUPABASE_URL  (dev URL)
- SUPABASE_SERVICE_ROLE_KEY (dev key)
- SUPABASE_ACCESS_TOKEN     (Management API PAT — User env per memory reference_supabase_management_api)

Project standard: see `reference_supabase_management_api` memory for curl recipe; this script uses fetch() instead of curl. Use `--ssl-no-revoke` flag is curl-only — Node fetch is fine on Windows.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scaffold scripts/test-trigger-19.mjs subcommand dispatcher</name>
  <files>scripts/test-trigger-19.mjs</files>
  <action>
Create a Node ESM script at `scripts/test-trigger-19.mjs`. The script:

1. Reads `.env.local` from project root (use `node:fs.readFileSync` + simple parser; do NOT pull in dotenv as a dep). Required vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`. Fail fast with a clear error if any missing.

2. Asserts the URL points at the DEV branch by checking `NEXT_PUBLIC_SUPABASE_URL.includes('effppfiphrykllkpkdbv')`. If not, exit with code 2 and message "Refusing to run: not pointing at dev branch effppfiphrykllkpkdbv". This is the critical safety gate — NEVER touch prod ref `cmkifdwjunojgigrqwnr`.

3. Builds two clients:
   - `supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })` from `@supabase/supabase-js` (already a dep — verify with `node -e "require('@supabase/supabase-js')"`)
   - `runSql(sql)` helper that POSTs to `https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query` with `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}` and body `{ query: sql }`, returning parsed JSON. Throws on non-2xx with the response body included.

4. Exports stub subcommand handlers (each just `console.log('[stub] <name>')` for now — Plan 01 fills bodies):
   - `cmdEnums()` — `--enums`
   - `cmdColumns()` — `--columns`
   - `cmdPlanConfig()` — `--plan-config`
   - `cmdAuditTable()` — `--audit-table`
   - `cmdSignup()` — `--signup`
   - `cmdNormalize()` — `--normalize`
   - `cmdDuplicate()` — `--duplicate`
   - `cmdQuick()` — `--quick` (runs all the above sequentially, exits non-zero on first failure)

5. Argv dispatcher: `process.argv.slice(2)` → first flag → call matching handler. Unknown flag prints usage and exits 1.

6. Implements `cleanupTestUser(email)` helper used by subcommand bodies: `supabase.auth.admin.deleteUser(...)` by email; suppresses "user not found" errors. Also `cleanupAllTestUsersWithPrefix(prefix)` for test emails like `phase19-test-<uuid>@example.com`.

7. Top-level `main()` is async, uses try/catch, and `process.exit(failed ? 1 : 0)`.

Use Node ESM (`.mjs` extension), no transpile step. No new dependencies.

Verify `@supabase/supabase-js` is in package.json dependencies (it is — used by `lib/supabase/server.ts`).
  </action>
  <verify>
    <automated>node scripts/test-trigger-19.mjs --quick 2>&1 | grep -E "stub|skip" | head -1</automated>
  </verify>
  <done>
- File exists at `scripts/test-trigger-19.mjs`
- `node scripts/test-trigger-19.mjs --enums` prints stub line and exits 0
- `node scripts/test-trigger-19.mjs --quick` runs all 7 stubs and exits 0
- Pointing at non-dev URL exits with code 2 (verifiable by temporarily editing .env.local — do NOT commit that change)
  </done>
</task>

<task type="auto">
  <name>Task 2: Wire the read-only smoke subcommands (--enums, --columns, --audit-table, --normalize)</name>
  <files>scripts/test-trigger-19.mjs</files>
  <action>
Fill in the four read-only subcommand bodies. These do NOT require the migration to have created any test data — they just inspect schema state. Each prints `OK <subcommand>` on pass and `FAIL <subcommand>: <reason>` + non-zero exit on fail. Pre-migration state: each MUST gracefully report `SKIP <subcommand>: migration not applied` (detect by catching the expected "type does not exist" / "column does not exist" / "relation does not exist" errors from runSql).

`cmdEnums()`:
- runSql: `SELECT array_agg(enumlabel ORDER BY enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='subscription_plan'` — assert `['free','pro']`.
- runSql: same for `billing_cycle` — assert `['monthly','annual']`.

`cmdColumns()`:
- runSql: `SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('subscription_plan','billing_cycle','credits_balance_cap','credits_included_monthly') ORDER BY column_name`.
- Assert: `subscription_plan` NOT NULL, default `'free'::subscription_plan`; `billing_cycle` IS NULLABLE, default NULL; `credits_balance_cap` NOT NULL, default 500; `credits_included_monthly` default 250 (existing column, just check default is now 250 not 500).
- runSql: `SELECT conname FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='c' AND conname='users_billing_cycle_required_for_pro'` — assert exists.
- runSql: attempt `INSERT INTO public.users (id,email,subscription_plan,billing_cycle) VALUES (gen_random_uuid(),'pro-no-cycle@test',  'pro', NULL)` wrapped in `BEGIN; ... ROLLBACK;` — assert error code `23514` (check constraint violation).

`cmdAuditTable()`:
- runSql: `SELECT relname FROM pg_class WHERE relname='signup_audit' AND relkind='r'` — assert 1 row.
- runSql: `SELECT relrowsecurity FROM pg_class WHERE relname='signup_audit'` — assert true.
- runSql: `SELECT count(*) FROM pg_policy WHERE polrelid='public.signup_audit'::regclass` — assert 0 (deny-by-default per D-10).
- runSql: column shape — assert `id uuid pk`, `user_id uuid not null`, `email_normalized text not null`, `ip inet`, `duplicate_flag boolean not null default false`, `created_at timestamptz not null default now()`.

`cmdNormalize()`:
- runSql 6 cases via `SELECT public.normalize_email($input)`:
  - `'plain@example.com'` → `'plain@example.com'`
  - `'UPPER@EXAMPLE.COM'` → `'upper@example.com'`
  - `'kamil.wandtke@gmail.com'` → `'kamilwandtke@gmail.com'`
  - `'kamil+x@gmail.com'` → `'kamil@gmail.com'`
  - `'Kamil.Wandtke+x@Googlemail.com'` → `'kamilwandtke@gmail.com'`
  - `'with+alias@yahoo.com'` → `'with+alias@yahoo.com'` (NOT stripped for non-gmail)

Use parameterized SQL by interpolating safely (single-quote-escape each input via `replace(/'/g,"''")`); inputs are test literals, no untrusted data.
  </action>
  <verify>
    <automated>node scripts/test-trigger-19.mjs --enums; node scripts/test-trigger-19.mjs --columns; node scripts/test-trigger-19.mjs --audit-table; node scripts/test-trigger-19.mjs --normalize</automated>
  </verify>
  <done>
- Pre-migration: each of the 4 commands exits 0 with `SKIP` line.
- Post-migration (after Plan 01): each exits 0 with `OK` line.
- Failure mode: each exits 1 with descriptive `FAIL` line if assertion mismatches.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire the trigger integration subcommands (--signup, --duplicate, --plan-config)</name>
  <files>scripts/test-trigger-19.mjs</files>
  <action>
Fill in the three side-effecting subcommand bodies. Each creates real `auth.users` rows on the dev branch via `supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { ip: '<test-ip>' } })`, observes trigger side effects, then deletes the user. Use unique test emails like `phase19-${subcommand}-${randomUUID().slice(0,8)}@example.com` so concurrent runs don't collide.

`cmdSignup()` — verifies PRIC-05 + PRIC-14 atomic write:
1. Create user with `user_metadata.ip = '203.0.113.10'`.
2. Wait briefly (200ms — trigger is synchronous but allow client roundtrip).
3. SELECT from `public.users` where id = new user id. Assert: `subscription_plan='free'`, `billing_cycle IS NULL`, `credits_balance=250`, `credits_balance_cap=500`, `credits_included_monthly=250`, `trial_ends_at IS NULL`, `subscription_active=false`, `billing_period IS NULL`.
4. SELECT from `public.credit_transactions` where user_id = new user id. Assert: exactly 1 row, `type='monthly_grant'`, `amount=250`, `description='Free tier signup grant'`.
5. SELECT from `public.signup_audit` where user_id = new user id. Assert: exactly 1 row, `email_normalized` matches `normalizeEmail(email)` (compute in JS via mirroring SQL fn — keep inline; reuse Plan 02's TS impl is fine but copy literally here to keep harness self-contained), `ip = '203.0.113.10'::inet`, `duplicate_flag=false`.
6. Cleanup: `supabase.auth.admin.deleteUser(userId)` — cascade deletes signup_audit / credit_transactions / users rows.

`cmdDuplicate()` — verifies PRIC-14 duplicate flag:
1. Create user A: `kamil.wandtke+test1@gmail.com`, ip `198.51.100.50`.
2. Create user B: `kamilwandtke+test2@gmail.com`, ip `198.51.100.50` (same normalized email + same IP).
3. SELECT from `signup_audit` where user_id = B. Assert `duplicate_flag=true`.
4. SELECT from `users` where id = B. Assert `credits_balance=250` (NO hard reject per D-11).
5. Cleanup both users.

`cmdPlanConfig()` — verifies PRIC-14 cap/included values match D-05:
1. Quick read-only check: SELECT 1 free user post-`cmdSignup`-style (do ephemeral create+check+delete here too to avoid coupling). Assert `credits_balance_cap=500` AND `credits_included_monthly=250`.

Update `cmdQuick()` so it runs in this order: `enums → columns → audit-table → normalize → signup → duplicate → plan-config`. Stop on first failure.
  </action>
  <verify>
    <automated>node scripts/test-trigger-19.mjs --quick</automated>
  </verify>
  <done>
- Pre-migration: `--quick` exits 0 with all SKIP lines.
- Post-migration: `--quick` exits 0 with all OK lines.
- Test users with prefix `phase19-` do NOT remain in `auth.users` after each subcommand (verifiable: `runSql("SELECT count(*) FROM auth.users WHERE email LIKE 'phase19-%@example.com'")` returns 0).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local dev → Supabase Management API | SUPABASE_ACCESS_TOKEN crosses here; full project admin scope on dev branch only |
| Local dev → Supabase service role | SUPABASE_SERVICE_ROLE_KEY bypasses RLS on dev branch |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-00-01 | Spoofing | scripts/test-trigger-19.mjs targeting wrong project | mitigate | Hard assertion that `NEXT_PUBLIC_SUPABASE_URL` includes `effppfiphrykllkpkdbv`; exit code 2 on mismatch. Prevents accidental prod hit (cmkifdwjunojgigrqwnr). |
| T-19-00-02 | Tampering | Test data leakage into dev branch | mitigate | All test emails use `phase19-` prefix and `@example.com` domain; cleanup runs in `finally` block of every subcommand; `cmdQuick` exits non-zero if any phase19- user remains. |
| T-19-00-03 | Information Disclosure | Service-role key written to console on error | mitigate | `runSql` error path strips `Authorization` header from any echoed request; never logs `SUPABASE_SERVICE_ROLE_KEY` value. |
| T-19-00-04 | Denial of Service | Concurrent test runs collide on same fixture email | accept | Each test email includes `randomUUID().slice(0,8)`; collision probability negligible for solo dev workflow. |
| T-19-00-05 | Elevation of Privilege | Script committed with embedded keys | mitigate | Script reads from `.env.local` (gitignored per CLAUDE.md); no fallback hardcoded values. Pre-commit grep would catch any literal key. |
</threat_model>

<verification>
Run after all 3 tasks complete:

```bash
# Sanity: file exists, executable
test -f scripts/test-trigger-19.mjs

# Pre-migration baseline (Plan 01 not applied yet): all SKIP
node scripts/test-trigger-19.mjs --quick

# Safety gate: refuses non-dev URL
# (manual one-time test — temporarily flip URL and verify exit code 2)
```

Plan 01 will re-run `--quick` post-migration; that is where OK lines appear.
</verification>

<success_criteria>
- `scripts/test-trigger-19.mjs` exists with 8 subcommand handlers + dispatcher + cleanup helper
- Safety gate refuses any URL not containing `effppfiphrykllkpkdbv` (exit code 2)
- Pre-migration `--quick` run completes with all-SKIP and exit 0
- No new npm dependencies added (verify `git diff package.json` shows no changes)
- Script imports only `@supabase/supabase-js`, `node:crypto`, `node:fs`, `node:path` — nothing else
</success_criteria>

<output>
After completion, create `.planning/phases/19-free-tier-enum-signup-flow/19-00-SUMMARY.md` recording:
- Final subcommand list and exit-code semantics
- Dev branch ref used (effppfiphrykllkpkdbv)
- Cleanup invariant (zero phase19- users post-run)
- Note: read-only subcommands SKIP gracefully pre-migration
</output>
