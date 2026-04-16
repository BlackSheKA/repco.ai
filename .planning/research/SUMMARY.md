# Project Research Summary

**Project:** repco.ai
**Domain:** AI social intent detection + automated DM outreach (Reddit + LinkedIn)
**Researched:** 2026-04-16
**Confidence:** HIGH

---

## Executive Summary

repco.ai occupies genuine whitespace: **no competitor detects intent AND acts on both Reddit and LinkedIn**. Gojiberry is LinkedIn-only, Octolens monitors but doesn't act, PhantomBuster/Expandi lack LLM-based intent classification.

The recommended architecture is a five-layer event-driven system: scheduled ingestion (snoowrap + Apify), hybrid classification (structural-first, Claude Sonnet for ~10-20% ambiguous posts), Supabase persistence + Realtime, webhook-triggered action execution (GoLogin + Playwright CDP + Haiku CU), and Next.js 15 App Router presentation.

Three risks require early mitigation: behavioral fingerprinting (silent shadowbans), GoLogin CDP compatibility drift, and Vercel timeout orphaning browser sessions. All preventable with patterns from PITFALLS.md.

---

## Stack Verdict

PRD stack validated with one upgrade: **Next.js 15** (not 14) — v14 is legacy, v15 ships Fluid Compute (800s timeout on Pro, eliminates Railway fallback concern).

| Layer | Technology | Confidence |
|-------|-----------|------------|
| Framework | Next.js 15 App Router + React 19 | HIGH |
| Database + Auth + Realtime | Supabase Pro (JS SDK 2.x) | HIGH |
| Browser automation | GoLogin Cloud + Playwright 1.49+ CDP | HIGH |
| AI (Computer Use) | Claude Haiku 4.5 | MEDIUM — 56% benchmark, needs step limits |
| AI (Intelligence) | Claude Sonnet 4.6 | HIGH |
| Reddit API | snoowrap 1.23.0 (unmaintained but viable) | MEDIUM — wrap in adapter |
| LinkedIn scraping | Apify actors (pay-per-use) | MEDIUM — silent failures possible |
| Payments | Stripe 17.x | HIGH |
| Email | Resend 6.x + react-email | HIGH |
| Observability | Sentry + Axiom | HIGH |

**Additions:** pnpm, zod, date-fns, shadcn/ui, Tailwind 3.x.

**Day 1 action:** Register Reddit OAuth app — new pre-approval policy takes 2-4 weeks.

---

## Feature Landscape

### Table Stakes
- Keyword/subreddit monitoring
- Intent scoring (1-10 scale)
- Personalized DM generation (references specific post)
- Follow-up sequence (3-touch, stops on reply)
- Reply detection (inbox check)
- Prospect pipeline tracking (kanban)
- Account health + rate limiting
- Approval queue (HITL)
- Analytics/daily digest
- CSV export
- Billing transparency (credit balance visible)

### Differentiators
- **Cross-platform (Reddit + LinkedIn)** — unique in market
- **Agent persona ("repco") with emotional states** — shareable, memorable
- **"Scan my product" landing hook** — value before signup
- **/live public feed** — viral mechanic
- **Browser-based DM via Computer Use** — the moat (DM APIs don't exist)
- **Auto-generated onboarding** (3 questions → full config)
- **Credit economy** (3-layer, no arbitrary caps)
- **Warmup progress visualization**

### Anti-Features (don't build in V1)
- Autopilot (no approval) — V2 after quality proven
- CRM integrations — CSV covers 80%
- A/B testing — needs statistical infrastructure
- Additional platforms — dominate Reddit + LinkedIn first
- Chrome extension — most detectable automation vector
- Email sequences — different product category
- Mobile app — mobile-responsive web sufficient

---

## Architecture

### Five-Layer System

1. **Ingestion** — Vercel Cron → snoowrap (Reddit 15min) + Apify (LinkedIn 2-4h)
2. **Signal Processing** — Structural match (80-90%, free) → Claude Sonnet (10-20%, ~$1-2/user/msc)
3. **Persistence + Realtime** — Supabase PostgreSQL + DB Webhooks + Realtime (auth dashboard only)
4. **Action Execution** — DB Webhook → Vercel Fluid Compute → GoLogin CDP → Playwright → Haiku CU
5. **Presentation** — Next.js 15 App Router (dashboard Realtime, /live polling 10s)

### Key Architectural Decisions
- **Event-driven actions** (DB Webhook, not polling) — zero idle invocations
- **Structural-first classification** — Claude sees only ambiguous ~10-20% of posts
- **Polling for /live, Realtime for dashboard** — avoids WebSocket connection limits on public page
- **FOR UPDATE SKIP LOCKED** — concurrency safety for action execution
- **Adapter pattern on GoLogin** — single vendor dependency needs isolation

---

## Critical Pitfalls

| # | Pitfall | Severity | Prevention |
|---|---------|----------|------------|
| 1 | Shared Reddit OAuth client ID — rate limits hit wall at ~10 users | HIGH | Per-workspace OAuth app from day 1 |
| 2 | GoLogin CDP silent failures — version drift breaks sessions | HIGH | Post-connect verification, health check |
| 3 | Haiku CU loops — burns credits and time without completing | HIGH | max_steps: 15, screenshot hash stuck detection |
| 4 | Reddit behavioral fingerprinting — shadowbans from transactional behavior | HIGH | Organic warmup, 1:3 promo:organic ratio, shadowban detection |
| 5 | Vercel timeout orphaned state — half-composed DMs | MEDIUM | State machine + zombie recovery cron |
| 6 | Credit race conditions — negative balances from concurrent approvals | HIGH | Atomic SQL: `UPDATE ... WHERE balance >= cost` |
| 7 | Intent false positives — noisy approval queue erodes trust | MEDIUM | Two-tier classification, threshold ≥7, feedback loop |
| 8 | LinkedIn Apify silent failure — 0 results looks like "quiet day" | MEDIUM | Smoke test query, staleness alerting |

---

## Build Order (strict dependency chain)

1. **Foundation** — Supabase schema + RLS + Auth, Next.js 15 shell, Sentry + Axiom
2. **Reddit Monitoring** — snoowrap + structural match + signal processor + Realtime intent feed
3. **Action Engine** — GoLogin + Playwright CDP + Haiku CU + DB Webhook + state machine
4. **Intelligence + Sequences** — Sonnet DM gen + follow-ups + reply detection + anti-ban + warmup
5. **Billing + Growth** — Stripe + credit economy + onboarding + landing + /live page
6. **LinkedIn** — Apify integration (additive after Reddit proven end-to-end)

**Critical path:** Schema → Reddit monitoring → Action engine. Everything else is additive.

---

## Roadmap Implications

1. **Register Reddit OAuth app on day 1** — 2-4 week approval window
2. **Next.js 15** from the start — Fluid Compute eliminates timeout concern
3. **Action engine is highest technical risk** — build early, validate in beta
4. **Anti-ban + warmup before any outreach** — shadowban = restart from zero
5. **Credit atomicity from billing phase** — never read-then-write
6. **snoowrap + GoLogin behind adapters** — escape hatches for vendor risk
7. **/live + "Scan my product" are independent** — ship as marketing mechanics in parallel

---

*Research synthesis for: repco.ai*
*Synthesized: 2026-04-16*
