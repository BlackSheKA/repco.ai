---
phase: 08-public-stats-digest-cleanup
verified: 2026-04-21T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 8: Public Stats + Digest Cleanup Verification Report

**Phase Goal:** `/live` aggregate stats show real numbers (not zeros) AND users receive exactly one daily digest email per day
**Verified:** 2026-04-21
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | live_stats table has a seed row with fixed UUID so the cron can UPSERT | VERIFIED | `00012_phase8_live_stats_seed.sql` contains `INSERT INTO live_stats (id) VALUES ('00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING` |
| 2 | refresh-live-stats cron computes and writes all 6 aggregate columns | VERIFIED | `src/app/api/cron/refresh-live-stats/route.ts` queries intent_signals, actions (dm/followup_dm completed), and prospects in parallel; UPSERTs all 6 columns on LIVE_STATS_ID |
| 3 | vercel.json registers refresh-live-stats at */5 * * * * and excludes daily-digest | VERIFIED | `node scripts/phase-08-validate.mjs --vercel-crons` returns `[PASS]`; vercel.json has 10 entries, no `/api/cron/daily-digest` entry |
| 4 | src/app/api/cron/daily-digest/ directory is deleted | VERIFIED | `test -d src/app/api/cron/daily-digest` returns DELETED |
| 5 | digest/route.ts uses sendDailyDigest branded template, queries replyCount, top-3 signals | VERIFIED | `sendDailyDigest` imported from `@/features/notifications/lib/send-daily-digest`; `replyCount` and `replied_detected_at` present; `.limit(3)` confirmed |
| 6 | digest/route.ts has idempotency guard via last_digest_sent_at | VERIFIED | Guard checks `user.last_digest_sent_at === todayLocalDate` before localHour check; sets column after successful send; `last_digest_sent_at` appears 6 times (UserRow, 2x SELECT, guard, update, warn) |
| 7 | Migration 00013 adds last_digest_sent_at date column to users | VERIFIED | `00013_phase8_last_digest_sent_at.sql` contains `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL` |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/00012_phase8_live_stats_seed.sql` | Seed row for live_stats with fixed UUID | VERIFIED | Idempotent INSERT with `ON CONFLICT (id) DO NOTHING`; correct UUID |
| `supabase/migrations/00013_phase8_last_digest_sent_at.sql` | Adds last_digest_sent_at date column to users | VERIFIED | `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL` |
| `src/app/api/cron/refresh-live-stats/route.ts` | 5-minute cron UPSERTing 6 aggregates | VERIFIED | Exports GET, runtime="nodejs", maxDuration=30; LIVE_STATS_ID constant set; 2x `await logger.flush()` (try+catch) |
| `src/app/api/cron/digest/route.ts` | Consolidated digest with branded template, replyCount, top-3, idempotency | VERIFIED | Uses sendDailyDigest; replyCount from prospects.replied_detected_at; limit(3); last_digest_sent_at guard; no buildHtml, no `new Resend`; 2x `await logger.flush()` |
| `src/app/api/cron/daily-digest/` | Must NOT exist | VERIFIED | Directory deleted |
| `vercel.json` | 10 crons: has refresh-live-stats at */5, no daily-digest | VERIFIED | 10 entries; refresh-live-stats at `*/5 * * * *`; no daily-digest entry |
| `scripts/phase-08-validate.mjs` | Validation runner with 4 subcommands | VERIFIED | All 4 subcommands implemented (checkLiveStatsSeed, checkLiveStatsFresh, checkVercelCrons, checkDigestIdempotency); shebang present; exits 0/1 correctly |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `00012_phase8_live_stats_seed.sql` | live_stats table | INSERT ... ON CONFLICT (id) DO NOTHING | VERIFIED | UUID `00000000-0000-0000-0000-000000000001` present |
| `refresh-live-stats/route.ts` | live_stats table | Supabase UPSERT on LIVE_STATS_ID | VERIFIED | `supabase.from("live_stats").upsert({id: LIVE_STATS_ID, ...}, {onConflict: "id"})` |
| `refresh-live-stats/route.ts` | job_logs | INSERT with `cron: "refresh-live-stats"` | VERIFIED | job_logs insert in try block with full metadata |
| `digest/route.ts` | send-daily-digest.ts | `import { sendDailyDigest }` | VERIFIED | Import on line 6; called with signalCount, pendingCount, replyCount, topSignals, productName |
| `digest/route.ts` | prospects table | COUNT on replied_detected_at | VERIFIED | `.from("prospects").select("id", {count:"exact",head:true}).gte("replied_detected_at", ...)` |
| `digest/route.ts` | users.last_digest_sent_at | SELECT then UPDATE after send | VERIFIED | Select includes `last_digest_sent_at`; guard compares `user.last_digest_sent_at === todayLocalDate`; UPDATE sets it after successful send |
| `00013_phase8_last_digest_sent_at.sql` | users table | ALTER TABLE users ADD COLUMN | VERIFIED | `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_digest_sent_at date DEFAULT NULL` |

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| GROW-01 | 08-01, 08-02 | /live page shows public real-time feed and aggregate stats from real data | SATISFIED | Migration 00012 seeds live_stats row; refresh-live-stats cron writes 6 real aggregates every 5 minutes; /api/live reads them |
| GROW-02 | 08-01, 08-02 | /live page shows aggregate stats: signals last hour, signals 24h, active users, DMs sent, replies, conversion rate | SATISFIED | All 6 columns written in refresh-live-stats/route.ts: signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate |
| NTFY-01 | 08-03, 08-04 | User receives exactly one daily digest per day with signal count, top signals, and pending DMs | SATISFIED | daily-digest duplicate deleted; digest/route.ts has DB-level idempotency guard (last_digest_sent_at); uses sendDailyDigest branded template; includes replyCount and top-3 signals |
| GROW-05 | 08-03 | System sends daily email digest at 8:00 user's timezone | SATISFIED | digest/route.ts checks `localHour !== 8` per user's timezone via formatInTimeZone; single cron registered at `0 * * * *` |

---

### Anti-Patterns Found

No blockers found. Clean implementation throughout.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TODOs, placeholders, or stub returns found | — | — |

---

### Human Verification Required

#### 1. /live page shows non-zero numbers after cron runs

**Test:** With dev Supabase populated (any intent_signals rows), trigger the cron via `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/refresh-live-stats` then navigate to `/live` and observe the stats widgets.
**Expected:** Signals, active users, or DMs counts show non-zero values matching the data in intent_signals/actions/prospects tables.
**Why human:** Cannot verify actual Supabase data content or rendered UI values programmatically in this session.

#### 2. Digest email renders correctly with React Email template

**Test:** Trigger `GET /api/cron/digest` for a user at their local hour 8 (or temporarily remove the hour check in dev). Inspect the received email.
**Expected:** Email uses the branded sendDailyDigest React Email template with correct signalCount, replyCount, and up to 3 top signals with subreddit labels.
**Why human:** Email rendering and content correctness requires receiving and inspecting an actual email delivery.

---

### Gaps Summary

No gaps. All 7 truths verified, all artifacts substantive and correctly wired, all 4 required REQ-IDs satisfied.

The phase cleanly achieves both halves of the stated goal:
- **Real numbers on /live**: Migration seeds the live_stats row; refresh-live-stats cron UPSERTs all 6 aggregates every 5 minutes; vercel.json registers it correctly.
- **Exactly one digest per day**: daily-digest directory deleted; duplicate vercel.json entry removed; digest/route.ts upgraded with sendDailyDigest, replyCount, top-3 signals, and a DB-level idempotency guard (last_digest_sent_at) backed by migration 00013.

---

_Verified: 2026-04-21_
_Verifier: Claude (gsd-verifier)_
