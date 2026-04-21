---
phase: 12-trial-auto-activation-expiry
plan: 01
subsystem: database
tags: [postgres, plpgsql, trigger, billing, credits, migration]

# Dependency graph
requires:
  - phase: 00004_auth_trigger
    provides: handle_new_user() trigger on auth.users INSERT
  - phase: 05-billing-onboarding-growth
    provides: trial_ends_at, credits_balance columns, credit_transactions table
provides:
  - Auto-provisioned 3-day free trial on every new signup via DB trigger
  - Backfill of existing users with trial_ends_at IS NULL
  - Matching credit_transactions row for every trial grant (ledger consistency)
affects: [billing, credit-burn-cron, trial-badge, plan-12-02, plan-12-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DB trigger atomicity: trial provisioning tied to auth.users INSERT so it cannot be bypassed"
    - "Double-entry credits: users.credits_balance + credit_transactions row always mutated together"
    - "Idempotent backfill: ON CONFLICT DO NOTHING + narrow updated_at window for safe re-runs"

key-files:
  created:
    - supabase/migrations/00015_auto_trial.sql
  modified: []

key-decisions:
  - "Used CREATE OR REPLACE FUNCTION on existing handle_new_user() — trigger DDL from 00004 is unchanged, only the body is replaced"
  - "GREATEST(credits_balance, 500) in backfill UPDATE avoids reducing any manually-granted balances"
  - "Backfill INSERT uses updated_at >= NOW() - INTERVAL '5 seconds' window to target only the current batch, not all free users"
  - "SECURITY DEFINER SET search_path = '' preserved exactly from 00004 pattern"

patterns-established:
  - "Auto-trial pattern: extend DB trigger rather than Next.js middleware/callback for bypass-proof activation"

requirements-completed: [BILL-01]

# Metrics
duration: 3min
completed: 2026-04-21
---

# Phase 12 Plan 01: Auto-Trial Migration Summary

**PostgreSQL trigger replacement (00015_auto_trial.sql) that atomically grants 3-day free trial + 500 credits on signup, plus one-time backfill for existing no-trial users**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-21T17:28:40Z
- **Completed:** 2026-04-21T17:31:42Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Migration 00015_auto_trial.sql replaces `handle_new_user()` body so every new auth.users row gets `trial_ends_at = NOW() + 3 days` and `credits_balance = 500` atomically
- Credit ledger consistency maintained: trigger also inserts `credit_transactions` row (type=monthly_grant, amount=500, description='Free trial credits')
- Backfill UPDATE covers all existing users with `trial_ends_at IS NULL AND subscription_active = false`, using `GREATEST(credits_balance, 500)` to avoid reducing any existing balances
- Backfill INSERT...SELECT generates matching `credit_transactions` rows with `ON CONFLICT DO NOTHING` for idempotent re-runs

## Task Commits

1. **Task 1: Write migration 00015_auto_trial.sql** - `983a763` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `supabase/migrations/00015_auto_trial.sql` - Three-part migration: trigger function replacement, backfill UPDATE, backfill INSERT...SELECT

## Decisions Made
- `CREATE OR REPLACE FUNCTION` targets the existing function name — the trigger `on_auth_user_created` already points to it (created in 00004) and does not need to be recreated
- Backfill uses `GREATEST(credits_balance, 500)` to be safe with users who may have received manual credit grants
- Narrow `updated_at >= NOW() - INTERVAL '5 seconds'` window in backfill INSERT targets only the current migration batch, avoiding duplicating rows for users whose `subscription_active` later becomes false

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Migration is applied via Supabase Management API (same path as 00014).

## Next Phase Readiness
- Migration 00015 is committed and ready for deployment via Supabase Management API
- Plan 12-02 (ACTN-10 reconciliation + expiry boundary test) can proceed independently
- Plan 12-03 (billing UI cleanup — remove startFreeTrial CTA) can also proceed
- Once 00015 is applied, the credit-burn cron at `api/cron/credit-burn/route.ts` will automatically pick up auto-activated users (already filters `trial_ends_at > now`)

---
*Phase: 12-trial-auto-activation-expiry*
*Completed: 2026-04-21*
