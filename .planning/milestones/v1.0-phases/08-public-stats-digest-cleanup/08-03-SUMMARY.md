---
phase: 08-public-stats-digest-cleanup
plan: "03"
subsystem: notifications
tags: [cron, digest, email, cleanup, consolidation]
dependency_graph:
  requires:
    - 08-02 (refresh-live-stats cron, vercel.json 11-entry baseline)
    - src/features/notifications/lib/send-daily-digest.ts (DailyDigestData interface)
    - src/features/notifications/emails/daily-digest.tsx (React Email template)
  provides:
    - Consolidated daily digest cron (digest/route.ts only)
    - 10-entry vercel.json cron registry
  affects:
    - vercel.json (11 → 10 entries)
    - User email delivery (1 digest/day instead of 2)
tech_stack:
  added: []
  patterns:
    - sendDailyDigest wrapper pattern (React Email + Resend owned internally)
    - TZ-aware yesterday boundary computation via date-fns-tz formatInTimeZone round-trip
key_files:
  created: []
  modified:
    - src/app/api/cron/digest/route.ts
    - vercel.json
  deleted:
    - src/app/api/cron/daily-digest/route.ts
decisions:
  - "Port daily-digest features into digest/route.ts rather than the reverse — digest was the Phase 5 P07 canonical route with job_logs per-user logging"
  - "sendDailyDigest owns Resend client and from-address — digest/route.ts removes its own Resend instantiation entirely"
  - "TZ-aware yesterday boundaries replace rolling 24h window to match email subject line accuracy"
metrics:
  duration: 2min
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_modified: 2
  files_deleted: 1
requirements_closed:
  - NTFY-01
  - GROW-05
  - GROW-06
---

# Phase 08 Plan 03: Digest Consolidation Summary

**One-liner:** Consolidated duplicate digest crons — ported React Email template, replyCount query, and top-3 signals from daily-digest into digest/route.ts, then deleted daily-digest and removed it from vercel.json (11 → 10 crons).

## What Was Built

Two duplicate cron jobs both fired at 8am local time for each user. `digest/route.ts` (Phase 5 P07) used inline `buildHtml` with a rolling 24h window and no replyCount. `daily-digest/route.ts` (Phase 4 P03) used the branded `sendDailyDigest` React Email template, TZ-aware yesterday boundaries, replyCount from `prospects.replied_detected_at`, and top-3 signals with subreddit extraction.

This plan ports the superior features into the keeper route and deletes the duplicate.

## Tasks Completed

| # | Name | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Port branded template + replyCount + top-3 signals | cf96ae7 | Rewrote digest/route.ts: sendDailyDigest, replyCount, limit(3), TZ-aware boundaries, 3-count empty guard |
| 2 | Delete daily-digest route and remove vercel.json entry | 722bf9f | Deleted daily-digest/, removed vercel.json entry (11→10) |

## Key Changes in digest/route.ts

- **Imports:** Removed `Resend`, added `sendDailyDigest`
- **Removed:** `buildHtml` function, `IntentSignalRow` interface, `resend`/`resendKey`/`fromAddress`/`dashboardUrl` variables
- **Signal queries:** Changed from rolling `twentyFourHoursAgoIso` to TZ-aware `startOfYesterdayLocalUtc`/`endOfYesterdayLocalUtc`
- **replyCount:** Added `prospects.replied_detected_at` COUNT query for yesterday window
- **Top signals:** `limit(1)` → `limit(3)` with subreddit regex extraction (`reddit.com/r/([^/]+)`)
- **Empty guard:** `signalCount === 0 && pendingCount === 0` → `signalCount === 0 && pendingCount === 0 && replyCount === 0`
- **Send path:** Replaced `resend.emails.send(...)` + fallback block with single `sendDailyDigest(...)` try/catch

## Verification

- `pnpm typecheck`: PASS (0 errors)
- `node scripts/phase-08-validate.mjs --vercel-crons`: `[PASS] vercel-crons: /api/cron/daily-digest absent, /api/cron/refresh-live-stats present`
- `test ! -d src/app/api/cron/daily-digest`: PASS
- `node -e "console.log(JSON.parse(...).crons.length)"` → `10`
- `grep -q "sendDailyDigest" src/app/api/cron/digest/route.ts`: PASS
- `grep -q "replyCount" src/app/api/cron/digest/route.ts`: PASS

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/app/api/cron/digest/route.ts` exists and contains `sendDailyDigest`, `replyCount`, `limit(3)`, `replied_detected_at`
- `src/app/api/cron/daily-digest/` directory does not exist
- `vercel.json` has 10 cron entries, no `/api/cron/daily-digest` entry
- Commits cf96ae7 and 722bf9f exist in git log
