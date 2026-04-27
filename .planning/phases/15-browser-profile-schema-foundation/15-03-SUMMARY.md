---
phase: 15-browser-profile-schema-foundation
plan: 03
subsystem: accounts
tags: [gologin, supabase, server-actions, react, transition-shim]

requires:
  - phase: 15-browser-profile-schema-foundation
    provides: connectAccount post-Plan-02 (with createProfile leak); social_accounts.browser_profile_id nullable
provides:
  - connectAccount as a pure DB-insert shim (no GoLogin REST calls)
  - ConnectionFlow accepts profileId: string | null (forward-compat for Phase 17 allocator)
  - Reconnect path no longer hard-blocks on null profileId
affects: [17-residential-proxy-gologin-profile-allocator]

tech-stack:
  added: []
  patterns:
    - "Phase-transition stub: server action returns null id for a column the next phase will populate"

key-files:
  created: []
  modified:
    - src/features/accounts/actions/account-actions.ts
    - src/features/accounts/components/account-list.tsx
    - src/features/accounts/components/connection-flow.tsx

key-decisions:
  - "Kept profileId key in connectAccount return shape (returning null) to avoid touching every caller — surgical per CLAUDE.md §3"
  - "Chose Option A (widen prop type) over Option B (drop prop) in ConnectionFlow — leaves Phase 17 free to wire allocator-issued profile id back in"
  - "Dropped both gates on newProfileId in account-list.tsx (handleReconnect early-return AND ConnectionFlow render gate at line 210); the showHandleForm gate works correctly as-is because !newAccountId already drives the transition"

patterns-established:
  - "Gap-closure plan format: plan title, surgical edits across 3 files, no abstractions, hand-off note for the rewriting phase"

requirements-completed: [BPRX-02]

duration: ~25min
completed: 2026-04-27
---

# Phase 15 Plan 03: G-01 GoLogin quota leak — closed Summary

**connectAccount stripped of GoLogin REST calls; Add Account/Reconnect flows still progress to ConnectionFlow which surfaces the existing "no browser profile yet" message via startAccountBrowser. Phase 17 allocator now has a clean canvas.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `connectAccount` no longer calls `createProfile()` — the GoLogin profile-quota leak from the Add Account flow is closed at the source.
- `createProfile` import dropped from `account-actions.ts`; `Failed to create browser profile` error branch deleted.
- `connectAccount` returns `{ success, accountId, profileId: null }`; callers compile unchanged via existing `?? null` reads.
- `account-list.tsx::handleReconnect` early-return (`toast.error("This account has no browser profile")`) dropped; reconnect now flows through to ConnectionFlow even when the row's profile is null.
- `account-list.tsx` ConnectionFlow render gate at line ~210 widened: `connecting && newAccountId && newProfileId` → `connecting && newAccountId`.
- `ConnectionFlow.profileId` prop type widened to `string | null`.

## Task Commits

1. **Task 1: Strip createProfile from connectAccount** — `3a1afea` (fix)
2. **Task 2: Audit + adjust callers (account-list.tsx, connection-flow.tsx)** — `4ee03d7` (fix)
3. **Task 3: Validate + grep audit + smoke test + SUMMARY** — _this commit_ (docs)

## Files Created/Modified

- `src/features/accounts/actions/account-actions.ts` — removed `createProfile` import + call site + error branch; success return now `profileId: null`.
- `src/features/accounts/components/account-list.tsx` — dropped null-profileId early return in `handleReconnect`; dropped `newProfileId` from ConnectionFlow render gate.
- `src/features/accounts/components/connection-flow.tsx` — widened `profileId` prop to `string | null`.

## Validation

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0 (after generating standard `next-env.d.ts` — pre-existing infra prerequisite, file is git-ignored) |
| `pnpm vitest run --reporter=dot` | exit 0 — **55 test files, 409 tests passed, 0 regressions** |
| `pnpm build` | **exit 1 — environmental, NOT caused by this plan's changes** (see Issues Encountered) |

### Grep Audit (Task 3 Step 2)

**A) `grep -n "createProfile(" src/features/accounts/actions/account-actions.ts`** — empty (exit 1 from grep = no match). The literal call is gone; the comment at line 43 mentions the word "createProfile" inside parentheses-free prose, which doesn't match the `createProfile(` pattern.

**B) `grep -rn "createProfile" src/ --include="*.ts" --include="*.tsx" | grep -v "src/lib/gologin/client.ts"`** — 5 hits, all acceptable:

- 1 hit in `src/features/accounts/actions/account-actions.ts` line 43 — comment text only, not a call.
- 4 hits in `src/lib/gologin/__tests__/client.test.ts` — these tests target the `createProfile` lib function itself (still exported from `@/lib/gologin/client`). Per Plan 03 scope, the lib stays intact; only the connect-flow caller was stripped.

**Feature-scope guard** (success-criteria check): `grep -rn "createProfile(" src/features/accounts/` → empty.

## Decisions Made

- **Kept `profileId: null` in the return shape** rather than dropping the key — every existing caller uses `result.profileId ?? null`, so `null` flows through unchanged. Removing the key would have widened the change surface to types and prop initialization. Surgical, per CLAUDE.md §3.
- **Adjusted both gates on `newProfileId` in `account-list.tsx`**, not just the one the planner's `<interfaces>` block called out. The orchestrator's addendum was correct: line ~210's `connecting && newAccountId && newProfileId` would have prevented the dialog from advancing once `profileId` is permanently null. Without dropping it, the user would see neither the handle form (gate flips off after `setNewAccountId`) nor the ConnectionFlow (third clause never satisfied). Both gates were dropped together to keep the flow functional.
- **Did not touch the `showHandleForm` gate** (`connecting && !newAccountId && !newProfileId`) — `!newProfileId` is now permanently `true`, so the gate effectively reduces to `connecting && !newAccountId`, which is the correct semantics. No edit needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated missing `next-env.d.ts` to enable typecheck**
- **Found during:** Task 2 verification
- **Issue:** Fresh worktree had no `next-env.d.ts`; tsc reported missing SVG/PNG module type declarations from `@/app/images/*`. The file is auto-generated by Next.js and git-ignored.
- **Fix:** Wrote standard 4-line `next-env.d.ts` (the canonical content Next would generate on first `next dev`/`next build`).
- **Files modified:** `next-env.d.ts` (git-ignored, NOT committed).
- **Verification:** `pnpm typecheck` exits 0.

**2. [Rule 1 - Bug] Dropped second `newProfileId` render gate in `account-list.tsx`**
- **Found during:** Task 2 (per orchestrator addendum)
- **Issue:** Planner's `<interfaces>` block only flagged the `showHandleForm` gate. The line ~210 gate (`connecting && newAccountId && newProfileId`) would have prevented `<ConnectionFlow>` from ever rendering once `profileId` is permanently null — Add Account would dead-end into a blank state after the handle form hides.
- **Fix:** Dropped `newProfileId` from the gate; left the prop forwarding (`profileId={newProfileId}`) intact since ConnectionFlow's prop now accepts `string | null`.
- **Files modified:** `src/features/accounts/components/account-list.tsx`.
- **Verification:** Trace: `setNewAccountId(uuid) + setNewProfileId(null)` → `connecting && newAccountId && _` → ConnectionFlow renders with `profileId={null}`.
- **Committed in:** `4ee03d7`.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both essential to deliver the plan's stated UX outcome ("Add Account flow reaches ConnectionFlow"). No scope creep — all edits trace directly to G-01 / WR-01.

## Issues Encountered

- **`pnpm build` fails with `Module not found: Can't resolve '@radix-ui/react-dismissable-layer'`** in 4 radix sub-packages (dialog, popover, select, tooltip). The package IS present at `node_modules/.pnpm/.../node_modules/@radix-ui/react-dismissable-layer/` — verified by direct `ls`. This is a Turbopack module-resolution / Windows path-length issue specific to building inside `.claude/worktrees/agent-...` deep nested paths, NOT caused by this plan's changes (none of the modified files import or reference radix dialog/popover/select/tooltip; all changes are isolated to `src/features/accounts/actions/account-actions.ts`, `src/features/accounts/components/account-list.tsx`, and `src/features/accounts/components/connection-flow.tsx`). `pnpm typecheck` and `pnpm vitest run` both pass cleanly, confirming the source itself compiles. The orchestrator should re-run `pnpm build` from the merged main worktree to verify; expect it to pass since the change set has zero radix touch.
- **Manual smoke test (Task 3 Step 3-4) skipped** — runs against `pnpm dev --port 3001` in the parent worktree (Supabase dev branch, real GoLogin dashboard). This is a parallel executor; spinning up a dev server here would conflict with the user's existing port 3001 process. The relevant guarantees are covered by static analysis: (a) `grep "createProfile(" src/features/accounts/` is empty so the Add Account click cannot reach a `createProfile` REST call; (b) `connectAccount` source no longer imports `createProfile`; (c) `pnpm vitest run` covers `social_accounts` insert behavior. Recommend running the manual smoke (Add Reddit account → confirm GoLogin profile count steady) post-merge.

## No Production Schema Touched

This plan modifies TypeScript source only. No Supabase migration, no SQL execution, no production schema (`cmkifdwjunojgigrqwnr`) or dev branch (`effppfiphrykllkpkdbv`) touched.

## Phase 17 Handoff Note

Phase 17's allocator inherits a clean shim:

- **`connectAccount`** is now a pure DB-insert: auth check → `effectiveHandle` (LinkedIn placeholder synthesis preserved) → insert `social_accounts` row with `browser_profile_id: null` → return `{ success, accountId, profileId: null }`. The allocator should rewrite this end-to-end: introduce GoLogin profile creation (or proxy/profile pool reuse), write the resulting `browser_profile_id`, and decide whether to keep the placeholder-row pattern or defer the insert until allocation succeeds.
- **`ConnectionFlow.profileId` prop** is `string | null` — ready to receive a real profile id once the allocator wires one in. No prop-shape change required at the call site.
- **`handleReconnect`** trusts the caller (no early-return on null); `startAccountBrowser` remains the single source of the user-facing "no browser profile yet" error string. Phase 17 should remove that fallback path once every account has a profile guaranteed by the allocator.
- **Out-of-band cleanup**: existing orphaned GoLogin profiles created by the pre-fix bug remain in the user's GoLogin dashboard (T-15-06 in plan threat register, accepted). The allocator's reuse logic can recycle them, or the user can purge manually.

## G-01 / WR-01 Closure

- **15-UAT.md G-01** (GoLogin quota leak — `createProfile` orphans profiles every Add Account click): **resolved**. Audit grep confirms zero call sites in `src/features/accounts/`.
- **15-REVIEW.md WR-01** (same finding from review pass): **resolved**.

## Self-Check: PASSED

- `src/features/accounts/actions/account-actions.ts` — modified, committed in `3a1afea` ✓
- `src/features/accounts/components/account-list.tsx` — modified, committed in `4ee03d7` ✓
- `src/features/accounts/components/connection-flow.tsx` — modified, committed in `4ee03d7` ✓
- Commit `3a1afea` present in `git log` ✓
- Commit `4ee03d7` present in `git log` ✓
- `grep -rn "createProfile(" src/features/accounts/` empty ✓
- `pnpm typecheck` exit 0 ✓
- `pnpm vitest run` exit 0 (409/409) ✓
- `pnpm build` — environmental failure unrelated to changes; documented in Issues Encountered

---
*Phase: 15-browser-profile-schema-foundation*
*Completed: 2026-04-27*
