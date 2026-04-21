---
phase: 08-public-stats-digest-cleanup
plan: "04"
subsystem: notifications
tags: [cron, digest, idempotency, migration, database]
dependency_graph:
  requires:
    - 08-03 (digest/route.ts with sendDailyDigest, replyCount, top-3 signals)
    - supabase/migrations/00012_phase8_live_stats_seed.sql (last migration before this)
  provides:
    - Migration 00013: last_digest_sent_at date column on users
    - Per-user idempotency guard in digest/route.ts
    - VALIDATION.md finalized (status: final, nyquist_compliant: true)
  affects:
    - supabase/migrations/00013_phase8_last_digest_sent_at.sql (new)
    - src/app/api/cron/digest/route.ts (idempotency guard + select update)
    - .planning/phases/08-public-stats-digest-cleanup/08-VALIDATION.md (finalized)
tech_stack:
  added: []
  patterns:
    - Per-user date-based idempotency guard (last_digest_sent_at = todayLocalDate)
    - Warn-not-throw pattern for non-critical post-send DB update
key_files:
  created:
    - supabase/migrations/00013_phase8_last_digest_sent_at.sql
  modified:
    - src/app/api/cron/digest/route.ts
    - .planning/phases/08-public-stats-digest-cleanup/08-VALIDATION.md
decisions:
  - "Idempotency check placed BEFORE localHour check — no point computing TZ hour if already sent today"
  - "last_digest_sent_at update failure is warn-not-throw — digest was delivered, DB update is non-critical"
  - "todayLocalDate reused for both idempotency guard and yesterday-boundary computation (removed duplicate todayDateStr)"
metrics:
  duration: 2min
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_modified: 2
  files_created: 1
requirements_closed:
  - NTFY-01
---

# Phase 08 Plan 04: Digest Idempotency Guard Summary

**One-liner:** Added durable DB-backed idempotency guard to digest cron — last_digest_sent_at date column on users prevents duplicate digests when Vercel retries or cron fires multiple times within hour-8 window.

## What Was Built

The digest cron previously relied solely on the single-cron model (NTFY-01 exactly-once guarantee). This plan adds a durable DB guard: each user has a `last_digest_sent_at date` column that gets set to their local-TZ today-date after each successful send. On subsequent cron fires (Vercel retry, multi-fire), users with `last_digest_sent_at === todayLocalDate` are skipped before any localHour check or DB queries run.

## Tasks Completed

| # | Name | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Migration 00013 — add last_digest_sent_at to users | 379758f | `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL` |
| 2 | Idempotency guard in digest/route.ts + finalize VALIDATION.md | d56bae5 | UserRow interface + SELECT queries + guard before localHour + UPDATE after send; VALIDATION.md status: final |

## Key Changes in digest/route.ts

- **UserRow interface:** Added `last_digest_sent_at: string | null`
- **SELECT queries:** Both `subRes` and `trialRes` select `last_digest_sent_at`
- **Loop order:** Idempotency check first (computes `todayLocalDate`, skips if `last_digest_sent_at === todayLocalDate`), then `localHour !== 8`, then `!user.email`
- **Removed duplicate:** `todayDateStr` eliminated — `todayLocalDate` now used for both idempotency check and `endOfYesterdayLocalUtc` boundary
- **Post-send update:** After `sent += 1` and job_logs insert, updates `users.last_digest_sent_at = todayLocalDate`; update failure logs warn and continues (digest was delivered)

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `pnpm lint`: Pre-existing errors in `tmp/wrap-part2.cjs` — no new errors from this plan
- `node scripts/phase-08-validate.mjs --vercel-crons`: `[PASS] vercel-crons: /api/cron/daily-digest absent, /api/cron/refresh-live-stats present`
- `grep -c "last_digest_sent_at" src/app/api/cron/digest/route.ts`: 6 (interface + 2 selects + guard + update + warn log)
- `grep "status: final" .planning/phases/08-public-stats-digest-cleanup/08-VALIDATION.md`: PASS
- `grep "nyquist_compliant: true" .planning/phases/08-public-stats-digest-cleanup/08-VALIDATION.md`: PASS
- `test -f supabase/migrations/00013_phase8_last_digest_sent_at.sql`: PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `supabase/migrations/00013_phase8_last_digest_sent_at.sql` exists with `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL`
- `src/app/api/cron/digest/route.ts` contains `last_digest_sent_at` in interface, both SELECT statements, idempotency guard, and UPDATE after send
- `08-VALIDATION.md` has `status: final` and `nyquist_compliant: true` in frontmatter
- Commits 379758f and d56bae5 exist in git log
