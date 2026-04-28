---
phase: 15-browser-profile-schema-foundation
plan: 02
subsystem: schema-foundation
tags: [refactor, schema, helper, worker, cron]
requires:
  - 15-01 (browser_profiles helper + types + migration 00023)
provides:
  - All consumer reads of GoLogin profile/proxy go through helper
  - BPRX-02 acceptance gate satisfied
affects:
  - src/features/accounts/actions/account-actions.ts
  - src/features/accounts/components/account-card.tsx
  - src/lib/action-worker/worker.ts
  - src/app/api/cron/check-replies/route.ts
  - src/app/api/cron/linkedin-prescreen/route.ts
  - src/lib/action-worker/__tests__/worker-quarantine.test.ts
  - src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts
  - src/app/api/cron/check-replies/__tests__/route.test.ts
  - src/features/browser-profiles/lib/get-browser-profile.ts (Plan 01 helper — type-cast bug fix)
tech-stack:
  added: []
  patterns:
    - vi.mock("@/features/browser-profiles/lib/get-browser-profile") for unit tests
    - "Resolve once, reuse" — worker.ts calls helper once at top of executeAction body
key-files:
  created: []
  modified:
    - src/features/accounts/actions/account-actions.ts
    - src/features/accounts/components/account-card.tsx
    - src/lib/action-worker/worker.ts
    - src/app/api/cron/check-replies/route.ts
    - src/app/api/cron/linkedin-prescreen/route.ts
    - src/lib/action-worker/__tests__/worker-quarantine.test.ts
    - src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts
    - src/app/api/cron/check-replies/__tests__/route.test.ts
    - src/features/browser-profiles/lib/get-browser-profile.ts
decisions:
  - linkedin-prescreen uses getBrowserProfileById (post .not(...is.null) filter — id-direct read avoids extra JOIN)
  - worker.ts resolves browser profile once near top of executeAction; reused across all former gologin_profile_id guards
  - connectAccount writes browser_profile_id: null (allocator in Phase 17 populates)
  - createProfile() retained in connectAccount so profileId can still be returned to caller for UX continuity
  - Plan 01 helper had a TS2352 type-cast bug (Supabase generated types widen FK embed to BrowserProfile[]); fixed via cast through unknown
metrics:
  duration: ~25 min
  completed: 2026-04-27
requirements: [BPRX-02]
---

# Phase 15 Plan 02: Reader-Site Refactor Summary

One-liner: Refactored all 5 production reader sites and 3 test files to consume `getBrowserProfileForAccount` / `getBrowserProfileById` instead of the dropped `social_accounts.gologin_profile_id` / `proxy_id` columns; full unit-test suite green.

## What Was Refactored

### Production source (5 files)

| File | Change |
|------|--------|
| `src/features/accounts/actions/account-actions.ts` | `connectAccount` writes `browser_profile_id: null`; `deleteAccount` resolves via `getBrowserProfileById` before GoLogin cleanup; `start/stopAccountBrowser` resolve via `getBrowserProfileForAccount` |
| `src/features/accounts/components/account-card.tsx` | `onReconnect` now passes `account.browser_profile_id` (was `gologin_profile_id`) — props signature unchanged |
| `src/lib/action-worker/worker.ts` | Helper resolved once near top of `executeAction` body; three former `account?.gologin_profile_id` guard sites now check `browserProfile`; `connectToProfile` consumes `browserProfile.gologin_profile_id` |
| `src/app/api/cron/check-replies/route.ts` | Selects `browser_profile_id`, resolves via helper, warn-skip on null |
| `src/app/api/cron/linkedin-prescreen/route.ts` | `.not("browser_profile_id", "is", null)` filter; `getBrowserProfileById` used since the filter already guarantees non-null |

### Test source (3 files)

All three test files now `vi.mock("@/features/browser-profiles/lib/get-browser-profile", ...)` with a `mockBrowserProfile` factory that returns a `BrowserProfile` row with `gologin_profile_id: "gp-test-id"` (or `gp-1`) defaults. Account fixture rows updated from `gologin_profile_id: "gp-X"` to `browser_profile_id: "bp-X"`. Inline types updated from `gologin_profile_id: string` to `browser_profile_id: string | null`.

### Plan 01 helper (1 file — Rule 3 fix)

`src/features/browser-profiles/lib/get-browser-profile.ts` had a `TS2352` cast error: Supabase's generated types widen FK embeds to `BrowserProfile[]` even on to-one relationships, breaking the direct `as` cast. Fixed by casting through `unknown` first, with a comment documenting the runtime-vs-types mismatch. This was a Plan 01 carry-over surfaced by Plan 02's typecheck.

## Verification

### `pnpm typecheck`

```
src/app/(auth)/login/page.tsx: TS2307: Cannot find module '@/app/images/repco-dark-mode.svg'
src/app/(auth)/login/page.tsx: TS2307: Cannot find module '@/app/images/repco-light-mode.svg'
src/app/(public)/layout.tsx:  TS2307 × 2 (same SVG modules)
src/components/shell/app-sidebar.tsx: TS2307 × 2 (same SVG modules)
ELIFECYCLE Command failed with exit code 2.
```

**6 errors, all pre-existing and out of scope.** Confirmed by stashing Plan 02 changes and re-running typecheck — identical 6 errors plus the (now-fixed) Plan 01 helper TS2352 are produced. SVG module-resolution errors are unrelated to schema refactor work; logged as deferred items rather than fixed (CLAUDE.md "scope boundary" rule).

After Plan 02 fix to the helper: **0 errors introduced by Plan 02. The helper TS2352 was eliminated.**

### `pnpm vitest run`

```
Test Files  55 passed (55)
Tests       409 passed (409)
Duration    21.73s
```

All 3 Plan-02-touched test files pass:
- `src/lib/action-worker/__tests__/worker-quarantine.test.ts` (6 tests)
- `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts` (3 tests)
- `src/app/api/cron/check-replies/__tests__/route.test.ts` (1 test)

No regressions in the other 52 test files.

### `pnpm build`

```
Module not found: Can't resolve '@radix-ui/react-dismissable-layer'
ELIFECYCLE Command failed with exit code 1.
```

**Pre-existing pnpm workspace dep resolution failure**, not introduced by Plan 02. The missing module (`@radix-ui/react-dismissable-layer`) is a transitive dep of `@radix-ui/react-tooltip` used by `inbox-warning-banner.tsx` — none of Plan 02's surface area touches tooltip/dismissable-layer code. Logged as deferred item.

### Global grep coverage gate (BPRX-02 acceptance)

Strict legacy pattern check (`account.gologin_profile_id`, `account.proxy_id`, `.select("...gologin_profile_id...")`, `.not("gologin_profile_id"...)` etc.):

```bash
grep -rnE "account\.(gologin_profile_id|proxy_id)|\.select\([^)]*\bgologin_profile_id\b|\.select\([^)]*\bproxy_id\b|gologin_profile_id: profileId|\.not\(\"gologin_profile_id\"" src/ --include="*.ts" --include="*.tsx"
```

**Output:**
```
src/features/browser-profiles/lib/get-browser-profile.ts:39:    .select("id, gologin_profile_id, gologin_proxy_id, ...")
```

Single hit, intentional — the helper itself selects from `browser_profiles` table where these are legitimate column names. Every other consumer routes through the helper.

### Plan-stated grep gate (literal "0 matches" target)

```
src/app/api/cron/check-replies/route.ts:227:        connection = await connectToProfile(browserProfile.gologin_profile_id)
src/app/api/cron/check-replies/__tests__/route.test.ts:8:  gologin_profile_id: "gp-1",
src/app/api/cron/linkedin-prescreen/route.ts:203:        connection = await connectToProfile(browserProfile.gologin_profile_id)
src/features/accounts/actions/account-actions.ts:130:    const session = await startCloudBrowser(browserProfile.gologin_profile_id)
src/features/accounts/actions/account-actions.ts:159:    await stopCloudBrowser(browserProfile.gologin_profile_id)
src/features/accounts/actions/account-actions.ts:210:    gologinProfileId = browserProfile?.gologin_profile_id ?? null
src/lib/action-worker/worker.ts:131:  //    social_accounts.gologin_profile_id read). Resolved ONCE here and
src/lib/action-worker/worker.ts:265:      connection = await connectToProfile(browserProfile!.gologin_profile_id)
src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts:21:  gologin_profile_id: "gp-test-id",
src/lib/action-worker/__tests__/worker-quarantine.test.ts:20:  gologin_profile_id: "gp-test-id",
```

All matches are references to `BrowserProfile.gologin_profile_id` (the **helper's return-shape field**, used after resolution) or to that field's value in `mockBrowserProfile` factories. The `BrowserProfile` interface in `src/features/accounts/lib/types.ts` literally defines `gologin_profile_id: string` — so the substring is unavoidable in any code that consumes the helper's return value.

The plan's literal "0 matches" target is **incompatible with its own `<interfaces>` block** (which mandates `BrowserProfile { gologin_profile_id, gologin_proxy_id, ... }`). Plan 01 SUMMARY flagged the same conflict. The intent of the criterion — "no consumer reads `social_accounts.gologin_profile_id` directly" — **IS satisfied** (verified above by the strict-pattern grep).

### Cron route smoke test

Skipped — the worktree runs against the dev Supabase branch (`effppfiphrykllkpkdbv`) where `social_accounts` was wiped by migration 00023. Smoke test would yield empty-result 200 with no insight. Code-path validation is provided by the unit tests instead (`check-replies` route test exercises the full GET handler).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Fixed Plan 01 helper TS2352 cast bug**
- **Found during:** Task 3 typecheck verification.
- **Issue:** `src/features/browser-profiles/lib/get-browser-profile.ts:26` cast `data as { browser_profiles: BrowserProfile | null }` — but Supabase's generated types widen FK embeds to `BrowserProfile[]`, producing `TS2352 may be a mistake because neither type sufficiently overlaps`.
- **Fix:** Cast through `unknown` first (`data as unknown as {...}`) with a comment explaining the runtime-vs-types mismatch.
- **Files modified:** `src/features/browser-profiles/lib/get-browser-profile.ts`
- **Commit:** `5bdfc05`

### Deferred Issues (out of scope, logged for future work)

- **6× `TS2307` SVG module errors** in `(auth)/login/page.tsx`, `(public)/layout.tsx`, `components/shell/app-sidebar.tsx` — files exist on disk in `src/app/images/` but `tsconfig` lacks SVG module declarations. Pre-existing.
- **`@radix-ui/react-dismissable-layer` missing** — pnpm workspace transitive dep resolution failure inside the worktree's nested `node_modules`. Affects `pnpm build` only (not vitest, not typecheck). Pre-existing, may be related to worktree-vs-main `node_modules` divergence.

## Production Schema Untouched

No curl/SQL/migration commands were issued against `cmkifdwjunojgigrqwnr` during this plan. All changes are source-code only.

## Phase 17 Handoff

The allocator's surface area for Phase 17 is now well-defined:

1. **`connectAccount` in `src/features/accounts/actions/account-actions.ts`** — currently writes `browser_profile_id: null`. The allocator should either:
   - call into account-actions and follow up with a separate INSERT into `browser_profiles` + UPDATE on `social_accounts`, OR
   - intercept the `connectAccount` flow and populate `browser_profile_id` before INSERT.
2. **`src/features/browser-profiles/`** is the new feature directory — Phase 17 should colocate its allocator logic here (not in `src/features/accounts/`) so the FK target's lifecycle is explicit.
3. The `BrowserProfile` type and helper are stable and consumed everywhere; the allocator only needs to write to `browser_profiles` (cols documented in migration 00023).

## Commits

- `3501d97` — refactor(15-02): route account-actions GoLogin reads through helper
- `bc4f017` — refactor(15-02): route worker + crons + account-card through browser profile helper
- `5bdfc05` — test(15-02): mock browser profile helper in 3 affected test files

## Self-Check

- src/features/accounts/actions/account-actions.ts — modified, 5 helper-call sites
- src/features/accounts/components/account-card.tsx — modified, browser_profile_id passed
- src/lib/action-worker/worker.ts — modified, helper imported + 3 guard-site refactor
- src/app/api/cron/check-replies/route.ts — modified, helper imported + select changed
- src/app/api/cron/linkedin-prescreen/route.ts — modified, helper imported + .not filter changed
- src/lib/action-worker/__tests__/worker-quarantine.test.ts — modified, vi.mock added
- src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts — modified, vi.mock added
- src/app/api/cron/check-replies/__tests__/route.test.ts — modified, vi.mock added
- src/features/browser-profiles/lib/get-browser-profile.ts — modified, TS2352 fix
- 3501d97 — FOUND
- bc4f017 — FOUND
- 5bdfc05 — FOUND
- pnpm typecheck — only 6 pre-existing SVG TS2307 errors; 0 introduced by Plan 02
- pnpm vitest run — 409/409 PASS
- pnpm build — pre-existing radix dep failure unrelated to Plan 02
- Strict legacy-pattern grep gate — only the helper itself reads `browser_profiles.gologin_profile_id` (legitimate)
- Production schema cmkifdwjunojgigrqwnr UNTOUCHED

## Self-Check: PASSED
