---
phase: 03-action-engine
plan: 08
subsystem: ui
tags: [supabase, rsc, sidebar, notification-dot, shadcn]

requires:
  - phase: 03-action-engine
    provides: social_accounts table with health_status column + AppSidebar dot UI (already wired for prop consumption)
provides:
  - hasAccountAlerts prop plumbed from (app)/layout server query → AppShell → AppSidebar
  - Server-side count query on social_accounts filtered by non-healthy health_status
  - Visual reactive red dot on Accounts nav item on page loads
affects: [05-billing-onboarding, 03-UAT gap closures]

tech-stack:
  added: []
  patterns:
    - "Server Component data fetching in route-group layout, passed as props to client shell"
    - "Count-only Supabase query with { count: 'exact', head: true } for cheap existence checks"
    - "Fail-safe null coalescing so RLS/edge errors produce no false positive UI state"

key-files:
  created: []
  modified:
    - src/components/shell/app-shell.tsx
    - src/app/(app)/layout.tsx

key-decisions:
  - "Query happens in Server Component layout (not client shell) since app-shell.tsx is 'use client'"
  - "Use count/head query instead of fetching rows — we only need a boolean"
  - "Coalesce null count → 0 so any query error fails safe to no dot rather than spurious alert"
  - "Realtime-driven dot updates deferred to a future client hook; page-reload reactivity sufficient for MVP"

patterns-established:
  - "Layout-level server queries feed UI flags through AppShell props to the client sidebar"

requirements-completed: [ACCT-03]

duration: 4min
completed: 2026-04-20
---

# Phase 03 Plan 08: Sidebar Account-Alert Dot Wiring Summary

**Server-side social_accounts count query in (app)/layout now drives the red alert dot on the Accounts sidebar item via hasAccountAlerts prop passthrough through AppShell to AppSidebar.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-20T08:21:00Z
- **Completed:** 2026-04-20T08:24:47Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- AppShell accepts and forwards `hasAccountAlerts?: boolean` to AppSidebar
- `(app)/layout.tsx` runs a cheap count query on social_accounts filtered by `health_status IN ('warning','cooldown','banned')` and passes the boolean flag
- UAT Gap 2 (MAJOR) closed — ACCT-03 is now fully live; users with any non-healthy account see the red dot on Accounts nav

## Task Commits

1. **Task 1: Add hasAccountAlerts prop to AppShell and forward to AppSidebar** — `f9deceb` (feat)
2. **Task 2: Query alert-bearing accounts in (app)/layout.tsx and pass hasAccountAlerts** — `4b066fc` (feat)

**Plan metadata:** pending (docs commit with SUMMARY/STATE/ROADMAP)

## Files Created/Modified

- `src/components/shell/app-shell.tsx` — Added `hasAccountAlerts?: boolean` to `AppShellProps`, destructured it, and forwarded to `<AppSidebar />`
- `src/app/(app)/layout.tsx` — Added a count-only supabase query on `social_accounts` filtered by non-healthy `health_status`, coalesced null to 0, derived `hasAccountAlerts` boolean, passed to `<AppShell />`

## Query Shape

```ts
const { count: alertCount } = await supabase
  .from("social_accounts")
  .select("id", { count: "exact", head: true })
  .eq("user_id", user.id)
  .in("health_status", ["warning", "cooldown", "banned"])

const hasAccountAlerts = (alertCount ?? 0) > 0
```

- `count: "exact", head: true` — server returns count in Prefer header, no row payload (cheapest possible form)
- `.eq("user_id", user.id)` — defensive; RLS already restricts to own rows
- `alertCount ?? 0` — any RLS/network edge case produces false (fail-safe: no spurious alert)

## Decisions Made

- Query lives in the Server Component layout because `app-shell.tsx` is `"use client"` and cannot run a supabase RSC query directly
- No change to AppSidebar — the dot span and conditional render were already wired to consume `hasAccountAlerts`
- Realtime updates for the dot are deferred; a page reload is sufficient for MVP. A future client hook subscribed to the `social_accounts` channel could update the flag live (noted as future work, not blocking)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Pre-existing typecheck error (out of scope):** `src/features/actions/actions/approval-actions.ts(4,19): Cannot find module 'zod'`. Verified pre-existing by stashing 03-08 edits and re-running `pnpm typecheck` (same error). Logged to `.planning/phases/03-action-engine/deferred-items.md` — to be addressed in a dedicated fix plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Sidebar alert dot fully reactive on page loads; Phase 5 (billing/onboarding) and ongoing UAT can rely on ACCT-03 visual cue
- Future improvement (not blocking): a client-side Realtime subscription on `social_accounts` changes to update the flag without page reload

## Self-Check

Verification before state updates:

- File `src/components/shell/app-shell.tsx` — FOUND (3 `hasAccountAlerts` matches confirmed)
- File `src/app/(app)/layout.tsx` — FOUND (2 `hasAccountAlerts` matches, 1 `health_status`, 1 `social_accounts`)
- Commit `f9deceb` — FOUND
- Commit `4b066fc` — FOUND

## Self-Check: PASSED

---
*Phase: 03-action-engine*
*Completed: 2026-04-20*
