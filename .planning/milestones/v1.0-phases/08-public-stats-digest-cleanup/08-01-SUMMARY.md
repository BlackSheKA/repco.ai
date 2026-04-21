---
phase: 08-public-stats-digest-cleanup
plan: 01
subsystem: database
tags: [supabase, postgres, migration, validation, scripts, live-stats]

# Dependency graph
requires:
  - phase: 05-billing-onboarding-growth
    provides: live_stats table with conversion_rate column (migration 00010)
  - phase: 06-linkedin
    provides: confirmed 00011 is last migration
provides:
  - Idempotent seed row for live_stats with fixed UUID '00000000-0000-0000-0000-000000000001'
  - Phase-08 validation CLI with --live-stats-seed, --live-stats-fresh, --vercel-crons, --digest-idempotency subcommands
affects:
  - 08-02-PLAN (refresh-live-stats cron depends on seed row for UPSERT target)
  - 08-03-PLAN (--vercel-crons check validates vercel.json state)
  - 08-04-PLAN (--digest-idempotency check validates once-daily digest constraint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase validation script pattern: ESM .mjs with argv subcommands, service role Supabase client, PASS/FAIL output"
    - "Fixed-UUID live_stats seed: single row with known id for deterministic UPSERT in cron"

key-files:
  created:
    - supabase/migrations/00012_phase8_live_stats_seed.sql
    - scripts/phase-08-validate.mjs
  modified: []

key-decisions:
  - "Fixed UUID '00000000-0000-0000-0000-000000000001' for live_stats seed row to guarantee deterministic UPSERT in refresh-live-stats cron"
  - "Validation script as ESM .mjs (not .ts) to match existing scripts/ convention and avoid transpile step"
  - "ON CONFLICT DO NOTHING makes migration idempotent — safe to run on databases that already have the row"

patterns-established:
  - "Phase validation script: scripts/phase-08-validate.mjs with named subcommand flags, exits 0/1, PASS/FAIL prefixed output"

requirements-completed:
  - GROW-01
  - GROW-02

# Metrics
duration: 2min
completed: 2026-04-21
---

# Phase 8 Plan 01: Phase 8 Foundation Summary

**Idempotent live_stats seed migration (00012) and 4-subcommand phase-08 validation CLI enabling automated verification for all subsequent plans**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T15:45:10Z
- **Completed:** 2026-04-21T15:47:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Migration 00012 seeds the fixed-id live_stats row so the refresh-live-stats cron always has a known UPSERT target
- Validation script implements all 4 required subcommands with correct exit codes and PASS/FAIL output
- `--vercel-crons` runs without crashing (returns FAIL as expected; Plan 03 will make it green)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration — seed live_stats fixed-id row** - `d8e7c3e` (chore)
2. **Task 2: Validation script — phase-08-validate.mjs** - `f377059` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `supabase/migrations/00012_phase8_live_stats_seed.sql` - Idempotent INSERT of fixed-UUID seed row into live_stats
- `scripts/phase-08-validate.mjs` - Phase-08 validation CLI with 4 subcommands for automated verification

## Decisions Made
- Fixed UUID `00000000-0000-0000-0000-000000000001` for seed row — guarantees deterministic UPSERT in cron without table growth
- ESM `.mjs` format for validation script to match existing scripts/ convention (sentry-alert-rules.ts is TS but ours is pure Node with no build step)
- `ON CONFLICT (id) DO NOTHING` makes migration idempotent — safe to re-run on any environment

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing lint errors in `tmp/*.cjs` files unrelated to our changes — out of scope, not fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can now implement the refresh-live-stats cron using the seed row as UPSERT target
- `node scripts/phase-08-validate.mjs --live-stats-seed` will validate the seed is applied after migration runs
- `node scripts/phase-08-validate.mjs --live-stats-fresh` available for Plan 02 post-cron verification
- `node scripts/phase-08-validate.mjs --vercel-crons` will turn green after Plan 03 updates vercel.json

---
*Phase: 08-public-stats-digest-cleanup*
*Completed: 2026-04-21*
