---
phase: 03-action-engine
plan: 09
subsystem: api
tags: [dm-expiry, approval-queue, cron, constants-alignment]

# Dependency graph
requires:
  - phase: 03-action-engine
    provides: createActionsFromSignal DM expiry (was 4h) and expireStaleActions cron threshold (was 4h)
provides:
  - DM expiry at 12 hours, aligned with phase CONTEXT locked decision
  - Cron expiry threshold matches creation-time expiry (single source of truth, 12h literal)
affects: [phase-03-uat, phase-05-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-constant-by-convention: create-time and cron-side expiry both use 12 * 60 * 60 * 1000 literal"

key-files:
  created: []
  modified:
    - src/features/actions/actions/create-actions.ts
    - src/lib/action-worker/expiry.ts

key-decisions:
  - "Kept literal 12h in both files (no shared constant module) per plan rule to minimize blast radius"

patterns-established:
  - "Gap-closure plans make deterministic constant changes with grep-based acceptance criteria"

requirements-completed: [ACTN-04, ACTN-10]

# Metrics
duration: 2min
completed: 2026-04-20
---

# Phase 3 Plan 9: 12-hour DM expiry alignment Summary

**Aligned DM expiry to 12h in both create-actions.ts and expiry.ts, closing UAT Gap 3 per phase CONTEXT locked decision**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-20T08:23:19Z
- **Completed:** 2026-04-20T08:25:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `createActionsFromSignal` now sets `expires_at` to 12 hours from creation (was 4h)
- `expireStaleActions` cron threshold now 12h (was 4h), matching creation expiry
- Both files carry the same literal `12 * 60 * 60 * 1000`, establishing a single source of truth by convention
- Comment header on expiry.ts updated from "4 hours" to "12 hours"

## Task Commits

Each task was committed atomically:

1. **Task 1: Change DM expiry to 12h in create-actions.ts** — `5c93d1c` (fix)
2. **Task 2: Align expiry cron threshold to 12h in expiry.ts** — `b7f8b84` (fix)

## Files Created/Modified
- `src/features/actions/actions/create-actions.ts` — `expires_at` now `Date.now() + 12 * 60 * 60 * 1000`, added inline comment citing CONTEXT decision
- `src/lib/action-worker/expiry.ts` — `fourHoursAgo` renamed to `twelveHoursAgo`; subtraction and `.lt("created_at", ...)` reference updated; header comment updated

## Decisions Made
- **Keep literal 12h in both files** (no shared constant module) — plan explicitly ruled this out to minimize blast radius for a 2-line deterministic change.
- **No cron schedule change** — `vercel.json` cron still runs hourly, so cards effectively live 12–13h. That latency is acceptable per CONTEXT ("silently disappear from queue when expired" — no countdown UX).

## Deviations from Plan

None — plan executed exactly as written. Both tasks applied the constant change per spec; no bugs, missing functionality, or blockers encountered in scope.

## Issues Encountered

Whole-project `pnpm typecheck` surfaced unrelated errors from in-flight sibling plans (plan 03-10 saveEdits added `onSave` prop dependency in parallel; plan 03-08 sidebar refactor touched `@/components/ui/sidebar`). Both errors are pre-existing or arrived from other gap-closure plans running in the same wave — **out of scope per SCOPE BOUNDARY rule** in execute-plan.md.

**Mitigation:** Ran a scoped tsc (`tsconfig.scoped.json` with only my two files in `include`) to confirm my changes introduce zero new type errors. Scoped typecheck passed with no output.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- UAT Gap 3 (MAJOR) closed: create-time and cron-time expiry thresholds are consistent at 12h.
- Phase 3 UAT can be re-run against ACTN-04 / ACTN-10 expectations and will now see matching constants.
- No blockers introduced.

## Self-Check: PASSED

- FOUND: `.planning/phases/03-action-engine/03-09-SUMMARY.md`
- FOUND: commit `5c93d1c` (Task 1: create-actions.ts 12h expiry)
- FOUND: commit `b7f8b84` (Task 2: expiry.ts 12h threshold)
- VERIFIED: `grep -c "4 \* 60 \* 60 \* 1000"` returns 0 in both target files
- VERIFIED: `grep -c "fourHoursAgo"` returns 0 in expiry.ts
- VERIFIED: scoped `tsc --noEmit` on the two modified files exits 0 (zero type errors from this plan's changes)

---
*Phase: 03-action-engine*
*Completed: 2026-04-20*
