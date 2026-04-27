---
phase: 17-residential-proxy-gologin-profile-allocator
plan: "02"
subsystem: browser-profiles
tags: [phase-17, gologin, allocator, connect-account, geolocation-proxy, bprx-03, bprx-06]

requires:
  - phase: "17-01"
    provides: "createProfileV2, patchProfileFingerprints stub, country-map module"
  - phase: "15-browser-profile-schema-foundation"
    provides: "browser_profiles + social_accounts schema, one_account_per_platform constraint"

provides:
  - "src/features/browser-profiles/lib/allocator.ts — allocateBrowserProfile orchestrator"
  - "connectAccount refactored to delegate to allocateBrowserProfile (D-14)"
  - "account-list.tsx unified pending copy: 'Setting up your account...'"
  - "legacy createProfile (mode:gologin) removed from client.ts"

affects:
  - "Phase 18 cookies jar — allocator is the creation chokepoint Phase 18 integrates with"
  - "Phase 19 credits — account creation billable event flows through allocateBrowserProfile"

tech-stack:
  added: []
  patterns:
    - "Two-step reuse query pattern (PostgREST cannot inline subqueries)"
    - "D-10 best-effort rollback: deleteProfile in catch, swallow secondary failures"
    - "socialAccountId surfaced in allocator result to satisfy existing UI contract"

key-files:
  created:
    - src/features/browser-profiles/lib/allocator.ts
  modified:
    - src/features/accounts/actions/account-actions.ts
    - src/features/accounts/components/account-list.tsx
    - src/lib/gologin/client.ts
    - src/lib/gologin/__tests__/client.test.ts

key-decisions:
  - "D-01: country='US' hardcoded at connectAccount call site; allocator takes SupportedCountry param for future extension"
  - "D-10: Best-effort deleteProfile rollback on newly-created paths only; reuse-path failures leave the GoLogin profile intact"
  - "D-14: allocateBrowserProfile returns socialAccountId in addition to D-14 spec to satisfy UI accountId contract (Option A)"
  - "D-15: legacy createProfile deleted; test cases for it removed from client.test.ts"
  - "DEVIATION: patchProfileFingerprints skipped (MCP-only per OQ#1); console.warn emitted; BPRX-04 deferred to Phase 18+"
  - "DEVIATION: gologin_proxy_id stores profile.id (OQ#2 fallback — no proxy.id in geolocation response)"

requirements-completed: [BPRX-03, BPRX-06]

duration: ~15min
completed: 2026-04-27
---

# Phase 17 Plan 02: Allocator Summary

**allocateBrowserProfile orchestrator wiring reuse-or-create algorithm, geolocation proxy, D-10 rollback, and connectAccount refactor — legacy mode:gologin path unreachable**

## Status

**PAUSED AT CHECKPOINT** — Tasks 1-3 complete and committed. Task 4 (UAT) awaits human verification.

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-27T15:00:00Z
- **Completed (Tasks 1-3):** 2026-04-27T15:15:00Z
- **Tasks completed:** 3/4 (Task 4 = UAT checkpoint)
- **Files modified:** 5

## Accomplishments

- Implemented `allocateBrowserProfile` with full reuse-or-create algorithm (D-02: two-step PostgREST query pattern), D-09 no-lock semantics, and D-10 best-effort rollback
- Refactored `connectAccount` to delegate entirely to the allocator; removed Phase 15 placeholder INSERT path
- Updated `account-list.tsx` pending copy to unified "Setting up your account..." for both Reddit and LinkedIn flows (UI-SPEC §State A)
- Deleted legacy `createProfile` export (mode:gologin shared pool) — grep proves 0 matches for `mode:"gologin"` in src/
- All 427 existing tests pass after changes

## Task Commits

1. **Task 1: Implement allocateBrowserProfile orchestrator** - `3e8aefc` (feat)
2. **Task 2: Refactor connectAccount + update connect dialog UI copy** - `27ff9ea` (feat)
3. **Task 3: Remove legacy createProfile from client.ts** - `45e7262` (chore)

## Files Created/Modified

- `src/features/browser-profiles/lib/allocator.ts` — new chokepoint: reuse lookup, GoLogin alloc, DB inserts, rollback
- `src/features/accounts/actions/account-actions.ts` — connectAccount now delegates to allocateBrowserProfile; D-11 error copy
- `src/features/accounts/components/account-list.tsx` — unified "Setting up your account..." for Reddit button + LinkedIn pending card
- `src/lib/gologin/client.ts` — legacy createProfile export removed (mode:gologin gone)
- `src/lib/gologin/__tests__/client.test.ts` — createProfile test cases removed (function deleted)

## Decisions Made

- **Option A for socialAccountId:** `allocateBrowserProfile` result includes `socialAccountId` so `connectAccount` can return `accountId` matching the existing UI contract. Smaller blast radius than refactoring `ConnectionFlow` to accept `browserProfileId`.
- **Reuse-path lookup:** D-02 two-step query (PostgREST cannot filter with subqueries inline) — first collect occupied profile ids per platform, then exclude from the user+country filter.
- **Test cleanup:** Legacy `createProfile` tests in `client.test.ts` removed together with the function — keeping them would cause import errors; their coverage intent is replaced by Plan 02 UAT scenarios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] patchProfileFingerprints call skipped (MCP-only — REST 404)**
- **Found during:** Task 1 (pre-execution, documented in 17-01-SUMMARY.md)
- **Issue:** `patchProfileFingerprints` stub throws at runtime (no REST endpoint per 17-API-PROBE.md OQ#1). Calling it and catching would always trigger the rollback path, aborting every allocation.
- **Fix:** Skip the call entirely in the allocator; emit `console.warn` with the OQ#1 reference so it's visible in server logs. BPRX-04 partial deferral documented.
- **Files modified:** `src/features/browser-profiles/lib/allocator.ts`
- **Committed in:** `3e8aefc` (Task 1 commit)

**2. [Rule 1 - Bug] Legacy test cases removed from client.test.ts**
- **Found during:** Task 3 (grep for callers before deleting createProfile)
- **Issue:** `src/lib/gologin/__tests__/client.test.ts` imported `createProfile` and had 4 test cases that would fail after deletion.
- **Fix:** Removed the `createProfile` describe block and updated the dynamic import. Remaining `getProfile` and `deleteProfile` tests unaffected.
- **Files modified:** `src/lib/gologin/__tests__/client.test.ts`
- **Committed in:** `45e7262` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs from pre-existing constraints)
**Impact on plan:** patchProfileFingerprints skip means BPRX-04 fingerprint diversity is not enforced on new profiles in this phase. GoLogin profiles are still created with mode:geolocation (BPRX-03 met). BPRX-04 restoration requires MCP tool access in server runtime (Phase 18+).

## gologin_proxy_id Column Resolution

Per 17-API-PROBE.md OQ#2: no `proxy.id` field is returned under `mode:"geolocation"`. The allocator stores `gologin_profile_id` value in both `gologin_profile_id` and `gologin_proxy_id` columns. This satisfies the `UNIQUE NOT NULL` constraint from migration 00023 because GoLogin profile IDs are unique. Documents as an accepted edge case.

## auth.users Test Data State

No explicit wipe was performed before Tasks 1-3 (code tasks only). UAT (Task 4) will interact with dev Supabase branch `effppfiphrykllkpkdbv`. The user should wipe test rows or use a fresh test user identity before running UAT scenario 1 (BPRX-03) to avoid false reuse-path results.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| patchProfileFingerprints skipped via console.warn | `src/features/browser-profiles/lib/allocator.ts` | REST 404 (MCP-only); restoring BPRX-04 requires Phase 18+ MCP tool wiring |

## Threat Surface Scan

No new network endpoints or auth paths introduced beyond the plan's threat model. The allocator runs inside the `connectAccount` server action boundary (T-17-02-01 through T-17-02-07 all accounted for). T-17-02-01 (handle sanitization): handle is passed as-is to `createProfileV2` which interpolates it into `name: repco-${handle}` in JSON — no SQL or shell surface. T-17-02-02 (cross-user reuse): query filters `user_id = userId` plus RLS enforces `auth.uid() = user_id` on browser_profiles SELECT.

## UAT Screenshots Pending

Task 4 checkpoint — screenshots not yet captured:
- `screenshots/uat-17-bprx03-geolocation.png` (pending)
- `screenshots/uat-17-bprx06-reuse.png` (pending)

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/features/browser-profiles/lib/allocator.ts | FOUND |
| src/features/accounts/actions/account-actions.ts allocateBrowserProfile call | FOUND |
| src/features/accounts/components/account-list.tsx "Setting up your account..." (2×) | FOUND |
| src/lib/gologin/client.ts createProfile export gone | CONFIRMED ABSENT |
| grep mode:"gologin" src/ → 0 matches | PASS |
| All 427 tests pass | PASS |
| commit 3e8aefc (Task 1) | FOUND |
| commit 27ff9ea (Task 2) | FOUND |
| commit 45e7262 (Task 3) | FOUND |

## Next Phase Readiness

- Allocator is the creation chokepoint for Phase 18 (cookies jar integration)
- `reused` flag in result enables Axiom structured logging in Phase 18+
- BPRX-04 (fingerprint patch) requires MCP tool accessible in server runtime — Phase 18+ responsibility
- UAT approval (Task 4) required before marking plan complete

---
*Phase: 17-residential-proxy-gologin-profile-allocator*
*Completed (paused at checkpoint): 2026-04-27*
