# Phase 6: LinkedIn - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The system monitors LinkedIn every 4 hours via Apify and surfaces LinkedIn signals alongside Reddit signals in the same unified intent feed — extending repco's cross-platform advantage. LinkedIn signals trigger a LinkedIn-specific outreach flow (connect + note, then DM after acceptance) through the same action engine. No new platforms (V1.5+), no autopilot mode (V2), no team features (V2).

</domain>

<decisions>
## Implementation Decisions

### Apify integration model
- Vercel Cron fires every 4 hours, calls Apify API to start a public marketplace actor run, waits/polls for results, then writes signals to DB
- Use a public LinkedIn scraper actor from Apify Store (community-maintained) — no custom actor development
- Pay-per-usage via Apify platform credits (~$5-15/mo at MVP scale)
- Same cron pattern as Reddit monitoring: CRON_SECRET auth, correlation ID, job_logs entry, logger.flush()
- Adapter pattern: `linkedin-adapter.ts` parallels `reddit-adapter.ts` — wraps Apify API calls

### LinkedIn signal differences
- LinkedIn cards do NOT need to mirror Reddit card format — LinkedIn has richer data and different structure
- Author info: show full name + professional headline (e.g., "Jane Smith · VP Engineering at Acme") — LinkedIn's key differentiator is professional identity
- Monitor original posts and long-form articles only — skip reshares/reposts (less likely to represent original intent)
- LinkedIn-specific keyword matcher: separate from Reddit structural matcher to handle LinkedIn conventions (hashtags, mentions, article links)
- Same Sonnet classification pipeline for ambiguous signals (intent_type, intent_strength, reasoning, suggested_angle)

### Failure detection & staleness
- Canary query smoke test: each run includes a known-good search term (e.g., "hiring") that should always return results — zero canary results on a "successful" run = silent failure
- 2 retries with 5-minute delay on failure; after 3rd failure: log to job_logs as failed, show dashboard warning banner, fire Sentry alert
- Dashboard warning banner pattern (same as Phase 4 reply detection failure): "LinkedIn check failed — last successful: Xh ago"
- Each LinkedIn monitoring run logged to job_logs with duration, status, signal count, and Apify run ID

### Feed integration & filtering
- LinkedIn signals appear in the unified intent feed alongside Reddit, sorted by recency
- Enable the existing disabled LinkedIn filter option in filter-bar.tsx
- Platform badge: LinkedIn brand blue (#0A66C2) icon badge, matching the Reddit orange badge pattern
- "View on LinkedIn" link on each LinkedIn signal card

### LinkedIn outreach flow
- Two-step flow: connection request with personalized note first, then DM after connection accepted
- Step 1: "Contact" on a LinkedIn signal creates a prospect + generates a connection request note (Claude Sonnet 4.6, short personalized note referencing the post)
- Step 2: When connection is accepted (detected via inbox check), generate and queue a DM draft in the approval queue
- Connection request appears in approval queue for user review (same stacked card pattern as DM approval)
- Uses LinkedIn-specific GoLogin Cloud profile for execution via Haiku CU
- Daily limits apply separately for LinkedIn (connect: 20/day per BILL-06 credit cost of 20 per connect)

### Claude's Discretion
- Specific Apify marketplace actor selection (evaluate available LinkedIn scrapers)
- Apify API integration details (authentication, run management, result polling)
- LinkedIn-specific keyword matcher implementation (hashtag handling, mention parsing)
- LinkedIn signal card layout details (how to display richer data vs Reddit cards)
- Connection acceptance detection mechanism (polling interval, Haiku CU inbox navigation for LinkedIn)
- Warmup protocol adaptations for LinkedIn accounts (if different from Reddit)
- Deduplication strategy for LinkedIn posts (URL format, uniqueness)
- Freshness cutoff for LinkedIn (may differ from Reddit's 48h given 4h polling)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LinkedIn monitoring
- `PRD/repco-prd-final.md` §7.2 — Monitoring engine spec: LinkedIn via Apify, 2-4h cadence, silent failure detection
- `.planning/REQUIREMENTS.md` — MNTR-02: LinkedIn monitoring via Apify with staleness alerting

### Action engine (reused)
- `PRD/repco-prd-final.md` §7.4 — Action execution pipeline: GoLogin → Playwright CDP → Haiku CU (reused for LinkedIn outreach)
- `.planning/phases/03-action-engine/03-CONTEXT.md` — GoLogin Cloud profiles, approval queue UX, DM generation, account health states

### Monitoring pipeline (Reddit pattern to parallel)
- `src/features/monitoring/lib/reddit-adapter.ts` — Reddit adapter pattern to mirror for LinkedIn
- `src/features/monitoring/lib/ingestion-pipeline.ts` — Ingestion pipeline pattern (dedup, freshness, DB writes)
- `src/features/monitoring/lib/structural-matcher.ts` — Reddit matcher (LinkedIn gets its own)
- `src/features/monitoring/lib/sonnet-classifier.ts` — Shared Sonnet classification (reused for LinkedIn)
- `src/features/monitoring/lib/types.ts` — Monitoring types (extend for LinkedIn post shape)

### Prior phase context
- `.planning/phases/02-reddit-monitoring-intent-feed/02-CONTEXT.md` — Signal card design, dashboard layout, feed filtering, agent persona
- `.planning/phases/04-sequences-reply-detection/04-CONTEXT.md` — Reply detection failure banner pattern (reused for staleness alerts)
- `.planning/phases/05-billing-onboarding-growth/05-CONTEXT.md` — Credit economy (LinkedIn keyword cost: 6/day, connect cost: 20)

### Project-level
- `.planning/PROJECT.md` — Constraints (Anthropic only, Vercel Pro, GoLogin Cloud), key decisions
- `.planning/REQUIREMENTS.md` — MNTR-02 requirement definition

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/monitoring/lib/reddit-adapter.ts` — Adapter pattern to mirror for `linkedin-adapter.ts`
- `src/features/monitoring/lib/ingestion-pipeline.ts` — Ingestion pipeline (adapt for LinkedIn post shape)
- `src/features/monitoring/lib/sonnet-classifier.ts` — Sonnet classification pipeline (reuse directly)
- `src/features/monitoring/lib/classification-pipeline.ts` — Classification orchestration (extend for LinkedIn)
- `src/features/dashboard/components/signal-card.tsx` — Signal card component (extend for LinkedIn-specific fields)
- `src/features/dashboard/components/filter-bar.tsx` — Platform filter with disabled LinkedIn option (enable it)
- `src/features/dashboard/components/flame-indicator.tsx` — Intent strength display (reuse for LinkedIn signals)
- `src/features/dashboard/lib/use-realtime-signals.ts` — Supabase Realtime subscription (already platform-agnostic)
- `src/features/accounts/lib/types.ts` — SocialAccount type already supports `platform: "reddit" | "linkedin"`
- `src/lib/logger.ts` — Structured logging for LinkedIn cron jobs

### Established Patterns
- Feature-grouped folders: new module at `src/features/monitoring/lib/linkedin-adapter.ts` and `src/features/monitoring/lib/linkedin-matcher.ts`
- Adapter pattern: platform-specific adapter wraps external API, returns normalized post objects
- Cron route pattern: CRON_SECRET auth, correlation ID, service role client, structured logging, logger.flush()
- Per-call API client instantiation for serverless safety

### Integration Points
- `platform_type` enum already includes `'linkedin'` in DB schema
- Supabase tables: `intent_signals` (platform column), `monitoring_signals`, `social_accounts`, `job_logs`
- Supabase Realtime: existing signal subscription is platform-agnostic
- Vercel Cron: new `/api/cron/monitor-linkedin` endpoint
- Apify API: external integration for LinkedIn data collection
- App shell: no sidebar changes needed (monitoring settings page already exists)

</code_context>

<specifics>
## Specific Ideas

- LinkedIn cards should leverage LinkedIn's richer data — professional headline is the killer feature for lead qualification
- Two-step outreach (connect + note, then DM) respects LinkedIn's social norms and reduces ban risk
- Canary query smoke test is critical — Apify actors can silently return empty results without errors
- Unified feed with platform badges makes repco feel like a true cross-platform tool, not two separate products

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-linkedin*
*Context gathered: 2026-04-18*
