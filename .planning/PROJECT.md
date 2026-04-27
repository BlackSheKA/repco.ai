# repco.ai

## What This Is

repco.ai is an AI sales rep that monitors Reddit and LinkedIn 24/7, detects people actively looking for products like yours, and sends personalized DMs on your behalf — from your accounts, with your voice. Built for indie hackers and small SaaS teams who need consistent social outbound without hiring an SDR.

## Core Value

People who are actively looking for your product get a personalized, relevant DM within hours — not days, not never.

## Current Milestone: v1.2 — Survival + Foundation

**Started:** 2026-04-27
**Goal:** Stop the account-ban bleeding (per-profile residential proxy + cookies + preflight detection) and ship the PLG-ready pricing foundation (27-mechanism cost engine + free tier + hard wipe) so v1.3+ can expand signal/outbound mechanisms on a coherent base.

**Two parallel tracks:**

**Track 1 — Anti-Ban (Fazy 0–4 from `ANTI-BAN-ARCHITECTURE.md`):**
- New `browser_profiles` table: 1 residential proxy = 1 GoLogin profile = N social_accounts (max 1 per platform)
- Per-profile residential GeoProxy via GoLogin matched to `country_code` + consistent timezone/locale/UA stack
- Cookies persistence (`cookies_jar JSONB`, save/restore around sessions)
- Pre-action preflight (Reddit `about.json`) + post-action Haiku CU detector (ban/captcha/suspended modals)
- Auto-reuse profile algorithm (same user + same country + no platform conflict → reuse)

**Track 2 — Pricing & Free Tier (Fazy A–E from `PRICING.md`):**
- `mechanism_costs` table seeded with all 27 signal + 28 outbound mechanism costs (single source of truth, used by both signal/outbound expansion in v1.3)
- `monitoring_signals` schema rewrite: `frequency`, `mechanism_id`, `config jsonb`
- New `subscription_tier='free'` (replaces 3-day trial); 250 cr/month, 1 account, 2 mechanisms, ≥4h cadence, 0 outbound
- Outbound paywall modals + locked-mechanism badges in `/signals` UI redesign
- `monthly-credit-grant` cron (1st of month, additive cap = 2× grant)
- Hard wipe of `auth.users` (pre-launch test data) with confirmation gate; Stripe products refreshed for new grant levels
- UI never shows burn math (balance + per-action cost only)

**Deferred to v1.3+:**
- Anti-Ban Faza 3 (real warmup activity) and Faza 5 (account-creation hygiene cosmetics)
- Pricing Fazy F–G (outbound mechanism cost engine + sequence/variants billing) — paired with outbound expansion
- All 27 signal mechanisms P1–P11 — only the cost rows seeded in v1.2; actual mechanism implementations in v1.3
- All 28 outbound mechanisms OP1–OP8 — same; cost rows seeded, implementations in v1.3

**Reference docs (input specs):**
- `.planning/ANTI-BAN-ARCHITECTURE.md`
- `.planning/PRICING.md`
- `.planning/SIGNAL-DETECTION-MECHANISMS.md` (cost-table data only for v1.2)
- `.planning/OUTBOUND-COMMUNICATION-MECHANISMS.md` (cost-table data only for v1.2)

**Key context:**
- Reddit account got banned immediately on manual login through GoLogin profile — proves default `proxy: { mode: "gologin" }` shared pool is burned. Faza 1 is the unblock for everything else.
- 8 residential proxies (geo.floppydata.com pool) already provisioned with 2 GB traffic — Faza 1 needs no pre-purchase.
- All current users are test data (`feedback_dev_branch_no_touch` + `project_users_are_test_data`) — wipe is safe; rule changes when first real customer arrives.
- Free tier is the PLG hook: feed visible, all outreach locked → upgrade pressure without burn-math doomsday clock.

## Last shipped

**v1.1 LinkedIn Action Expansion** (2026-04-27)
- LinkedIn DM, Follow, Like, Comment executors via deterministic Playwright (no Claude CU)
- Day 3/7/14 followup_dm routes to LinkedIn DM executor (Reddit regression-safe)
- Prospect pre-screening cron filters structurally-unreachable LinkedIn prospects
- Account quarantine enforcement: `health_status` + `cooldown_until` gate execution at both worker and `claim_action` RPC layers

**Open carry-over from v1.1:**
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

### Active (v1.2 scope)

**Anti-Ban (BPRX):**
- [ ] BPRX-01: New `browser_profiles` table — 1 residential proxy = 1 GoLogin profile = N `social_accounts` (max 1 per platform); enforced by `(browser_profile_id, platform)` unique constraint
- [ ] BPRX-02: New `social_accounts` rows are linked to a `browser_profile_id` (replaces `gologin_profile_id` + `proxy_id` columns)
- [ ] BPRX-03: New browser_profiles allocate residential GeoProxy via GoLogin REST matched to `country_code` (no shared `mode: "gologin"` proxy ever again)
- [ ] BPRX-04: Per-profile fingerprint uniqueness via `patch_profile_fingerprints` after profile creation
- [ ] BPRX-05: Country → timezone + locale + UA mapping is consistent (US→`America/New_York`+`en-US`, GB→`Europe/London`+`en-GB`, DE→`Europe/Berlin`+`de-DE`, PL→`Europe/Warsaw`+`pl-PL`)
- [ ] BPRX-06: Auto-reuse algorithm — when a user adds a new account, server picks an existing same-country profile that doesn't already have that platform, otherwise creates a new browser_profile + proxy
- [ ] BPRX-07: Cookies persisted to `browser_profiles.cookies_jar JSONB` after every session and restored before the next session (no fresh-login pattern)
- [ ] BPRX-08: Pre-action preflight checks Reddit `about.json` (suspended / very-low-karma / 404) before action executes; failure flips `health_status='banned'` and aborts
- [ ] BPRX-09: Post-action Haiku CU detector inspects screenshot for "rule broken" / captcha / "account suspended" / rate-limit modals; any positive flips `health_status='banned'` and halts
- [ ] BPRX-10: All current `auth.users` test rows are wiped behind an explicit confirmation gate before the new schema goes live (pre-launch reset, no data preservation needed)

**Pricing & Free Tier (PRIC):**
- [ ] PRIC-01: New `mechanism_costs` table seeded with all 27 signal + 28 outbound mechanism cost rows (`mechanism_id` PK, `cr_per_scan`/`cr_per_action`, `mechanism_kind`, `premium`, `requires_gologin`, `free_tier_allowed`)
- [ ] PRIC-02: `monitoring_signals` schema rewrite — `frequency` (interval), `mechanism_id` (FK to mechanism_costs), `config` (jsonb per-mechanism parameters)
- [ ] PRIC-03: Server-side credit burn engine computes `daily_burn = cr_per_scan × scans_per_day(cadence) × num_sources` from DB lookup; legacy `MONITORING_COSTS` constants removed
- [ ] PRIC-04: `subscription_tier` ENUM extended with `free` value
- [ ] PRIC-05: New users on signup automatically get `subscription_tier='free'` + 250 cr balance (replaces `trial_ends_at` / 3-day trial path; `handle_new_user` trigger updated)
- [ ] PRIC-06: Free tier hard caps enforced — max 1 social account total (Reddit OR LinkedIn), max 2 mechanisms active, cadence ≥4h, 0 outbound actions allowed (paywall modal on every DM/reply/connection/comment/post)
- [ ] PRIC-07: Free tier mechanism whitelist — only R1, R3, R4, L1, L7, T1, T2 selectable; gologin-required mechanisms (R7, R8, L6, L10, L11, T3) and heavy mechanisms (L2-L5, T4) locked with upgrade badge
- [ ] PRIC-08: `monthly-credit-grant` cron (`0 0 1 * *`) applies `balance = min(balance + monthly_grant, balance_cap)` per active subscription tier; cap = 2× grant
- [ ] PRIC-09: Stripe products refreshed for new grant levels (Free $0, Monthly $49 / 2k cr, Quarterly $35/m / 3k cr, Annual $25/m / 4k cr) and credit packs (Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399)
- [ ] PRIC-10: Top-up credit packs are blocked for free-tier users (forced upgrade to subscription)
- [ ] PRIC-11: `/signals` UI redesigned — 27 mechanism cards with toggle, configuration, **static unit-cost label** ("1 credit per scan"), upgrade badge for locked mechanisms, status (last_scan_at, signals_24h)
- [ ] PRIC-12: UI never shows burn math — no `cr/day`, no `cr/month`, no live ticker, no "wystarczy na X dni", no breakdown
- [ ] PRIC-13: Free tier landing copy on `/pricing` (Free column added) and dashboard signup hook reflects 250-cr / 1-account / 0-outreach contract
- [ ] PRIC-14: Anti-abuse — 1 free tier per `email + IP` enforced in `handle_new_user` trigger with audit log; `users.credits_balance_cap` and `users.credits_included_monthly` columns set per tier

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
*Last updated: 2026-04-27 — v1.2 milestone started (Survival + Foundation: anti-ban infrastructure + PLG free tier + 27-mechanism cost engine, derived from 4 spec docs in `.planning/`)*
