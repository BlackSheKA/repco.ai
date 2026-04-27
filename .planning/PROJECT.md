# repco.ai

## What This Is

repco.ai is an AI sales rep that monitors Reddit and LinkedIn 24/7, detects people actively looking for products like yours, and sends personalized DMs on your behalf — from your accounts, with your voice. Built for indie hackers and small SaaS teams who need consistent social outbound without hiring an SDR.

## Core Value

People who are actively looking for your product get a personalized, relevant DM within hours — not days, not never.

## Current State

**Last shipped:** v1.1 LinkedIn Action Expansion (2026-04-27)
**Current focus:** Planning next milestone — run `/gsd-new-milestone` to define v1.2 scope

**v1.1 delivered:**
- LinkedIn DM, Follow, Like, Comment executors via deterministic Playwright (no Claude CU)
- Day 3/7/14 followup_dm now routes to LinkedIn DM executor (Reddit regression-safe)
- Prospect pre-screening cron filters structurally-unreachable LinkedIn prospects
- Account quarantine enforcement: `health_status` + `cooldown_until` now gate execution at both worker and `claim_action` RPC layers

**Open after v1.1 close:**
- Phase 13 Nyquist `wave_0_complete: false` — `/gsd-validate-phase 13` recommended
- 8 human-verification UAT tests on Phase 13 (warmed GoLogin profile + real prospects required)
- 11 deferred code-quality nits / improvement items per `13-REVIEW-FIX.md`

## Requirements

### Validated

- [x] OBSV-01: Action execution logging to job_logs with duration_ms, status, error — Validated in Phase 1: Foundation
- [x] OBSV-02: Zombie recovery cron (5 min) resets stuck actions — Validated in Phase 1: Foundation
- [x] OBSV-03: Error tracking via Sentry + structured logging via Axiom — Validated in Phase 1: Foundation
- [x] OBSV-04: Threshold alerting (success rate < 80%, timeout > 5%) via Sentry — Validated in Phase 1: Foundation
- [x] MNTR-01: Reddit monitoring via snoowrap, 15-min Vercel Cron — Validated in Phase 2: Reddit Monitoring + Intent Feed
- [x] MNTR-03: Structural keyword matching (80-90% zero AI cost) — Validated in Phase 2
- [x] MNTR-04: Claude Sonnet classification for ambiguous signals — Validated in Phase 2
- [x] MNTR-05: Deduplication by post_url + 48h freshness filter — Validated in Phase 2
- [x] MNTR-06: Supabase Realtime feed updates — Validated in Phase 2
- [x] MNTR-07: Job logging for monitor runs — Validated in Phase 2
- [x] FEED-01 through FEED-05: Intent feed with signal cards, flame indicators, contact/dismiss, filters — Validated in Phase 2
- [x] AGNT-01 through AGNT-03: Agent persona card, 7 emotional states, terminal header — Validated in Phase 2
- [x] DASH-01 through DASH-03: Dashboard layout, realtime updates — Validated in Phase 2
- [x] FLLW-01 through FLLW-05: 3-touch follow-up sequences (day 3/7/14), auto-send toggle, cancellation — Validated in Phase 4: Sequences + Reply Detection
- [x] RPLY-01 through RPLY-04: Reply detection via GoLogin + Playwright + Haiku vision, stop-on-reply, inbox failure tracking — Validated in Phase 4
- [x] NTFY-01 through NTFY-03: Email notifications (reply alert, daily digest, account warning) via Resend + React Email — Validated in Phase 4
- [x] Onboarding: 3-question flow (product, customer, competitor) with Claude keyword generation — Validated in Phase 5: Billing + Onboarding + Growth
- [x] Prospect database: pipeline kanban (6 stages), CSV export, drag-drop — Validated in Phase 5
- [x] /live page: public real-time feed of intent signals (10s polling) — Validated in Phase 5
- [x] "Scan my product" landing hook: real Reddit search + rate-limited (3/hr) — Validated in Phase 5
- [x] Weekly results card: 1200x630 OG image + X/LinkedIn share intents — Validated in Phase 5
- [x] Stripe billing: 3 subscription tiers + 4 credit packs, hosted Checkout + webhook — Validated in Phase 5
- [x] Credit economy: daily burn cron (monitoring + account) + action-level deduction — Validated in Phase 5
- [x] LNKD-01: LinkedIn DM 1st-degree (deterministic DOM, no CU) — Validated in v1.1 Phase 13
- [x] LNKD-02: LinkedIn Follow + Premium-gate detection — Validated in v1.1 Phase 13 (read-gate added in Phase 14)
- [x] LNKD-03: LinkedIn React (Like) + post failure modes — Validated in v1.1 Phase 13
- [x] LNKD-04: LinkedIn Comment ≤1250 chars — Validated in v1.1 Phase 13
- [x] LNKD-05: Day 3/7/14 followup_dm → LinkedIn DM executor — Validated in v1.1 Phase 13
- [x] LNKD-06: Pre-screen marks unreachable LinkedIn prospects — Validated in v1.1 Phase 13 (read-gate added in Phase 14)
- [x] Action engine: event-driven (Supabase DB Webhook → Vercel Function → GoLogin → Playwright CDP → Claude Haiku CU) — Validated in v1.0 Phase 3
- [x] Human-in-the-loop: DM + public reply require approval; like + follow auto-approved — Validated in v1.0 Phase 3
- [x] DM generation: Claude Sonnet 4.6, max 3 sentences, references specific post, quality control pass — Validated in v1.0 Phase 3
- [x] Anti-ban system: GoLogin Cloud profiles, behavioral noise, warmup protocol (7 days), rate limiting — Validated in v1.0 Phase 3
- [x] Dashboard: multi-column layout with persistent terminal header, agent card, intent feed, approval queue, results — Validated in v1.0 Phases 2 + 5
- [x] Account health monitoring: warmup progress, health status, daily limits — Validated in v1.0 Phase 3 + v1.1 Phase 14 (runtime quarantine read-gate)
- [x] Warmup scheduler: 7-day progressive warmup protocol per account — Validated in v1.0 Phase 3
- [x] LinkedIn integration: monitoring (v1.0 Phase 6) + outreach (v1.0 Phase 10 + v1.1 Phases 13–14)

### Active

(None — next milestone scope to be defined via `/gsd-new-milestone`)

### Out of Scope

- Autopilot mode (no approval) — V2, need to validate quality first
- TikTok, Instagram, X, Facebook — V1.5+, Reddit + LinkedIn first
- GeeLark mobile profiles — V1.5
- A/B testing messages — V2
- CRM integrations (HubSpot, Pipedrive) — V2
- White-label Agency — V1.5
- Team features / multi-user — V2
- Multilogin enterprise — V2

## Context

- Solo founder build, Claude-assisted development
- Competitive landscape: Gojiberry.ai (LinkedIn-only, $1.4M ARR/9msc), Sintra.ai (AI employees, $12M ARR/12msc)
- No existing tools do cross-platform intent detection + social DM outreach — DM APIs don't exist, Computer Use makes it possible
- Target: $20K MRR by month 3-4
- Self-promotion GTM from day 1 — repco uses itself as first customer
- Design language: shadcn preset b3QwALGmg — radix-nova style, indigo primary (#4338CA), warm stone palette, agent personality
- Typography: Inter (body/headings), Geist (UI sans), Geist Mono (monospace/terminal)

## Constraints

- **Tech stack**: Next.js 14 App Router + Supabase + GoLogin Cloud + Claude API (Anthropic only) — as specified in PRD v3.0
- **Runtime**: Single runtime — Node.js/TypeScript everywhere (snoowrap, not PRAW)
- **Hosting**: Vercel Pro for everything; Railway fallback only if action worker hits 60s timeout at ~100 users
- **Budget**: Bootstrapped — minimize fixed costs, pay-per-use where possible (~$185/msc at launch)
- **Timeline**: 5-week build to MVP deploy
- **Browser automation**: GoLogin Cloud profiles with built-in proxy (no Bright Data, no 2Captcha)
- **AI vendor**: Anthropic only — Haiku 4.5 for Computer Use, Sonnet 4.6 for DM generation + classification
- **Privacy**: No social credentials stored — GoLogin session cookies only. Public data only on /live page

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Agent name: "repco" | Consistent with brand, "your repco found 8 people today" | — Pending |
| Vercel Pro first, Railway fallback | Minimize infrastructure complexity at launch; migrate worker only if timeout becomes issue at ~100 users | — Pending |
| snoowrap over PRAW | Single TypeScript runtime, no Python dependency | — Pending |
| GoLogin built-in proxy over Bright Data | Simpler setup, fewer vendors, sufficient for MVP | — Pending |
| Claude Haiku CU over Playwright selectors | Resilient to UI changes, undetectable as automation, natural navigation | — Pending |
| Credit economy over DM tiers | Measures full agent activity, natural expansion, no ceiling frustration | — Pending |
| Polling for /live, Realtime for dashboard | Avoid WebSocket connection limits on public page | — Pending |
| Event-driven actions (DB Webhook) over polling | Zero empty invocations, fires only on user approval | — Pending |

---
*Last updated: 2026-04-27 — v1.1 LinkedIn Action Expansion shipped (Phases 13–14, 6/6 LNKD requirements satisfied; deterministic LinkedIn DM/Follow/Like/Comment + followup_dm + prescreen + runtime quarantine enforcement)*
