---
phase: 05-billing-onboarding-growth
plan: 01
subsystem: billing
tags: [postgres, rpc, credits, pipeline, vitest, tdd]

requires:
  - phase: 01-foundation
    provides: users and credit_transactions schema, credit_type enum
  - phase: 02-monitoring-intent-feed
    provides: monitoring_signals table used for daily burn calculation
  - phase: 03-action-engine
    provides: social_accounts table used for extra-account burn
provides:
  - Migration 00010 with deduct_credits/add_credits RPC functions
  - onboarding_completed_at and avg_deal_value columns on users
  - account_burn credit_type enum value
  - conversion_rate column on live_stats
  - Billing type surface (CREDIT_COSTS, MONITORING_COSTS, ACCOUNT_COSTS, INCLUDED_ACCOUNTS, PRICING_PLANS, CREDIT_PACKS)
  - getActionCreditCost helper
  - calculateMonitoringBurn / calculateAccountBurn / calculateDailyBurn helpers
  - Prospect pipeline types (PIPELINE_STAGES, PipelineStage, ProspectWithSignal)
  - isValidStageTransition validator
affects: [05-02-stripe-integration, 05-03-onboarding-wizard, 05-04-credit-burn-cron, 05-05-live-page, 05-06-prospect-pipeline, 05-07-billing-ui]

tech-stack:
  added: []
  patterns:
    - "Atomic credit deduction via SQL WHERE balance >= amount (returns -1 on insufficient funds)"
    - "SECURITY DEFINER RPC pattern matching 00006 claim_action style"
    - "Pure TypeScript business logic in lib/ with Vitest TDD unit tests"

key-files:
  created:
    - supabase/migrations/00010_phase5_billing_onboarding.sql
    - src/features/billing/lib/types.ts
    - src/features/billing/lib/credit-costs.ts
    - src/features/billing/lib/credit-costs.test.ts
    - src/features/billing/lib/credit-burn.ts
    - src/features/billing/lib/credit-burn.test.ts
    - src/features/prospects/lib/types.ts
    - src/features/prospects/lib/pipeline.ts
    - src/features/prospects/lib/pipeline.test.ts
  modified: []

key-decisions:
  - "Migration renumbered from plan's 00007 to 00010 because 00007-00009 already exist on disk (Rule 3 blocking-issue deviation)"
  - "Account burn logic counts active accounts in insertion order; first INCLUDED_ACCOUNTS (2) are free, extras billed per platform rate"
  - "Pipeline transitions forbid backward moves; only 'rejected' serves as universal in/out stage for un-rejection"
  - "Unknown signal_type / platform values contribute 0 credits (fail-safe; matches SupabaseClient loose typing at boundaries)"

patterns-established:
  - "src/features/{domain}/lib/ houses pure business logic with co-located .test.ts files"
  - "RPC returns sentinel -1 on insufficient credits rather than throwing"
  - "Pricing/pack arrays read Stripe price IDs from process.env with ?? '' fallback so types stay valid in non-prod envs"

requirements-completed: [BILL-07, BILL-04, BILL-05, BILL-06]

duration: 3min
completed: 2026-04-20
---

# Phase 05 Plan 01: Billing + Prospect Data Layer Summary

**Atomic credit RPCs (deduct_credits / add_credits), pricing/pack type surface, daily burn calculator (monitoring + extra-account), and prospect pipeline transition validator with full TDD coverage.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-20T11:29:09Z
- **Completed:** 2026-04-20T11:32:24Z
- **Tasks:** 3
- **Files created:** 9

## Accomplishments

- Migration 00010 creates deduct_credits (atomic, SECURITY DEFINER) and add_credits RPCs plus onboarding/avg-deal-value columns, account_burn enum value, and live_stats.conversion_rate
- Billing lib exports full pricing/pack/cost surface consumed by subsequent Phase 5 plans (Stripe checkout, onboarding, burn cron, /live, billing UI)
- Pipeline transition validator codifies the "rejected is the only reversible stage" rule for the prospect kanban
- 25 passing Vitest cases (5 credit-cost + 10 burn + 10 pipeline)
- `pnpm typecheck` passes cleanly

## Task Commits

1. **Task 1: Database migration for Phase 5** - `8bd5654` (feat)
2. **Task 2: Billing types and credit cost/burn logic (TDD)**
   - RED tests: `a30be61` (test)
   - GREEN impl: `d0a8f49` (feat)
3. **Task 3: Prospect pipeline types and transitions (TDD)**
   - RED tests: `4c4361b` (test)
   - GREEN impl: `bf5371d` (feat)

## Files Created/Modified

- `supabase/migrations/00010_phase5_billing_onboarding.sql` - deduct_credits + add_credits RPCs, user columns, account_burn enum, conversion_rate
- `src/features/billing/lib/types.ts` - CREDIT_COSTS, MONITORING_COSTS, ACCOUNT_COSTS, INCLUDED_ACCOUNTS, PRICING_PLANS, CREDIT_PACKS
- `src/features/billing/lib/credit-costs.ts` - getActionCreditCost
- `src/features/billing/lib/credit-costs.test.ts` - 5 cases
- `src/features/billing/lib/credit-burn.ts` - calculateMonitoringBurn / calculateAccountBurn / calculateDailyBurn
- `src/features/billing/lib/credit-burn.test.ts` - 10 cases
- `src/features/prospects/lib/types.ts` - PIPELINE_STAGES, PipelineStage, ProspectWithSignal
- `src/features/prospects/lib/pipeline.ts` - isValidStageTransition
- `src/features/prospects/lib/pipeline.test.ts` - 10 cases

## Decisions Made

- **Migration file 00010 (not 00007)**: Filenames 00007/00008/00009 were already consumed by Phase 4 + screenshots buckets. Keeping the plan's `00007` would have broken migration ordering. Migrated as 00010 with a comment referencing the original plan number.
- **Extra-account counting by insertion order**: When >2 accounts are active, tests expect the *last* added accounts to be billed. Implemented via `active.slice(INCLUDED_ACCOUNTS)`, which matches the "2 reddit + 1 linkedin -> 5" test (linkedin is the third = extra).
- **Rejected as universal exit/entry**: Simplifies UI flow — users can always reject or un-reject, but cannot accidentally undo progress toward "converted".
- **Sentinel -1 for RPC insufficient-funds**: Avoids PostgREST error surface and lets callers branch on numeric result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Renumbered migration from 00007 to 00010**
- **Found during:** Task 1 (database migration)
- **Issue:** Plan specifies `00007_phase5_billing_onboarding.sql`, but `supabase/migrations/` already contains `00007_phase4_sequences_notifications.sql`, `00008_session_verified_at.sql`, and `00009_screenshots_bucket.sql`. Creating 00007 would collide; Supabase migration ordering requires monotonically increasing prefixes.
- **Fix:** Renamed to `00010_phase5_billing_onboarding.sql`; added file-header comment documenting the renumber. Content matches plan verbatim.
- **Files modified:** supabase/migrations/00010_phase5_billing_onboarding.sql
- **Verification:** `grep -c 'CREATE OR REPLACE FUNCTION'` returns 2 (matches plan's `<verify>`)
- **Committed in:** 8bd5654

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Filename-only change; all SQL content and acceptance criteria satisfied. Downstream Phase 5 plans referencing "the Phase 5 migration" remain compatible.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration. Migration 00010 must be applied to Supabase dev/prod via Management API (same pattern as migration 00007 / 00009) before Plan 05-02 is executed.

## Next Phase Readiness

- Data layer + contracts are in place for all remaining Phase 5 plans.
- Subsequent plans can import from `@/features/billing/lib/*` and `@/features/prospects/lib/*`.
- Migration 00010 is not yet applied to Supabase (plan does not call for it) — recommend apply before 05-02 Stripe integration lands.

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*

## Self-Check: PASSED

- All 10 listed files exist on disk
- All 5 task commits present in git log (8bd5654, a30be61, d0a8f49, 4c4361b, bf5371d)
- 25/25 vitest cases pass
- `pnpm typecheck` clean
