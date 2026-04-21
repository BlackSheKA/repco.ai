---
phase: 10-linkedin-outreach-execution
plan: "01"
subsystem: types
tags: [typescript, types, linkedin, connection_request, warmup, billing]
dependency_graph:
  requires: []
  provides:
    - ActionType union with connection_request
    - ActionCreditType union with connection_request
    - CREDIT_COSTS.connection_request = 20
    - WarmupState.allowedActions union with connection_request
    - getWarmupState() day-4+ and day-8+/completed buckets include connection_request
  affects:
    - src/lib/action-worker/worker.ts (warmup gate cast can now include connection_request)
    - src/features/billing/ (credit deduction math is now type-safe for connection_request)
tech_stack:
  added: []
  patterns:
    - Union type extension pattern (append | "new_member" to existing union)
    - CREDIT_COSTS map expanded to match union (CreditCostMap = Record<ActionCreditType, number>)
key_files:
  created: []
  modified:
    - src/features/actions/lib/types.ts
    - src/features/billing/lib/types.ts
    - src/features/accounts/lib/types.ts
decisions:
  - connection_request allowed from warmup day 4+ (same threshold as like/follow per 10-CONTEXT.md decision)
  - connection_request NOT added to days 6-7 bucket (only day-4 and day-8+/completed gates)
  - connection_request credit cost set to 20 per BILL-06
metrics:
  duration: 2min
  completed_date: "2026-04-21"
  tasks_completed: 3
  files_modified: 3
---

# Phase 10 Plan 01: TS Type Extensions for connection_request Summary

**One-liner:** Extended three TypeScript type files to make `connection_request` a compile-time-safe member of `ActionType`, `ActionCreditType`/`CREDIT_COSTS`, and `WarmupState.allowedActions`/`getWarmupState()`.

## Tasks Completed

| # | Task | Commit | Files Modified |
|---|------|--------|----------------|
| 1 | Extend ActionType union | afeac9b | src/features/actions/lib/types.ts |
| 2 | Extend ActionCreditType + CREDIT_COSTS | a9adaa6 | src/features/billing/lib/types.ts |
| 3 | Extend WarmupState + getWarmupState day-4 bucket | 5133832 | src/features/accounts/lib/types.ts |

## Changes Made

### src/features/actions/lib/types.ts
- `ActionType` union: appended `| "connection_request"` after `"followup_dm"`

### src/features/billing/lib/types.ts
- `ActionCreditType` union: appended `| "connection_request"` after `"followup_dm"`
- `CREDIT_COSTS` map: added `connection_request: 20` entry (BILL-06 rate)
- `CreditCostMap = Record<ActionCreditType, number>` is automatically satisfied — no separate change needed

### src/features/accounts/lib/types.ts
- `WarmupState.allowedActions` union: added `"connection_request"` to the tuple type
- `getWarmupState()` day-8+/completed bucket: added `"connection_request"` alongside all other actions
- `getWarmupState()` day-4 bucket: added `"connection_request"` alongside `"like"` and `"follow"`
- Day 6-7 bucket: left unchanged (connection_request is not an intermediate LinkedIn warmup step)

## Verification

```
actions OK  ← grep '"connection_request"' src/features/actions/lib/types.ts
billing OK  ← grep 'connection_request: 20' src/features/billing/lib/types.ts
accounts OK ← grep '"connection_request"' src/features/accounts/lib/types.ts
pnpm typecheck: zero errors
```

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

- `connection_request` allowed from warmup day 4+ per 10-CONTEXT.md locked decision (same threshold as `like`/`follow`)
- Day 6-7 bucket intentionally excludes `connection_request` (not an intermediate LinkedIn warmup action)
- Credit cost of 20 per BILL-06 requirement confirmed

## Self-Check: PASSED

- `src/features/actions/lib/types.ts` — modified, contains `"connection_request"` in ActionType
- `src/features/billing/lib/types.ts` — modified, contains `connection_request: 20` in CREDIT_COSTS
- `src/features/accounts/lib/types.ts` — modified, contains `"connection_request"` in 3 places
- Commits afeac9b, a9adaa6, 5133832 — all verified in git log
- `pnpm typecheck` — passes with zero errors
