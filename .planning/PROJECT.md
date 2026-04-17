# repco.ai

## What This Is

repco.ai is an AI sales rep that monitors Reddit and LinkedIn 24/7, detects people actively looking for products like yours, and sends personalized DMs on your behalf — from your accounts, with your voice. Built for indie hackers and small SaaS teams who need consistent social outbound without hiring an SDR.

## Core Value

People who are actively looking for your product get a personalized, relevant DM within hours — not days, not never.

## Requirements

### Validated

- [x] OBSV-01: Action execution logging to job_logs with duration_ms, status, error — Validated in Phase 1: Foundation
- [x] OBSV-02: Zombie recovery cron (5 min) resets stuck actions — Validated in Phase 1: Foundation
- [x] OBSV-03: Error tracking via Sentry + structured logging via Axiom — Validated in Phase 1: Foundation
- [x] OBSV-04: Threshold alerting (success rate < 80%, timeout > 5%) via Sentry — Validated in Phase 1: Foundation

### Active

- [ ] Onboarding: 3-question flow (product, customer, competitor) that auto-generates keywords and subreddits
- [ ] Monitoring: Reddit (snoowrap, co 15 min) + LinkedIn (Apify, co 2-4h) intent detection
- [ ] Signal detection: structural keyword/pattern matching + Claude Sonnet classification for ambiguous signals
- [ ] Intent feed: real-time dashboard showing detected signals with intent strength scoring (1-10)
- [ ] Agent persona: "repco" with emotional states (Scanning, Found, Waiting, Sent, Reply, Cooldown, Quiet)
- [ ] Action engine: event-driven (Supabase DB Webhook -> Vercel Function -> GoLogin -> Playwright CDP -> Claude Haiku CU)
- [ ] Human-in-the-loop: DM + public reply require approval; like + follow auto-approved
- [ ] DM generation: Claude Sonnet 4.6, max 3 sentences, references specific post, quality control pass
- [ ] Follow-up sequence: 3 follow-ups (day 3, 7, 14), stops on any reply
- [ ] Reply detection: inbox check co 2h via GoLogin + Playwright + Haiku CU
- [ ] Anti-ban system: GoLogin Cloud profiles, behavioral noise, warmup protocol (7 days), rate limiting
- [ ] Dashboard: multi-column layout with persistent terminal header, agent card, intent feed, approval queue, results
- [ ] Prospect database: pipeline kanban (detected -> engaged -> contacted -> replied -> converted -> rejected), CSV export
- [ ] Account health monitoring: warmup progress, health status, daily limits
- [ ] Daily email digest: "X people looking for [product] yesterday" via Resend
- [ ] /live page: public real-time feed of intent signals (polling, no auth required)
- [ ] "Scan my product" landing page hook: real Reddit search results before signup
- [ ] Weekly results card: shareable 1200x630 image with stats
- [ ] Stripe billing: subscription (monthly/quarterly/annual) + credit packs (one-time)
- [ ] Credit economy: 3-layer (monitoring burn + account burn + action cost)
- [ ] Warmup scheduler: 7-day progressive warmup protocol per account

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
*Last updated: 2026-04-17 — Phase 1 Foundation complete*
