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

### Pre-existing ESLint errors (not caused by Plan 04-05) — DEFERRED

Discovered while running `pnpm lint` during Plan 04-05. All are in files NOT modified by this plan, or on lines that were already present before this plan touched the file. Out of scope per execution protocol (Rules 1-3 apply only to issues DIRECTLY caused by the current plan's changes).

- `src/app/(app)/page.tsx:43` — `Date.now` impure call during render. Pre-existing (line in the 24h-ago boundary for `signalsFound` query; untouched by this plan).
- `src/components/shell/theme-toggle.tsx:16` — setState sync within effect. Pre-existing.
- `src/features/dashboard/components/signal-feed.tsx:50` — setState sync within effect. Pre-existing.
- `src/hooks/use-mobile.ts:17` — setState sync within effect. Pre-existing.
- `src/features/sequences/lib/__tests__/scheduler.test.ts:42` — `any` in test mock. From Plan 04-01.
- `src/features/sequences/lib/__tests__/stop-on-reply.test.ts:65` — `any` in test mock. From Plan 04-01.
- Unused-var warnings in `schedule-followups/route.ts` (productDescription), `scheduler.test.ts` (actionsCallState) — from prior plans.

`pnpm typecheck` is CLEAN. These are style/best-practice lint rules, not type errors. Recommend a dedicated cleanup plan in Phase 5 or 6.

