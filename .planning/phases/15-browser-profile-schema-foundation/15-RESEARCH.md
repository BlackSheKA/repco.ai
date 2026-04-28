# Phase 15: Browser Profile Schema Foundation — Research

**Researched:** 2026-04-27
**Domain:** Postgres schema migration + Supabase-js v2 + TypeScript refactor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `browser_profiles` column set is strictly BPRX-01 (no forward-looking columns)
- D-02: FK `browser_profiles.user_id → public.users(id) ON DELETE CASCADE`
- D-03: `social_accounts.browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE` — nullable
- D-04: Unique constraint `one_account_per_platform UNIQUE (browser_profile_id, platform)`
- D-05: Drop `gologin_profile_id` and `proxy_id` from `social_accounts` in this migration
- D-06: `DELETE FROM social_accounts;` in-migration before column changes
- D-07: RLS on `browser_profiles`: owner-only (`auth.uid() = user_id`) for SELECT/INSERT/UPDATE/DELETE
- D-08: Helper at `src/features/browser-profiles/lib/get-browser-profile.ts`; return shape TBD in plan-phase
- D-09: All 9 reader files refactor through the helper (no inline JOINs outside helper)
- D-10: `SocialAccount` type: drop `gologin_profile_id` + `proxy_id`, add `browser_profile_id: string | null`
- D-11: Migration file `supabase/migrations/00023_browser_profiles.sql`
- D-12: Apply on dev branch `effppfiphrykllkpkdbv` first via Supabase Management API
- D-13: Commit scope `feat(15):`

### Claude's Discretion
- Helper return shape (throw vs return null) — minimize call-site noise
- Index design — at minimum `idx_browser_profiles_user_id`
- Test fixture updates for refactored unit tests
- Whether to add CHECK constraints on `country_code`/`locale`/`timezone` (lean minimal)

### Deferred Ideas (OUT OF SCOPE)
- `cookies_jar JSONB` — Phase 18
- `last_used_at` on browser_profiles — Phase 17
- `fingerprint_patched_at` — Phase 17
- Allocator / `connectAccount` rewrite — Phase 17
- `auth.users` wipe — Phase 20
- `country_code`/`locale` CHECK constraints — Phase 17
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BPRX-01 | New `browser_profiles` table with BPRX-01 column set + unique `(browser_profile_id, platform)` constraint on `social_accounts` | Items 1, 5, 6 below |
| BPRX-02 | `social_accounts` rewritten to reference `browser_profile_id` (FK to `browser_profiles`), dropping legacy columns; worker.ts and account-actions read profile via JOIN | Items 2, 3, 4, 7 below |
</phase_requirements>

---

## Summary

Phase 15 is a pure schema + code refactor with no new UI. The migration (`00023_browser_profiles.sql`) creates `browser_profiles`, rewrites `social_accounts`, and the 9-file code refactor replaces all direct reads of `gologin_profile_id`/`proxy_id` with calls through a new helper module.

All locked decisions are well-defined. The remaining research surfaces: exact Postgres NULL semantics for the unique constraint, which FK/index constraints are safe to drop, the preferred helper return shape, the Supabase-js JOIN select string, minimal index set, migration step order, test framework state, and the curl recipe for dev-branch migration.

**Primary recommendation:** Return `null` from the helper (not throw) — consistent with how `account?.gologin_profile_id` is already guarded at all 4+ call sites in worker.ts.

---

## 1. Postgres NULL Semantics for UNIQUE (browser_profile_id, platform)

**Confidence:** HIGH [VERIFIED: Postgres 15 documentation]

In Postgres, NULL values are considered distinct from each other in a standard `UNIQUE` constraint. The constraint `UNIQUE (browser_profile_id, platform)` with a NULL `browser_profile_id` will allow multiple rows with `(NULL, 'reddit')` — they do NOT conflict. This is the desired behavior for Phase 15: accounts with no browser profile yet can coexist freely; the constraint only enforces uniqueness once a profile is assigned.

`NULLS NOT DISTINCT` (Postgres 15+) would treat NULLs as equal and would block a second `(NULL, 'reddit')` row. **Do NOT use it here.** The nullable `browser_profile_id` is intentional (D-03), and multiple unassigned accounts on the same platform must be allowed during Phase 16's transition.

[CITED: https://www.postgresql.org/docs/15/indexes-unique.html — "NULL values are not considered equal for the purposes of a uniqueness check."]

---

## 2. Existing FK/Index Audit on social_accounts (lines 76–94 of 00002_initial_schema.sql)

**Confidence:** HIGH [VERIFIED: read migration file directly]

```sql
-- From 00002_initial_schema.sql:76-94
gologin_profile_id text,   -- no FK, no index, no NOT NULL, no UNIQUE
proxy_id text,             -- no FK, no index, no NOT NULL, no UNIQUE
```

Both columns are plain `text` with no constraints beyond the column definition itself. There is one index on the table:

```sql
CREATE INDEX idx_social_accounts_user_id ON social_accounts (user_id);
```

This index references `user_id` only — not `gologin_profile_id` or `proxy_id`.

**Constraints to drop: None.** `DROP COLUMN gologin_profile_id` and `DROP COLUMN proxy_id` are safe — no FK, no index, no check constraint references either column. No `DROP CONSTRAINT` or `DROP INDEX` statements needed before the `ALTER TABLE ... DROP COLUMN` steps.

---

## 3. Helper Return Shape

**Recommendation: return `null`** [ASSUMED — based on reading call sites]

Call site analysis from the codebase:

- `worker.ts:130` — `if (!account?.gologin_profile_id) { ... }` — guards with null check, falls through to try block for logging
- `worker.ts:137` — `if (account?.gologin_profile_id) { ... }` — conditional use
- `worker.ts:260` — `connectToProfile(account!.gologin_profile_id!)` — used after guard
- `check-replies/route.ts:208` — `if (!account.gologin_profile_id) { logger.warn(...); continue }` — explicit skip with warning log
- `linkedin-prescreen/route.ts:101` — `.not("gologin_profile_id", "is", null)` — filtered at query level; only accounts with a value arrive at the call site

The existing pattern is: check for null at the call site, log/skip, continue. This is already a return-null pattern. Throwing would force every caller to wrap in try/catch, adding more noise than a null guard. After refactor, callers will null-check the helper result and skip/return in the same style.

**Signature:**
```typescript
// Returns null when account has no browser_profile_id OR no matching browser_profiles row
async function getBrowserProfileForAccount(
  accountId: string,
  supabase: SupabaseClient
): Promise<BrowserProfile | null>

async function getBrowserProfileById(
  browserProfileId: string,
  supabase: SupabaseClient
): Promise<BrowserProfile | null>
```

---

## 4. Supabase-js v2 JOIN Select String

**Confidence:** HIGH [VERIFIED: Supabase-js v2 docs on embedded resources]

To fetch a social account with its browser_profile in one round-trip:

```typescript
// One-level embed — fetches the FK-related row automatically
const { data } = await supabase
  .from("social_accounts")
  .select("*, browser_profiles(*)")
  .eq("id", accountId)
  .single()
```

The resulting TypeScript shape (inferred via generated types or typed manually):

```typescript
type SocialAccountWithProfile = SocialAccount & {
  browser_profiles: BrowserProfile | null  // null when browser_profile_id IS NULL
}
```

**Important:** The embedded key name in Supabase PostgREST is the **table name** (`browser_profiles`), not the column name (`browser_profile_id`). When `browser_profile_id` is NULL, the embedded value is `null` (not an error).

Inside the helper module only (D-09), this JOIN pattern replaces the legacy direct column read:

```typescript
// In get-browser-profile.ts — fetch via account's FK
const { data } = await supabase
  .from("social_accounts")
  .select("browser_profile_id, browser_profiles(*)")
  .eq("id", accountId)
  .single()

return data?.browser_profiles ?? null
```

[CITED: https://supabase.com/docs/reference/javascript/select — "Embedded filters / foreign tables" section]

---

## 5. Index Recommendation

**Recommendation: 2 indexes** [ASSUMED — based on query patterns observed in codebase]

| Index | Table | Column | Rationale |
|-------|-------|--------|-----------|
| `idx_browser_profiles_user_id` | `browser_profiles` | `user_id` | Every RLS query and dashboard query scopes by user; standard pattern matching all other tables (social_accounts, intent_signals, etc.) |
| `idx_social_accounts_browser_profile_id` | `social_accounts` | `browser_profile_id` | The helper's `getBrowserProfileForAccount` JOINs on this column; without an index the FK lookup is a seq scan |

No index on `gologin_profile_id` or `gologin_proxy_id` in `browser_profiles` — these already have `UNIQUE` constraints which implicitly create B-tree indexes in Postgres.

**Do NOT add** an index on `(browser_profile_id, platform)` — the unique constraint `one_account_per_platform` already creates one implicitly.

---

## 6. Migration Step Ordering for 00023_browser_profiles.sql

**Confidence:** HIGH [VERIFIED: Postgres constraint requirements]

Execute in this order:

```sql
-- Step 1: Create the new table (must exist before FK can reference it)
CREATE TABLE browser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gologin_profile_id text UNIQUE NOT NULL,
  gologin_proxy_id text UNIQUE NOT NULL,
  country_code text NOT NULL,
  timezone text NOT NULL,
  locale text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Index on user_id
CREATE INDEX idx_browser_profiles_user_id ON browser_profiles (user_id);

-- Step 3: RLS enable + policies
ALTER TABLE browser_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_select" ON browser_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner_insert" ON browser_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update" ON browser_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "owner_delete" ON browser_profiles FOR DELETE USING (auth.uid() = user_id);

-- Step 4: Wipe existing social_accounts rows (test data only)
--         Must happen BEFORE adding NOT NULL-equivalent constraints or dropping columns
--         (nullable browser_profile_id means this isn't strictly required, but D-06 mandates it)
DELETE FROM social_accounts;

-- Step 5: Add browser_profile_id FK column (nullable — D-03)
ALTER TABLE social_accounts
  ADD COLUMN browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE;

-- Step 6: Add unique constraint
ALTER TABLE social_accounts
  ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform);

-- Step 7: Index on browser_profile_id for JOIN performance
CREATE INDEX idx_social_accounts_browser_profile_id ON social_accounts (browser_profile_id);

-- Step 8: Drop legacy columns
ALTER TABLE social_accounts DROP COLUMN gologin_profile_id;
ALTER TABLE social_accounts DROP COLUMN proxy_id;
```

**Note on ordering:** Steps 5–6 can technically precede step 4 because `browser_profile_id` is nullable (no existing rows would violate the FK). However, dropping legacy columns (step 8) after the wipe is safer — no risk of data integrity confusion. Step 4 before step 5 is the documented D-11 order and is correct.

---

## 7. Test Framework Detection

**Confidence:** HIGH [VERIFIED: read vitest.config.ts + worker-quarantine.test.ts]

**Framework:** Vitest `^4.1.4` — fully configured with `vitest.config.ts` + `vitest.setup.ts`.

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x |
| Config file | `vitest.config.ts` (root) |
| Quick run | `pnpm test` (`vitest run`) |
| Watch mode | `pnpm test:watch` |
| Environment | `happy-dom` |
| Path alias | `@/*` → `./src/*` resolved |

**Import style in tests:** ES module imports with `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"` — no global injection needed (but `globals: true` is set in config so both work).

**Mock pattern:** `vi.mock(...)` module-level mocks + inline factory functions that produce typed row objects. The `AccountRow` type in `worker-quarantine.test.ts` currently has `gologin_profile_id: string` as a required field.

**Recommendation: keep as-is, extend mocks only.** No new vitest config needed. Changes required:
1. Update `AccountRow` type in test factories: remove `gologin_profile_id`, add `browser_profile_id: string | null`
2. Add `mockBrowserProfile()` factory function returning a `BrowserProfile` shape
3. Update `buildSupabase()` mock to handle the `browser_profiles(*)` embed in select strings

---

## 8. Supabase Management API One-Liner

**Confidence:** HIGH [VERIFIED: CLAUDE.md + reference_supabase_management_api.md memory]

Apply `00023_browser_profiles.sql` to dev branch `effppfiphrykllkpkdbv`:

```bash
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(cat supabase/migrations/00023_browser_profiles.sql | tr -d '\n' | sed 's/"/\\"/g')\"}"
```

**Preferred alternative** (avoids shell escaping issues with complex SQL):

```bash
# Write query to a temp file, then POST the file content
SQL=$(cat supabase/migrations/00023_browser_profiles.sql)
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw "{\"query\": $(node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('supabase/migrations/00023_browser_profiles.sql','utf8')))")}"
```

The Node JSON.stringify approach handles multi-line SQL, double quotes, and backslashes correctly without manual escaping. Response is `[{"command":"CREATE"},{"command":"CREATE"},...]` on success; an error object on failure.

---

## Validation Architecture

> Nyquist gate: all commands must produce a clear yes/no signal.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` (single suite currently) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BPRX-01 | browser_profiles table exists with correct columns | SQL query | curl query (see V-01) | ❌ Wave 0 — SQL probe |
| BPRX-01 | RLS enforced: user B cannot see user A's profile | SQL query as two roles | curl query (see V-02) | ❌ Wave 0 — SQL probe |
| BPRX-01 | Unique constraint rejects duplicate (browser_profile_id, platform) | SQL insert attempt | curl query (see V-03) | ❌ Wave 0 — SQL probe |
| BPRX-02 | Legacy columns gone from social_accounts | SQL information_schema | curl query (see V-04) | ❌ Wave 0 — SQL probe |
| BPRX-02 | No legacy column references in source files | grep | grep command (see V-05) | ❌ Wave 0 — grep |
| BPRX-02 | TypeScript types compile clean | typecheck | `pnpm typecheck` (see V-06) | ✅ (existing) |
| BPRX-02 | worker-quarantine tests pass with updated mocks | unit | `pnpm test` (see V-07) | ✅ (existing, needs mock update) |
| BPRX-01+02 | Build succeeds end-to-end | build | `pnpm build` (see V-08) | ✅ (existing) |

### Verification Commands (Copy-Pastable)

**V-01 — Migration applied (table exists):**
```bash
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'browser_profiles'"'"' ORDER BY ordinal_position;"}' \
  | grep -c "column_name"
# Expect: 9 (id, user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name, created_at)
```

**V-02 — RLS enforced (cross-user isolation):**
```bash
# Insert a row as service role, then verify it's invisible via a different user's JWT.
# Practical check: verify RLS policy exists in pg_policies.
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT count(*) FROM pg_policies WHERE tablename='"'"'browser_profiles'"'"';"}' \
  | grep -E '"count":"4"'
# Expect: 4 policies (SELECT/INSERT/UPDATE/DELETE)
```

**V-03 — Unique constraint enforced:**
```bash
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT conname FROM pg_constraint WHERE conrelid='"'"'social_accounts'"'"'::regclass AND conname='"'"'one_account_per_platform'"'"';"}' \
  | grep "one_account_per_platform"
# Expect: matches "one_account_per_platform"
```

**V-04 — Legacy columns dropped:**
```bash
curl --ssl-no-revoke -s -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name='"'"'social_accounts'"'"' AND column_name IN ('"'"'gologin_profile_id'"'"','"'"'proxy_id'"'"');"}' \
  | grep -c "column_name"
# Expect: 0 (empty result = columns are gone)
```

**V-05 — No legacy column references in source (outside migration + helper):**
```bash
grep -rn "gologin_profile_id\|\.proxy_id" \
  "src/" \
  --include="*.ts" --include="*.tsx" \
  | grep -v "00023_browser_profiles" \
  | grep -v "get-browser-profile.ts"
# Expect: zero output (no matches)
```

**V-06 — TypeScript compiles clean:**
```bash
pnpm typecheck
# Expect: exit code 0, no errors
```

**V-07 — Unit tests pass:**
```bash
pnpm test
# Expect: all tests pass, no failures
```

**V-08 — Full build succeeds:**
```bash
pnpm build 2>&1 | tail -5
# Expect: "Route (app)" table printed, exit code 0
```

### Sampling Rate
- **Per task commit:** `pnpm typecheck`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate (before /gsd-verify-work):** V-01 through V-08 all pass

### Wave 0 Gaps
- SQL probes V-01 through V-04 are curl commands, not test files — no test file to create; run manually after migration is applied
- No new test files needed for schema verification (curl handles it)
- [ ] `src/lib/action-worker/__tests__/worker-quarantine.test.ts` — update `AccountRow` mock type (remove `gologin_profile_id`, add `browser_profile_id: string | null`) and `buildSupabase()` mock
- [ ] `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts` — same mock update
- [ ] `src/app/api/cron/check-replies/__tests__/route.test.ts` — update account mock shape

---

## Open Questions

1. **connectAccount cleanup** — after refactor, `connectAccount` in `account-actions.ts` currently writes `gologin_profile_id: profileId`. In Phase 15, this write must be removed (column won't exist) and `browser_profile_id: null` should be written instead. Phase 17 fills in the actual profile. Confirm this is the intent — the planner should explicitly task it.

2. **deleteAccount GoLogin cleanup** — `deleteAccount` currently reads `gologin_profile_id` to call `stopCloudBrowser` + `deleteProfile`. After dropping the column, these GoLogin cleanup calls need a new source (JOIN to `browser_profiles`). This is a refactor call site that's easy to miss since it's not a read-for-execution — it's a cleanup read. Planner must include it in task list for D-09.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase dev branch `effppfiphrykllkpkdbv` | Migration apply | ✓ (per CLAUDE.md / memory) | — | None (blocking) |
| `$SUPABASE_ACCESS_TOKEN` env | curl API calls | ✓ (per User env per memory) | — | None |
| `pnpm` | Build/test/typecheck | ✓ | — | — |
| Vitest 4.1.x | Unit tests | ✓ | 4.1.4 | — |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Helper should return `null` (not throw) | Item 3 | Call sites need try/catch instead of null guard — more invasive refactor |
| A2 | `idx_social_accounts_browser_profile_id` is needed | Item 5 | Minor perf issue only; index can be added later |
| A3 | `deleteAccount`'s GoLogin cleanup is a refactor call site needing attention | Open Questions | Compilation will catch it (column missing) — low risk |

---

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/00002_initial_schema.sql:76-94` — confirmed no FK/index on legacy columns
- `src/lib/action-worker/__tests__/worker-quarantine.test.ts` — confirmed Vitest 4.1.x, mock factory pattern
- `vitest.config.ts` — confirmed framework config
- `src/features/accounts/actions/account-actions.ts` — confirmed all call sites
- `src/lib/action-worker/worker.ts:130-260` — confirmed gologin_profile_id guard pattern

### Cited (MEDIUM confidence)
- [CITED: https://www.postgresql.org/docs/15/indexes-unique.html] — NULL distinctness in UNIQUE constraints
- [CITED: https://supabase.com/docs/reference/javascript/select] — embedded resource (foreign table) select syntax

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable stack — Postgres, Supabase-js, Vitest)
