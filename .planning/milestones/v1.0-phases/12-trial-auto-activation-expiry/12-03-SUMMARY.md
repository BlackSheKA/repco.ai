---
phase: 12-trial-auto-activation-expiry
plan: "03"
subsystem: billing
tags: [billing, cleanup, dead-code, trial]
dependency_graph:
  requires: [12-01]
  provides: [billing-ui-without-start-trial-cta]
  affects: [billing/page.tsx, billing-page-client.tsx, checkout.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - src/features/billing/actions/checkout.ts
    - src/app/(app)/billing/page.tsx
    - src/features/billing/components/billing-page-client.tsx
decisions:
  - Kept trialActive badge and trialExpired card intact — they correctly fire for auto-activated trials
  - Pre-existing typecheck error in ingestion-pipeline.test.ts (out of scope) logged as deferred
metrics:
  duration: "~2min"
  completed: "2026-04-21"
  tasks_completed: 3
  files_modified: 3
---

# Phase 12 Plan 03: Billing UI Cleanup Summary

**One-liner:** Removed dead startFreeTrial server action, canStartTrial derivation, and "Start Trial" CTA button now that trial activation is fully handled by the DB trigger from plan 12-01.

## What Was Built

Surgical deletion of three dead-code paths across the billing feature:

1. **checkout.ts** — Deleted the entire `startFreeTrial` export (60 lines). The function had no callers once the CTA button was removed, and trial activation is now handled atomically by the `handle_new_user()` DB trigger deployed in plan 12-01.

2. **billing/page.tsx** — Removed the `canStartTrial` derivation (2 lines) and the `canStartTrial={canStartTrial}` prop passed to `BillingPageClient`. The `trialActive` badge (lines 91-98) and `trialExpired` card (lines 110-121) were intentionally preserved — they correctly reflect trial state for auto-activated trials.

3. **billing-page-client.tsx** — Removed `startFreeTrial` named import, `canStartTrial?: boolean` prop from interface, `canStartTrial = false` from destructuring, the entire `handleStartTrial()` function, and the `{canStartTrial && <Card>}` CTA block. The `Card`/`CardContent` imports were kept as they remain in the `view === "cancel"` branch.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6b2926a | feat(12-03): remove startFreeTrial server action from checkout.ts |
| 2 | 6e77f15 | feat(12-03): remove canStartTrial derivation and Start Trial CTA from billing UI |

## Deviations from Plan

**Pre-existing out-of-scope issue logged:**

`src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` has a TS7023 implicit `any` return type error. This existed before this plan's changes (verified by checking typecheck output before any edits). Not caused by our deletions. Logged below as deferred.

None introduced — plan executed exactly as written for the three target files.

## Deferred Issues

- `src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` line 29: TS7023 `makeSupabaseStub` implicit `any` return type. Pre-existing before this phase; unrelated to billing cleanup. Fix: add explicit return type annotation to `makeSupabaseStub`.

## Verification Results

```
startFreeTrial in billing feature: PASS (absent)
canStartTrial in billing feature:  PASS (absent)
trialActive badge preserved:       PASS (present)
Typecheck (our files):             PASS (no errors in modified files)
Pre-existing external error:       ingestion-pipeline.test.ts TS7023 (out of scope)
```

## Self-Check: PASSED

Files exist:
- FOUND: src/features/billing/actions/checkout.ts
- FOUND: src/app/(app)/billing/page.tsx
- FOUND: src/features/billing/components/billing-page-client.tsx

Commits exist:
- FOUND: 6b2926a
- FOUND: 6e77f15
