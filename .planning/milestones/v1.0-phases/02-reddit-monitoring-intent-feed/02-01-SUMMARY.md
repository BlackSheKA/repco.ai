---
phase: 02-reddit-monitoring-intent-feed
plan: 01
subsystem: api
tags: [snoowrap, reddit, cron, supabase, server-actions, monitoring]

requires:
  - phase: 01-foundation
    provides: "Schema (intent_signals, monitoring_signals, job_logs), auth, app shell, logger, cron pattern"
provides:
  - "Reddit snoowrap adapter with lazy init, rate limiting, searchSubreddit/searchAll"
  - "Ingestion pipeline: fetch -> 48h filter -> deduplicate upsert"
  - "Monitor-reddit cron route (15-min interval) with CRON_SECRET auth and job_logs logging"
  - "Settings page with keyword/subreddit add/remove via server actions"
  - "Schema migration adding subreddit, dismissed_at, classification_status to intent_signals"
  - "Shared types: RedditPost, MatchResult, ClassificationResult, MonitoringConfig"
affects: [02-02, 02-03, 02-04]

tech-stack:
  added: [snoowrap, "@anthropic-ai/sdk", date-fns]
  patterns: [reddit-adapter-lazy-init, ingestion-pipeline, monitoring-server-actions]

key-files:
  created:
    - supabase/migrations/00005_phase2_extensions.sql
    - src/features/monitoring/lib/types.ts
    - src/features/monitoring/lib/reddit-adapter.ts
    - src/features/monitoring/lib/ingestion-pipeline.ts
    - src/app/api/cron/monitor-reddit/route.ts
    - src/features/monitoring/actions/settings-actions.ts
    - src/features/monitoring/components/settings-form.tsx
    - src/app/(app)/settings/page.tsx
  modified:
    - vercel.json
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Cast snoowrap search limit via spread to bypass incomplete BaseSearchOptions type"
  - "In-memory deduplication by permalink before upsert to avoid redundant DB calls"
  - "Server actions with duplicate check before insert (not relying solely on DB constraint)"

patterns-established:
  - "Reddit adapter pattern: lazy-init snoowrap client with requestDelay for rate limiting"
  - "Ingestion pipeline pattern: fetch -> filter -> deduplicate -> upsert with onConflict"
  - "Monitoring server actions: CRUD on monitoring_signals with revalidatePath"

requirements-completed: [MNTR-01, MNTR-05, MNTR-07]

duration: 5min
completed: 2026-04-17
---

# Phase 2 Plan 1: Reddit Ingestion Pipeline Summary

**snoowrap adapter with 15-min cron ingestion, 48h freshness filter, post_url deduplication, and Settings page for keyword/subreddit management**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-17T09:14:51Z
- **Completed:** 2026-04-17T09:19:36Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Reddit ingestion pipeline: snoowrap adapter -> 48h filter -> deduplicate upsert into intent_signals
- Monitor-reddit cron route secured by CRON_SECRET, processes all active users, logs to job_logs with duration/signal counts
- Settings page at /settings with instant-save keyword and subreddit management via server actions
- Schema migration adds subreddit, dismissed_at, classification_status columns to intent_signals

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration, shared types, snoowrap adapter, and Vercel Cron config** - `f4026cb` (feat)
2. **Task 2: Monitor-reddit cron route and settings page** - `ae3f037` (feat)

## Files Created/Modified
- `supabase/migrations/00005_phase2_extensions.sql` - Adds subreddit, dismissed_at, classification_status to intent_signals
- `src/features/monitoring/lib/types.ts` - Shared types: RedditPost, MatchResult, ClassificationResult, MonitoringConfig
- `src/features/monitoring/lib/reddit-adapter.ts` - Thin snoowrap wrapper with lazy init and rate limiting
- `src/features/monitoring/lib/ingestion-pipeline.ts` - Fetch -> filter -> deduplicate -> upsert pipeline
- `src/app/api/cron/monitor-reddit/route.ts` - 15-min cron endpoint processing all users
- `src/features/monitoring/actions/settings-actions.ts` - Server actions for add/remove keywords and subreddits
- `src/features/monitoring/components/settings-form.tsx` - Client form with pills, Enter key support, toast feedback
- `src/app/(app)/settings/page.tsx` - Settings page fetching user's monitoring_signals
- `vercel.json` - Added monitor-reddit cron entry (*/15)

## Decisions Made
- Used spread cast to pass `limit` to snoowrap's `Subreddit.search()` which has incomplete types (only `BaseSearchOptions` typed, not full `SearchOptions`)
- Deduplicate posts in-memory by permalink before DB upsert to reduce unnecessary database calls when same post matches multiple keywords
- Server actions check for duplicates before insert (belt-and-suspenders with DB UNIQUE constraint)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed snoowrap TypeScript type incompatibility for search limit**
- **Found during:** Task 1 (snoowrap adapter creation)
- **Issue:** `Subreddit.search()` accepts `BaseSearchOptions` which lacks `limit` property, though the Reddit API supports it
- **Fix:** Spread `limit` via `Record<string, unknown>` cast to bypass the incomplete type definition
- **Files modified:** src/features/monitoring/lib/reddit-adapter.ts
- **Verification:** pnpm build passes
- **Committed in:** f4026cb (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type workaround for archived snoowrap library. No scope creep.

## Issues Encountered
None beyond the snoowrap type issue documented above.

## User Setup Required

**External services require manual configuration.** Reddit API credentials needed:
- `REDDIT_CLIENT_ID` - Reddit Apps page -> Create App -> client ID
- `REDDIT_CLIENT_SECRET` - Reddit Apps page -> Create App -> secret
- `REDDIT_REFRESH_TOKEN` - OAuth2 flow with scope 'read'
- `ANTHROPIC_API_KEY` - Anthropic Console -> API Keys (used in Plan 02)

## Next Phase Readiness
- Ingestion pipeline ready; Plan 02 (structural matcher + Sonnet classifier) can process signals
- Settings page functional for keyword/subreddit management
- Schema supports classification_status for pending/completed/failed tracking
- Reddit API credentials must be configured before cron produces real data

---
*Phase: 02-reddit-monitoring-intent-feed*
*Completed: 2026-04-17*
