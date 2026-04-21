# Phase 8: Public Stats + Duplicate Digest Cleanup - Research

**Researched:** 2026-04-21
**Domain:** Cron write path (live_stats) + digest deduplication
**Confidence:** HIGH — all findings from direct code inspection, no training-data guesses

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Write mechanism: dedicated cron at `/api/cron/refresh-live-stats`, Node runtime, Bearer CRON_SECRET, service role client, every 5 minutes (`*/5 * * * *`)
- Single-row UPSERT on a fixed id; `/api/live`'s `.order("updated_at", desc).limit(1)` stays unchanged
- Emit a `job_logs` row on every run (same observability pattern as zombie-recovery)
- Register in `vercel.json`
- Keep `/api/cron/digest` (Phase 5), remove `/api/cron/daily-digest` (Phase 4)
- Remove both the vercel.json entry AND the route file `src/app/api/cron/daily-digest/route.ts`
- Port from `daily-digest` into `digest` BEFORE deleting: `sendDailyDigest` React Email template, `replyCount` query, top-3 signals query
- Keep `digest`'s subscription/trial gating

### Claude's Discretion
- Exact shape of the refresh-live-stats query (single CTE vs separate queries)
- Seed migration strategy for the single `live_stats` row
- Unit test framework choice / placement for the vercel.json guard
- Exact column names for DM sent-at timestamp (verify during planning — see Section 1 findings)
- Whether `sendDailyDigest` needs edits to render top-3 signals vs single signal

### Deferred Ideas (OUT OF SCOPE)
- Historical live_stats time-series
- Populating `scans_per_hour`
- Redis/Vercel KV cache for `/api/live`
- `sent_digest_at` idempotency column per user
- Auth/login-based `active_users` metric
- DB-trigger based live_stats updates
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GROW-01 | /live page shows aggregate stats with real non-zero numbers | live_stats write path (Section 1) |
| GROW-02 | /live page shows aggregate stats: signals last hour, 24h, active users, DMs sent, replies, conversion rate | Column map + SQL shapes (Section 1) |
| NTFY-01 | User receives exactly one daily email digest at 8:00 user's timezone | Digest dedup + local-hour filter (Sections 2 & 3) |
| GROW-05 | System sends daily email digest at 8:00 user's timezone: "X people looking for [product] yesterday" | Hour-8 correctness + `sendDailyDigest` port (Section 3) |
</phase_requirements>

---

## Executive Summary

- **live_stats has no write path today.** The table was created in migration 00002 (7 columns) with `conversion_rate` added in 00010 — but nothing ever INSERTs or UPDATEs it, so `/live` always serves zeros. A new 5-minute cron route closes the gap with a single UPSERT.
- **Two digest crons run hourly, both gated on `localHour === 8`.** Any user in a timezone where it is currently 8am gets two emails — one from `/api/cron/daily-digest` (Phase 4) and one from `/api/cron/digest` (Phase 5). The fix is to port the superior features of `daily-digest` into `digest`, delete `daily-digest`, and remove its vercel.json entry.
- **The local-hour-8 filter is correctly implemented in both routes** via `date-fns-tz`'s `formatInTimeZone`. No timezone bug exists; the only issue is duplication across two routes.
- **No idempotency guard column exists** (`sent_digest_at` is deferred per CONTEXT.md). Once `daily-digest` is deleted, the single-cron model is sufficient idempotency. No migration needed for this phase.

---

## Section 1: live_stats Write Path

### Table DDL (confirmed from migrations)

`00002_initial_schema.sql` line 184–193:
```sql
CREATE TABLE live_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signals_last_hour integer DEFAULT 0,
  signals_last_24h integer DEFAULT 0,
  active_users integer DEFAULT 0,
  dms_sent_24h integer DEFAULT 0,
  replies_24h integer DEFAULT 0,
  scans_per_hour integer DEFAULT 0,   -- NOT in LiveStatsData, skip
  updated_at timestamptz DEFAULT now()
);
```
`00010_phase5_billing_onboarding.sql` line 97 adds:
```sql
ALTER TABLE live_stats ADD COLUMN IF NOT EXISTS conversion_rate numeric(5,2) DEFAULT 0;
```

Final column count for the cron to write: **7 columns** (6 live + `updated_at`). `scans_per_hour` stays 0 per CONTEXT.md.

### What `/api/live` Reads (confirmed)

`src/app/api/live/route.ts` lines 31–36 selects:
```
signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate
```
Uses `.order("updated_at", { ascending: false }).limit(1).maybeSingle()`. The cron must keep `updated_at` current so this ORDER BY stays meaningful.

### Column Map: Aggregate Query to Table Column

| Column | Source Query | Key Finding |
|--------|-------------|-------------|
| `signals_last_hour` | `COUNT(*) FROM intent_signals WHERE detected_at > now() - interval '1 hour'` | `detected_at` column confirmed in schema |
| `signals_last_24h` | `COUNT(*) FROM intent_signals WHERE detected_at > now() - interval '24 hours'` | Same column, wider window |
| `active_users` | `COUNT(DISTINCT user_id) FROM intent_signals WHERE detected_at > now() - interval '24 hours'` | Counts users repco found signals for |
| `dms_sent_24h` | `COUNT(*) FROM actions WHERE action_type IN ('dm','followup_dm') AND status='completed' AND executed_at > now() - interval '24 hours'` | **CRITICAL: no `sent_at` column exists.** Actions table (00002 line 159) has `executed_at timestamptz` and status `'completed'`. Use `executed_at` + `status='completed'`. Both `dm` and `followup_dm` action types count (enum confirmed in 00001). |
| `replies_24h` | `COUNT(*) FROM prospects WHERE replied_detected_at > now() - interval '24 hours'` | `replied_detected_at` added in 00007 line 10 |
| `conversion_rate` | `ROUND(replies_24h::numeric / NULLIF(dms_sent_24h, 0) * 100, 2)` | `numeric(5,2)` column type; compute in application layer from the two counts, or inline in SQL |

### Recommended Cron Shape

Single CTE that computes all 6 aggregates in one round-trip, then UPSERTs:

```sql
WITH stats AS (
  SELECT
    COUNT(*) FILTER (WHERE detected_at > now() - interval '1 hour')   AS signals_last_hour,
    COUNT(*) FILTER (WHERE detected_at > now() - interval '24 hours') AS signals_last_24h,
    COUNT(DISTINCT user_id) FILTER (WHERE detected_at > now() - interval '24 hours') AS active_users
  FROM intent_signals
),
dms AS (
  SELECT COUNT(*) AS dms_sent_24h
  FROM actions
  WHERE action_type IN ('dm', 'followup_dm')
    AND status = 'completed'
    AND executed_at > now() - interval '24 hours'
),
reps AS (
  SELECT COUNT(*) AS replies_24h
  FROM prospects
  WHERE replied_detected_at > now() - interval '24 hours'
)
-- UPSERT into live_stats using a fixed seed row id
INSERT INTO live_stats (id, signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate, updated_at)
VALUES (
  '<SEED_UUID>',
  (SELECT signals_last_hour FROM stats),
  (SELECT signals_last_24h FROM stats),
  (SELECT active_users FROM stats),
  (SELECT dms_sent_24h FROM dms),
  (SELECT replies_24h FROM reps),
  ROUND((SELECT replies_24h FROM reps)::numeric / NULLIF((SELECT dms_sent_24h FROM dms), 0) * 100, 2),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  signals_last_hour = EXCLUDED.signals_last_hour,
  signals_last_24h  = EXCLUDED.signals_last_24h,
  active_users      = EXCLUDED.active_users,
  dms_sent_24h      = EXCLUDED.dms_sent_24h,
  replies_24h       = EXCLUDED.replies_24h,
  conversion_rate   = EXCLUDED.conversion_rate,
  updated_at        = EXCLUDED.updated_at;
```

Alternatively, via Supabase JS client: run 3 parallel `.select()` COUNT queries and compute `conversion_rate` in TypeScript, then `.upsert()`. This avoids raw SQL and is more readable — planner's discretion.

### Seed Row Strategy

Two options (planner's discretion per CONTEXT.md):

**Option A — Migration seed row:**
```sql
INSERT INTO live_stats (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
```
Add to migration `00011_phase8_live_stats_seed.sql`. Cron always UPSERTs on this constant UUID.

**Option B — Cron-side guard:**
Check if any row exists before first UPSERT; if not, INSERT. Adds one extra query per cron run. Option A is simpler.

### Cron Pattern to Mirror

`src/app/api/cron/zombie-recovery/route.ts` — same 5-min cadence, same auth/observability pattern. The new route must follow CLAUDE.md §"Cron Route Pattern":
1. Auth: Bearer CRON_SECRET check
2. Setup: correlationId + startedAt
3. Operations: service role client
4. Logging: structured logs with correlationId
5. Cleanup: `await logger.flush()` before return

---

## Section 2: Duplicate Digest Resolution

### What Each Route Does

| Aspect | `digest/route.ts` (Phase 5 — KEEP) | `daily-digest/route.ts` (Phase 4 — DELETE) |
|--------|--------------------------------------|----------------------------------------------|
| Email template | Inline `buildHtml()` function, plain HTML | `sendDailyDigest()` from `src/features/notifications/lib/send-daily-digest.ts` — React Email branded component |
| Signal window | Rolling 24h from `now()` | Calendar "yesterday" in user's TZ (start/end of day boundaries) |
| Top signals | 1 signal (`limit(1)`) | 3 signals (`limit(3)`) with subreddit extraction |
| Reply count | Not included | `replyCount` from `prospects.replied_detected_at` (yesterday's TZ window) |
| Eligibility | `subscription_active OR trial_ends_at > now` (gated) | All users (no billing gate) |
| Empty digest skip | `signalCount === 0 && pendingCount === 0` | `signalCount === 0 && pendingCount === 0 && replyCount === 0` |
| job_logs write | Per-send + summary | Summary only |
| `logger.flush()` | Yes (line 324) | Yes (line 238 / line 242) |
| vercel.json schedule | `0 * * * *` (hourly) | `0 * * * *` (hourly) |

### What Must Be Ported INTO `digest` Before Deletion

Three changes to `src/app/api/cron/digest/route.ts`:

1. **Replace `buildHtml()` with `sendDailyDigest()`** — import from `@/features/notifications/lib/send-daily-digest`. This brings the React Email branded template.
2. **Add `replyCount` query** — mirror `daily-digest` lines 101–108: count `prospects.replied_detected_at` in last 24h for this user. Update empty-digest guard to include `replyCount === 0`.
3. **Expand top signals: `limit(1)` → `limit(3)`** — update query and pass `topSignals` array (with subreddit extraction) to `sendDailyDigest`.

Note: `sendDailyDigest` already accepts `replyCount` and `topSignals[]` (confirmed in `send-daily-digest.ts` lines 6–15). The template is ready for the richer data.

### `sendDailyDigest` Signature (confirmed)

```typescript
// src/features/notifications/lib/send-daily-digest.ts
export interface DailyDigestData {
  signalCount: number
  pendingCount: number
  replyCount: number
  topSignals: Array<{ excerpt: string; subreddit: string; intentStrength: number }>
  productName: string
}
export async function sendDailyDigest(to: string, data: DailyDigestData): Promise<...>
```

### vercel.json Changes

Remove the `daily-digest` entry (lines 25–28 of current vercel.json):
```json
{
  "path": "/api/cron/daily-digest",
  "schedule": "0 * * * *"
}
```

Add the `refresh-live-stats` entry:
```json
{
  "path": "/api/cron/refresh-live-stats",
  "schedule": "*/5 * * * *"
}
```

Final cron count: 10 → 10 (remove 1, add 1).

### File to Delete

`src/app/api/cron/daily-digest/route.ts` — entire directory `src/app/api/cron/daily-digest/` can be removed. No other file imports from it (it only imports `sendDailyDigest` FROM notifications, not the reverse).

---

## Section 3: Hour=8 Local Filter Correctness

### Current Behavior (CORRECT — confirmed by code inspection)

Both routes use identical logic:
```typescript
// digest/route.ts lines 138–141
// daily-digest/route.ts lines 43–48
const tz = user.timezone ?? "UTC"
const localHour = parseInt(formatInTimeZone(now, tz, "H"), 10)
if (localHour !== 8) {
  skipped += 1
  continue
}
```

`formatInTimeZone(now, tz, "H")` from `date-fns-tz` correctly converts the server's UTC `now` to the user's IANA timezone, extracts the local hour (0–23), and gates on `=== 8`. This is correct.

**No timezone bug to fix.** The hour-8 logic works as intended. The only problem is two routes doing it simultaneously.

### users.timezone Column (confirmed)

`digest/route.ts` line 13 declares `timezone: string | null` in `UserRow`. The `users` table in 00002 does not show this column in the initial 100 lines — it may have been added in a later migration, but both cron routes query it and treat `null` as `"UTC"` fallback. No change needed here.

### Idempotency Guard

Per CONTEXT.md `<deferred>` section: `sent_digest_at` column is deferred. The single-cron model after deletion is sufficient: if the cron fires at :00 every hour and only sends when `localHour === 8`, a user can only receive one email per day (Vercel guarantees at-most-once cron invocation per scheduled tick). No DB guard column needed for this phase.

**Edge case acknowledged but deferred:** If a cron invocation fails mid-loop and Vercel retries within the same hour-8 window, some users could receive a duplicate. CONTEXT.md explicitly defers the `sent_digest_at` guard. The current code in both routes has no guard.

### Signal Window: Rolling 24h vs Calendar Yesterday

`daily-digest` uses calendar "yesterday" in user's TZ (more accurate for "people looking yesterday").
`digest` uses rolling `now() - 24 hours`.

CONTEXT.md does not lock this choice. The rolling window is simpler and consistent with the `live_stats` query style. The planner should note this behavioral difference — the digest subject line says "people looking for X **yesterday**" but the query actually covers a rolling 24h window. If this matters, the planner can port `daily-digest`'s calendar-boundary logic.

---

## Validation Architecture

### Test Framework

No test framework is configured (confirmed: CLAUDE.md §Testing). Per CONTEXT.md `## Claude's Discretion`, test framework choice is left to the planner.

| Property | Value |
|----------|-------|
| Framework | None configured — Wave 0 must install if integration tests are required |
| Quick verification | Manual: open `/live` in incognito → stats non-zero |
| Cron verification | Vercel dashboard → Cron Jobs tab → confirm only one digest entry |

### Requirement → Verification Map

| Req | Behavior | Verification | Automated? |
|-----|----------|-------------|-----------|
| GROW-01 | `/live` shows non-zero stats after first cron run | Visual check: open `/live` in incognito; OR query `SELECT * FROM live_stats` and confirm non-zero values | Manual (no test framework) |
| GROW-02 | All 6 aggregates populate correctly | DB query: `SELECT signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate FROM live_stats` — all non-null after first cron run assuming prod activity exists | Manual DB query |
| NTFY-01 / GROW-05 | Exactly ONE digest email per user per day | Check Resend dashboard: count emails to a single address on a given date. Check job_logs: `SELECT COUNT(*) FROM job_logs WHERE metadata->>'cron'='digest' AND user_id='...' AND started_at::date='2026-04-21'` | Manual via Resend + DB query |
| GROW-05 (idempotency) | No duplicate from deleted cron | Vercel dashboard shows zero runs for `/api/cron/daily-digest`; vercel.json has no `daily-digest` entry | Static assertion: `vercel.json` has exactly one entry matching `digest` |

### Observability Proof Points

- **refresh-live-stats cron:** `job_logs` row with `metadata.cron='refresh-live-stats'` inserted every ~5 min; `updated_at` on `live_stats` row advances.
- **Digest dedup:** `job_logs` rows with `metadata.cron='digest'` (not `daily-digest`) appear for users at hour=8. Absence of `metadata.cron='daily-digest'` confirms cleanup worked.
- **Axiom structured logs** (via `logger`): correlation IDs on all cron runs enable per-run tracing.

### Wave 0 Gaps

- [ ] Seed migration `00011_phase8_live_stats_seed.sql` — inserts fixed-id live_stats row (or planner uses cron-side guard instead)
- [ ] `src/app/api/cron/refresh-live-stats/route.ts` — new file, does not exist yet
- [ ] `src/app/api/cron/daily-digest/route.ts` — must be deleted
- [ ] vercel.json — two edits: add refresh-live-stats entry, remove daily-digest entry
- [ ] `src/app/api/cron/digest/route.ts` — three edits: swap template, add replyCount, expand top signals to 3

---

## Sources

### Primary (HIGH confidence — direct file reads)
- `supabase/migrations/00002_initial_schema.sql` lines 184–193 — live_stats DDL
- `supabase/migrations/00010_phase5_billing_onboarding.sql` line 97 — conversion_rate column
- `supabase/migrations/00001_enums.sql` lines 18–22 — action_type and action_status_type enums
- `supabase/migrations/00002_initial_schema.sql` lines 149–163 — actions table (executed_at confirmed, no sent_at)
- `supabase/migrations/00007_phase4_sequences_notifications.sql` line 10 — replied_detected_at column
- `src/app/api/cron/digest/route.ts` — full route inspection
- `src/app/api/cron/daily-digest/route.ts` — full route inspection
- `src/app/api/live/route.ts` — confirmed read column list
- `src/features/notifications/lib/send-daily-digest.ts` — confirmed DailyDigestData interface
- `vercel.json` — confirmed both digest entries at `0 * * * *`

---

## RESEARCH COMPLETE
