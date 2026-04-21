# Phase 2: Reddit Monitoring + Intent Feed - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The system monitors Reddit every 15 minutes, classifies intent signals using keyword matching + Claude Sonnet for ambiguous cases, and surfaces them in a real-time dashboard with an agent persona card and terminal activity header. Users can view, filter, dismiss, and initiate contact on signals. No action execution (Phase 3), no follow-ups (Phase 4), no onboarding auto-generation (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Signal classification pipeline
- Keywords can be single words or multi-word phrases — structural matcher handles both
- Keyword matching is exact match only (no regex patterns) — Sonnet handles nuanced/pattern-based intent
- Match keywords against both post title and body text
- All signals get an intent_strength score (1-10): rule-based heuristic for structural matches, Sonnet-generated for ambiguous ones
- Sonnet classification returns full output: intent_type (buying/comparing/complaining/asking), intent_strength (1-10), reasoning (1 sentence), suggested_angle
- Sonnet only classifies ambiguous matches (~10-20% of search results per PRD) — NOT all subreddit posts
- Batch classification: send 10-20 posts per Sonnet call for cost efficiency
- On Sonnet API failure: queue and retry — show signal immediately with "Classifying..." state, update when Sonnet responds

### Intent feed card design
- Intent strength displayed as flame/heat icon scale (cold/warm/hot tiers) — not numeric bars or badges
- Each card shows: platform badge, subreddit, author handle, time ago, 2-3 line post excerpt (~150 chars), flame heat indicator
- "View on Reddit" link on each card
- "Contact" button creates a prospect record (status: detected) with a toast "Prospect saved — outreach available in Phase 3"
- "Dismiss" is soft: sets dismissed_at timestamp, hides from feed, recoverable via filter
- Feed sorted by recency, filterable by platform (Reddit/LinkedIn placeholder) and minimum intent strength

### Dashboard layout
- Standard SaaS layout: sidebar nav (from Phase 1 shell) + main content area — NOT multi-column
- Terminal header: persistent strip at top of main content area, below the app header — shows last 5 agent actions
- Terminal header styling uses design system tokens from shadcn preset (dark surface, Geist Mono, accent indigo) — NOT arbitrary "black background"
- Agent card: dedicated card above the intent feed in the main content area, shows repco's current state + today's stats
- Below agent card: filter bar, then scrollable intent feed

### Agent persona
- 7 emotional states per PRD: Scanning, Found, Waiting, Sent, Reply, Cooldown, Quiet
- Tone: "chill colleague" — relaxed, conversational, not robotic or over-the-top enthusiastic
- Example messages: "Scanning r/SaaS..." / "Found a good one — someone's asking about CRM alternatives." / "Quiet day. Keeping an eye out."
- Agent card shows: repco name, current state, mood message, today's stats (signals found, actions pending)

### Monitoring config & ingestion
- Settings page with manual keyword and subreddit input (add/remove, instant save) — no auto-generation yet (Phase 5)
- Single Vercel Cron fires every 15 min, processes all users' configs sequentially
- snoowrap search API per keyword across specified subreddits — Reddit does the filtering
- Fixed 48h freshness cutoff for all users (not configurable)
- Deduplication by post_url (UNIQUE constraint in DB)
- Each monitoring run logged to job_logs with duration, status, signal count
- New signals pushed to dashboard via Supabase Realtime

### Claude's Discretion
- Rule-based scoring heuristics for structural matches (how to assign 1-10 based on match quality)
- Exact flame icon breakpoints (which scores map to cold/warm/hot)
- Terminal header update animation/transition
- Agent card visual design details (avatar, layout, spacing)
- Settings page layout and validation
- snoowrap query pagination and rate limiting strategy
- Retry queue implementation for failed Sonnet classifications

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Monitoring & classification
- `PRD/repco-prd-final.md` §7.2 — Monitoring engine spec: snoowrap usage, structural matching rules, Sonnet classification fields, 48h cutoff, deduplication
- `PRD/repco-prd-final.md` §8.3 — Schema: monitoring_signals table, intent_signals table, job_logs table, product_profiles table

### Agent persona & dashboard
- `PRD/repco-prd-final.md` §7.3 — Agent persona states, emotional state machine, state transitions
- `PRD/repco-prd-final.md` §7.7 — Dashboard layout philosophy, terminal header concept, column descriptions

### Design system
- `.planning/phases/01-foundation/01-UI-SPEC.md` — Typography, color tokens, spacing scale, shadcn preset — ALL Phase 2 UI must follow this contract
- `.planning/phases/01-foundation/01-CONTEXT.md` — Phase 1 decisions: auth method, project structure, brand identity

### Project-level
- `.planning/PROJECT.md` — Constraints (tech stack, runtime, hosting), key decisions
- `.planning/REQUIREMENTS.md` — MNTR-01, MNTR-03 through MNTR-07, FEED-01 through FEED-05, AGNT-01 through AGNT-03, DASH-01 through DASH-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — Phase 1 not built. Phase 2 will be the first feature code on top of the foundation.

### Established Patterns
- Feature-grouped folders: `src/features/monitoring/`, `src/features/dashboard/` (established in Phase 1 CONTEXT)
- shadcn/ui components via preset `b3QwALGmg` (Phase 1)
- Supabase client pattern (Phase 1)
- pnpm as package manager (Phase 1)

### Integration Points
- Supabase tables: monitoring_signals, intent_signals, product_profiles, job_logs (Phase 1 schema)
- Supabase Realtime: subscribe to intent_signals inserts for live dashboard updates
- Vercel Cron: `/api/cron/monitor-reddit` endpoint
- App shell: sidebar nav + header chrome from Phase 1 — Phase 2 adds terminal header strip and main content

</code_context>

<specifics>
## Specific Ideas

- Terminal header should feel like a live activity log — Geist Mono font, design system dark surface color, accent indigo highlights on key events
- Agent personality is "chill colleague" not "excited bot" — conversational but not cringey
- Flame icons for intent strength give the product personality — "hot leads" metaphor baked into the UI
- The simplest effective approach wins: search API + keyword matching + Sonnet only for ambiguous cases

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-reddit-monitoring-intent-feed*
*Context gathered: 2026-04-17*
