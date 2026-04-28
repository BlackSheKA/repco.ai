---
phase: 16-mechanism-cost-engine-schema
plan: 02
subsystem: billing-cost-engine
tags: [helper, cache, billing, mechanism_costs]
requires:
  - mechanism_costs table (Plan 16-01)
provides:
  - getMechanismCost(id) cached lookup
  - getAllMechanismCosts() cached Map
  - invalidateMechanismCostCache() test hook
  - MechanismCost TS interface
affects:
  - src/features/billing/lib/credit-burn.ts (Plan 16-03 consumer; not modified here)
tech_stack:
  added: []
  patterns:
    - Module-level Map cache lazy-loaded once per process (D-15)
    - SSR client (`@/lib/supabase/server`) for authenticated SELECT under RLS
    - vi.mock factory + counter assertions (vitest)
key_files:
  created:
    - src/features/billing/lib/mechanism-costs.ts
    - src/features/billing/lib/mechanism-costs.test.ts
  modified: []
decisions:
  - SSR client (not service role) — RLS policy from Plan 16-01 grants authenticated SELECT, so SSR is sufficient and keeps the helper usable in user-scoped server actions/route handlers
  - Async createClient (matches the existing `src/lib/supabase/server.ts` shape — it awaits cookies())
  - Cache stays null on Supabase error (no poisoning); next call retries cleanly
metrics:
  duration_seconds: 90
  completed_at: 2026-04-27
  tasks_completed: 2
---

# Phase 16 Plan 02: Cached mechanism_costs Helper Summary

DB-driven cost engine consumer-side helper: module-level `Map<mechanism_id, MechanismCost>` cache lazy-loaded once per process, with `invalidateMechanismCostCache()` test hook and error-path that throws without poisoning the cache. Unblocks Plan 16-03's async `calculateMonitoringBurn`.

## Tasks Completed

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Create mechanism-costs.ts helper with module-level cache | `b224ec1` | 4 exports: MechanismCost, getMechanismCost, getAllMechanismCosts, invalidateMechanismCostCache |
| 2 | Write mechanism-costs.test.ts (5 vitest cases) | `7fcc99e` | All 5 tests pass; cache hit verified via `fromMock` counter |

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `pnpm test src/features/billing/lib/mechanism-costs.test.ts` | 5 pass / 0 fail | 5 pass / 0 fail (1.04s) |
| `grep -q "export function invalidateMechanismCostCache"` | match | match |
| `grep -q "let _cache: Map<string, MechanismCost>"` | match | match |
| `grep -q "from(\"mechanism_costs\")"` | match | match |
| Surface exports | MechanismCost, getMechanismCost, getAllMechanismCosts, invalidateMechanismCostCache | all 4 present |
| Cache hit assertion | `expect(fromMock).toHaveBeenCalledTimes(1)` after 3 calls | passes |
| Invalidate refetch | from() count goes 1 → 2 after invalidate | passes |
| Error throws + cache empty | rejects with `mechanism_costs lookup failed: boom`, retry succeeds | passes |

## Client Choice (SSR vs service role)

Per RESEARCH §7 and Plan 16-01's RLS policy (`authenticated SELECT` allowed, all writes denied to client roles), the SSR client `@/lib/supabase/server` is correct:

- mechanism_costs is read-only for all client code; service-role would over-grant
- SSR client honors the user's session — works in server actions, route handlers, RSC
- The 60-row dataset is non-sensitive (cost catalogue), but RLS still gates access to authenticated callers, satisfying defence-in-depth

`createClient` is `async` in `src/lib/supabase/server.ts` (it awaits `cookies()`), so the helper awaits it — no deviation from the plan-supplied skeleton.

## Deviations from Plan

None. Helper module shape, exports, error-handling, and test count all match the plan specification verbatim.

`pnpm typecheck` reports pre-existing image-import errors (`@/app/images/*.svg`/`*.png`) in unrelated files; these are out-of-scope per the executor scope-boundary rule and were not introduced by this plan. No errors in `src/features/billing/`.

## Auth Gates

None.

## Self-Check: PASSED

- File `src/features/billing/lib/mechanism-costs.ts`: FOUND
- File `src/features/billing/lib/mechanism-costs.test.ts`: FOUND
- Commit `b224ec1`: FOUND (`feat(16-02): add cached mechanism-costs helper`)
- Commit `7fcc99e`: FOUND (`test(16-02): cover mechanism-costs cache hit and invalidation`)
- All 5 tests pass
- 4 required exports present
