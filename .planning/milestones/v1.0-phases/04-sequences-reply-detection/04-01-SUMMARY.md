---
phase: 04-sequences-reply-detection
plan: 01
subsystem: sequences
tags: [database-migration, sequences, follow-up-scheduling, stop-on-reply, tdd]

requires:
  - phase: 01-foundation
    provides: Supabase schema foundation (actions, prospects, social_accounts tables + enums)
  - phase: 03-action-engine
    provides: ActionStatus type, action_type enum (followup_dm), action execution patterns
provides:
  - DB migration 00007 with cancelled enum, sequence columns, timezone, inbox tracking, indexes
  - FOLLOW_UP_SCHEDULE constant (day 3/7/14 with angles)
  - DueFollowUp + SequenceProgress types
  - findDueFollowUps + getNextFollowUpStep logic
  - handleReplyDetected stop-on-reply handler
  - 20 passing Vitest tests (TDD)
affects: [04-sequences-reply-detection, 05-billing-onboarding-growth]

tech-stack:
  added: []
  patterns:
    - "TDD RED-GREEN-REFACTOR: test file committed before implementation (expected typecheck fail in RED)"
    - "Pure helper (getNextFollowUpStep) extracted from DB-coupled function (findDueFollowUps) for unit testability"
    - "Supabase query chain mocked with vi.fn() chaining to enable unit tests without live DB"
    - "Idempotent reply handler — checks pipeline_status before any mutation; returns false on already-replied"

key-files:
  created:
    - supabase/migrations/00007_phase4_sequences_notifications.sql
    - src/features/sequences/lib/types.ts
    - src/features/sequences/lib/scheduler.ts
    - src/features/sequences/lib/stop-on-reply.ts
    - src/features/sequences/lib/__tests__/scheduler.test.ts
    - src/features/sequences/lib/__tests__/stop-on-reply.test.ts
    - .planning/phases/04-sequences-reply-detection/deferred-items.md
  modified:
    - src/features/actions/lib/types.ts

key-decisions:
  - "Sequence state tracked on prospects table (sequence_stopped, last_reply_snippet, replied_detected_at) — no separate table; keeps queries simple"
  - "getNextFollowUpStep is a pure function (no DB) to enable unit tests without mocking; findDueFollowUps wraps it with DB queries"
  - "Missed-step progression: if step 1 was expired/skipped and day >= 7, scheduler returns step 2 directly (not step 1)"
  - "handleReplyDetected is idempotent: if pipeline_status is already 'replied', returns false immediately and makes no DB calls"

patterns-established:
  - "sequences feature module: lib/types.ts + lib/scheduler.ts + lib/stop-on-reply.ts + lib/__tests__/"
  - "Supabase mock chain pattern: vi.fn() on each chained method (from/select/eq/in/order/limit/single)"

requirements-completed: [FLLW-01, FLLW-02, FLLW-03, FLLW-04]

duration: 3min
completed: 2026-04-20
---

# Phase 04 Plan 01: Follow-up Scheduler + Stop-on-Reply Summary

**DB migration 00007 (cancelled enum, sequence columns, timezone, inbox tracking) + pure follow-up scheduling logic + idempotent stop-on-reply handler with 20/20 TDD tests**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-04-20T08:23:47Z
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 1

## Accomplishments

- Created migration `00007_phase4_sequences_notifications.sql` with all 8 Phase 4 schema changes:
  - Added `cancelled` to `action_status_type` enum
  - Added `sequence_stopped`, `last_reply_snippet`, `last_reply_at`, `replied_detected_at` columns to `prospects`
  - Added `auto_send_followups` and `timezone` columns to `users`
  - Added `last_inbox_check_at` and `consecutive_inbox_failures` columns to `social_accounts`
  - Enabled Supabase Realtime on `prospects` table
  - Created `idx_prospects_sequence_active` index (pipeline_status = contacted AND sequence_stopped = false)
  - Created `idx_actions_prospect_followup` index (action_type = followup_dm)
- Created `src/features/sequences/lib/types.ts` with `FOLLOW_UP_SCHEDULE` (day 3/7/14 with feature/value/check-in angles), `FollowUpStep`, `DueFollowUp`, and `SequenceProgress` types
- Extended `ActionStatus` union in `src/features/actions/lib/types.ts` with `"cancelled"` value
- Implemented `getNextFollowUpStep` — pure function walking the schedule, skipping completed steps, returning first due step
- Implemented `findDueFollowUps` — queries `contacted` + non-stopped prospects, skips those with pending/approved followup_dm actions, and returns `DueFollowUp[]` for each prospect whose next step is due
- Implemented `handleReplyDetected` — cancels all pending/approved `followup_dm` actions, flips prospect to `replied` + `sequence_stopped`, stores reply snippet and detection timestamp; idempotent on already-replied prospects
- Wrote 20 Vitest unit tests across scheduler and stop-on-reply suites; all pass

## Task Commits

1. **Task 1 (DB migration + shared types)** — `fb4594a` (feat)
2. **Task 2 RED (failing tests)** — `c6deb8b` (test)
3. **Task 2 GREEN (implementation)** — `dae5bfd` (feat)

No refactor commit needed — GREEN implementation was minimal and clean.

## Files Created/Modified

### Created

- `supabase/migrations/00007_phase4_sequences_notifications.sql` — Full Phase 4 schema migration
- `src/features/sequences/lib/types.ts` — FOLLOW_UP_SCHEDULE, FollowUpStep, DueFollowUp, SequenceProgress
- `src/features/sequences/lib/scheduler.ts` — findDueFollowUps, getNextFollowUpStep
- `src/features/sequences/lib/stop-on-reply.ts` — handleReplyDetected
- `src/features/sequences/lib/__tests__/scheduler.test.ts` — 14 tests
- `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` — 6 tests
- `.planning/phases/04-sequences-reply-detection/deferred-items.md` — Deferred issue log (all resolved)

### Modified

- `src/features/actions/lib/types.ts` — Added `"cancelled"` to ActionStatus union

## Decisions Made

- **Sequence state on prospects table** — `sequence_stopped`, `last_reply_snippet`, `replied_detected_at` stored directly on `prospects` rather than a separate sequences table. Keeps queries simple and avoids an extra JOIN in the scheduler.
- **Pure helper extracted** — `getNextFollowUpStep(completedSteps, daysSinceInitialDm)` is a pure function so it can be unit-tested without any Supabase mock. `findDueFollowUps` calls it internally.
- **Missed-step skip** — If step 1 was expired/missed and enough days have passed for step 2, the scheduler returns step 2 directly. This prevents sending stale step-1 content to a prospect who is now 7+ days out.
- **Idempotent reply handler** — `handleReplyDetected` checks `pipeline_status` before any mutation and returns `false` immediately if already `replied`. Prevents duplicate cancellations on repeated calls.

## Deviations from Plan

None — plan executed exactly as written. The TDD RED commit briefly caused a typecheck error (expected behavior for RED phase) that was resolved by the GREEN commit.

## Test Results

```
Test Files  2 passed (2)
     Tests  20 passed (20)
  Duration  282ms
```

- `getNextFollowUpStep` — 6 unit tests (day 3/7/14, all-done, not-yet-due, skip-missed-step)
- `findDueFollowUps` — 8 integration-unit tests with mocked Supabase
- `handleReplyDetected` — 6 tests (cancel, status update, sequence_stopped, snippet, already-replied, not-found)

## Self-Check: PASSED

Verified:

- `supabase/migrations/00007_phase4_sequences_notifications.sql` — FOUND
- `src/features/sequences/lib/types.ts` — FOUND
- `src/features/sequences/lib/scheduler.ts` — FOUND
- `src/features/sequences/lib/stop-on-reply.ts` — FOUND
- `src/features/sequences/lib/__tests__/scheduler.test.ts` — FOUND
- `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` — FOUND
- Commit `fb4594a` — FOUND
- Commit `c6deb8b` — FOUND
- Commit `dae5bfd` — FOUND
- Tests: 20/20 passing
- Typecheck: clean

---
*Phase: 04-sequences-reply-detection*
*Completed: 2026-04-20*
