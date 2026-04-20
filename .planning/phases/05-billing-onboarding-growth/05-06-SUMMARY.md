---
phase: 05-billing-onboarding-growth
plan: 06
subsystem: growth
tags: [public-page, polling, reddit, rate-limiting, anonymization, plg]

requires:
  - phase: 05-billing-onboarding-growth
    provides: 05-01 data layer (intent_signals.is_public, live_stats schema)
  - phase: 02-reddit-monitoring
    provides: structural-matcher + intent_type enum for anonymization mapping
provides:
  - /live public page with anonymized polling feed (10s) + 6-metric stat bar
  - Server-side anonymization lib mapping intent_type to generic descriptions
  - /api/live GET endpoint (stats + anonymized signals, Cache-Control SWR)
  - /api/scan POST endpoint (Reddit public search + in-memory 3/hr rate limit)
  - Scan my product form component with loading/results/error/zero states
  - (public) route group + minimal header layout with Sign up free CTA
affects: [growth, onboarding, landing-page, seo]

tech-stack:
  added: []
  patterns:
    - "Public (public) route group bypasses AppShell + auth middleware via PUBLIC_ROUTES allowlist"
    - "Server-side anonymization before JSON response (author_handle=null, post_url='#', description from intent_type)"
    - "Client poll loop with known-id dedup + MAX_SIGNALS cap + silent retry on network errors"
    - "In-memory Map rate limit keyed by x-forwarded-for IP (3/hour, 429 response)"
    - "AbortController 8s timeout for external fetch with partial results returned"

key-files:
  created:
    - "src/app/(public)/layout.tsx"
    - "src/app/(public)/live/page.tsx"
    - "src/app/api/live/route.ts"
    - "src/app/api/scan/route.ts"
    - "src/features/growth/lib/anonymize.ts"
    - "src/features/growth/components/anonymized-signal-card.tsx"
    - "src/features/growth/components/live-stats.tsx"
    - "src/features/growth/components/live-feed.tsx"
    - "src/features/growth/components/scan-hook.tsx"
  modified:
    - "src/middleware.ts"

key-decisions:
  - "Reddit public search JSON (no auth) used for /api/scan to keep the demo zero-friction; snoowrap reserved for authed user pipelines"
  - "Anonymization replaces post_content with intent_type-derived generic copy (no excerpts leak from private users)"
  - "Rate limit uses in-memory Map per process (serverless cold-start drops counters, acceptable for MVP demo)"
  - "10s setInterval polling with id-based dedup instead of Supabase Realtime (keeps /live anon-friendly, no long-lived connections)"

patterns-established:
  - "Public route group + middleware PUBLIC_ROUTES allowlist for SEO/growth pages"
  - "Server anonymization boundary: raw DB rows never leave server without stripping identifying fields"
  - "Structural matcher reuse for public demo (same keyword -> strength scoring as authed monitoring)"

requirements-completed: [GROW-01, GROW-02, GROW-03]

duration: 10 min
completed: 2026-04-20
---

# Phase 05 Plan 06: Live Page + Scan Hook Summary

**Public /live page with 10s-polling anonymized feed and aggregate stats, plus a rate-limited "Scan my product" form hitting Reddit's public search JSON and classifying via the existing structural matcher.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-20T11:50:21Z
- **Completed:** 2026-04-20T12:00:59Z
- **Tasks:** 2
- **Files created:** 9
- **Files modified:** 1

## Accomplishments

- Public `/live` page renders without auth via `(public)` route group and `PUBLIC_ROUTES` middleware allowlist, with anonymized signal feed polling every 10 seconds.
- Six-metric aggregate stat bar (last hour / 24h / active users / DMs sent / replies / conversion rate) rendered in Geist Mono on responsive 3-col mobile / 6-col desktop grid.
- Server-side anonymization strips author handles, post URLs, subreddit names, and post content — replaced with generic descriptions derived from `intent_type`.
- `/api/scan` endpoint runs Reddit public JSON search with 8 second abort, classifies via existing `matchPost` structural matcher, caps at 10 results, enforces 3/hour/IP in-memory rate limit returning 429 with "Try again in a few minutes".
- Scan form has full state machine (idle / loading / error / results / zero-results) with 10 second client-side abort, toast on rate-limit, and Sign-up CTA after results.
- Minimal (public) layout with repco logo + Sign up free header button (no sidebar, no AppShell).

## Task Commits

1. **Task 1: /live public page with anonymized feed and aggregate stats** — `a545542` (feat)
2. **Task 2: "Scan my product" API endpoint and form component** — `8ed5a34` (feat)

**Plan metadata:** _(to be added by metadata commit)_

## Files Created/Modified

### Created
- `src/app/(public)/layout.tsx` — Minimal public layout with logo + Sign up free CTA
- `src/app/(public)/live/page.tsx` — /live server component with metadata, initial stats/signals fetch, ScanHook mount
- `src/app/api/live/route.ts` — GET polling endpoint returning aggregated stats + anonymized signals with SWR cache header
- `src/app/api/scan/route.ts` — POST Reddit search endpoint with Zod validation, IP rate limiting, and structural matcher classification
- `src/features/growth/lib/anonymize.ts` — Pure anonymizer (RawSignal → AnonymizedSignal) mapping intent_type to generic descriptions
- `src/features/growth/components/anonymized-signal-card.tsx` — Simplified card (no Contact/Dismiss, fade-in on mount)
- `src/features/growth/components/live-stats.tsx` — 6-metric stat bar component
- `src/features/growth/components/live-feed.tsx` — Polling feed with id-dedup and skeleton state
- `src/features/growth/components/scan-hook.tsx` — Scan form + results preview + zero-state + rate-limit handling

### Modified
- `src/middleware.ts` — Added `/api/live` to `PUBLIC_ROUTES` allowlist so polling works without auth cookies

## Decisions Made

- **Reddit public JSON search for /api/scan** — Avoids the snoowrap OAuth credential path for anonymous demo traffic, keeping the hook frictionless. Snoowrap remains the authed-pipeline path inside `src/features/monitoring/lib/reddit-adapter.ts`.
- **In-memory rate limit Map** — 3 requests per IP per hour in a module-level Map. Serverless cold starts drop the counters, which is acceptable for an MVP demo gate; a production upgrade would move to Supabase + SQL bucket or Upstash.
- **Server-side anonymization boundary** — The anonymizer runs before JSON leaves both the initial server component render and the polling endpoint. Client code never sees author handles or post content from public feeds.
- **10s setInterval polling, not Realtime** — `/live` is an anon endpoint; Supabase Realtime requires a channel subscription that complicates RLS for anon. Polling with `Cache-Control: max-age=10, stale-while-revalidate=30` is simpler and CDN-friendly.

## Deviations from Plan

None - plan executed exactly as written.

The only substantive scope adjustment was that `src/middleware.ts` already had a `PUBLIC_ROUTES` allowlist from earlier plans (02 + 04 hotfix). Rather than rewriting the structure, the plan's "add explicit check" was satisfied by extending the existing list with `/api/live` (Task 1 diff). `/live`, `/api/scan`, `/api/stripe`, `/api/og` were already present.

## Issues Encountered

- **Sibling-plan reset race** — Sibling 05-04 executed a `git reset: moving to HEAD` shortly after my Task 1 commit landed. Verified `a545542` is an ancestor of HEAD via `git merge-base --is-ancestor`; all Task 1 files remained tracked, so no rework was needed. Task 2 committed cleanly on top of the rebased history.

## User Setup Required

None - no external service configuration required. The /api/scan endpoint uses Reddit's public JSON search which requires no credentials. snoowrap env vars (`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_REFRESH_TOKEN`) are unchanged and only affect the authed monitoring pipeline.

## Next Phase Readiness

Phase 5 growth surface ready:
- `/live` + `/api/scan` give visitors an instant demo hook (PLG entry point).
- Anonymization lib is reusable for any future public signal exposure (shareable links, /stats API, embed widgets).
- Rate limit pattern can be lifted into a shared helper for other public endpoints.

Remaining Phase 5 work outside this plan:
- Billing + prospect pipeline are covered by sibling plans 05-03 / 05-04 / 05-05.
- Weekly results card / social share rendering (ResultsCard) is listed in UI-SPEC but belongs to a follow-up growth plan if prioritized.

## Self-Check: PASSED

- All 9 created files verified on disk with `-f` test
- Both task commits (`a545542`, `8ed5a34`) verified in `git log --all`
- `pnpm typecheck` passed after each task

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*
