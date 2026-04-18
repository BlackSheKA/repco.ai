# Requirements: repco.ai

**Defined:** 2026-04-16
**Core Value:** People actively looking for your product get a personalized, relevant DM within hours

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Onboarding

- [ ] **ONBR-01**: User can describe their product in one sentence and get auto-generated keywords + subreddits
- [ ] **ONBR-02**: User can specify their target customer in one sentence
- [ ] **ONBR-03**: User can optionally name competitors (helps find "alternative to X" posts)
- [ ] **ONBR-04**: User can connect their Reddit account via GoLogin profile session
- [ ] **ONBR-05**: User can connect their LinkedIn account via GoLogin profile session
- [ ] **ONBR-06**: User sees live scanning animation with real signals appearing during onboarding
- [ ] **ONBR-07**: User is redirected to dashboard with first intent signals after onboarding completes

### Monitoring

- [ ] **MNTR-01**: System scans Reddit every 15 minutes for posts matching user's keywords and subreddits via snoowrap
- [ ] **MNTR-02**: System scans LinkedIn every 2-4 hours for posts matching user's keywords via Apify
- [x] **MNTR-03**: System applies structural matching (keyword, regex, competitor mention) to filter ~80-90% of signals at zero AI cost
- [x] **MNTR-04**: System classifies ambiguous signals (~10-20%) using Claude Sonnet with intent_type, intent_strength (1-10), reasoning, and suggested_angle
- [ ] **MNTR-05**: System deduplicates signals by post_url (UNIQUE constraint) and filters posts older than 48h
- [x] **MNTR-06**: System pushes new signals to dashboard in real-time via Supabase Realtime
- [ ] **MNTR-07**: System logs each monitoring run to job_logs with duration, status, and signal count

### Intent Feed

- [x] **FEED-01**: User can view intent signals in a scrollable feed sorted by recency
- [x] **FEED-02**: Each signal shows platform, subreddit/source, author handle, time ago, post excerpt, and intent strength (1-10) with visual bar
- [x] **FEED-03**: User can click "Contact" to initiate outreach sequence for a signal
- [x] **FEED-04**: User can click "Dismiss" to remove a signal from the feed
- [x] **FEED-05**: User can filter signals by platform (Reddit/LinkedIn) and minimum intent strength

### Agent Persona

- [x] **AGNT-01**: Dashboard displays agent card showing "repco" with current state and today's stats
- [x] **AGNT-02**: Agent has emotional states: Scanning, Found, Waiting, Sent, Reply, Cooldown, Quiet
- [x] **AGNT-03**: Terminal header (persistent, top, black bg) shows last 5 agent actions in real-time with monospace font and orange accents

### Action Engine

- [x] **ACTN-01**: System creates engage actions (like, follow) with auto-approved status when user clicks "Contact"
- [x] **ACTN-02**: System generates DM draft via Claude Sonnet 4.6 (max 3 sentences, references specific post, no link in first message)
- [x] **ACTN-03**: System runs quality control pass on generated DM (rejects spammy, generic, long, or link-containing messages)
- [x] **ACTN-04**: DM action appears in approval queue with status pending_approval
- [ ] **ACTN-05**: System executes approved actions via Supabase DB Webhook -> Vercel Function -> GoLogin Cloud -> Playwright CDP -> Claude Haiku CU
- [x] **ACTN-06**: System uses FOR UPDATE SKIP LOCKED for atomic action claiming (no duplicate execution)
- [ ] **ACTN-07**: System takes screenshot after action execution for verification
- [ ] **ACTN-08**: System limits Haiku CU to max 15 steps per action with stuck detection (3 identical screenshots = abort)
- [ ] **ACTN-09**: System enforces daily action limits per account (DM: 8, engage: 20, public reply: 5)
- [x] **ACTN-10**: Action expires after 4h if not approved (post becomes stale)

### Approval Queue

- [x] **APRV-01**: User can view pending DM drafts with original post context, intent score, and suggested angle
- [x] **APRV-02**: User can approve a DM draft with one click
- [x] **APRV-03**: User can edit a DM draft before approving
- [x] **APRV-04**: User can reject a DM draft

### Follow-up Sequences

- [ ] **FLLW-01**: System schedules follow-up 1 at day 3 (feature/benefit angle) if no reply detected
- [ ] **FLLW-02**: System schedules follow-up 2 at day 7 (value/insight angle) if no reply detected
- [ ] **FLLW-03**: System schedules follow-up 3 at day 14 (low-pressure check-in) if no reply detected
- [ ] **FLLW-04**: System stops all follow-ups immediately when any reply is detected
- [ ] **FLLW-05**: Each follow-up appears in approval queue for user review before sending

### Reply Detection

- [ ] **RPLY-01**: System checks DM inboxes every 2h via GoLogin + Playwright CDP + Haiku CU
- [ ] **RPLY-02**: System matches reply sender to prospect record and updates pipeline_status to "replied"
- [ ] **RPLY-03**: System sends email notification to user when a reply is received
- [ ] **RPLY-04**: System pushes reply event to dashboard via Supabase Realtime

### Anti-Ban System

- [x] **ABAN-01**: Each social account uses a dedicated GoLogin Cloud profile with unique fingerprint and built-in proxy
- [x] **ABAN-02**: System enforces 7-day progressive warmup: days 1-3 browse only, days 4-5 likes+follows (max 5/day), day 6-7 first public reply, day 8+ DM enabled
- [x] **ABAN-03**: System adds random delays between actions (mean 90s, std 60s, min 15s)
- [x] **ABAN-04**: System generates behavioral noise: 60% of actions are scroll, read, like on unrelated content
- [x] **ABAN-05**: System varies action timing within user's timezone active hours (configurable, default 8-22)
- [x] **ABAN-06**: System ensures no two accounts contact the same prospect (target isolation)
- [x] **ABAN-07**: System tracks account health: healthy, warning (auto-cooldown 48h), cooldown, banned (alert user)

### Prospect Pipeline

- [ ] **PRSP-01**: User can view all prospects in a kanban board with stages: detected, engaged, contacted, replied, converted, rejected
- [ ] **PRSP-02**: User can view prospect detail: platform, handle, bio, intent signal, conversation history, pipeline status
- [ ] **PRSP-03**: User can add notes and tags to prospects
- [ ] **PRSP-04**: User can export prospects as CSV
- [ ] **PRSP-05**: User can manually move prospects between pipeline stages
- [ ] **PRSP-06**: Dashboard shows total prospects count, replied count, converted count, and estimated revenue

### Account Management

- [x] **ACCT-01**: User can view health status and warmup progress for each connected social account
- [x] **ACCT-02**: User can see daily action limits and remaining capacity per account
- [x] **ACCT-03**: User can assign accounts to signal sources (which account responds to which platform)
- [x] **ACCT-04**: System automatically manages GoLogin profiles (create, open, close) without user intervention

### Dashboard

- [x] **DASH-01**: Dashboard displays persistent terminal header with last 5 agent actions in real-time
- [x] **DASH-02**: Dashboard displays multi-column layout: Agent card, Found Today (intent feed), Approval Queue, Results
- [x] **DASH-03**: Dashboard updates in real-time via Supabase Realtime for authenticated users
- [ ] **DASH-04**: Dashboard shows revenue counter (user-configured avg deal value x conversions)

### Billing

- [ ] **BILL-01**: User can sign up for 3-day free trial without credit card (500 credits included)
- [ ] **BILL-02**: User can subscribe to monthly ($49), quarterly ($35/msc), or annual ($25/msc) plan via Stripe Checkout
- [ ] **BILL-03**: User can purchase credit packs: Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399
- [ ] **BILL-04**: System deducts monitoring credits daily (Reddit keyword 3/day, LinkedIn keyword 6/day, subreddit watch 3/day)
- [ ] **BILL-05**: System deducts account credits daily (Reddit 3/day, LinkedIn 5/day per extra account beyond 2 included)
- [ ] **BILL-06**: System deducts action credits on completion: like/follow 0, public reply 15, DM 30, follow-up DM 20, LinkedIn connect 20
- [ ] **BILL-07**: System uses atomic SQL for credit deduction (no negative balance race conditions)
- [ ] **BILL-08**: Dashboard shows live credit burn, remaining balance, and per-action costs
- [ ] **BILL-09**: System shows contextual upgrade prompts when credits run low

### PLG / Growth

- [ ] **GROW-01**: /live page shows public real-time feed of anonymized intent signals (polling every 10s, no auth)
- [ ] **GROW-02**: /live page shows aggregate stats: signals last hour, signals 24h, active users, DMs sent, replies, conversion rate
- [ ] **GROW-03**: Landing page "Scan my product" hook: user enters product description, sees real Reddit results in <5s without signup
- [ ] **GROW-04**: System generates weekly shareable results card (1200x630 image) with stats
- [ ] **GROW-05**: System sends daily email digest at 8:00 user's timezone: "X people looking for [product] yesterday"
- [ ] **GROW-06**: Daily digest includes top signal details and count of DMs waiting for approval

### Notifications

- [ ] **NTFY-01**: User receives daily email digest with signal count, top signal, and pending DMs
- [ ] **NTFY-02**: User receives email notification when a prospect replies
- [ ] **NTFY-03**: User receives email alert when an account is flagged (warning/banned)

### Observability

- [x] **OBSV-01**: System logs all action executions to job_logs with duration_ms, status, and error details
- [x] **OBSV-02**: System runs zombie recovery cron every 5 minutes: actions stuck in "executing" > 10 min are reset
- [x] **OBSV-03**: System tracks error rates via Sentry with structured logging via Axiom
- [x] **OBSV-04**: System alerts (email) when action success rate < 80% or timeout rate > 5%

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Autopilot
- **AUTO-01**: User can enable autopilot mode to skip approval for DMs (after quality validation)

### Additional Platforms
- **PLAT-01**: System monitors X/Twitter for intent signals
- **PLAT-02**: System monitors Instagram for intent signals
- **PLAT-03**: System monitors TikTok for intent signals

### Team Features
- **TEAM-01**: Multiple users can access the same workspace
- **TEAM-02**: Shared approval queue with audit log

### CRM Integration
- **INTG-01**: User can push prospect data to HubSpot
- **INTG-02**: User can push prospect data to Pipedrive

### Agency
- **AGNC-01**: Agency user can manage multiple client workspaces
- **AGNC-02**: White-label branding for agency dashboards

### Advanced
- **ADVN-01**: User can A/B test DM message variants
- **ADVN-02**: User can configure Slack webhook for high-intent signals

## Out of Scope

| Feature | Reason |
|---------|--------|
| Chrome extension | Most detectable automation vector — undermines anti-ban story |
| Email sequences | Different product category; crowded market repco doesn't compete in |
| Mobile native app | Mobile-responsive web sufficient for V1; PWA if demand emerges |
| Real-time WebSocket on /live | Connection limits on public page; polling 10s is imperceptible |
| Storing social credentials | Security risk; GoLogin session cookies only |
| Multi-user accounts | Solo-user SaaS simpler; team features V2 |
| Referral program | V1.5 after proving retention; premature at launch |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OBSV-01 | Phase 1 | Complete |
| OBSV-02 | Phase 1 | Complete |
| OBSV-03 | Phase 1 | Complete |
| OBSV-04 | Phase 1 | Complete |
| MNTR-01 | Phase 2 | Pending |
| MNTR-03 | Phase 2 | Complete |
| MNTR-04 | Phase 2 | Complete |
| MNTR-05 | Phase 2 | Pending |
| MNTR-06 | Phase 2 | Complete |
| MNTR-07 | Phase 2 | Pending |
| FEED-01 | Phase 2 | Complete |
| FEED-02 | Phase 2 | Complete |
| FEED-03 | Phase 2 | Complete |
| FEED-04 | Phase 2 | Complete |
| FEED-05 | Phase 2 | Complete |
| AGNT-01 | Phase 2 | Complete |
| AGNT-02 | Phase 2 | Complete |
| AGNT-03 | Phase 2 | Complete |
| DASH-01 | Phase 2 | Complete |
| DASH-02 | Phase 2 | Complete |
| DASH-03 | Phase 2 | Complete |
| ACTN-01 | Phase 3 | Complete |
| ACTN-02 | Phase 3 | Complete |
| ACTN-03 | Phase 3 | Complete |
| ACTN-04 | Phase 3 | Complete |
| ACTN-05 | Phase 3 | Pending |
| ACTN-06 | Phase 3 | Complete |
| ACTN-07 | Phase 3 | Pending |
| ACTN-08 | Phase 3 | Pending |
| ACTN-09 | Phase 3 | Pending |
| ACTN-10 | Phase 3 | Complete |
| APRV-01 | Phase 3 | Complete |
| APRV-02 | Phase 3 | Complete |
| APRV-03 | Phase 3 | Complete |
| APRV-04 | Phase 3 | Complete |
| ABAN-01 | Phase 3 | Complete |
| ABAN-02 | Phase 3 | Complete |
| ABAN-03 | Phase 3 | Complete |
| ABAN-04 | Phase 3 | Complete |
| ABAN-05 | Phase 3 | Complete |
| ABAN-06 | Phase 3 | Complete |
| ABAN-07 | Phase 3 | Complete |
| ACCT-01 | Phase 3 | Complete |
| ACCT-02 | Phase 3 | Complete |
| ACCT-03 | Phase 3 | Complete |
| ACCT-04 | Phase 3 | Complete |
| FLLW-01 | Phase 4 | Pending |
| FLLW-02 | Phase 4 | Pending |
| FLLW-03 | Phase 4 | Pending |
| FLLW-04 | Phase 4 | Pending |
| FLLW-05 | Phase 4 | Pending |
| RPLY-01 | Phase 4 | Pending |
| RPLY-02 | Phase 4 | Pending |
| RPLY-03 | Phase 4 | Pending |
| RPLY-04 | Phase 4 | Pending |
| NTFY-01 | Phase 4 | Pending |
| NTFY-02 | Phase 4 | Pending |
| NTFY-03 | Phase 4 | Pending |
| BILL-01 | Phase 5 | Pending |
| BILL-02 | Phase 5 | Pending |
| BILL-03 | Phase 5 | Pending |
| BILL-04 | Phase 5 | Pending |
| BILL-05 | Phase 5 | Pending |
| BILL-06 | Phase 5 | Pending |
| BILL-07 | Phase 5 | Pending |
| BILL-08 | Phase 5 | Pending |
| BILL-09 | Phase 5 | Pending |
| ONBR-01 | Phase 5 | Pending |
| ONBR-02 | Phase 5 | Pending |
| ONBR-03 | Phase 5 | Pending |
| ONBR-04 | Phase 5 | Pending |
| ONBR-05 | Phase 5 | Pending |
| ONBR-06 | Phase 5 | Pending |
| ONBR-07 | Phase 5 | Pending |
| GROW-01 | Phase 5 | Pending |
| GROW-02 | Phase 5 | Pending |
| GROW-03 | Phase 5 | Pending |
| GROW-04 | Phase 5 | Pending |
| GROW-05 | Phase 5 | Pending |
| GROW-06 | Phase 5 | Pending |
| PRSP-01 | Phase 5 | Pending |
| PRSP-02 | Phase 5 | Pending |
| PRSP-03 | Phase 5 | Pending |
| PRSP-04 | Phase 5 | Pending |
| PRSP-05 | Phase 5 | Pending |
| PRSP-06 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| MNTR-02 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 98 total
- Mapped to phases: 98
- Unmapped: 0

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 — traceability populated by roadmapper*
