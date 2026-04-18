---
phase: 03-action-engine
plan: 03
subsystem: api
tags: [anthropic, computer-use, playwright, supabase-rpc, anti-ban, cron, webhook]

requires:
  - phase: 03-01
    provides: "GoLogin adapter, action/account types, CUResult interface, DB functions (claim_action, check_and_increment_limit)"
  - phase: 03-02
    provides: "DM generation and QC pipeline"
  - phase: 03-04
    provides: "Anti-ban modules (delays, noise, target-isolation)"
provides:
  - "Haiku CU executor with 15-step cap and stuck detection"
  - "Screenshot capture, comparison, and Supabase Storage upload (signed URLs)"
  - "Reddit DM and engagement prompt generators"
  - "Action worker pipeline with full anti-ban wiring"
  - "Atomic action claiming via Supabase RPC"
  - "Daily action limit enforcement"
  - "Webhook handler for approved action execution"
  - "Expiry cron for stale pending_approval actions"
affects: [03-06, 04-sequences, 05-billing]

tech-stack:
  added: ["@anthropic-ai/sdk"]
  patterns: ["CU agent loop with step cap + stuck detection", "DB webhook -> worker pipeline", "anti-ban module wiring pattern"]

key-files:
  created:
    - src/lib/computer-use/executor.ts
    - src/lib/computer-use/screenshot.ts
    - src/lib/computer-use/actions/reddit-dm.ts
    - src/lib/computer-use/actions/reddit-engage.ts
    - src/lib/action-worker/worker.ts
    - src/lib/action-worker/claim.ts
    - src/lib/action-worker/limits.ts
    - src/lib/action-worker/expiry.ts
    - src/app/api/webhooks/actions/route.ts
    - src/app/api/cron/expire-actions/route.ts
    - src/lib/computer-use/__tests__/stuck-detection.test.ts
    - src/lib/action-worker/__tests__/claim.test.ts
    - src/lib/action-worker/__tests__/limits.test.ts
    - src/lib/action-worker/__tests__/expiry.test.ts
  modified:
    - vercel.json
    - package.json

key-decisions:
  - "SupabaseClient type annotation on createServiceClient return to resolve generic param mismatch in supabase-js 2.103"
  - "CU coordinate-based input mapping for Anthropic computer_20250124 tool format"

patterns-established:
  - "CU executor pattern: initial screenshot -> agent loop -> tool_use -> executeComputerAction -> screenshot -> stuck check"
  - "Worker pipeline order: claim -> target isolation -> warmup gate -> active hours -> limits -> delay -> noise -> connect -> execute"

requirements-completed: [ACTN-01, ACTN-04, ACTN-05, ACTN-06, ACTN-07, ACTN-08, ACTN-09, ACTN-10]

duration: 6min
completed: 2026-04-18
---

# Phase 03 Plan 03: Action Execution Pipeline Summary

**Haiku CU executor with 15-step cap and stuck detection, action worker pipeline with full anti-ban module wiring, webhook handler, and hourly expiry cron**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-18T09:36:55Z
- **Completed:** 2026-04-18T09:43:12Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Haiku CU agent loop executor capped at 15 steps with 3-identical-screenshot stuck detection
- Screenshot capture/compare/upload with private bucket signed URLs (7-day expiry)
- Complete action worker pipeline wiring all anti-ban modules: target isolation, warmup gate, active hours, daily limits, random delay, behavioral noise
- Webhook handler for DB-triggered approved action execution (maxDuration=300)
- Hourly expiry cron for stale pending_approval actions (12h threshold)
- 4 test files with 16 new tests (claim, limits, expiry, stuck-detection) all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Haiku CU executor + screenshot management + stuck detection tests** - `db7d61e` (feat)
2. **Task 2: Action worker pipeline with anti-ban wiring + webhook handler + limits + expiry cron + tests** - `26dc3f7` (feat)

## Files Created/Modified
- `src/lib/computer-use/executor.ts` - Haiku CU agent loop with step cap and stuck detection
- `src/lib/computer-use/screenshot.ts` - Screenshot capture, comparison (isStuck), and Supabase Storage upload
- `src/lib/computer-use/actions/reddit-dm.ts` - Reddit DM prompt generator
- `src/lib/computer-use/actions/reddit-engage.ts` - Reddit like/follow prompt generators
- `src/lib/action-worker/worker.ts` - Main action execution pipeline orchestrator with anti-ban wiring
- `src/lib/action-worker/claim.ts` - Atomic action claiming via Supabase RPC
- `src/lib/action-worker/limits.ts` - Daily action limit checking and incrementing
- `src/lib/action-worker/expiry.ts` - Expiry logic for stale pending_approval actions
- `src/app/api/webhooks/actions/route.ts` - DB Webhook handler for action execution
- `src/app/api/cron/expire-actions/route.ts` - Cron endpoint to expire stale actions
- `src/lib/computer-use/__tests__/stuck-detection.test.ts` - 5 tests for isStuck function
- `src/lib/action-worker/__tests__/claim.test.ts` - 3 tests for claimAction RPC wrapper
- `src/lib/action-worker/__tests__/limits.test.ts` - 4 tests for limit checking
- `src/lib/action-worker/__tests__/expiry.test.ts` - 3 tests for expiry logic
- `vercel.json` - Added expire-actions cron schedule
- `package.json` - Added @anthropic-ai/sdk dependency

## Decisions Made
- Used `SupabaseClient` type annotation on `createServiceClient()` return to resolve generic parameter mismatch with supabase-js 2.103 strict types
- CU executor maps Anthropic's `coordinate` array format (computer_20250124) to Playwright mouse/keyboard actions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SupabaseClient generic type mismatch**
- **Found during:** Task 2 (worker.ts typecheck)
- **Issue:** `createClient()` returns `SupabaseClient<any, "public", ...>` which is incompatible with imported functions expecting `SupabaseClient` base type
- **Fix:** Added explicit `SupabaseClient` return type annotation on `createServiceClient()` helper
- **Files modified:** src/lib/action-worker/worker.ts
- **Verification:** `pnpm typecheck` passes
- **Committed in:** 26dc3f7 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed BetaContentBlock type incompatibility in CU executor**
- **Found during:** Task 1 (executor.ts typecheck)
- **Issue:** `response.content` from beta messages API returns `BetaContentBlock[]` which is not assignable to `ContentBlockParam[]`
- **Fix:** Cast via `unknown` to `ContentBlockParam[]` for message history
- **Files modified:** src/lib/computer-use/executor.ts
- **Verification:** `pnpm typecheck` passes
- **Committed in:** db7d61e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None beyond the type fixes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Action execution pipeline complete, ready for approval queue UI (03-06)
- Anti-ban modules fully wired into worker pipeline
- CU executor ready for testing with real GoLogin profiles

---
*Phase: 03-action-engine*
*Completed: 2026-04-18*
