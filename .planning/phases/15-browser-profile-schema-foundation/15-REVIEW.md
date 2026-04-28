---
phase: 15-browser-profile-schema-foundation
reviewed: 2026-04-27T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/app/api/cron/check-replies/__tests__/route.test.ts
  - src/app/api/cron/check-replies/route.ts
  - src/app/api/cron/linkedin-prescreen/route.ts
  - src/features/accounts/actions/account-actions.ts
  - src/features/accounts/components/account-card.tsx
  - src/features/accounts/lib/types.ts
  - src/features/browser-profiles/lib/get-browser-profile.ts
  - src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts
  - src/lib/action-worker/__tests__/worker-quarantine.test.ts
  - src/lib/action-worker/worker.ts
  - supabase/migrations/00023_browser_profiles.sql
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-04-27
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 15 cleanly carves the GoLogin profile/proxy fields out of `social_accounts` into a new `browser_profiles` table reached through `social_accounts.browser_profile_id`. The migration follows project conventions (RLS on every new table, four owner-only policies, FK CASCADE, `idx_browser_profiles_user_id`, NOT NULL on identity columns). The helper module `getBrowserProfileForAccount` / `getBrowserProfileById` is small, dependency-injected (caller-supplied client — good), and is used consistently in all five rewritten reader sites. Tests were updated to mock the new helper and stable `BrowserProfile` shape.

Findings below are scoped to the diff. None are critical. Four warnings concern data-integrity / fragile patterns introduced or relied on by Phase 15; five info items are conventions and minor cleanups. Performance and orthogonal worker complexity are out of scope per CLAUDE.md and the GSD review v1 charter.

## Warnings

### WR-01: `connectAccount` creates a GoLogin profile and then orphans it

**File:** `src/features/accounts/actions/account-actions.ts:46-74`
**Issue:** The action calls `createProfile(...)` (line 49), captures `profileId`, then inserts the `social_accounts` row with `browser_profile_id: null` and never persists `profileId` anywhere. The comment correctly documents that the Phase 17 allocator owns `browser_profiles` writes — but as written today this means **every connect attempt provisions a GoLogin profile that no DB row references**. If `deleteAccount` is later called the cleanup branch is gated on `account.browser_profile_id`, so the orphan is never garbage-collected. This silently burns the user's GoLogin profile quota on every reconnect, and there is no recovery path because `profileId` is only returned to the client (which discards it once login finishes).
**Fix:** Either (a) skip `createProfile` until the allocator ships and surface a clear error in `startAccountBrowser` (which already does this — see line 124), or (b) insert a `browser_profiles` row inline with the FK set on the social account. Option (a) is the smaller surgical change consistent with the in-file comment at line 43-46.

```ts
// Phase 15 transition: defer profile creation to the allocator (Phase 17).
// Account is created with browser_profile_id=null; startAccountBrowser will
// surface a clear "no profile yet" error until the allocator lands.
const { data, error } = await supabase
  .from("social_accounts")
  .insert({
    user_id: user.id,
    platform,
    handle: effectiveHandle,
    browser_profile_id: null,
    health_status: "warmup",
    warmup_day: 1,
  })
  .select("id")
  .single()
if (error) return { error: error.message }
revalidatePath("/accounts")
return { success: true, accountId: data.id }
```

### WR-02: `verifyAccountSession` swallows DB errors on missing column and reports `verified: true` regardless

**File:** `src/features/accounts/actions/account-actions.ts:252-268`
**Issue:** The catch arm returns `{ success: true, verified: true }` even when the column-missing fallback fires *and* every other Supabase error path that doesn't match the `column ... does not exist` regex. If the message regex changes Supabase-side (it has, between PostgREST minor versions) the route will still return verified=true to the caller without writing the timestamp. This is unrelated to Phase 15 but the file was touched in this phase. Mark as Warning because the UI in `account-card.tsx` gates the "Session active" pill on `session_verified_at !== null`, so a silent failure here is observable user-facing drift.
**Fix:** Drop the regex fallback — `session_verified_at` exists in current schema. Return `{ success: false, verified: false, error }` on any non-null `error`. If preserving the fallback is required, return `verified: false` from the fallback branch.

### WR-03: `getBrowserProfileForAccount` swallows error from Supabase

**File:** `src/features/browser-profiles/lib/get-browser-profile.ts:17-32`
**Issue:** The destructure ignores `error`. Any DB-level failure (RLS denial, network timeout, FK target missing because of a race) is indistinguishable from "row not found" and surfaces as `null`, which callers (`worker.ts:139`, `linkedin-prescreen/route.ts:177`, `account-actions.ts:121`, `check-replies/route.ts:213`) all interpret as "account has no browser profile yet — skip / fail soft". A persistent RLS/auth problem will silently drain the entire monitoring pipeline with the misleading log message `"Skipping account — no browser profile"`. Per CLAUDE.md `feedback_supabase_mocked_tests_mask_column_drift.md`, exactly this destructure-and-ignore pattern is what masked column drift in a previous phase.
**Fix:** Capture `error`, log it, and either rethrow (preferred, given upstream `try`/`catch`) or return a discriminated result.

```ts
const { data, error } = await supabase
  .from("social_accounts")
  .select("browser_profile_id, browser_profiles(*)")
  .eq("id", accountId)
  .single()
if (error && error.code !== "PGRST116") {
  throw new Error(`getBrowserProfileForAccount: ${error.message}`)
}
if (!data) return null
```

Same issue in `getBrowserProfileById` (line 41-47).

### WR-04: `getBrowserProfileById` select list will silently drop new columns

**File:** `src/features/browser-profiles/lib/get-browser-profile.ts:41-47`
**Issue:** `getBrowserProfileById` hand-rolls a column list (`"id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name"`) while `getBrowserProfileForAccount` uses `browser_profiles(*)`. Two readers, two truths. When Phase 17 adds columns (e.g. `created_at`, `last_used_at`, status), the FK-embed reader will pick them up automatically and the by-id reader will continue to silently drop them. Today the cast on line 47 means TS won't catch the mismatch.
**Fix:** Use `select("*")` here too — the `BrowserProfile` interface is the contract. If a narrower projection is desired for cost, define a single `BROWSER_PROFILE_COLUMNS` constant shared by both readers and the type.

## Info

### IN-01: `social_accounts` UNIQUE includes nullable `browser_profile_id`

**File:** `supabase/migrations/00023_browser_profiles.sql:55-58`
**Issue:** `UNIQUE (browser_profile_id, platform)` with `NULLS DISTINCT` (Postgres default) does what the inline comment claims — multiple `(NULL, 'reddit')` rows are allowed during the Phase 15→17 transition. This is correct given the rollout plan, but worth flagging that once the allocator lands, the constraint will not retroactively force a back-fill. Either add a follow-up migration to `NOT NULL` the FK after Phase 17, or capture this in `.planning/STATE.md` so it isn't forgotten.
**Fix:** Track-only — add a TODO in the migration trailer or in the phase state.

### IN-02: `BrowserProfile` interface duplicates the column list out of step with the SELECT projection

**File:** `src/features/accounts/lib/types.ts:17-25`
**Issue:** The interface lists 7 fields. `getBrowserProfileById` selects exactly those 7 fields. `getBrowserProfileForAccount` selects `*`. If the table grows, both readers will diverge from the type without TS catching it, since the helper casts through `unknown`.
**Fix:** Either generate types from the DB (`supabase gen types`) or comment-pin the interface to the migration. Cosmetic until Phase 17 lands.

### IN-03: `SocialAccountWithProfile` type defined but never imported anywhere reviewed

**File:** `src/features/accounts/lib/types.ts:49-51`
**Issue:** `SocialAccountWithProfile` is declared in this phase's diff but no reviewed reader uses it (workers and crons all use the helper functions, not the embedded shape). Could be intentional for downstream use; flag for confirmation. Per CLAUDE.md "no abstractions for single-use code" / "no flexibility that wasn't requested".
**Fix:** Confirm a consumer exists outside the reviewed files. If not, drop until needed.

### IN-04: Fallback platform key access reads from a `Record<string, string>` map

**File:** `src/features/accounts/components/account-card.tsx:40-48,103,144`
**Issue:** `PLATFORM_LABEL[account.platform] ?? account.platform` — `account.platform` is typed as `"reddit" | "linkedin"`, so the maps could just be `Record<"reddit" | "linkedin", string>` and the `??` fallbacks dropped. Minor type-tightening; low priority.
**Fix:**
```ts
const PLATFORM_LABEL: Record<SocialAccount["platform"], string> = {
  reddit: "Reddit",
  linkedin: "LinkedIn",
}
```

### IN-05: Migration deletes existing test rows without explicit user confirmation gate

**File:** `supabase/migrations/00023_browser_profiles.sql:48-49`
**Issue:** `DELETE FROM social_accounts;` is correct per D-06 (test data on the dev branch only) but a future operator running the migration on prod for a forked branch would lose data without a migration-time guard. The phase context says prod is currently empty and the dev branch (`effppfiphrykllkpkdbv`) is the only target — fine for now, but worth a comment line citing prod-empty as the safety condition.
**Fix:** Prepend an inline comment:

```sql
-- D-06: prod has zero social_accounts rows as of phase 15 (.planning/phases/15-.../15-CONTEXT.md).
-- This DELETE is destructive on any environment that holds real data — verify before forward-porting.
DELETE FROM social_accounts;
```

---

_Reviewed: 2026-04-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
