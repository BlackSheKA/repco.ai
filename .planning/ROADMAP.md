# Roadmap: repco.ai

## Overview

repco.ai is built in six phases that follow the strict dependency chain from research: Foundation enables everything, Reddit Monitoring proves the core loop, the Action Engine delivers the Computer Use moat, Sequences + Reply Detection closes the outreach loop, Billing + Onboarding + Growth productizes the system, and LinkedIn extends it to the second platform. The critical path is Schema → Reddit → Action Engine. Everything else is additive.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Supabase schema + RLS + Auth, Next.js 15 shell, observability infrastructure
- [x] **Phase 2: Reddit Monitoring + Intent Feed** - snoowrap ingestion, hybrid signal classification, real-time intent feed, dashboard shell, agent persona (completed 2026-04-17)
- [ ] **Phase 3: Action Engine** - GoLogin + Playwright + Haiku CU action execution, approval queue, anti-ban system, account management
- [ ] **Phase 4: Sequences + Reply Detection** - 3-touch follow-up sequences, inbox reply detection, email notifications
- [ ] **Phase 5: Billing + Onboarding + Growth** - Stripe subscription + credit economy, 3-question onboarding, landing hook, /live page, prospect pipeline
- [ ] **Phase 6: LinkedIn** - Apify LinkedIn integration (additive after Reddit proven end-to-end)

## Phase Details

### Phase 1: Foundation
**Goal**: The project skeleton exists and is deployable — auth works, schema is live, errors are tracked, and nothing can be built wrong due to missing infrastructure
**Depends on**: Nothing (first phase)
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04
**Success Criteria** (what must be TRUE):
  1. A user can sign up, log in, and log out via Supabase Auth on the deployed Next.js 15 app
  2. The Supabase schema (signals, actions, prospects, job_logs, credits, accounts) is live with RLS policies enforced
  3. Any unhandled error in production appears in Sentry with structured context visible in Axiom
  4. A zombie recovery cron runs every 5 minutes and resets stale "executing" actions
  5. The app is deployed to Vercel Pro and accessible at its production URL
**Plans:** 6 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold: Next.js 15, shadcn/ui preset, brand theming, Supabase client utilities
- [ ] 01-02-PLAN.md — Database schema: all 11 PRD tables, ENUMs, indexes, RLS policies, auth trigger
- [ ] 01-03-PLAN.md — Auth flow + app shell: login page, middleware, sidebar, header, theme toggle
- [ ] 01-04-PLAN.md — Observability: Sentry, Axiom, structured logger, zombie recovery cron
- [ ] 01-05-PLAN.md — Gap closure: OBSV-04 threshold alerting via Sentry (action success rate + timeout rate checks)
- [ ] 01-06-PLAN.md — UAT gap closure: fix theme toggle, mobile sidebar, sign-out dialog (React 19 compatibility)

### Phase 2: Reddit Monitoring + Intent Feed
**Goal**: The system monitors Reddit every 15 minutes, classifies intent signals using structural matching + Claude Sonnet, and surfaces them in a real-time dashboard with agent persona
**Depends on**: Phase 1
**Requirements**: MNTR-01, MNTR-03, MNTR-04, MNTR-05, MNTR-06, MNTR-07, FEED-01, FEED-02, FEED-03, FEED-04, FEED-05, AGNT-01, AGNT-02, AGNT-03, DASH-01, DASH-02, DASH-03
**Success Criteria** (what must be TRUE):
  1. Reddit is scanned every 15 minutes and new signals appear in the database with deduplication enforced
  2. Posts matching keywords by structural rules are classified without AI cost; only ambiguous ~10-20% hit Claude Sonnet
  3. Each signal in the feed shows platform, subreddit, author, time ago, post excerpt, and intent strength bar (1-10)
  4. User can filter signals by minimum intent strength and dismiss or initiate contact on any signal
  5. The terminal header shows the last 5 agent actions in real-time, and the agent card shows repco's current emotional state
  6. Dashboard updates in real-time via Supabase Realtime without page refresh
**Plans**: TBD

Plans:
- [ ] 02-01: snoowrap adapter, keyword/subreddit config storage, 15-minute Vercel Cron ingestion
- [ ] 02-02: Structural signal processor + Claude Sonnet classification pipeline + deduplication
- [ ] 02-03: Intent feed UI, signal cards, filter controls, Supabase Realtime subscription
- [ ] 02-04: Agent persona card, terminal header, emotional state machine, dashboard shell layout

### Phase 3: Action Engine
**Goal**: Approved DMs and engage actions execute end-to-end via GoLogin + Playwright CDP + Haiku Computer Use, with anti-ban protections and account health tracking in place before any outreach happens
**Depends on**: Phase 2
**Requirements**: ACTN-01, ACTN-02, ACTN-03, ACTN-04, ACTN-05, ACTN-06, ACTN-07, ACTN-08, ACTN-09, ACTN-10, APRV-01, APRV-02, APRV-03, APRV-04, ABAN-01, ABAN-02, ABAN-03, ABAN-04, ABAN-05, ABAN-06, ABAN-07, ACCT-01, ACCT-02, ACCT-03, ACCT-04
**Success Criteria** (what must be TRUE):
  1. User can view a pending DM draft in the approval queue with original post context, intent score, and suggested angle — and approve, edit, or reject it with one click
  2. An approved DM action executes via DB Webhook → Vercel Function → GoLogin Cloud → Playwright CDP → Haiku CU and a screenshot is stored as verification
  3. Like and follow actions auto-execute without approval, subject to daily limits (DM: 8, engage: 20, public reply: 5 per account)
  4. No account can contact a prospect already contacted by another account (target isolation enforced)
  5. Each connected social account has a dedicated GoLogin Cloud profile and completes the 7-day progressive warmup before DMs are enabled
  6. User can view warmup progress, health status (healthy/warning/cooldown/banned), and remaining daily capacity for each account
**Plans:** 6 plans

Plans:
- [ ] 03-01-PLAN.md — DB migration (expired enum, claim RPC, limit RPC, target isolation), GoLogin REST client + CDP adapter, shared types
- [ ] 03-02-PLAN.md — DM generation (Claude Sonnet 4.6, 3-sentence limit, QC rules) with TDD
- [ ] 03-03-PLAN.md — Haiku CU executor (15-step cap, stuck detection), action worker pipeline, webhook handler, daily limits, expiry cron
- [ ] 03-04-PLAN.md — Anti-ban system: random delays, behavioral noise, timezone timing, target isolation, health state machine, warmup cron
- [ ] 03-05-PLAN.md — Approval queue UI (stacked cards, inline edit, approve/reject/regenerate), Realtime updates, contact-to-action flow
- [ ] 03-06-PLAN.md — Account management page (/accounts), health badges, warmup progress, daily limits, connection flow, sidebar update

### Phase 4: Sequences + Reply Detection
**Goal**: Prospects who don't reply receive structured follow-ups at day 3, 7, and 14; replies are detected automatically and stop all follow-ups; users are notified by email for replies, account alerts, and daily digests
**Depends on**: Phase 3
**Requirements**: FLLW-01, FLLW-02, FLLW-03, FLLW-04, FLLW-05, RPLY-01, RPLY-02, RPLY-03, RPLY-04, NTFY-01, NTFY-02, NTFY-03
**Success Criteria** (what must be TRUE):
  1. After a DM is sent, follow-ups at day 3, 7, and 14 appear in the approval queue automatically (if no reply detected)
  2. When a prospect replies, all pending follow-ups are cancelled immediately and the prospect's pipeline status updates to "replied"
  3. The DM inbox is checked every 2 hours via GoLogin + Playwright + Haiku CU and new replies are matched to prospect records
  4. User receives an email notification within 10 minutes of a reply being detected
  5. User receives a daily email digest at 8:00 local time with signal count, top signal, and count of DMs pending approval
  6. User receives an email alert when any connected account is flagged as warning or banned
**Plans**: TBD

Plans:
- [ ] 04-01: Follow-up scheduler (day 3/7/14 cron), sequence state machine, stop-on-reply logic
- [ ] 04-02: Reply detection worker (2h cron, GoLogin + Playwright + Haiku CU inbox check, prospect matching)
- [ ] 04-03: Email notifications via Resend: reply received, account alert, daily digest

### Phase 5: Billing + Onboarding + Growth
**Goal**: A new user can sign up, complete 3-question onboarding, connect accounts, see live intent signals, manage their prospect pipeline, pay via Stripe, and share repco's results — making the product sellable and self-promoting
**Depends on**: Phase 4
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, BILL-09, ONBR-01, ONBR-02, ONBR-03, ONBR-04, ONBR-05, ONBR-06, ONBR-07, GROW-01, GROW-02, GROW-03, GROW-04, GROW-05, GROW-06, PRSP-01, PRSP-02, PRSP-03, PRSP-04, PRSP-05, PRSP-06, DASH-04
**Success Criteria** (what must be TRUE):
  1. User can answer 3 questions (product, customer, competitors) and get auto-generated keywords + subreddits, then watch live signals appear during onboarding before landing on the dashboard
  2. User can start a 3-day free trial (500 credits, no card), subscribe to a plan, or buy a credit pack via Stripe Checkout
  3. Dashboard shows live credit burn rate, remaining balance, per-action costs, and contextual upgrade prompts when credits run low
  4. User can view all prospects in a kanban pipeline, add notes/tags, export CSV, and see estimated revenue from conversions
  5. The /live page shows a public real-time feed of anonymized signals with aggregate stats — no login required
  6. The "Scan my product" landing hook returns real Reddit results in under 5 seconds without requiring signup
  7. User can share a weekly results card (1200x630 image) with their stats
**Plans**: TBD

Plans:
- [ ] 05-01: 3-question onboarding flow, keyword/subreddit auto-generation, account connection (GoLogin profiles), live scanning animation
- [ ] 05-02: Stripe billing: subscription plans, credit packs, 3-day free trial, webhook handlers
- [ ] 05-03: Credit economy: 3-layer deduction (monitoring, account, action), atomic SQL, balance display, upgrade prompts
- [ ] 05-04: Prospect pipeline kanban, detail view, notes/tags, CSV export, revenue counter
- [ ] 05-05: /live page (polling 10s), "Scan my product" hook, weekly results card generation

### Phase 6: LinkedIn
**Goal**: The system monitors LinkedIn every 2-4 hours via Apify and surfaces LinkedIn signals alongside Reddit signals in the same intent feed — extending repco's cross-platform advantage
**Depends on**: Phase 5
**Requirements**: MNTR-02
**Success Criteria** (what must be TRUE):
  1. LinkedIn posts matching user's keywords appear in the intent feed with correct platform badge and Apify source attribution
  2. LinkedIn monitoring runs every 2-4 hours and logs run status (including Apify silent failure detection via smoke test)
  3. LinkedIn signals trigger the same action engine flow — DM drafts appear in the approval queue and execute via GoLogin + Haiku CU
**Plans**: TBD

Plans:
- [ ] 06-01: Apify actor integration, LinkedIn signal ingestion, staleness alerting, feed integration

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/6 | Gap closure | - |
| 2. Reddit Monitoring + Intent Feed | 4/4 | Complete   | 2026-04-17 |
| 3. Action Engine | 0/6 | Not started | - |
| 4. Sequences + Reply Detection | 0/3 | Not started | - |
| 5. Billing + Onboarding + Growth | 0/5 | Not started | - |
| 6. LinkedIn | 0/1 | Not started | - |
