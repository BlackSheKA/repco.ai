# Deferred Items — Phase 04

Out-of-scope issues discovered during phase 04 plan execution.

## Resolved

### Pre-existing TypeScript Error (Plan 04-01) — RESOLVED
- **Error:** `src/features/sequences/lib/__tests__/scheduler.test.ts(4,55): error TS2307: Cannot find module '../scheduler'`
- **Resolved by:** Plan 04-01 commit `c6deb8b` (RED tests) + scheduler/stop-on-reply implementation commit.

### Pre-existing TypeScript Error (Plan 04-02 RED phase) — RESOLVED
- **Error:** `src/features/notifications/lib/__tests__/reply-alert.test.ts(13,32): error TS2307: Cannot find module '../send-reply-alert'`
- **Reason:** RED phase of TDD — tests were committed first (commit `e1e9c15`) before implementation.
- **Resolved by:** Plan 04-02 GREEN phase commit `ce0dbc3` (send-reply-alert.ts, send-daily-digest.ts, send-account-warning.ts).
- **Final typecheck:** PASSING.

## Open

_None._
