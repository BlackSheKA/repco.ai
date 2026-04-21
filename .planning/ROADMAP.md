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
- [x] **Phase 5: Billing + Onboarding + Growth** - Stripe subscription + credit economy, 3-question onboarding, landing hook, /live page, prospect pipeline
- [x] **Phase 6: LinkedIn** - Apify LinkedIn integration (additive after Reddit proven end-to-end)
- [x] **Phase 7: Reply Detection Fix** (GAP CLOSURE) - Handle normalization bug unblocking RPLY-02/03/04 + FLLW-04 cascade
- [ ] **Phase 8: Public Stats + Duplicate Digest Cleanup** (GAP CLOSURE) - live_stats write path (GROW-01), remove duplicate daily digest cron
- [ ] **Phase 9: Cross-Platform Approval + Action Audit Trail** (GAP CLOSURE) - Platform-aware approval card + worker.ts job_logs column fix
- [ ] **Phase 10: LinkedIn Outreach Execution** (GAP CLOSURE) - ONBR-05 GoLogin LinkedIn connection + connection_request executor arm
- [ ] **Phase 11: Nyquist Validation Compliance** (GAP CLOSURE) - Complete 6 VALIDATION.md files + retroactive Phase 6 VERIFICATION.md
- [ ] **Phase 12: Trial Auto-Activation + Expiry Reconciliation** (GAP CLOSURE) - BILL-01 auto-trial + ACTN-10 expiry spec reconciliation

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
**Plans:** 10 plans (6 original + 4 gap closure)

Plans:
- [ ] 03-01-PLAN.md — DB migration (expired enum, claim RPC, limit RPC, target isolation), GoLogin REST client + CDP adapter, shared types
- [ ] 03-02-PLAN.md — DM generation (Claude Sonnet 4.6, 3-sentence limit, QC rules) with TDD
- [ ] 03-03-PLAN.md — Haiku CU executor (15-step cap, stuck detection), action worker pipeline, webhook handler, daily limits, expiry cron
- [ ] 03-04-PLAN.md — Anti-ban system: random delays, behavioral noise, timezone timing, target isolation, health state machine, warmup cron
- [ ] 03-05-PLAN.md — Approval queue UI (stacked cards, inline edit, approve/reject/regenerate), Realtime updates, contact-to-action flow
- [ ] 03-06-PLAN.md — Account management page (/accounts), health badges, warmup progress, daily limits, connection flow, sidebar update
- [ ] 03-07-PLAN.md — Gap closure (BLOCKER): apply migration 00006 to project cmkifdwjunojgigrqwnr via Supabase Management API
- [ ] 03-08-PLAN.md — Gap closure (MAJOR): sidebar account-alert notification dot — wire hasAccountAlerts in (app)/layout.tsx + AppShell
- [ ] 03-09-PLAN.md — Gap closure (MAJOR): DM expiry 4h → 12h in create-actions.ts + expiry.ts
- [ ] 03-10-PLAN.md — Gap closure (MINOR): Save button in ApprovalCard + saveEdits server action

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
**Plans:** 2/5 plans executed

Plans:
- [x] 04-01-PLAN.md — DB migration (cancelled enum, sequence columns, user timezone), shared types, follow-up scheduling logic + stop-on-reply with TDD
- [x] 04-02-PLAN.md — Resend + React Email setup, 3 branded email templates (reply alert, daily digest, account warning), send functions with TDD
- [ ] 04-03-PLAN.md — Follow-up scheduler cron (4h cadence, DM generation), daily digest cron (timezone-aware), auto-send toggle on settings page
- [ ] 04-04-PLAN.md — Reply detection cron (2h, GoLogin + Haiku CU inbox check), reply matching, consecutive failure tracking
- [ ] 04-05-PLAN.md — Dashboard UI: Replies section, reply cards, sequence timeline, inbox warning banner, terminal header events

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
**Plans:** 7 plans

Plans:
- [x] 05-01-PLAN.md — DB migration (deduct_credits/add_credits RPC, onboarding + billing columns), billing types + credit cost/burn logic (TDD), prospect pipeline types + stage transitions (TDD)
- [x] 05-02-PLAN.md — 3-question onboarding wizard, Claude keyword generation, scanning animation, dashboard checklist card, middleware onboarding gate
- [x] 05-03-PLAN.md — Stripe billing: checkout actions, webhook handler, /billing page with plans, credit packs, history, subscription management
- [x] 05-04-PLAN.md — Credit economy runtime: daily burn cron, sidebar credit balance widget, dashboard credit card, upgrade prompts (banner + contextual)
- [x] 05-05-PLAN.md — Prospect pipeline: kanban board (@dnd-kit/react), prospect detail page, notes/tags, CSV export, dashboard stats + revenue counter
- [x] 05-06-PLAN.md — /live public page (10s polling, anonymized feed, aggregate stats), "Scan my product" API + form with rate limiting
- [x] 05-07-PLAN.md — Weekly results card (next/og 1200x630 PNG), share buttons (X/LinkedIn), daily email digest cron

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
- [x] 06-01: Apify actor integration, LinkedIn signal ingestion, staleness alerting, feed integration

### Phase 7: Reply Detection Fix
**Goal**: Reply detection actually matches inbox senders to prospect records so RPLY-02/03/04 fire end-to-end and FLLW-04 stops pending follow-ups on reply
**Depends on**: Phase 4
**Requirements**: RPLY-02, RPLY-03, RPLY-04
**Gap Closure**: Closes audit gap — handle normalization mismatch (`u/username` stored vs `username` normalized during matching) causes `matchReplyToProspect` to always return null, cascading to RPLY-03 email alerts, RPLY-04 Realtime push, and FLLW-04 follow-up cancellation
**Success Criteria** (what must be TRUE):
  1. Inbox sender handles are compared against `prospects.handle` in the same normalized form (either both prefixed with `u/` or both stripped) and matches succeed
  2. When a reply is matched, `prospect.pipeline_status` transitions to `replied` and all pending follow-up actions cancel
  3. Reply alert email (RPLY-03) dispatches within 10 minutes of reply detection
  4. Realtime reply push (RPLY-04) fires on the `use-realtime-replies` subscription
  5. Reply-matching unit tests use production-shaped handle fixtures (`u/` prefix) so the bug cannot regress silently
**Plans:** 1 plan

Plans:
- [x] 07-01: normalizeHandle util + symmetric matchReplyToProspect + cron cascade integration test (RPLY-02/03/04 + FLLW-04 unblocked)

### Phase 8: Public Stats + Duplicate Digest Cleanup
**Goal**: `/live` aggregate stats show real numbers (not zeros) and users receive exactly one daily digest email per day
**Depends on**: Phase 5
**Requirements**: GROW-01, GROW-02, NTFY-01, GROW-05
**Gap Closure**: Closes audit gaps — `live_stats` table has no write path so all 6 aggregate metrics display 0; both `/api/cron/daily-digest` (Phase 4) and `/api/cron/digest` (Phase 5) run hourly and send duplicate emails
**Success Criteria** (what must be TRUE):
  1. `live_stats` row(s) are written by a cron, trigger, or signal/action event handler on a defined cadence
  2. All 6 aggregate stats on `/live` (signals last hour, 24h, active users, DMs sent, replies, conversion rate) display non-zero when underlying activity exists
  3. Only `/api/cron/digest` remains registered in `vercel.json`; `/api/cron/daily-digest` is removed (or consolidated)
  4. Users with local hour=8 receive exactly one daily digest email per day
**Plans:** 2/4 plans executed

Plans:
- [ ] 08-01-PLAN.md — Migration 00012 (live_stats seed row) + phase-08-validate.mjs script
- [ ] 08-02-PLAN.md — refresh-live-stats cron route (6 aggregates, UPSERT, job_logs) + vercel.json registration
- [ ] 08-03-PLAN.md — Consolidate digests: port sendDailyDigest + replyCount + top-3 signals into digest/route.ts; delete daily-digest; update vercel.json
- [ ] 08-04-PLAN.md — Idempotency guard: migration 00013 (last_digest_sent_at), per-user guard in digest/route.ts, finalize VALIDATION.md

### Phase 9: Cross-Platform Approval + Action Audit Trail
**Goal**: Approval queue renders correct platform badge for LinkedIn actions and action worker audit trail is written to `job_logs` correctly
**Depends on**: Phase 6
**Requirements**: APRV-01, OBSV-01
**Gap Closure**: Closes audit gaps — `approval-card.tsx` hardcodes Reddit badge + `r/{subreddit}` for all platforms (LinkedIn shows `r/null`); `worker.ts` inserts non-existent `details`/`correlation_id` columns into `job_logs` and PostgREST silently drops them
**Success Criteria** (what must be TRUE):
  1. Approval card renders the correct platform badge (Reddit vs LinkedIn) and source label based on `action.platform` — no `r/null` regressions
  2. `worker.ts` writes to `job_logs` using schema-valid column names only; every action execution produces a `job_logs` row with duration, status, and correlation context
  3. Integration test or manual verification confirms action executions appear in `job_logs` queries
**Plans**: TBD

### Phase 10: LinkedIn Outreach Execution
**Goal**: A user can connect their LinkedIn account via GoLogin and approved `connection_request` actions execute end-to-end through the action worker
**Depends on**: Phase 6, Phase 9
**Requirements**: ONBR-05, MNTR-02, ACTN-01, ACTN-05
**Gap Closure**: Closes audit gap ONBR-05 (never built) + integration gap `connection_request — executor arm missing` (warmup gate blocks + no executor case arm) + resolves `TODO-phase6-connection-request.md` + Phase 6 tech debt (ActionType TS union, SQL credit cost)
**Success Criteria** (what must be TRUE):
  1. User can connect a LinkedIn account through the `/accounts` connection flow (GoLogin profile provisioned, session cookies captured, account reaches `healthy` state after warmup)
  2. `worker.ts` executor has a `connection_request` arm that runs via GoLogin + Playwright + Haiku CU and stores verification screenshot
  3. Warmup gate `allowedActions` includes `connection_request` on the appropriate warmup day
  4. `ActionType` TypeScript union includes `connection_request` (compile-time safety)
  5. `get_action_credit_cost` SQL returns the documented credit cost for `connection_request`
  6. End-to-end: approved LinkedIn `connection_request` action transitions from `pending_approval` → `sent` with `job_logs` audit trail
**Plans**: TBD

### Phase 11: Nyquist Validation Compliance
**Goal**: All 6 milestone phases have production-ready VALIDATION.md (`status: final`, `nyquist_compliant: true`) and Phase 6 has a retroactive VERIFICATION.md
**Depends on**: Phases 1–6 complete
**Requirements**: none directly (process/test coverage)
**Gap Closure**: Closes tech debt — all 6 VALIDATION.md files are `status: draft`, `nyquist_compliant: false`; Phase 6 has no VERIFICATION.md (UAT passed 7/7 but process gap)
**Success Criteria** (what must be TRUE):
  1. Each of phases 01–06 has a VALIDATION.md with `status: final` and `nyquist_compliant: true` after running `/gsd:validate-phase N`
  2. All identified Nyquist test coverage gaps have tests committed and passing
  3. Phase 6 has a VERIFICATION.md summarizing goal-backward verification of MNTR-02 delivery
**Plans**: TBD

### Phase 12: Trial Auto-Activation + Expiry Reconciliation
**Goal**: New users automatically get a 3-day free trial activated at signup, and DM expiry is reconciled between spec and code
**Depends on**: Phase 5
**Requirements**: BILL-01, ACTN-10
**Gap Closure**: Closes tech debt — `startFreeTrial` exists but only runs if user manually visits `/billing`, so `trial_ends_at` is never set for most signups and credit-burn cron ignores them; ACTN-10 spec says 4h expiry but code uses 12h consistently
**Success Criteria** (what must be TRUE):
  1. New user signup automatically sets `trial_ends_at` = signup + 3 days (via DB trigger, signup server action, or signup hook) without requiring a `/billing` visit
  2. Credit-burn cron applies to trial users from day 1 and trial expiration transitions work correctly
  3. ACTN-10 expiry is reconciled — either spec updated to 12h (current code behavior) or code reduced to 4h (original spec); decision documented and requirement checkbox state matches reality
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/6 | Gap closure | - |
| 2. Reddit Monitoring + Intent Feed | 4/4 | Complete   | 2026-04-17 |
| 3. Action Engine | 3/6 | In Progress|  |
| 4. Sequences + Reply Detection | 2/5 | In Progress|  |
| 5. Billing + Onboarding + Growth | 5/7 | In Progress | - |
| 6. LinkedIn | 1/1 | Complete | 2026-04-21 |
| 7. Reply Detection Fix (GAP) | 0/1 | Pending | - |
| 8. Public Stats + Duplicate Digest (GAP) | 2/4 | In Progress|  |
| 9. Cross-Platform Approval + Audit Trail (GAP) | 0/0 | Pending | - |
| 10. LinkedIn Outreach Execution (GAP) | 0/0 | Pending | - |
| 11. Nyquist Validation Compliance (GAP) | 0/0 | Pending | - |
| 12. Trial Auto-Activation + Expiry (GAP) | 0/0 | Pending | - |
