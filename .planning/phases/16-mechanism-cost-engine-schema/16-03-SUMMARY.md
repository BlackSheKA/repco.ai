---
phase: 16-mechanism-cost-engine-schema
plan: 03
subsystem: billing
tags: [credit-burn, cost-engine, refactor, cron, mechanism-id]
requires:
  - 16-01 (mechanism_costs table exists)
  - 16-02 (mechanism-costs.ts cached helper)
provides:
  - "src/features/billing/lib/credit-burn.ts (async, mechanism_id-driven)"
  - "intervalToCadenceBucket parser (7 buckets)"
  - "SCANS_PER_DAY constant (matches PRICING.md §1)"
  - "calculateMonitoringBurn (async) — DB-backed, E1 stacking flat 5/day"
  - "calculateDailyBurn (async)"
affects:
  - "src/app/api/cron/credit-burn/route.ts (now reads mechanism_id+frequency)"
tech-stack:
  added: []
  patterns:
    - "Async cost engine consuming module-cached DB lookup"
    - "Fail-safe zero on unknown mechanism_id / unknown cadence"
    - "Per-row formula unit_cost × scans_per_day(frequency)"
    - "E1 special case: 5 cr/day flat, counted once per call"
key-files:
  created: []
  modified:
    - src/features/billing/lib/credit-burn.ts
    - src/features/billing/lib/credit-burn.test.ts
    - src/features/billing/lib/types.ts
    - src/app/api/cron/credit-burn/route.ts
decisions:
  - "Folded test rewrite into Task 1 commit so typecheck stays green between commits (deviation Rule 3 — blocking issue)"
  - "Task 3 is a no-op verify because Task 1 already removed legacy constants from types.ts"
metrics:
  completed: 2026-04-27
  tasks_completed: 3
  commits: 2
---

# Phase 16 Plan 03: Credit Burn Engine Refactor Summary

Async credit-burn engine driven by `mechanism_id + frequency` consumes the cached `mechanism_costs` lookup from PLAN 02; legacy `MONITORING_COSTS` constants and the `signal_type` column reference are gone.

## What Changed

### `src/features/billing/lib/credit-burn.ts` (rewritten)
- **Old:** 66 lines, sync, `MONITORING_COSTS[signal_type]` map lookup
- **New:** 135 lines, async, `getMechanismCost(mechanism_id)` DB-cached lookup
- Adds `CadenceBucket` type, `SCANS_PER_DAY` constant, `intervalToCadenceBucket()` parser
- E1 stacking: flat 5 cr/day counted once regardless of cadence or row count
- Outbound mechanism_kind in monitoring input → 0 (defense-in-depth)
- Unknown mechanism_id or unknown cadence → 0 (fail-safe)
- `calculateMonitoringBurn` and `calculateDailyBurn` are now `async`/`Promise<number>`
- `calculateAccountBurn` unchanged (per D-18)

### `src/features/billing/lib/credit-burn.test.ts` (rewritten)
- **Old:** 93 lines, 11 cases, sync against `signal_type` strings
- **New:** 218 lines, 25 vitest cases mocking `@/lib/supabase/server` with seeded `mechanism_costs` rows
- Cadence parser: 10 parametrized cases + 2 negative cases
- SCANS_PER_DAY equality check vs PRICING.md §1 table
- All 9 cost-engine invariants from RESEARCH §Validation Architecture: R1×6h=4, R1×1h×2=48, E1=5, E1+R1×6h=9, 2×E1=5 (counted once), inactive=0, unknown=0, empty=0, OL2 (outbound)=0
- Bonus: L6 at 24h × 1 = 3
- Account burn: 2 cases preserved
- Daily burn: combined async case (R1×6h + 1 extra reddit account = 7)

### `src/features/billing/lib/types.ts`
- Removed `MonitoringSignalType` union (5 members) and `MONITORING_COSTS` const map.
- Preserved: `ActionCreditType`, `CREDIT_COSTS`, `AccountPlatform`, `ACCOUNT_COSTS`, `INCLUDED_ACCOUNTS`, `PRICING_PLANS`, `CREDIT_PACKS`.

### `src/app/api/cron/credit-burn/route.ts`
- `MonitoringSignalRow` interface: `signal_type` → `mechanism_id, frequency`
- `.select("user_id, signal_type, active")` → `.select("user_id, mechanism_id, frequency, active")`
- `calculateMonitoringBurn(signals)` → `await calculateMonitoringBurn(signals)`
- Auth, correlation ID, service-role client, structured logging, RPC call, `await logger.flush()`, and `job_logs` insert untouched.

## Test Results

```
Test Files  1 passed (1)
Tests       25 passed (25)
```

All cost-engine invariants from `16-RESEARCH.md §Validation Architecture` are asserted and pass.

## Validation Architecture Conformance

No deviations from RESEARCH §Validation Architecture cost-engine invariants. Every documented invariant has at least one matching test case.

## Verification

- `grep -r "MONITORING_COSTS" src/` → 0 hits
- `grep -r "MonitoringSignalType" src/` → 0 hits
- `grep -q "export async function calculateMonitoringBurn" src/features/billing/lib/credit-burn.ts` → success
- `grep -q "intervalToCadenceBucket" src/features/billing/lib/credit-burn.ts` → success
- `grep -q "from \"./mechanism-costs\"" src/features/billing/lib/credit-burn.ts` → success
- `grep -q 'if (signal.mechanism_id === "E1")' src/features/billing/lib/credit-burn.ts` → success
- `grep -q '\.select("user_id, mechanism_id, frequency, active")' src/app/api/cron/credit-burn/route.ts` → success
- `grep -q "await calculateMonitoringBurn" src/app/api/cron/credit-burn/route.ts` → success
- `! grep -q "signal_type" src/app/api/cron/credit-burn/route.ts` → success
- `await logger.flush()` still present in cron route
- 25/25 vitest cases green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Folded Task 2 Step A (test rewrite) into Task 1 commit**
- **Found during:** Task 1 typecheck verification
- **Issue:** Task 1 changes the `MonitoringSignalInput` shape from `{signal_type}` to `{mechanism_id, frequency}` and makes `calculateMonitoringBurn` async. The pre-existing test file at `credit-burn.test.ts` calls the sync API with `signal_type` literals, so Task 1's `pnpm typecheck` would fail unless the test file is updated in the same commit.
- **Fix:** Wrote the new vitest spec (Task 2 Step A content) inside the Task 1 commit so each commit individually keeps typecheck/tests green.
- **Files modified:** `src/features/billing/lib/credit-burn.test.ts` (in Task 1 commit)
- **Commit:** 9f7728e

**2. [Plan structure] Task 3 absorbed into Task 1**
- **Found during:** Task 3 verification step
- **Issue:** Task 3 explicitly states it is idempotent: "If already removed by Task 1, do nothing." Task 1 Step A already removed both legacy declarations, so Task 3 is a verification-only step requiring no commit.
- **Fix:** Verified all negative greps pass; no commit produced for Task 3.
- **Commit:** N/A

## Threat Model Outcomes

| Threat ID | Disposition | Outcome |
|-----------|-------------|---------|
| T-16-07 (price drift tampering) | mitigated | Engine reads `unit_cost` from DB cache; no hardcoded constant remains. |
| T-16-08 (unknown mechanism_id leak) | accepted | Unknown ids contribute 0; no error surfaced to client. |
| T-16-09 (cron timeout on async) | mitigated | First call hits DB once, all subsequent rows reuse PLAN 02 module cache. |
| T-16-10 (legacy const drift / repudiation) | mitigated | `MONITORING_COSTS` and `MonitoringSignalType` deleted; verified by negative grep. |

## Commits

- `9f7728e` feat(16-03): rewrite credit-burn engine around mechanism_id + frequency
- `0d37e77` feat(16-03): refactor credit-burn cron route to mechanism_id + frequency

## Self-Check

- credit-burn.ts: FOUND, 135 lines, async, imports getMechanismCost from ./mechanism-costs
- credit-burn.test.ts: FOUND, 218 lines, 25 cases passing
- types.ts: FOUND, no MonitoringSignalType / MONITORING_COSTS
- cron/credit-burn/route.ts: FOUND, selects mechanism_id+frequency, awaits burn
- Commit 9f7728e: FOUND in git log
- Commit 0d37e77: FOUND in git log

## Self-Check: PASSED
