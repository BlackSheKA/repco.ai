---
phase: 08-public-stats-digest-cleanup
plan: "02"
subsystem: cron
tags: [live-stats, cron, aggregates, vercel]
dependency_graph:
  requires: [live_stats table seeded row (00000000-0000-0000-0000-000000000001)]
  provides: [refresh-live-stats cron route, live_stats write path]
  affects: [/api/live route (read path now has non-zero data), /live page]
tech_stack:
  added: []
  patterns: [cron-route-pattern, service-role-upsert, parallel-promise-all]
key_files:
  created:
    - src/app/api/cron/refresh-live-stats/route.ts
  modified:
    - vercel.json
decisions:
  - "Fetch intent_signals rows (not COUNT) to compute both signals_last_hour and signals_last_24h + active_users in one DB round-trip; only detected_at + user_id selected"
  - "In-JS filtering on detected_at string comparison for oneHourAgo (ISO strings sort lexicographically)"
  - "onConflict: id UPSERT targets fixed LIVE_STATS_ID; assumes seed row exists from 08-01"
  - "refresh-live-stats inserted at index 1 in vercel.json (grouped with zombie-recovery at */5 * * * *)"
metrics:
  duration: 12min
  completed_date: "2026-04-21"
  tasks_completed: 2
  files_changed: 2
---

# Phase 08 Plan 02: Refresh Live Stats Cron Summary

**One-liner:** 5-minute cron that computes 6 live metrics via parallel DB queries and UPSERTs into a fixed live_stats row, closing GROW-01's write path.

## What Was Built

The `/api/cron/refresh-live-stats` route is the write side that was missing from the `/live` page. The `/api/live` route (read path) has always existed and reads from `live_stats`, but nothing ever wrote to it — so the public stats page showed all zeros. This plan closes that gap.

### Task 1: Create refresh-live-stats cron route

Created `src/app/api/cron/refresh-live-stats/route.ts` following the CLAUDE.md cron pattern exactly:

- **Auth**: Bearer CRON_SECRET check → 401 on mismatch
- **Setup**: correlationId + startedAt timestamp
- **Operations**: 3 parallel queries via `Promise.all`
  - `intent_signals`: fetch `detected_at, user_id` for last 24h → derive signals_last_hour (JS filter), signals_last_24h (array length), active_users (Set dedup)
  - `actions`: COUNT where action_type IN ('dm','followup_dm') AND status='completed' AND executed_at >= 24h ago → dms_sent_24h
  - `prospects`: COUNT where replied_detected_at >= 24h ago → replies_24h
- **Compute**: conversion_rate = round(replies/dms * 100, 2), or 0 when no DMs
- **UPSERT**: single row with fixed `id = LIVE_STATS_ID` and `onConflict: "id"`
- **Observability**: job_logs row with all 6 metric values + correlationId; structured logs at start/end; `await logger.flush()` in both try and catch paths

### Task 2: Register in vercel.json

Added entry at index 1 (after zombie-recovery, grouped by `*/5 * * * *` cadence). Total entries: 11.

## Verification

- `pnpm typecheck`: passes (0 errors)
- `pnpm lint src/app/api/cron/refresh-live-stats/route.ts`: passes (0 errors)
- 2 `await logger.flush()` calls confirmed (try path + catch path)
- LIVE_STATS_ID constant matches seed row UUID
- vercel.json: valid JSON, 11 entries, all 10 previous entries preserved

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/api/cron/refresh-live-stats/route.ts
- FOUND: commit bbe8776 (feat(08-02): create refresh-live-stats cron route)
- FOUND: commit 80922db (chore(08-02): register refresh-live-stats cron in vercel.json)
