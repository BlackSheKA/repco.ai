---
phase: 01-foundation
plan: 05
subsystem: infra
tags: [sentry, alerting, observability, cron, supabase]

# Dependency graph
requires:
  - phase: 01-foundation/04
    provides: "Sentry integration, structured logger, zombie recovery cron"
provides:
  - "OBSV-04 threshold alerting on action success/timeout rates"
  - "Sentry alert rule setup script for email notifications"
affects: [observability, monitoring, action-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Threshold checking piggybacked on existing cron jobs", "Sentry fingerprint-based alerting for rate monitoring"]

key-files:
  created: [src/lib/alerts.ts, scripts/sentry-alert-rules.ts]
  modified: [src/app/api/cron/zombie-recovery/route.ts]

key-decisions:
  - "Piggyback threshold checks on zombie-recovery cron rather than separate cron job"
  - "Use Sentry captureMessage with fingerprints for alert deduplication and email routing"
  - "Skip alerting when fewer than 5 actions in window to avoid false positives"

patterns-established:
  - "Threshold alerting via Sentry fingerprint: captureMessage with fingerprint array for grouping"
  - "Non-blocking secondary checks: isolated try/catch around threshold check so primary cron logic is unaffected"

requirements-completed: [OBSV-04]

# Metrics
duration: 2min
completed: 2026-04-17
---

# Phase 01 Plan 05: OBSV-04 Gap Closure Summary

**Threshold alerting for action success rate (<80%) and timeout rate (>5%) via Sentry captureMessage with fingerprint-based email notifications**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-17T08:35:24Z
- **Completed:** 2026-04-17T08:37:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created threshold checker module that queries job_logs and fires Sentry alerts when action metrics breach thresholds
- Wired threshold checking into zombie-recovery cron with isolated error handling
- Created Sentry alert rule setup script for programmatic email notification configuration

## Task Commits

Each task was committed atomically:

1. **Task 1: Create threshold checker module and Sentry alert rule setup script** - `ebf797b` (feat)
2. **Task 2: Wire threshold checker into zombie-recovery cron** - `72f9a8e` (feat)

## Files Created/Modified
- `src/lib/alerts.ts` - Threshold checker: queries job_logs, calculates success/timeout rates, fires Sentry alerts
- `scripts/sentry-alert-rules.ts` - Standalone script to create Sentry alert rules via API
- `src/app/api/cron/zombie-recovery/route.ts` - Now calls checkActionThresholds after zombie recovery

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

To enable email notifications, run the Sentry alert rule setup script:
```bash
SENTRY_AUTH_TOKEN=xxx SENTRY_ORG=xxx SENTRY_PROJECT=xxx npx tsx scripts/sentry-alert-rules.ts
```

## Next Phase Readiness
- OBSV-04 requirement is now code-verifiable
- All Phase 01 plans complete, ready for Phase 02

---
*Phase: 01-foundation*
*Completed: 2026-04-17*
