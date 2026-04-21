# Phase 5: Billing + Onboarding + Growth - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A new user can sign up, complete 3-question onboarding, connect accounts, see live intent signals, manage their prospect pipeline, pay via Stripe, and share repco's results — making the product sellable and self-promoting. No LinkedIn monitoring (Phase 6), no autopilot mode (V2), no team features (V2), no CRM integrations (V2).

</domain>

<decisions>
## Implementation Decisions

### Onboarding flow & first-run experience
- 3-question onboarding: product description, target customer, competitors (optional skip on competitors)
- One question per screen — clean, focused, minimal
- Account connection (GoLogin) happens AFTER onboarding, on the dashboard — not during the onboarding wizard
- After 3 questions: simulated scanning animation (typing animation "Scanning r/SaaS..." for 3-5s), then reveal real Reddit results all at once
- Zero results handling: encouraging message + suggested broader keywords ("No signals yet — repco will start scanning every 15 min. Here are broader keywords that might help."). Land on dashboard with empty feed
- After onboarding lands on dashboard: persistent checklist card showing setup progress (e.g., Product described, Keywords generated, Connect Reddit account, First DM approved). Dismissible after all items complete. Similar to Linear's onboarding checklist
- Claude auto-generates keywords + subreddits from product description — user can edit later in Settings
- Dashboard shows "Connect your Reddit account" as a checklist item, linking to /accounts

### Stripe billing & credit display
- Stripe Checkout (hosted page) for all payment flows — subscriptions and credit packs. Zero PCI scope
- Custom /billing management page for subscription management (cancel, change billing period, update payment method, view invoices) — NOT Stripe Customer Portal
- Credit balance displayed in TWO locations:
  1. Sidebar footer (always visible on every page): compact "342 credits · -34/day", turns orange at <100, red at <50. Clicking opens /billing
  2. Dashboard credit card: detailed breakdown showing balance, daily burn by layer (monitoring, accounts, actions), projected days remaining
- Full credit history and billing details on /billing page
- Upgrade prompts: BOTH banner + contextual
  - At <100 credits: sidebar balance turns orange
  - At <50 credits: warning banner on dashboard "Credits running low — buy a pack or upgrade"
  - Contextual prompts at point of action: e.g., when approving a DM costing 30 credits with <50 remaining, show inline "This DM costs 30 credits. 42 remaining. [Buy credits]"
- Trial: 3-day free, no credit card, 500 credits, full product access
- Pricing: single plan with 3 billing periods (monthly $49, quarterly $35/mo, annual $25/mo) per PRD
- Credit packs: Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399

### Prospect pipeline kanban
- Dedicated /prospects route in sidebar nav (separate from dashboard)
- Dashboard shows summary stats only: total prospects, replied, converted, estimated revenue (PRSP-06/DASH-04)
- Kanban columns: detected, engaged, contacted, replied, converted, rejected (per PRSP-01)
- Drag-and-drop between columns supported + "Move to..." dropdown on each card for keyboard/mobile users
- Prospect detail view: full page at /prospects/[id] (not a drawer), with back button to kanban
- Detail page shows: platform, handle, bio, intent signal, conversation history (DMs + follow-ups), pipeline status, notes, tags
- Notes and tags: inline editable on detail page
- CSV export: button on kanban page, exports all prospects (or filtered view)
- Revenue counter: manual avg deal value input in Settings. Revenue = conversions × avg deal value. Shown on dashboard summary card

### /live page & "Scan my product" hook
- /live page: public, no auth required, polling every 10s (per PRD decision — no WebSocket)
- Full anonymization: hide author handles, subreddit names, and post excerpts. Show only: platform badge, intent strength, time ago, and generic category description ("someone looking for a CRM alternative")
- Aggregate stats on /live: signals last hour, signals 24h, active users, DMs sent, replies, conversion rate (GROW-02)
- CTA: simple signup button in the /live page header only — clean, non-intrusive, trust the content
- "Scan my product" landing hook: two inputs — product description (required) + competitor name (optional). Scan button hits Reddit API, returns real results in <5s
- Scan results: show signal cards similar to intent feed but simplified (no auth actions). CTA: "Sign up to contact them"
- Weekly results card: auto-generated 1200x630 PNG with stats (posts scanned, signals, DMs sent, replies, reply rate, conversions)
- Results card sharing: download image + "Share to X" and "Share to LinkedIn" buttons that pre-fill a post with the image and link to repco.ai

### Claude's Discretion
- Onboarding screen visual design and transitions
- Simulated scanning animation implementation details
- Keyword/subreddit auto-generation prompt and Claude model choice
- Checklist card visual design and completion tracking
- /billing page layout and invoice display
- Credit deduction atomic SQL implementation
- Kanban drag-and-drop library choice
- Prospect detail page layout
- CSV export format and column selection
- /live page layout and polling implementation
- "Scan my product" API endpoint design and rate limiting
- Results card image generation approach (canvas, SVG, or service)
- Share button integration with X and LinkedIn APIs
- Stripe webhook handler implementation
- Trial expiry handling and grace period

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Onboarding
- `PRD/repco-prd-final.md` §7.1 — Onboarding flow: 3 questions, one-question-per-screen, auto-generated keywords/subreddits, live scan animation
- `.planning/REQUIREMENTS.md` — ONBR-01 through ONBR-07: onboarding requirements and acceptance criteria

### Billing & credits
- `PRD/repco-prd-final.md` §10 — Pricing & billing: single plan with 3 billing periods, credit economy (3 layers), credit packs, Stripe integration, unit economics
- `.planning/REQUIREMENTS.md` — BILL-01 through BILL-09: billing requirements including trial, subscriptions, credit packs, atomic deduction, balance display, upgrade prompts

### Prospect pipeline
- `PRD/repco-prd-final.md` §8.3 — Schema: prospects table (pipeline_status enum, handle, tags, notes)
- `.planning/REQUIREMENTS.md` — PRSP-01 through PRSP-06: kanban board, detail view, notes/tags, CSV export, manual stage moves, stats display
- `.planning/REQUIREMENTS.md` — DASH-04: revenue counter on dashboard

### PLG & growth
- `PRD/repco-plg-design.md` — PLG strategy: "Scan my product" hook, weekly results card, /live page, shareability mechanics
- `.planning/REQUIREMENTS.md` — GROW-01 through GROW-06: /live page, aggregate stats, scan hook, results card, daily digest, digest content

### Prior phase context
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema deployment, app shell pattern, auth flow, brand identity
- `.planning/phases/02-reddit-monitoring-intent-feed/02-CONTEXT.md` — Signal card design, dashboard layout, terminal header, agent persona, monitoring settings page
- `.planning/phases/03-action-engine/03-CONTEXT.md` — Approval queue UX (stacked cards, inline editing), GoLogin Cloud account connection, account health dashboard at /accounts
- `.planning/phases/04-sequences-reply-detection/04-CONTEXT.md` — Resend email setup, branded HTML templates, settings page for auto-send toggle

### Project-level
- `.planning/PROJECT.md` — Constraints (Vercel Pro, Anthropic only, GoLogin Cloud), key decisions (credit economy over DM tiers, polling for /live)
- `.planning/REQUIREMENTS.md` — Full requirement definitions with acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/card.tsx` — Card component for onboarding checklist, credit display, prospect cards, /live feed cards
- `src/components/ui/badge.tsx` — Badge for pipeline stages, intent strength indicators
- `src/components/ui/button.tsx` — CTA buttons, action buttons on prospect cards
- `src/components/ui/input.tsx`, `src/components/ui/label.tsx` — Form inputs for onboarding questions, settings fields
- `src/components/ui/select.tsx` — Dropdown for "Move to..." stage selection on prospect cards
- `src/components/ui/skeleton.tsx` — Loading states for pipeline, billing page
- `src/components/ui/sheet.tsx` — Available if drawer pattern needed elsewhere
- `src/components/ui/sidebar.tsx` — Sidebar component for adding nav items (Prospects, Billing) and credit balance footer
- `src/components/ui/alert-dialog.tsx` — Confirmation dialogs (subscription cancellation, etc.)
- `src/components/ui/switch.tsx` — Toggle for settings (auto-send from Phase 4, deal value config)
- `src/components/ui/tooltip.tsx` — Hover tooltips for credit breakdown, action costs
- `src/features/dashboard/components/signal-card.tsx` — Pattern reference for /live page signal cards and scan results
- `src/features/dashboard/components/flame-indicator.tsx` — Reuse for intent strength on prospect cards and /live feed
- `src/features/dashboard/lib/use-realtime-signals.ts` — Supabase Realtime pattern (adapt for prospect status changes)
- `src/features/monitoring/` — Settings page pattern for keyword/subreddit management (extend for deal value, billing prefs)
- `src/lib/logger.ts` — Structured logging for Stripe webhook handlers and scan API endpoint
- `src/hooks/use-mobile.ts` — Mobile detection for responsive kanban/billing layouts

### Established Patterns
- Feature-grouped folders: new modules at `src/features/onboarding/`, `src/features/billing/`, `src/features/prospects/`, `src/features/growth/`
- Server actions in `actions/` subdirectory for mutations
- Supabase server client for SSR, client for browser, service role for API routes/webhooks
- Sonner toast for notifications
- shadcn/ui components with cn() utility for conditional classes
- Vercel Cron with CRON_SECRET auth pattern (for daily credit deduction, digest emails)

### Integration Points
- Supabase tables: `users` (stripe_customer_id, billing_period, subscription_active), `credit_transactions`, `product_profiles`, `prospects`, `intent_signals`, `live_stats`
- Supabase Realtime: subscribe to prospect status changes for kanban updates
- Stripe API: Checkout Sessions, Customer Portal (for fallback), Webhooks (checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed)
- App shell sidebar: add Prospects, Billing nav items + credit balance footer
- Dashboard page: add credit summary card, prospect stats card, onboarding checklist
- Anthropic API: Claude for keyword/subreddit generation from product description, and for "Scan my product" intent classification
- Resend (from Phase 4): weekly results card email, daily digest with stats

</code_context>

<specifics>
## Specific Ideas

- Onboarding should feel instant — 3 questions, simulated scan, dashboard. Under 30 seconds total
- Checklist card on dashboard keeps new users oriented without a heavy-handed guided tour
- Credit balance in sidebar footer = constant ambient awareness of spend, like a bank balance
- Contextual upgrade prompts at the point of action (approving a DM) are the highest-converting nudge
- /live page with full anonymization protects user privacy while still showing repco works
- "Scan my product" with optional competitor field catches the highest-intent signals ("alternative to X" posts)
- Results card sharing with pre-filled posts to X/LinkedIn turns every user into a distribution channel
- Custom /billing page over Stripe Portal gives full control over the billing UX and keeps users in-app

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-billing-onboarding-growth*
*Context gathered: 2026-04-18*
