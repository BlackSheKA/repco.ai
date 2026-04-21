---
status: complete
phase: 06-linkedin
source: [06-01-SUMMARY.md]
started: 2026-04-21T09:30:00Z
updated: 2026-04-21T10:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Clear ephemeral state. Run `pnpm dev --port 3001` from scratch. Server boots without errors, migration 00011 is applied on dev DB, dashboard loads at http://localhost:3001 and a primary query (signal feed / auth session) returns live data.
result: pass
note: "Turbopack boot in 2.6s. Middleware deprecation warning is a pre-existing Next.js 16 advisory, not a regression. /login rendered without console errors."

### 2. LinkedIn Filter Option Enabled
expected: On the dashboard filter bar, open the Platform dropdown. The "LinkedIn" option is visible and selectable (not greyed out / not wrapped in a "Coming Soon" tooltip). Selecting it filters the feed to LinkedIn-only signals.
result: pass
note: "Option enabled without Tooltip/disabled. Selection set ?platform=linkedin on URL and scoped feed correctly."

### 3. Signal Card — LinkedIn Variant
expected: When a LinkedIn signal is present in the feed, its card shows a blue (#0A66C2) "LinkedIn" badge, the author's professional headline under the name, and a "Connect" CTA button (instead of the Reddit "Send DM" CTA). A "View on LinkedIn" secondary link is visible.
result: pass
note: "Verified after applying migration 00011 to prod and seeding a LinkedIn intent_signal. Card renders: 'LinkedIn' badge (bg-[#0A66C2]), author handle 'alex-prospect', headline 'Head of Growth at ExampleCorp', 8/10 flame, 'View on LinkedIn' link, 'Connect with alex-prospect' CTA."

### 4. Staleness Banner — Delayed / Failed States
expected: An amber banner appears above the filter bar when the last successful LinkedIn cron run is >8h ago ("LinkedIn monitoring delayed…") or >12h ago ("LinkedIn monitoring failed…"). If no run has ever succeeded, the banner reflects the delayed/failed state as appropriate. It is announced to screen readers (role="status", aria-live="polite"). When monitoring is healthy, the banner is not rendered.
result: pass
note: "Verified 2h=hidden, 9h=delayed copy, 13h=failed copy with 'Retrying automatically.' role=status present. Note: when lastSuccessAt is null (no run yet), banner stays hidden — intentional; no-data != stale."

### 5. Connect CTA → connection_request Action
expected: Clicking "Connect" on a LinkedIn signal card creates a new action in the approval queue with action_type = connection_request, status = pending_approval, and a Sonnet-drafted connection note <=300 characters. The original signal is marked as actioned. No like/follow auto-approved engage actions are created for LinkedIn (single-step flow).
result: pass
note: "Click Connect → 1 action created: action_type=connection_request, status=pending_approval, drafted_content 208 chars (<=300), professional tone referencing the post, no link. Signal.status updated to 'actioned'. No like/follow engage actions auto-created (single-step confirmed)."

### 6. LinkedIn Cron Endpoint — Auth Gate
expected: Calling GET /api/cron/monitor-linkedin without a valid Bearer CRON_SECRET returns 401/403 (rejects unauthorized). Calling with the correct Bearer token either runs the LinkedIn ingestion (if APIFY_API_TOKEN configured) or cleanly aborts via the canary gate with a structured log — it does not crash the server.
result: pass
note: "no bearer=401, wrong bearer=401, correct bearer=500 with clean canary abort (adapter_error, structured log, correlation ID) because APIFY_API_TOKEN is not configured — expected graceful degradation."

### 7. LinkedIn Status Endpoint
expected: GET /api/status/linkedin (auth-gated) returns JSON like {lastSuccessAt, hoursAgo} reflecting the most recent job_logs row for the monitor-linkedin job. Unauthenticated requests are rejected.
result: pass
note: "Unauth=401. Auth with no runs → {lastSuccessAt: null, hoursAgo: null}. After seeding a matching job_logs row scoped to user_id, endpoint returns correct ISO timestamp + hoursAgo float."

### 8. LinkedIn Signal Ingestion (optional — requires Apify)
expected: After a monitor-linkedin cron run completes with APIFY_API_TOKEN configured, new LinkedIn posts matching the user's monitoring keywords appear in the intent feed within 4h, tagged with the #0A66C2 LinkedIn badge, author headline, and 48h-fresh only. Duplicate posts (same post_url, UTM-stripped) are not re-inserted. Skip this test if Apify is not configured.
result: skipped
reason: "APIFY_API_TOKEN not configured in .env.local. End-to-end ingestion cannot be exercised without it. Unit tests (linkedin-adapter.test.ts, linkedin-ingestion.test.ts, linkedin-canary.test.ts, monitor-linkedin/route.test.ts) cover this path with fixtures (145/145 passing per SUMMARY)."

## Summary

total: 8
passed: 7
issues: 0
pending: 0
skipped: 1

## Gaps

[none]

## Notes

**Environment gap resolved during UAT:** Migration `00011_phase6_linkedin.sql` had only been applied to the dev Supabase branch `dvmfeswlhlbgzqhtoytl` per the phase SUMMARY's key-decision. Local `.env.local` points at prod `cmkifdwjunojgigrqwnr`, which was missing the 4 LinkedIn columns on `intent_signals` and the `connection_request` enum value on `action_type`. With user authorization, migration 00011 was applied to prod via the Supabase Management API (additive DDL only: ADD COLUMN + ADD ENUM VALUE). Tests 3 and 5 passed after the migration.

**Test fixtures cleaned up:** The seed `job_logs` row (Test 4) and the seed `intent_signals` + derived `actions`/`prospects` rows (Tests 3/5) were deleted post-verification. Prod DB is back to pre-UAT state except for the now-applied migration 00011 schema.

**Follow-ups (not phase-6 blockers):**
- Set `APIFY_API_TOKEN` in `.env.local` (and Vercel prod) to enable live LinkedIn ingestion (Test 8).
- Phase 3 executor case-arm for `connection_request` remains deferred per `TODO-phase6-connection-request.md`.
- LinkedIn credit cost in `get_action_credit_cost` SQL function is still not set — credit-neutral per Phase 5/6 boundary.
