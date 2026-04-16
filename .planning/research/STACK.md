# Stack Research

**Domain:** AI social intent detection + automated DM outreach platform
**Researched:** 2026-04-16
**Confidence:** HIGH (core stack), MEDIUM (snoowrap risk), LOW (Reddit API approval timeline)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 15.x (not 14) | Full-stack framework, App Router, API routes, cron | v15 is stable current release; v14 is now legacy. v16 released but drops sync APIs — too breaking for a 5-week build. v15 gives Fluid Compute support, React 19, improved caching defaults. |
| React | 19.x | UI runtime (bundled with Next.js 15) | Required by Next.js 15 App Router. No separate install decision. |
| TypeScript | 5.x | Type safety across entire codebase | Mandatory — snoowrap, Supabase JS, Anthropic SDK all ship first-class TS types. Catches intent-scoring bugs before production. |
| Supabase | 2.x JS SDK | PostgreSQL + Auth + Realtime + DB Webhooks | BaaS that ships all four primitives repco needs: structured storage (prospects, signals), auth (magic link), realtime (dashboard feed), and webhooks (approval → action pipeline). Self-managed alternative (Neon + Auth.js) requires 3x more setup for same result. |
| GoLogin Cloud | REST API + CDP | Anti-detect browser profiles, persistent sessions, built-in proxies | The ONLY service that combines: (1) browser fingerprint management, (2) cloud-hosted headful Chrome, (3) Playwright CDP connection via `cloudbrowser.gologin.com/connect`, (4) built-in residential proxy. Alternatives (Multilogin, Kameleo) are local-only or enterprise-priced. GeeLark is mobile-only (V1.5 scope). |
| Playwright | 1.49+ | Browser automation over GoLogin CDP | Connects via `chromium.connectOverCDP(goLoginWsUrl)` — same API as local Chrome. GoLogin exposes `wss://cloudbrowser.gologin.com/connect?token=X&profile=Y`. Puppeteer is an option but Playwright's auto-wait and network intercept are more robust for inbox checking. |
| Anthropic SDK | 0.x (latest) | Claude API access for CU + classification + DM generation | Official SDK, ships TS types. Used for two distinct tasks: `claude-haiku-4-5-20251001` (Computer Use, $1/MTok in), `claude-sonnet-4-6` (DM generation + intent classification, $3/MTok in). |
| Vercel Pro | — | Hosting: Next.js functions + cron + Fluid Compute | Native Next.js host. Fluid Compute (enabled by default for new projects as of Apr 2025) raises max function duration to 800s on Pro — eliminates the Railway fallback concern for browser automation sessions up to ~5 min. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| snoowrap | 1.23.0 | Reddit API wrapper (OAuth, subreddit monitoring, DM send) | READ RISK SECTION. Last updated 2020. Use for MVP because it's the only TypeScript-native Reddit wrapper with full OAuth+DM support. Plan migration to direct Reddit API calls post-MVP if TypeScript errors accumulate. |
| Apify client | 2.x | LinkedIn post scraping via Apify actors | Use `apify-client` npm package to trigger `linkedin-post-search-scraper` actor (~$1-1.20/1k posts). Apify is the most cost-effective LinkedIn data source post-Proxycurl shutdown (Jul 2025). Pricing is pay-per-run, no monthly commitment. |
| Stripe | 17.x (latest) | Subscription billing + credit pack purchases | Use Stripe Checkout for both subscription (monthly/quarterly/annual) and one-time payment (credit packs). Requires API version `2025-06-30.basil` or later for predictable subscription behavior. |
| Resend | 6.x | Transactional email (daily digest, alerts) | 6.11.0 current. Best-in-class developer experience for Vercel/Next.js projects. Free tier: 3,000 emails/month. Use `react-email` for digest templates — same component model as the rest of the app. |
| @supabase/supabase-js | 2.x | Supabase client (auth, db queries, realtime subscriptions) | Primary database interface. Realtime for authenticated dashboard (WebSocket per user). Polling (`setInterval`) for public `/live` page — avoids hitting connection limits on unauthenticated traffic. |
| Sentry | 8.x | Error tracking + performance monitoring | Use `@sentry/nextjs`. Critical for GoLogin CDP sessions — catch disconnections and Computer Use failures silently. Set up before first browser automation run. |
| Axiom | next-axiom 1.x | Log aggregation + query | Official Vercel integration: zero-config ingestion of all function logs. Free tier: 500GB/month. Use structured logging (`log.info({}, 'intent detected')`) for queryable intent pipeline traces. |
| date-fns | 3.x | Date manipulation (follow-up scheduling, cooldown timers) | Lightweight, tree-shakeable. Use for follow-up day calculation (day 3/7/14) and cooldown windows. |
| zod | 3.x | Runtime schema validation | Validate webhook payloads from Supabase DB webhooks before triggering action engine. Also validate Apify actor output shapes. |
| react-email | 2.x | Email template authoring | Paired with Resend. Write daily digest as React component, render server-side. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Package management | Faster than npm, better monorepo support if needed later. Use `pnpm@9`. |
| ESLint + Prettier | Code quality | Use `eslint-config-next` (ships with Next.js). Add `prettier-plugin-tailwindcss` for class sorting. |
| Tailwind CSS | Styling | v3.x — v4 still has ecosystem gaps. Terminal-first design system (black/white/orange) maps cleanly to Tailwind utilities. |
| shadcn/ui | UI component primitives | Copy-paste components, not a dependency. Use for dashboard data tables, kanban, approval queue modals. |
| Vercel CLI | Local dev + deployment | `vercel dev` for local function testing. Required for testing Supabase webhook → Vercel function flow via tunneling. |

---

## Installation

```bash
# Core
pnpm add next react react-dom typescript

# Supabase
pnpm add @supabase/supabase-js @supabase/ssr

# Browser automation
pnpm add playwright

# AI
pnpm add @anthropic-ai/sdk

# Reddit
pnpm add snoowrap
pnpm add -D @types/snoowrap

# LinkedIn (via Apify)
pnpm add apify-client

# Payments + email
pnpm add stripe resend react-email

# Observability
pnpm add @sentry/nextjs next-axiom

# Validation + utilities
pnpm add zod date-fns

# Dev
pnpm add -D tailwindcss postcss autoprefixer eslint prettier
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 15 | Next.js 14 | Never for greenfield — 14 is legacy. PRD specifies 14 but 15 is the correct current choice. |
| Next.js 15 | Next.js 16 | When v16 stabilizes (~Q3 2026) and `proxy` middleware rename is handled. Too early for a 5-week MVP build. |
| GoLogin Cloud | Multilogin | If you need 10+ simultaneous cloud browser sessions (GoLogin Cloud is limited to 1-3 concurrent). Enterprise price. |
| GoLogin Cloud | Bright Data Browser | If you need residential proxy quality > anti-detect quality. Adds a second vendor. |
| GoLogin Cloud | Browserless.io | For pure scraping without identity/account persistence — wrong fit for DM outreach which requires consistent logged-in sessions. |
| snoowrap | Reddit API (raw fetch) | Post-MVP if snoowrap TypeScript errors become blocking. Reddit API is straightforward REST — DM via `POST /api/compose`. |
| snoowrap | TRAW (TypeScript Reddit API Wrapper) | If snoowrap breaks on Reddit API changes — TRAW is a community TypeScript-native successor but unproven at production scale. |
| Apify actors | LinkFinder AI | If LinkedIn account safety is a concern — LinkFinder uses its own network. Higher cost, less flexible. |
| Apify actors | PhantomBuster | For scraping-to-outreach pipelines where Apify data quality proves insufficient. Different pricing model ($59+/msc flat). |
| Stripe | Paddle | If you want merchant-of-record (handles EU VAT). Adds complexity for US-focused MVP launch. |
| Resend | Postmark | Same quality, higher price. Resend has better Next.js/React integration via react-email. |
| Vercel Fluid Compute | Railway worker | Only migrate the action worker to Railway if GoLogin sessions consistently exceed 800s (unlikely at MVP scale). Railway adds a second deployment target to maintain. |
| Axiom | Datadog | 100x more expensive for the same log volume. Datadog is enterprise — wrong fit for bootstrapped. |
| Playwright | Puppeteer | Either works with GoLogin CDP. Playwright has better auto-wait, network interception, and TS types. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Python / PRAW | Breaks the single TypeScript runtime constraint. Two runtimes = deployment complexity, two error surfaces, cross-process communication overhead. | snoowrap (TypeScript) |
| Prisma ORM | Supabase ships with a full PostgREST API and the `@supabase/supabase-js` client handles queries, realtime, auth, and RLS in one SDK. Adding Prisma doubles the DB abstraction layer and conflicts with Supabase RLS patterns. | `@supabase/supabase-js` directly |
| NextAuth.js / Auth.js | Supabase Auth already handles OAuth, magic link, JWT, and session management — with RLS integration out of the box. Adding a second auth layer creates session token conflicts. | Supabase Auth (`@supabase/ssr`) |
| BullMQ | Requires a self-managed Redis instance. Adds infrastructure cost and operational burden for a bootstrapped solo build. The Supabase DB Webhook → Vercel Function event pattern eliminates the need for a separate queue. | Supabase DB Webhooks + Vercel Functions |
| Inngest | Runs inside your Vercel Functions (still hits timeout limits). Adds a vendor for something Fluid Compute + DB Webhooks handles natively. | Vercel Fluid Compute + Supabase Webhooks |
| Trigger.dev | Correct architecture (runs on separate machines, no timeout), but adds managed compute cost + another vendor dashboard. Justified only if Fluid Compute 800s ceiling is hit at scale. | Vercel Fluid Compute (revisit at 500+ users) |
| Selenium / WebDriver | Detectable, slow, no CDP support for GoLogin Cloud. GoLogin's cloud browser API is explicitly Playwright/Puppeteer CDP. | Playwright |
| Multilogin | Local-only profiles (desktop app required), enterprise pricing ($99+/msc), no cloud browser API equivalent to GoLogin. | GoLogin Cloud |
| GeeLark | Mobile profiles only — right tool for mobile app automation, wrong tool for web-based LinkedIn DMs. Explicitly out-of-scope for V1. | GoLogin Cloud |
| OpenAI GPT-4 | PRD constrains to Anthropic only. No technical gap — Claude Sonnet 4.6 matches or exceeds GPT-4o on DM generation tasks. | Claude Sonnet 4.6 |
| Next.js Pages Router | App Router is the current standard. Pages Router is in maintenance mode. Mixing both creates routing confusion. | Next.js 15 App Router exclusively |

---

## Critical Risk: snoowrap Maintenance Status

**Severity: MEDIUM — plan for mitigation, not blocking for MVP.**

snoowrap 1.23.0 was last published in 2020 (5 years ago). ~15,784 weekly npm downloads indicates active use, but no active maintainer.

**What this means:**
- Reddit API changes (which have accelerated since 2023's API crackdown) may break snoowrap silently
- Reddit now requires pre-approval for all new OAuth apps (since Nov 2025) — existing credentials continue working, but new app registrations take 2-4 weeks
- The DM send method (`snoowrap.composeMessage()`) uses a legacy Reddit endpoint that could be deprecated

**Mitigation strategy:**
1. Register the Reddit OAuth app NOW (before building) to avoid the approval wait
2. Encapsulate all snoowrap calls behind a `RedditClient` service class — makes drop-in replacement trivial
3. If snoowrap breaks: fall back to raw `fetch()` against the Reddit REST API (documented, stable OAuth endpoints)

---

## Stack Patterns by Context

**Supabase DB Webhook → Action trigger:**
- DB change (approval INSERT) → Supabase HTTP webhook → `POST /api/webhooks/action` → Verify HMAC signature → Trigger browser automation
- Verify with `crypto.timingSafeEqual` on the `SUPABASE_WEBHOOK_SECRET` header
- Fluid Compute handles the 2-5 min GoLogin session duration without Railway

**GoLogin Cloud Browser connection:**
```typescript
const wsUrl = `wss://cloudbrowser.gologin.com/connect?token=${GOLOGIN_TOKEN}&profile=${profileId}`;
const browser = await chromium.connectOverCDP(wsUrl);
const page = await browser.newPage();
// Claude Haiku CU takes screenshot + acts
```

**Intent classification pipeline:**
- snoowrap polls subreddit `new` every 15 min → keyword pre-filter (fast, free) → Claude Sonnet 4.6 classifies ambiguous posts → score 1-10 → INSERT to `signals` table → Supabase Realtime pushes to dashboard

**LinkedIn monitoring:**
- Vercel cron (every 2-4h) → `apify-client.actor('curious_coder/linkedin-post-search-scraper').call({keywords})` → await result → parse posts → same classification pipeline

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Next.js 15.x | React 19.x | Required. React 18 works with Pages Router only. |
| @supabase/supabase-js 2.x | Next.js 15 App Router | Use `@supabase/ssr` (not deprecated `auth-helpers-nextjs`) for cookie-based server sessions. |
| Playwright 1.49+ | GoLogin CDP | `connectOverCDP` is stable. Avoid Playwright 2.x alpha if it ships during build — breaking changes. |
| snoowrap 1.23.0 | Node.js 18-22 | Has known issues with Node 20+ ESM resolution. Use `"type": "commonjs"` in package.json or add `--experimental-vm-modules` flag. Test on first day. |
| Tailwind CSS 3.x | Next.js 15 | v4 has incomplete shadcn/ui component support — stick with v3 for MVP. |
| Stripe 17.x | Node.js 18+ | Use API version `2025-06-30.basil` or later per Stripe docs for subscription predictability. |

---

## Sources

- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) — Model IDs, pricing, CU support verified (HIGH confidence)
- [GoLogin Cloud Browser Docs](https://gologin.com/docs/api-reference/cloud-browser/getting-started) — CDP connection format, wss endpoint pattern (HIGH confidence)
- [GoLogin Pricing](https://gologin.com/pricing/) — Concurrent cloud browser limits, plan tiers (MEDIUM confidence)
- [Vercel Fluid Compute Docs](https://vercel.com/docs/fluid-compute) — 800s Pro max duration, default-enabled for new projects (HIGH confidence)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks) — HTTP webhook pattern, pg_net extension (HIGH confidence)
- [Supabase Realtime Limits](https://supabase.com/docs/guides/realtime/limits) — Connection limits, 8000 byte NOTIFY ceiling (HIGH confidence)
- [snoowrap npm](https://www.npmjs.com/package/snoowrap) — Version 1.23.0, last published 2020, ~15k weekly downloads (HIGH confidence)
- [Reddit API Pre-Approval Policy](https://replydaddy.com/blog/reddit-api-pre-approval-2025-personal-projects-crackdown) — Nov 2025 crackdown, 2-4 week approval timeline (MEDIUM confidence — single source)
- [Apify LinkedIn Post Scraper](https://apify.com/curious_coder/linkedin-post-search-scraper) — Pricing ~$1-1.20/1k posts (MEDIUM confidence)
- [Resend npm](https://www.npmjs.com/package/resend) — Version 6.11.0 (HIGH confidence)
- [Next.js 16 Release](https://nextjs.org/blog/next-16) — v16 stable, Turbopack default, sync API removal (HIGH confidence)
- [Stripe Build Subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions) — Subscription + one-time payment patterns (HIGH confidence)

---

*Stack research for: repco.ai — AI social intent detection + DM outreach platform*
*Researched: 2026-04-16*
