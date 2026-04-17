# Phase 3: Action Engine - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Approved DMs and engage actions execute end-to-end via GoLogin Cloud + Playwright CDP + Haiku Computer Use, with anti-ban protections and account health tracking in place before any outreach happens. Users can review, edit, approve, or reject DM drafts in an approval queue. Each connected social account has a dedicated GoLogin Cloud profile with progressive warmup. No follow-up sequences (Phase 4), no email notifications (Phase 4), no billing/credits (Phase 5), no onboarding wizard (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Approval queue UX
- Stacked cards layout, consistent with signal-card pattern from Phase 2
- Each card shows: original post excerpt, intent score (flame indicator), suggested angle, full DM draft text, and action buttons
- Action buttons per card: Approve, Edit (inline), Reject, Regenerate
- Inline editing: DM text becomes editable textarea directly in the card, no modal
- Regenerate button asks Claude Sonnet to write a fresh draft with a different angle
- 12-hour expiry: cards silently disappear from queue when expired (no countdown timer shown)
- Expired actions set to `expired` status; prospect record stays in pipeline (status: detected)
- Sorted by recency, newest first
- Approval queue is a section/tab on the main dashboard page (not a separate route)

### DM generation & tone
- Voice mirrors the user's voice (sample message or tone description from product_profiles — Phase 5 onboarding adds this; until then use default: casual, helpful, no hard sell)
- Context fed to Claude Sonnet 4.6 for DM generation:
  1. Original post text (title + body)
  2. Product description from product_profiles
  3. Suggested angle from Phase 2 classification (intent_type + suggested_angle)
- Max 3 sentences, no links in first message, references specific post content
- Quality control: automated rules (no second Sonnet call)
  - Reject if: >3 sentences, contains URL/link, mentions price/discount, doesn't reference original post
- On QC failure: auto-regenerate once with stricter instructions; if second attempt also fails, action is dropped silently (no card in queue)

### Account connection flow
- GoLogin profiles created via GoLogin API (API-driven creation)
- All profiles run in GoLogin Cloud — no local GoLogin desktop app required
- User logs into Reddit via GoLogin web dashboard for the specific profile
- After user confirms login, repco auto-verifies session via Playwright: opens GoLogin profile headlessly, navigates to Reddit, checks if logged in
- Verification result: green checkmark on success, or retry prompt on failure
- Each account gets a unique GoLogin Cloud fingerprint + built-in proxy (per PRD)

### Account health dashboard
- Dedicated /accounts route in sidebar nav (separate from main dashboard)
- Card per connected account showing:
  - Reddit username
  - Health badge: healthy (green), warning (orange), cooldown (yellow), banned (red)
  - Warmup progress bar: "Day X of 7" with percentage
  - Daily limits table: DMs used/limit, engage used/limit, replies used/limit
  - Last action timestamp
- Status change alerts: Sonner toast notification + red badge on Accounts nav item in sidebar
- Email alerts for warning/banned deferred to Phase 4 (Resend not set up yet)

### Warmup protocol
- 7-day progressive warmup per ABAN-02: days 1-3 browse only, days 4-5 likes+follows (max 5/day), day 6-7 first public reply, day 8+ DM enabled
- Warmup is skippable with confirmation dialog warning about ban risk (for power users with already-warm accounts)
- When skipped: account immediately moves to full capability (day 8+ state)

### Claude's Discretion
- GoLogin API integration details (profile creation params, session management)
- Playwright CDP connection strategy and adapter pattern for GoLogin compatibility drift
- Haiku CU step execution logic (navigation sequences for Reddit DM, like, follow actions)
- Stuck detection implementation (3 identical screenshots comparison)
- Screenshot storage strategy (Supabase Storage vs external)
- DB Webhook → Vercel Function trigger configuration
- FOR UPDATE SKIP LOCKED implementation for atomic action claiming
- Behavioral noise patterns (scroll, read, like on unrelated content)
- Random delay distribution (mean 90s, std 60s, min 15s)
- Action timing within timezone active hours
- Target isolation enforcement (no two accounts contact same prospect)
- Exact warmup automation sequences

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Action engine architecture
- `PRD/repco-prd-final.md` §7.4 — Action execution pipeline: DB Webhook → Vercel Function → GoLogin → Playwright CDP → Haiku CU, state machine, screenshot verification
- `PRD/repco-prd-final.md` §7.5 — Anti-ban system: warmup protocol, behavioral noise, random delays, action timing, target isolation
- `PRD/repco-prd-final.md` §8.3 — Schema: actions table, social_accounts table, action_counts table, prospects table

### DM generation
- `PRD/repco-prd-final.md` §7.4 — DM generation spec: Claude Sonnet 4.6, max 3 sentences, quality control criteria, no link in first message

### Account management
- `PRD/repco-prd-final.md` §7.6 — Account health states, warmup schedule, daily limits, GoLogin Cloud profiles

### Prior phase context
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema deployment decisions, app shell pattern, feature-grouped folders
- `.planning/phases/02-reddit-monitoring-intent-feed/02-CONTEXT.md` — Signal classification pipeline, intent feed card design, dashboard layout, agent persona
- `.planning/phases/01-foundation/01-UI-SPEC.md` — Design system tokens, typography, color palette — all Phase 3 UI must follow this contract

### Project-level
- `.planning/PROJECT.md` — Constraints (GoLogin Cloud, Anthropic only, Vercel Pro), key decisions (event-driven actions, Haiku CU over Playwright selectors)
- `.planning/REQUIREMENTS.md` — ACTN-01 through ACTN-10, APRV-01 through APRV-04, ABAN-01 through ABAN-07, ACCT-01 through ACCT-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/card.tsx` — Card component for approval queue cards and account health cards
- `src/components/ui/badge.tsx` — Badge component for health status indicators
- `src/components/ui/skeleton.tsx` — Loading skeletons for approval queue
- `src/components/ui/alert-dialog.tsx` — Confirmation dialog for warmup skip warning
- `src/components/ui/button.tsx` — Action buttons (Approve, Edit, Reject, Regenerate)
- `src/features/dashboard/components/signal-card.tsx` — Pattern reference for approval card layout
- `src/features/dashboard/components/flame-indicator.tsx` — Reuse for intent score display in approval cards
- `src/features/dashboard/lib/use-realtime-signals.ts` — Pattern for Supabase Realtime subscriptions (adapt for action status updates)
- `src/features/dashboard/components/terminal-header.tsx` — Will receive real action events from Phase 3

### Established Patterns
- Feature-grouped folders: `src/features/actions/`, `src/features/accounts/` (new modules)
- Server actions in `actions/` subdirectory for mutations
- Supabase server client for SSR, client for browser, service role for cron/API routes
- Sonner toast for notifications
- shadcn/ui components with cn() utility for conditional classes

### Integration Points
- Supabase tables: `actions`, `social_accounts`, `action_counts`, `prospects`, `intent_signals`
- Supabase Realtime: subscribe to `actions` status changes for queue updates
- Supabase DB Webhooks: trigger Vercel Function on `actions` status change to `approved`
- Vercel Cron: warmup automation runs on schedule
- App shell sidebar: add /accounts nav item
- Dashboard page: add approval queue section below intent feed
- GoLogin Cloud API: external integration for profile management
- Anthropic API: Claude Sonnet 4.6 for DM generation, Claude Haiku 4.5 for Computer Use

</code_context>

<specifics>
## Specific Ideas

- Approval cards should feel like a natural extension of signal cards — same visual language, just with DM content and action buttons added
- Inline editing keeps the user in flow — no modal interruption for quick tweaks
- Regenerate button is key UX: users shouldn't have to write DMs themselves, that's repco's job
- 12h expiry is generous enough for once-a-day queue checking without sending stale messages
- GoLogin Cloud-only means zero friction for users — no desktop app install required
- Warmup skip with warning respects power users while protecting newcomers
- Account health as a dedicated page keeps the main dashboard focused on the core loop: signals → approve → send

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-action-engine*
*Context gathered: 2026-04-17*
