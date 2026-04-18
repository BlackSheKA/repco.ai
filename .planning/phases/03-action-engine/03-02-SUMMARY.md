---
phase: 03-action-engine
plan: 02
subsystem: api
tags: [anthropic, claude-sonnet, dm-generation, quality-control, tdd, vitest]

# Dependency graph
requires:
  - phase: 02-reddit-monitoring-intent-feed
    provides: intent signals with suggested_angle for DM context
provides:
  - generateDM() function calling Claude Sonnet 4.6 with auto-retry
  - runQualityControl() function with automated rule-based DM validation
affects: [03-action-engine, approval-queue, action-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-call Anthropic client for serverless safety, rule-based QC without AI call, auto-retry with stricter prompt on QC failure]

key-files:
  created:
    - src/features/actions/lib/quality-control.ts
    - src/features/actions/lib/__tests__/quality-control.test.ts
    - src/features/actions/lib/dm-generation.ts
    - src/features/actions/lib/__tests__/dm-generation.test.ts
  modified: []

key-decisions:
  - "Rule-based QC (no second AI call) applied in strict order: empty, sentences, URL, price, post reference"
  - "Per-call Anthropic client instantiation for serverless safety (same pattern as Phase 2)"

patterns-established:
  - "QC-then-retry: generate DM, run QC rules, auto-retry once with failure reason appended to system prompt"
  - "Class-based vi.mock for Anthropic SDK default export in vitest"

requirements-completed: [ACTN-02, ACTN-03]

# Metrics
duration: 3min
completed: 2026-04-18
---

# Phase 3 Plan 2: DM Generation + Quality Control Summary

**Claude Sonnet 4.6 DM generation with automated QC rules (sentence count, URL, price, post reference) and single auto-retry on failure**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-18T09:15:12Z
- **Completed:** 2026-04-18T09:18:11Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented runQualityControl() with 6 ordered rules: empty check, sentence count (max 3), URL detection, price/promo mention detection, post reference verification
- Implemented generateDM() calling claude-sonnet-4-6-20250514 with max_tokens 300, auto-retries once on QC failure with stricter prompt, drops silently on second failure
- Full TDD coverage: 8 QC tests + 6 DM generation tests, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Quality control rules with TDD** - `f93d2f2` (feat)
2. **Task 2: DM generation with Claude Sonnet 4.6 and auto-retry** - `caf8087` (feat)

## Files Created/Modified
- `src/features/actions/lib/quality-control.ts` - QCResult interface and runQualityControl function with 6 ordered validation rules
- `src/features/actions/lib/__tests__/quality-control.test.ts` - 8 test cases covering all QC pass/fail scenarios
- `src/features/actions/lib/dm-generation.ts` - generateDM function with Anthropic SDK integration, QC check, and auto-retry
- `src/features/actions/lib/__tests__/dm-generation.test.ts` - 6 test cases with mocked Anthropic SDK

## Decisions Made
- Rule-based QC applied in strict order (empty -> sentences -> URL -> price -> post reference -> pass) to fail fast on cheapest checks
- Per-call Anthropic client instantiation follows serverless safety pattern established in Phase 2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock for Anthropic SDK default export**
- **Found during:** Task 2 (DM generation tests)
- **Issue:** vi.fn()-based mock was not constructable with `new`; `new Anthropic()` threw "is not a constructor"
- **Fix:** Used class-based mock (`class MockAnthropic`) instead of vi.fn() for default export
- **Files modified:** src/features/actions/lib/__tests__/dm-generation.test.ts
- **Verification:** All 6 tests pass
- **Committed in:** caf8087 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Mock syntax fix necessary for test execution. No scope creep.

## Issues Encountered
None beyond the mock constructor issue documented above.

## User Setup Required
None - no external service configuration required. ANTHROPIC_API_KEY is already expected in environment for runtime use.

## Next Phase Readiness
- DM generation and QC functions ready for integration with approval queue (Plan 3+)
- generateDM() accepts postContent, productDescription, suggestedAngle -- maps directly to intent signal data
- QC auto-retry ensures only quality DMs reach the approval queue

---
*Phase: 03-action-engine*
*Completed: 2026-04-18*
