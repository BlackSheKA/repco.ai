---
status: resolved
phase: 15-browser-profile-schema-foundation
source:
  - 15-01-SUMMARY.md
  - 15-02-SUMMARY.md
  - 15-03-SUMMARY.md
started: 2026-04-27T11:52:11Z
updated: 2026-04-27T12:19:42Z
---

## Current Test

[testing complete — gaps diagnosed]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Stop any running `pnpm dev`. From a clean shell run `pnpm dev --port 3001`.
  Server boots without errors. Open http://localhost:3001 — the home/dashboard
  loads against the dev Supabase branch (effppfiphrykllkpkdbv) with no
  500/console errors related to `browser_profiles` or missing
  `gologin_profile_id`/`proxy_id` columns.
result: pass

### 2. Add a new social account
expected: |
  On /accounts trigger account creation; new `browser_profiles` row appears,
  `social_accounts.browser_profile_id` is set NOT NULL, account card
  renders, no console error reading legacy columns.
result: blocked
blocked_by: prior-phase
reason: |
  User-observed: clicking "Add account" returns "Could not start remote
  browser". Root cause is the documented Phase 15 → 17 transition state
  per 15-CONTEXT.md "Out of scope": *no new Dodaj konto flow yet — allocator
  lands in Phase 17*. `connectAccount` writes `browser_profile_id: null`,
  `startAccountBrowser` reads it back as null and errors out.
  This is design, not regression — but see Gap G-01 below for a real
  side-effect bug discovered in this flow.

### 3. Existing account card renders
expected: |
  For pre-existing accounts the card on /accounts loads gracefully when
  `browser_profile_id` is null.
result: skipped
reason: |
  Migration 00023 D-06 wipes all existing `social_accounts` rows by design
  (test data only). No pre-existing accounts to render — there is nothing
  to test here in isolation. Re-test after Phase 17 ships and accounts can
  be created again.

### 4. Worker action executes via helper
expected: |
  Queued action processed by worker; helper resolves browser profile;
  GoLogin launcher receives gologin_profile_id + gologin_proxy_id; action
  runs (or fails for domain reason). job_logs entry shows non-TypeError
  status.
result: blocked
blocked_by: prior-phase
reason: |
  Same root cause as Test 2 — without the Phase 17 allocator there are no
  social_accounts with browser_profile_id set, so the worker has nothing
  to process. The helper-call code path in worker.ts is exercised by
  unit tests (worker-quarantine, worker-linkedin-followup — both pass)
  but end-to-end runtime requires Phase 17.

### 5. Cron route smoke (check-replies + linkedin-prescreen)
expected: |
  Both cron routes return 200 with structured JSON, no errors mentioning
  legacy columns.
result: blocked
blocked_by: prior-phase
reason: |
  Routes are exercised by unit tests (route.test.ts passes) but live
  smoke-test against real accounts is blocked until Phase 17 allocator
  populates browser_profile_id on at least one row.

## Summary

total: 5
passed: 1
issues: 1
pending: 0
skipped: 1
blocked: 3

## Gaps

### G-01 — connectAccount orphans GoLogin cloud profiles (severity: warning) — **RESOLVED in 15-03**

**Resolution (2026-04-27):** Plan 15-03 stripped `createProfile()` from
`connectAccount`. Add Account now inserts a placeholder `social_accounts`
row with `browser_profile_id: null` and surfaces the existing "Allocator
not yet shipped" message via `startAccountBrowser`. Phase 17 will rewrite
this code path entirely. Post-fix: typecheck clean, 409/409 tests, build
green.



**Location:** `src/features/accounts/actions/account-actions.ts:46-74`

**What happens:**
`connectAccount` calls `createProfile(handle, loginUrl)` which creates a real
GoLogin cloud profile (consuming quota). The returned `profileId` is
returned to the caller but **never persisted anywhere** — neither a stub
`browser_profiles` row nor any other table. The newly inserted
`social_accounts` row gets `browser_profile_id: null`. As a result every
"Add account" click (and especially every Retry) burns a GoLogin profile
slot with no way to clean it up later.

**Why it survived Phase 15:**
The inline comment ("createProfile() retained for now so its returned
profileId can be surfaced to the caller") describes what the code does, not
what the call site needs. UI never uses the returned `profileId` either —
it discards it and goes straight to `startAccountBrowser`, which fails
because `browser_profile_id` is null.

**Two clean fixes:**
1. **Remove `createProfile()` from `connectAccount` entirely.** Account
   creation just inserts the row; the Phase 17 allocator owns all GoLogin
   REST calls. Until then, "Add account" intentionally hits a friendly
   "Allocator not yet shipped" message.
2. **Persist the profile.** Insert a stub `browser_profiles` row with
   the returned `gologin_profile_id` (placeholder country/timezone/locale),
   then set `social_accounts.browser_profile_id` to it. Phase 17 picks up
   from there.

Option 1 is simpler and matches CONTEXT scope ("Allocator logic / GoLogin
REST calls — Phase 17"). Option 2 closer matches what the UI flow expects
today.

**Source:** Surfaced by `15-REVIEW.md` WR-01 and reproduced via UAT Test 2.
