# Phase 8: Public Stats + Duplicate Digest Cleanup - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Two gap closures only:

1. **GROW-01 (`live_stats` write path)** — Populate the `live_stats` table so all 6 aggregate metrics on `/live` display real non-zero numbers whenever underlying activity exists. The table was created in migration 00002 but has no writer today.
2. **Duplicate digest cleanup** — Both `/api/cron/daily-digest` (Phase 4) and `/api/cron/digest` (Phase 5) run hourly and each sends at `localHour=8`, so eligible users receive two emails per day. Consolidate to exactly one digest per day via `/api/cron/digest`.

Out of scope: new public stats, redesigning `/live`, new metrics beyond the 6 already in `LiveStatsData`, email template redesign beyond reaching parity with the deleted route, backfilling historical stats.

</domain>

<decisions>
## Implementation Decisions

### Write mechanism for `live_stats`
- **Dedicated cron route** at `/api/cron/refresh-live-stats` (Node runtime, Bearer `CRON_SECRET` auth, service role Supabase client) — same pattern as other crons in `src/app/api/cron/*`.
- **Cadence: every 5 minutes** (`*/5 * * * *`). Matches `zombie-recovery`. Acceptable lag for a public page polled every 10s.
- **Single-row UPSERT on a fixed id** (seed row in migration, then UPSERT by constant id). No time-series history, no append-only rows. `/api/live`'s existing `.order("updated_at", { ascending: false }).limit(1)` keeps working unchanged.
- **Emit a `job_logs` row** (status, duration_ms, correlation_id) on every run — same observability pattern as peer crons.
- **Register in `vercel.json`** alongside existing cron entries.

### Metric definitions (the 6 fields on `live_stats` used by `/api/live`)
- **`signals_last_hour`** — `COUNT(*) FROM intent_signals WHERE detected_at > now() - interval '1 hour'`.
- **`signals_last_24h`** — `COUNT(*) FROM intent_signals WHERE detected_at > now() - interval '24 hours'`.
- **`active_users`** — `COUNT(DISTINCT user_id) FROM intent_signals WHERE detected_at > now() - interval '24 hours'`. Reflects real product activity (users repco found signals for), not vanity subscriber count.
- **`dms_sent_24h`** — `COUNT(*) FROM actions WHERE action_type='dm' AND status='sent' AND sent_at > now() - interval '24 hours'` (verify exact status/timestamp column during planning; may be `completed_at` depending on Phase 3 schema).
- **`replies_24h`** — `COUNT(*) FROM prospects WHERE replied_detected_at > now() - interval '24 hours'`.
- **`conversion_rate`** — `replies_24h / NULLIF(dms_sent_24h, 0) * 100`, rounded to 2 decimals (matches `numeric(5,2)` column type). Labelled/interpreted as reply rate on /live.
- **Windows are rolling**, not calendar-aligned. Every query uses `now() - interval 'N'`.
- **`scans_per_hour` stays at 0** — column exists in schema but is NOT in `LiveStatsData` type nor selected by `/api/live`. Out of scope for this phase.

### Duplicate digest consolidation
- **Keep `/api/cron/digest`** (Phase 5), remove `/api/cron/daily-digest` (Phase 4) per ROADMAP success criteria.
- **Remove `vercel.json` cron entry AND delete the route file** `src/app/api/cron/daily-digest/route.ts`. Git history preserves rollback. No orphaned route code.
- **Port features from `daily-digest` into `digest` BEFORE deleting** so users don't regress:
  - Port the **React Email template** via `sendDailyDigest` (branded, styled) to replace `digest`'s inline HTML.
  - Port **`replyCount`** query (yesterday's replies) and **top 3 signals** (not just top 1) so the richer content survives.
  - Keep `digest`'s trial + subscription gating (better eligibility logic than `daily-digest`'s "every user" loop).
- **Verification:** manual prod check after deploy (Vercel cron dashboard shows only one digest entry, only one email arrives at 8am local) + a unit test that snapshots the `vercel.json` cron list (or asserts only one digest cron exists) so accidental re-addition fails CI.

### Claude's Discretion
- Exact shape of the `/api/cron/refresh-live-stats` query (single CTE with 6 aggregates vs separate queries) — planner chooses based on perf/readability.
- Seed migration strategy for the single `live_stats` row (INSERT ON CONFLICT DO NOTHING vs `has_live_stats_row()` check in the cron itself).
- Unit test framework choice / placement for the vercel.json guard (project doesn't have a test framework configured yet per CLAUDE.md).
- Exact column names for DM sent-at and converted-at timestamps — verify against Phase 3 migrations during planning.
- Whether the React Email template needs minor edits to accommodate top-3 signals (vs the current single-top-signal layout in `sendDailyDigest`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/REQUIREMENTS.md` §PLG/Growth — GROW-01 definition, GROW-02 aggregate stats fields
- `.planning/REQUIREMENTS.md` §Notifications — NTFY-01 daily digest behavior; §PLG/Growth GROW-05/06 digest content
- `.planning/ROADMAP.md` §"Phase 8: Public Stats + Duplicate Digest Cleanup" — goal, depends on, success criteria
- `.planning/v1.0-MILESTONE-AUDIT.md` §gaps.requirements.GROW-01 + §integration."live_stats — no write path" + §integration."duplicate digest crons" — evidence of the gap

### Existing read path + schema
- `src/app/api/live/route.ts` — live_stats reader; shape of `LiveStatsData`
- `src/features/growth/components/live-stats.tsx` — consumer of `LiveStatsData`
- `supabase/migrations/00002_initial_schema.sql` §10 live_stats — table DDL (7 columns)
- `supabase/migrations/00010_phase5_billing_onboarding.sql` §6 — conversion_rate column addition
- `supabase/migrations/00003_rls_policies.sql` §live_stats — anon SELECT policy; service_role writes

### Digest consolidation refs
- `src/app/api/cron/digest/route.ts` — keeper (Phase 5) — needs React Email + top-3 signals + replyCount ports
- `src/app/api/cron/daily-digest/route.ts` — to be deleted (Phase 4); source of `sendDailyDigest`, replyCount, top-3 queries
- `src/features/notifications/lib/send-daily-digest.ts` — React Email template to adopt in `digest`
- `vercel.json` — cron registration; both digest entries currently present

### Cron patterns + observability
- `src/app/api/cron/zombie-recovery/route.ts` — 5-min cron pattern to mirror
- `src/lib/logger.ts` — correlation IDs, `logger.flush()` before return
- `CLAUDE.md` §"Cron Route Pattern" — the mandated 5-step pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Service role Supabase client pattern** (`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`) — used in every cron route; reuse for `refresh-live-stats`.
- **`logger` + correlation IDs** (`src/lib/logger.ts`) — already wired to Sentry + Axiom.
- **`job_logs` insert pattern** — all crons write `{job_type, status, started_at, finished_at, duration_ms, metadata.correlation_id}` on completion.
- **`sendDailyDigest`** (`src/features/notifications/lib/send-daily-digest.ts`) — React Email branded template currently called by `daily-digest`; port call-site into `digest`.
- **`formatInTimeZone`** (`date-fns-tz`) — already used by both digest crons for local-hour-8 gating.
- **`vercel.json`** — single-file cron registry; add one entry, remove one entry.

### Established Patterns
- **Cron auth**: `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` check at top of every cron handler.
- **Single-row UPSERT**: not used yet in the codebase for `live_stats`; `deduct_credits`/`add_credits` RPCs (migration 00010) show the Supabase RPC style if we want a function.
- **Rolling windows in SQL**: `check-replies` and `expire-actions` both use `now() - interval 'N'` — reuse the pattern.

### Integration Points
- **`/api/live/route.ts`** — consumer of the new write path. Must remain compatible with `.order("updated_at" desc).limit(1)`.
- **`/live` page (`src/app/(public)/live/page.tsx`)** — downstream of `/api/live`; no change expected, will start showing real numbers automatically.
- **`vercel.json`** — two edits: add `refresh-live-stats`, remove `daily-digest`.
- **`digest/route.ts`** — three edits: swap inline HTML → `sendDailyDigest`, add replyCount query, expand top signals 1 → 3.

</code_context>

<specifics>
## Specific Ideas

- `/live` must go from "all zeros" to "real numbers" after first cron run post-deploy. Verification is visual: open `/live` in incognito, numbers non-zero (assuming prod activity exists).
- Users must receive exactly ONE digest email on any given day. "Exactly one per day" is the acceptance test.
- Port, don't rewrite — the React Email template + queries in `daily-digest` were built intentionally in Phase 4. Moving them into `digest` preserves the branded email without redesign work.
- "Rolling windows" matches the labels ("last hour", "24h") — users shouldn't see the hour counter drop to 0 when the wall clock ticks over.

</specifics>

<deferred>
## Deferred Ideas

- Historical `live_stats` time-series for trend graphs — not needed until /live gains charts (future phase).
- Populating `scans_per_hour` — would require UI changes on /live; scope creep.
- Redis/Vercel KV cache for `/api/live` — overkill for 10s polling on a single-row read.
- `sent_digest_at` idempotency column per user — only needed if we stop trusting the consolidation; manual verification + CI guard is enough.
- Auth/login-based `active_users` metric — would require new login tracking we don't have.
- DB-trigger based live_stats updates — revisit if 5-min lag proves insufficient.

</deferred>

---

*Phase: 08-public-stats-digest-cleanup*
*Context gathered: 2026-04-21*
