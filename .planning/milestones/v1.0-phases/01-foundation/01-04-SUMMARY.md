---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [sentry, axiom, logging, cron, observability, correlation-id]

# Dependency graph
requires:
  - phase: 01-foundation-02
    provides: "Database schema with actions and job_logs tables, enum types"
  - phase: 01-foundation-01
    provides: "Next.js project scaffold, vercel.json cron config, env var setup"
provides:
  - "Sentry error tracking for client, server, and edge runtimes"
  - "Structured logger with Axiom + Sentry correlation IDs"
  - "Zombie recovery cron endpoint that resets stuck actions"
  - "Global error boundary for unhandled React errors"
affects: [phase-02, phase-03, phase-04]

# Tech tracking
tech-stack:
  added: ["@sentry/nextjs (already installed)", "@axiomhq/js (already installed)"]
  patterns: ["withSentryConfig wrapper for next.config.ts", "correlation ID threading through logger -> Sentry tags -> Axiom entries", "CRON_SECRET bearer token auth for cron endpoints", "service_role client for RLS bypass in cron jobs"]

key-files:
  created:
    - sentry.client.config.ts
    - sentry.server.config.ts
    - sentry.edge.config.ts
    - src/app/instrumentation.ts
    - src/app/global-error.tsx
    - src/lib/axiom.ts
    - src/lib/logger.ts
    - src/app/api/cron/zombie-recovery/route.ts
  modified:
    - next.config.ts

key-decisions:
  - "Conditional Axiom client instantiation to avoid 'Missing token' warnings in local dev"
  - "Used @axiomhq/js directly (not @axiomhq/nextjs wrapper) for stable logger API"
  - "Used non-deprecated Sentry webpack config options (treeshake.removeDebugLogging, webpack.automaticVercelMonitors)"

patterns-established:
  - "Logger pattern: import { logger } from '@/lib/logger' with .info/.warn/.error/.flush"
  - "Cron security: Bearer CRON_SECRET header validation"
  - "Service role pattern: createClient with SUPABASE_SERVICE_ROLE_KEY for admin operations"

requirements-completed: [OBSV-01, OBSV-02, OBSV-03, OBSV-04]

# Metrics
duration: 4min
completed: 2026-04-17
---

# Phase 01 Plan 04: Observability Summary

**Sentry error tracking across all runtimes, Axiom structured logging with correlation IDs, and zombie recovery cron that resets stuck actions every 5 minutes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T08:08:53Z
- **Completed:** 2026-04-17T08:12:25Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Sentry configured for client (with replay), server, and edge runtimes with source map upload via withSentryConfig
- Structured logger utility writing to Axiom + console with correlation IDs threaded into Sentry tags
- Zombie recovery cron endpoint: secured by CRON_SECRET, resets actions stuck in 'executing' > 10 min, logs to job_logs
- Global error boundary catches unhandled React errors and reports to Sentry

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure Sentry (client, server, edge, instrumentation, error boundary) and wrap next.config** - `8268d69` (feat)
2. **Task 2: Create structured logger utility and zombie recovery cron endpoint** - `ea4730e` (feat)

## Files Created/Modified
- `sentry.client.config.ts` - Browser SDK config with replay integration
- `sentry.server.config.ts` - Server-side Sentry initialization
- `sentry.edge.config.ts` - Edge runtime Sentry initialization
- `src/app/instrumentation.ts` - Next.js instrumentation hook loading Sentry per runtime
- `src/app/global-error.tsx` - React error boundary with Sentry.captureException
- `next.config.ts` - Wrapped with withSentryConfig for source map upload
- `src/lib/axiom.ts` - Conditional Axiom client (null when no token)
- `src/lib/logger.ts` - Structured logger with info/warn/error/flush + correlation ID generation
- `src/app/api/cron/zombie-recovery/route.ts` - Cron endpoint resetting zombie actions

## Decisions Made
- Used conditional Axiom instantiation (`process.env.AXIOM_TOKEN ? new Axiom(...) : null`) to prevent "Missing Axiom token" warnings during local development and build
- Used non-deprecated Sentry config options (`webpack.treeshake.removeDebugLogging` and `webpack.automaticVercelMonitors`) instead of top-level `disableLogger` and `automaticVercelMonitors`
- Created Axiom client with `@axiomhq/js` directly rather than the `@axiomhq/nextjs` wrapper for a more stable and explicit logger API

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Sentry deprecated config options**
- **Found during:** Task 1 (Sentry configuration)
- **Issue:** `disableLogger` and `automaticVercelMonitors` are deprecated top-level options in @sentry/nextjs 10.49
- **Fix:** Moved to `webpack.treeshake.removeDebugLogging` and `webpack.automaticVercelMonitors`
- **Files modified:** next.config.ts
- **Verification:** Build passes with no deprecation warnings
- **Committed in:** 8268d69 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Axiom "Missing token" build warnings**
- **Found during:** Task 2 (Logger utility)
- **Issue:** Unconditional `new Axiom({ token: undefined })` logs "Missing Axiom token" during build
- **Fix:** Conditional instantiation -- only create Axiom client when AXIOM_TOKEN is set
- **Files modified:** src/lib/axiom.ts
- **Verification:** Build passes cleanly with no warnings
- **Committed in:** ea4730e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes address build-time warnings/deprecations. No scope creep.

## Issues Encountered
None

## User Setup Required

**External services require manual configuration.** The plan's `user_setup` section documents:
- **Sentry:** Create Next.js project, set SENTRY_DSN/AUTH_TOKEN/ORG/PROJECT env vars, create alert rule for error rate > 5%
- **Axiom:** Create 'repco' dataset, set AXIOM_TOKEN/AXIOM_DATASET env vars
- **Supabase:** Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

## Next Phase Readiness
- Observability infrastructure complete: all errors route to Sentry, structured logs to Axiom
- Logger utility available for all future features via `import { logger } from '@/lib/logger'`
- Zombie recovery cron pattern established for future cron endpoints
- OBSV-04 email alerts deferred to Phase 4 when Resend is configured; Sentry alert rules cover Phase 1

---
## Self-Check: PASSED

All 9 files verified present. Both commit hashes (8268d69, ea4730e) confirmed in git log.

---
*Phase: 01-foundation*
*Completed: 2026-04-17*
