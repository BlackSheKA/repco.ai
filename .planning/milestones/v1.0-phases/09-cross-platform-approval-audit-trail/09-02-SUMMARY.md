---
phase: 09-cross-platform-approval-audit-trail
plan: "02"
subsystem: api
tags: [supabase, job_logs, audit-trail, worker, try-finally]

# Dependency graph
requires:
  - phase: 03-action-engine
    provides: worker.ts pipeline (GoLogin + CU execution + anti-ban wiring)
  - phase: 01-foundation
    provides: job_logs schema with job_type, status, user_id, action_id, metadata JSONB
provides:
  - worker.ts with try/finally pipeline writing exactly one schema-valid job_logs row per claimed action run
  - All 5 early-failure paths (no GoLogin profile, warmup gate, target isolation, daily limit, GoLogin connect) logged with status=failed
  - Re-queue (outside active hours) path correctly returns before try block with no job_logs row
affects: [OBSV-04 threshold alerts, job_logs audit queries, action debugging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "try/catch/finally pipeline state pattern: shared let variables (runStatus, runError, cuSteps, screenshotCount, runPlatform) accumulated along pipeline; finally block writes single job_logs row"
    - "earlyReturn flag pattern: early-failure paths set flag + shared state, fall through to finally rather than returning directly inside try"

key-files:
  created: []
  modified:
    - src/lib/action-worker/worker.ts

key-decisions:
  - "Active-hours re-queue check stays BEFORE try block so it never logs to job_logs (deferred actions should not pollute completed/failed rate math used by OBSV-04)"
  - "GoLogin profile check moved INSIDE try block so configuration errors produce a logged failed row"
  - "connection variable declared with let before try block so finally can safely guard-call disconnectProfile(connection.browser)"
  - "runActionType, runUserId, runActionId declared const (not let) because they are initialized from action at claim time and never reassigned"
  - "isWithinActiveHours called with ?? fallbacks (UTC/8/22) since account may be null at that call site"

patterns-established:
  - "Single-insert-per-run discipline via try/finally — mirrors cron job_logs discipline but extended with action_id + user_id FKs and cu_steps/screenshot_count CU telemetry"

requirements-completed:
  - OBSV-01

# Metrics
duration: 8min
completed: "2026-04-21"
---

# Phase 9 Plan 02: Worker Audit Trail Summary

**worker.ts refactored with try/catch/finally pipeline so every claimed action run writes exactly one schema-valid job_logs row (user_id, action_id, started_at, finished_at, duration_ms, error, metadata) — fixing OBSV-04 alert input that was silently dropped by PostgREST due to non-existent columns**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-21T16:34:35Z
- **Completed:** 2026-04-21T16:42:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed broken `job_logs` insert that referenced non-existent columns `details` and `correlation_id` (top-level); PostgREST was silently dropping these rows, starving OBSV-04 threshold alerts of input data
- Wrapped the full action pipeline in `try { ... } catch { ... } finally { ... }` with shared pipeline state variables that accumulate along whichever code path is taken
- All 5 early-failure paths (no GoLogin profile, warmup gate, target isolation, daily limit, GoLogin connect failure) now reach `finally` with `runStatus = "failed"` and write a schema-valid row
- Re-queue path (outside active hours) keeps its `return` before the `try` block — no `job_logs` row written, preserving clean success/fail rate math
- CU telemetry fields (`cu_steps`, `screenshot_count`) conditionally included in metadata only on paths that actually invoked the computer-use executor

## Task Commits

1. **Task 1: Refactor worker.ts with try/finally pipeline state and single schema-valid job_logs insert** - `8df00d1` (fix)

## Files Created/Modified

- `src/lib/action-worker/worker.ts` - try/catch/finally pipeline with shared state, single schema-valid job_logs insert in finally block, earlyReturn flag pattern for 5 early-failure paths

## Decisions Made

- Active-hours re-queue check stays BEFORE try block: deferred actions should not write job_logs (they will retry and log on that later run; logging each deferral would pollute OBSV-04 completed/failed rate math)
- GoLogin profile check moved inside try block: a missing `gologin_profile_id` is a configuration error that deserves a logged `failed` row
- `connection` declared with `let` before try so `finally` can safely call `disconnectProfile(connection.browser)` with an existence guard
- `runActionType`, `runUserId`, `runActionId` declared `const` (initialized at claim time, never reassigned) to satisfy `prefer-const` lint rule

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error: `isWithinActiveHours` expects `string` not `string | undefined`**
- **Found during:** Task 1 (typecheck run)
- **Issue:** After moving account fetch before try block, `account?.timezone` is `string | undefined` but the function signature requires `string`
- **Fix:** Added `?? "UTC"` / `?? 8` / `?? 22` fallbacks since active-hours guard runs after the GoLogin profile check but before account is confirmed non-null
- **Files modified:** src/lib/action-worker/worker.ts
- **Verification:** pnpm typecheck exits 0
- **Committed in:** 8df00d1 (part of task commit)

**2. [Rule 1 - Bug] TypeScript error: `disconnectProfile` expects `Browser` not `Browser | undefined`**
- **Found during:** Task 1 (typecheck run)
- **Issue:** `connection` declared with `let` (possibly undefined), so `connection?.browser` is `Browser | undefined` but the function signature requires `Browser`
- **Fix:** Added `if (connection?.browser) { await disconnectProfile(connection.browser) }` guard in finally block
- **Files modified:** src/lib/action-worker/worker.ts
- **Verification:** pnpm typecheck exits 0
- **Committed in:** 8df00d1 (part of task commit)

**3. [Rule 1 - Bug] ESLint `prefer-const` errors on runActionType, runUserId, runActionId**
- **Found during:** Task 1 (lint run)
- **Issue:** Three variables declared with `let` but never reassigned
- **Fix:** Changed to `const`
- **Files modified:** src/lib/action-worker/worker.ts
- **Verification:** eslint src/lib/action-worker/worker.ts passes
- **Committed in:** 8df00d1 (part of task commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — type/lint bugs surfaced by typecheck and linter)
**Impact on plan:** All three fixes required for correctness and clean compilation. No scope creep.

## Issues Encountered

- The acceptance criteria grep test `grep "correlation_id" worker.ts | grep -v "metadata"` reports FAIL because `correlation_id:` appears on its own line inside the `metadata: { ... }` object (standard multi-line formatting). The actual requirement is met — `correlation_id` is NOT a top-level Supabase insert column; it lives inside `metadata`. The line-content grep cannot detect nesting level.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- OBSV-01 action audit trail is now fully functional: every claimed action run writes one schema-valid `job_logs` row
- OBSV-04 threshold alerts (success rate < 80%, timeout rate > 5%) will now receive real action data to calculate against
- Phase 9 Plan 01 (approval-card.tsx cross-platform rendering) runs in parallel — no conflicts

---
*Phase: 09-cross-platform-approval-audit-trail*
*Completed: 2026-04-21*
