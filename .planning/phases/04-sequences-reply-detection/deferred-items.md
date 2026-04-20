# Deferred Items — Phase 04

Out-of-scope issues discovered during phase 04 plan execution.

## Resolved

### Pre-existing TypeScript Error (Plan 04-01) — RESOLVED
- **Error:** `src/features/sequences/lib/__tests__/scheduler.test.ts(4,55): error TS2307: Cannot find module '../scheduler'`
- **Resolved by:** Plan 04-01 commit `c6deb8b` (RED tests) + scheduler/stop-on-reply implementation commit.

## Open

### Pre-existing TypeScript Error (Plan 04-02 incomplete)
- **Error:** `src/features/notifications/lib/__tests__/reply-alert.test.ts(13,32): error TS2307: Cannot find module '../send-reply-alert'`
- **Reason:** Plan 04-02 commit `e725830` appears to have introduced a test referencing an implementation that was not yet created.
- **Action:** Will be resolved when Plan 04-02's subsequent implementation task executes, or by the notifications plan that owns `send-reply-alert.ts`.
- **Out of scope for Plan 04-01** — notifications feature module is a separate plan.
