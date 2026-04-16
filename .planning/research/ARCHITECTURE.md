# Architecture Research

**Domain:** AI social intent detection + automated outreach (SaaS)
**Researched:** 2026-04-16
**Confidence:** HIGH (PRD fully specifies architecture; patterns confirmed by external research)

## Standard Architecture

### System Overview

Social intent detection + outreach systems have five canonical layers. repco.ai maps cleanly onto them:

```
┌─────────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER  (scheduled crawl — time-based triggers)            │
│  ┌───────────────────┐  ┌─────────────────────────────────────────┐  │
│  │  Reddit Monitor   │  │  LinkedIn Monitor                       │  │
│  │  snoowrap         │  │  Apify Actor                            │  │
│  │  Vercel Cron 15m  │  │  Vercel Cron 2-4h                       │  │
│  └────────┬──────────┘  └───────────────┬─────────────────────────┘  │
└───────────┼─────────────────────────────┼────────────────────────────┘
            │ raw posts                   │ raw posts
┌───────────▼─────────────────────────────▼────────────────────────────┐
│  SIGNAL PROCESSING LAYER  (classify, score, deduplicate)              │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Structural Match  (keyword / regex / competitor mention)     │    │
│  │  → fast, cheap, covers ~80-90% of signals, NO AI cost        │    │
│  └──────────────────┬───────────────────────────────────────────┘    │
│                     │ ambiguous posts only (~10-20%)                  │
│  ┌──────────────────▼───────────────────────────────────────────┐    │
│  │  Claude Sonnet 4.6 Classification                             │    │
│  │  → intent_type, intent_strength (1-10), angle, reasoning      │    │
│  └──────────────────┬───────────────────────────────────────────┘    │
│                     │                                                 │
│  ┌──────────────────▼───────────────────────────────────────────┐    │
│  │  Deduplication + Threshold Gate                               │    │
│  │  post_url UNIQUE; intent_strength >= 6 filter; age < 48h      │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │ qualified intent signals
┌─────────────────────────────▼─────────────────────────────────────────┐
│  PERSISTENCE + REALTIME LAYER  (Supabase)                              │
│                                                                        │
│  PostgreSQL                                                            │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ intent_signals │  │  prospects   │  │  actions   │  │ job_logs  │  │
│  └────────────────┘  └──────────────┘  └─────┬──────┘  └───────────┘  │
│                                               │ status='approved'      │
│  ┌────────────────────────────────────────────▼─────────────────────┐  │
│  │  Supabase Database Webhook  →  Vercel Function /api/webhooks/    │  │
│  │  actions (fires ONLY on approval — zero idle invocations)        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  Supabase Realtime  →  Dashboard (authenticated users only)            │
└────────────────────────────────────────────────────────────────────────┘
                              │ DB Webhook trigger
┌─────────────────────────────▼─────────────────────────────────────────┐
│  ACTION EXECUTION LAYER  (event-driven)                                │
│                                                                        │
│  Vercel Function /api/webhooks/actions                                 │
│  ├─  SELECT ... FOR UPDATE SKIP LOCKED  (concurrency safety)           │
│  ├─  GoLogin Cloud API  →  open browser profile (built-in proxy)       │
│  ├─  Playwright CDP  →  connect to remote Chrome                       │
│  └─  Claude Haiku 4.5 Computer Use  →  navigate / type / click / send  │
│                                                                        │
│  Vercel Cron /api/cron/replies  (co 2h)                                │
│  └─  GoLogin → Playwright CDP → Haiku CU  →  read inbox                │
│                                                                        │
│  Zombie Recovery Cron  (co 5 min)                                      │
│  └─  restore actions stuck in 'executing' > 10 min                    │
└────────────────────────────────────────────────────────────────────────┘
                              │ results
┌─────────────────────────────▼─────────────────────────────────────────┐
│  PRESENTATION LAYER  (Next.js 14 App Router on Vercel)                 │
│                                                                        │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐   │
│  │ Dashboard │  │ /live page   │  │  Landing +   │  │  Onboarding │   │
│  │ (Realtime)│  │ (polling 10s)│  │  scan hook   │  │  3 screens  │   │
│  └───────────┘  └──────────────┘  └──────────────┘  └─────────────┘   │
│                                                                        │
│  Supabase Auth  →  RLS enforced on all user tables                     │
│  Stripe webhooks  →  /api/webhooks/stripe  →  credits sync             │
│  Resend  →  daily digest, transactional                                │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Vercel Cron (monitor) | Schedule-triggered Reddit + LinkedIn crawl every 15 min / 2-4h | snoowrap, Apify, Claude Sonnet, Supabase |
| snoowrap | Reddit Public API client — keyword + subreddit search | Vercel Cron (monitor) |
| Apify Actor | LinkedIn post scraper — pay-per-use | Vercel Cron (monitor) |
| Claude Sonnet 4.6 | Ambiguous signal classification — intent_type, strength 1-10 | Vercel Cron (monitor) |
| Supabase PostgreSQL | Primary data store — all entities; RLS enforced | All backend services |
| Supabase DB Webhook | Fires HTTP POST on actions.status='approved'; triggers action execution | Vercel Function (actions) |
| Supabase Realtime | Push signal updates to authenticated dashboard tabs only | Next.js dashboard client |
| Vercel Function (actions) | Event-driven action worker — FOR UPDATE SKIP LOCKED for concurrency | GoLogin Cloud API, Playwright, Haiku CU |
| GoLogin Cloud API | Managed browser profiles with built-in proxy per profile | Vercel Functions |
| Playwright CDP | Connects to GoLogin remote Chrome; drives browser | Vercel Functions |
| Claude Haiku 4.5 CU | Computer Use — UI navigation for DM / like / follow / inbox read | Vercel Functions (actions, replies) |
| Claude Sonnet 4.6 | DM generation (3-sentence, quality-controlled) | Vercel Function on signal action creation |
| Next.js App Router | UI — dashboard, /live, landing, onboarding, approval queue | Supabase, Stripe, Resend |
| Stripe | Subscriptions + credit pack one-time payments | Next.js API route, Supabase |
| Resend | Daily email digest + transactional email | Vercel Cron (email cron) |
| Sentry + Axiom | Error tracking + structured logs with correlation IDs | All Vercel Functions |

## Recommended Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Auth-gated routes
│   │   ├── dashboard/          # Multi-column dashboard with terminal header
│   │   ├── prospects/          # Pipeline kanban + CSV export
│   │   ├── accounts/           # Account health + warmup progress
│   │   └── settings/           # Product profile, keywords, limits
│   ├── (public)/
│   │   ├── live/               # /live page — polling, no auth
│   │   └── page.tsx            # Landing + "scan my product" hook
│   ├── api/
│   │   ├── cron/
│   │   │   ├── monitor/        # Reddit + LinkedIn crawl + signal processing
│   │   │   ├── replies/        # Reply detection via GoLogin + Haiku CU
│   │   │   ├── followup/       # Follow-up sequence scheduler
│   │   │   ├── warmup/         # Warmup protocol step runner
│   │   │   └── zombie-recovery/ # Restore stuck 'executing' actions
│   │   ├── webhooks/
│   │   │   ├── actions/        # Supabase DB Webhook receiver — action executor
│   │   │   └── stripe/         # Stripe webhook — credit sync
│   │   └── live/               # Public polling endpoint for /live page
│   └── layout.tsx
├── lib/
│   ├── monitoring/
│   │   ├── reddit.ts           # snoowrap client + search + structural match
│   │   ├── linkedin.ts         # Apify actor client + result normalization
│   │   └── signal-processor.ts # Dedup, threshold gate, save to intent_signals
│   ├── classification/
│   │   └── intent-classifier.ts # Claude Sonnet classification for ambiguous signals
│   ├── generation/
│   │   ├── dm-generator.ts     # Claude Sonnet DM generation (3 sentences)
│   │   └── quality-control.ts  # Claude quality check pass before queue
│   ├── execution/
│   │   ├── action-worker.ts    # FOR UPDATE SKIP LOCKED + dispatch by action_type
│   │   ├── gologin.ts          # GoLogin Cloud API client (open/close profile)
│   │   ├── browser.ts          # Playwright CDP connection wrapper
│   │   └── computer-use.ts     # Claude Haiku CU prompt templates per action type
│   ├── anti-ban/
│   │   ├── delays.ts           # μ=90s, σ=60s random delay generator
│   │   ├── noise.ts            # Behavioral noise actions (scroll, read, like)
│   │   └── warmup.ts           # 7-day warmup protocol step logic
│   ├── credits/
│   │   ├── deduct.ts           # Atomic credit deduction with transaction log
│   │   └── monitoring-burn.ts  # Daily monitoring burn runner
│   ├── notifications/
│   │   ├── email.ts            # Resend daily digest + transactional
│   │   └── realtime.ts         # Supabase Realtime push helpers
│   └── db/
│       ├── supabase.ts         # Supabase client (server + browser)
│       └── schema.ts           # TypeScript types matching DB schema
├── components/
│   ├── dashboard/
│   │   ├── terminal-header.tsx # Live agent log stream
│   │   ├── agent-card.tsx      # Agent state + persona display
│   │   ├── intent-feed.tsx     # Signal cards with approve/skip
│   │   ├── approval-queue.tsx  # DM drafts pending human approval
│   │   └── results-column.tsx  # Prospect counts + revenue counter
│   └── live/
│       └── live-feed.tsx       # Public /live scrolling signal feed
└── types/
    └── index.ts                # Shared TypeScript interfaces
```

### Structure Rationale

- **lib/monitoring/**: Separates ingestion (snoowrap/Apify) from signal processing; each platform is independently testable
- **lib/execution/**: All browser automation isolated — GoLogin, CDP, Computer Use are a single bounded concern; adapter pattern here enables future migration (AdsPower, Multilogin)
- **lib/anti-ban/**: Behavioral noise and timing logic separated so it can be tuned without touching core action flow
- **lib/credits/**: Isolated because credit deduction must be atomic and auditable; never inline with other operations
- **api/cron/ vs api/webhooks/**: Crons are time-triggered (monitor, replies, warmup); webhooks are event-triggered (action execution, Stripe sync) — they have fundamentally different reliability properties

## Architectural Patterns

### Pattern 1: Structural-First Classification (Hybrid AI)

**What:** Apply cheap structural matching (keyword regex, competitor name match) first. Call Claude Sonnet only on posts that pass structural match but are semantically ambiguous. Claude never sees the obvious signals.

**When to use:** Any signal pipeline where AI classification cost scales with volume. At 1,000 posts/day, structural-first keeps AI calls at ~100-200/day instead of 1,000.

**Trade-offs:** Requires maintaining regex/keyword patterns alongside AI; structural rules can be too rigid — tune the threshold for what counts as "ambiguous."

```typescript
async function processPost(post: RedditPost, profile: ProductProfile): Promise<IntentSignal | null> {
  // Step 1: structural match — zero AI cost
  const structuralMatch = matchStructural(post, profile.keywords, profile.competitors);
  if (!structuralMatch.matched) return null;

  // Step 2: obvious high-confidence signals — skip AI
  if (structuralMatch.confidence === 'high') {
    return buildSignal(post, structuralMatch.intent_type, structuralMatch.strength, null);
  }

  // Step 3: ambiguous — call Claude only now
  const classification = await classifyWithClaude(post, profile);
  if (classification.intent_strength < INTENT_THRESHOLD) return null;
  return buildSignal(post, classification.intent_type, classification.intent_strength, classification.reasoning);
}
```

### Pattern 2: Event-Driven Action Execution (DB Webhook Trigger)

**What:** Actions table is the queue. When a row transitions to `status='approved'`, Supabase fires a Database Webhook to the action worker. The worker claims one action atomically with `FOR UPDATE SKIP LOCKED`. No polling, no empty invocations.

**When to use:** Any workflow where actions are user-approved and infrequent. Eliminates idle cron wakeups; Vercel function cold starts only on real work.

**Trade-offs:** Supabase Webhooks require a publicly reachable URL — local dev needs ngrok or similar tunnel. Webhook delivery is at-least-once; idempotency is required (check current status before executing).

```typescript
// /api/webhooks/actions
export async function POST(req: Request) {
  const payload = await req.json(); // Supabase webhook payload
  if (payload.record.status !== 'approved') return new Response('skip', { status: 200 });

  const action = await db.transaction(async (tx) => {
    return tx.query(
      `SELECT * FROM actions WHERE id = $1 AND status = 'approved'
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [payload.record.id]
    );
  });

  if (!action) return new Response('already claimed', { status: 200 }); // idempotency guard
  await executeAction(action);
}
```

### Pattern 3: Human-in-the-Loop Approval Queue

**What:** AI generates the draft (DM content, action plan). Draft appears in approval queue with supporting evidence (the original post, intent score, reasoning). User approves/edits/rejects. Only approved actions reach the execution layer.

**When to use:** Any action with real-world consequence (message sent, account interaction). HITL is the trust-building mechanism; autopilot is a V2 feature after quality is proven.

**Trade-offs:** Introduces latency between signal detection and action execution (4h expiry window). Requires an expiry/stale mechanism — signals older than 4h expire and are not sent even if approved late.

```typescript
// Evidence pack shown to user alongside DM draft
interface ApprovalCard {
  draft: string;           // generated DM
  signal: IntentSignal;    // the post that triggered it
  evidence: {
    post_content: string;
    intent_strength: number; // 1-10
    intent_reasoning: string;
    suggested_angle: string;
  };
  expires_at: Date;        // 4h window
}
```

### Pattern 4: Polling for Public / Realtime for Authenticated

**What:** `/live` page uses SWR polling at 10s intervals — no persistent WebSocket connection per anonymous visitor. Dashboard uses Supabase Realtime (WebSocket) only for authenticated users.

**When to use:** Any time you have a public page with unknown concurrent visitor count. Supabase Realtime has connection limits; polling degrades gracefully, scales linearly with CDN, and is cache-friendly.

**Trade-offs:** Polling adds up to 10s latency on /live vs instant push; acceptable given the page is entertainment/marketing not operations.

## Data Flow

### Monitoring Flow (every 15 min / 2-4h)

```
Vercel Cron triggers /api/cron/monitor
  → For each active user with plan:
    → snoowrap.search(subreddits, keywords)
    → filter: age < 48h, post_url NOT IN intent_signals (dedup)
    → structural match: keyword hit / competitor regex
      → if obvious match: save directly to intent_signals
      → if ambiguous:
          → Claude Sonnet 4.6 classification
          → if intent_strength >= 6: save to intent_signals
          → else: discard
    → Supabase Realtime push to user's dashboard channel
    → Update live_stats aggregate (for /live page)
    → Write job_logs entry (duration, status, signal count)
    → Deduct monitoring credits (daily burn)
```

### Action Execution Flow (event-driven)

```
User clicks "Contact" on intent signal in dashboard
  → POST /api/actions/create
  → Create prospect record (if new)
  → Create engage actions (like, follow): status = 'approved' immediately
  → Create DM action: status = 'pending_approval' + generate draft via Sonnet
  → Quality control pass on draft (Sonnet)
  → Draft appears in approval queue

User clicks "Approve" on DM draft
  → PATCH actions SET status = 'approved'
  → Supabase Database Webhook fires → POST /api/webhooks/actions

Vercel Function receives webhook
  → SELECT ... FOR UPDATE SKIP LOCKED (claim one action atomically)
  → GoLogin Cloud API: open browser profile (returns CDP endpoint URL)
  → Playwright: connect via CDP
  → Claude Haiku 4.5 Computer Use:
      navigate to prospect's profile
      → click "Message" / "Send DM"
      → type generated content (with behavioral delays)
      → click "Send"
      → screenshot for verification
  → UPDATE actions SET status = 'completed', executed_at = now()
  → UPDATE prospect pipeline_status = 'contacted'
  → Deduct action credits (30 credits for DM)
  → Supabase Realtime push to dashboard
  → Write job_logs entry (duration_ms, status)
  → Close GoLogin profile
```

### Reply Detection Flow (every 2h)

```
Vercel Cron triggers /api/cron/replies
  → For each active social_account:
    → GoLogin Cloud API: open profile
    → Playwright CDP: navigate to DM inbox
    → Claude Haiku 4.5 Computer Use: scan for unread messages
    → If new replies found:
        → extract sender_handle + message_content
        → match sender to prospects table
        → UPDATE prospect.pipeline_status = 'replied'
        → UPDATE action: stop_followup_sequence = true
        → Supabase Realtime push to dashboard
        → Resend: email notification to user
    → Write job_logs entry
    → Close GoLogin profile
```

### Follow-up Scheduling Flow (hourly cron)

```
Vercel Cron (hourly) → /api/cron/followup
  → For each prospect WHERE pipeline_status = 'contacted':
    → Check: has any reply been detected? → if yes: stop, mark replied
    → Check: last_action_at + step.delay <= now?
      → Step 1: day 3 — feature/benefit angle
      → Step 2: day 7 — value/insight angle
      → Step 3: day 14 — low-pressure check-in
    → If step due:
        → Claude Sonnet: generate follow-up (different angle, no link)
        → Create new action: followup_dm, pending_approval
        → User sees it in approval queue
    → After step 3: mark sequence complete, no more follow-ups
```

### Key Data Flows Summary

1. **Signals IN:** Cron → snoowrap/Apify → structural match → (Claude classify) → Supabase → Realtime push → dashboard intent feed
2. **Actions OUT:** User approval → DB row update → Supabase Webhook → Vercel Function → GoLogin → Playwright CDP → Haiku CU → execute
3. **Replies IN:** Cron → GoLogin → Playwright CDP → Haiku CU → inbox scan → Supabase update → Realtime push + email
4. **Public feed:** Supabase polling (10s) on is_public=true signals → /live page

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-10 users | Everything on Vercel + Supabase Pro. No changes needed. Monolith is correct. |
| 10-100 users | Watch job_logs for p95 action duration. Alert threshold: >50s (Vercel Pro limit = 60s). No structural change yet. |
| ~100 users | If action worker hits 60s timeout: migrate /api/webhooks/actions to Railway worker (~1 day of work). Monitor and reply crons stay on Vercel. DB webhook now points to Railway URL. |
| 100-1000 users | Apify: consider subscription over pay-per-use. GoLogin: review concurrent profile limits per plan. Supabase: add read replica for analytics queries. |
| 1000+ users | Separate monitoring into per-user queues (pg_cron or Supabase Edge Functions as queue workers). Consider partitioning intent_signals and job_logs by created_at. |

### Scaling Priorities

1. **First bottleneck:** Vercel Function 60s timeout on GoLogin + Computer Use action chain. Fix: Railway migration for action worker only (monitoring stays on Vercel).
2. **Second bottleneck:** GoLogin Cloud concurrent session limits. Fix: queue actions per account, enforce one concurrent session per profile (SKIP LOCKED already handles this).
3. **Third bottleneck:** Apify cost at volume. Fix: move to subscription plan at 50+ users; or implement direct LinkedIn scraper with custom GoLogin profile (no Apify dependency).

## Anti-Patterns

### Anti-Pattern 1: Polling for Action Execution

**What people do:** Run a cron every minute to check `WHERE status = 'approved'` and execute pending actions.

**Why it's wrong:** At 100 users with sparse approvals, 99% of invocations are empty. On Vercel, each cold-start wastes ~200ms. At scale, this creates thundering herd when many approvals come in simultaneously (all crons race to claim work), requiring separate locking logic anyway.

**Do this instead:** Supabase Database Webhook fires exactly when an action becomes approved. Zero idle invocations. The webhook is the trigger; `FOR UPDATE SKIP LOCKED` handles concurrency.

### Anti-Pattern 2: Running AI Classification on Every Post

**What people do:** Send all crawled posts through Claude for classification.

**Why it's wrong:** At 1,000 posts/day across a user base, full Claude classification costs ~$5-10/user/month just for monitoring. Structural matching (keyword regex + competitor mentions) handles 80-90% of cases cheaply and reliably.

**Do this instead:** Two-stage pipeline: structural match first (zero cost), Claude only on ambiguous remainders (~10-20%). Claude classification cost drops to ~$1-2/user/month.

### Anti-Pattern 3: Storing Social Credentials

**What people do:** Store username + password in the database to log into social accounts.

**Why it's wrong:** Credential breach = complete account takeover + legal liability + loss of all connected social accounts simultaneously.

**Do this instead:** GoLogin manages session cookies inside encrypted browser profiles. repco never sees or stores credentials. GoLogin profiles isolate each social account independently — a breach of one profile does not expose others.

### Anti-Pattern 4: Using Playwright CSS/XPath Selectors for Social UI

**What people do:** Record click paths via Playwright selectors targeting DOM elements (button[aria-label="Send message"]).

**Why it's wrong:** Social platforms redesign UI constantly. Selectors break silently — your automation either throws an error or clicks the wrong thing. Selector patterns are also fingerprinted by anti-bot systems.

**Do this instead:** Claude Haiku Computer Use navigates by visual understanding. It reads the screen like a human, adapts to layout changes automatically, and produces humanlike mouse movement patterns that are indistinguishable from real users.

### Anti-Pattern 5: Using Supabase Realtime for the Public /live Page

**What people do:** Push Supabase Realtime WebSocket connections to all /live visitors.

**Why it's wrong:** Supabase has concurrent Realtime connection limits. A viral moment (1,000 visitors) = 1,000 WebSocket connections hitting the limit instantly.

**Do this instead:** Poll `/api/live` every 10 seconds with SWR. The endpoint reads from Supabase normally. CDN caches the response. Load grows linearly and gracefully; no connection limits hit.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| snoowrap (Reddit API) | Node.js library — app-level API credentials, not per-user | Rate limit: 60 requests/min. Shared across all users — monitor carefully at scale. |
| Apify | REST API — trigger actor, poll for results | Job-based; cache results to avoid re-scraping same posts. Alert on >20% failure rate. |
| GoLogin Cloud | REST API — create/open/close profiles; returns CDP WebSocket URL | Session limits depend on GoLogin plan — verify before launch. Treat as critical dependency; adapter pattern for future migration. |
| Claude API (Haiku + Sonnet) | Anthropic SDK — direct API calls | Prompt caching on Haiku CU reduces cost ~60-80% on repeated navigation flows. Two models: Haiku for CU (fast/cheap), Sonnet for intelligence. |
| Stripe | Webhooks to /api/webhooks/stripe + Stripe SDK for checkout | Verify webhook signatures. Credit deduction on action completion, not on approval. |
| Resend | REST API — transactional email + daily digest | Daily digest scheduled via Vercel Cron (per-user at 8:00 user timezone). |
| Supabase Auth | Supabase JS SDK — Google OAuth + email magic link | RLS policies enforce data isolation. All API routes validate session server-side. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Monitoring cron → Signal processing | In-process function calls (same Vercel invocation) | Keep monitoring + classification in one function to minimize cold starts |
| Signal processing → Supabase | Direct Supabase client write | Write immediately after classification; Realtime fires automatically |
| Supabase → Action worker | Database Webhook (HTTP POST) | Asynchronous, at-least-once; worker must be idempotent |
| Action worker → Browser layer | GoLogin API + Playwright CDP (network) | Browser is remote; treat as unreliable — 30s timeout on GoLogin open, retry once on transient errors |
| Browser layer → Claude Haiku CU | Anthropic API (HTTP) | Each CU step is ~$0.005 with caching; budget 5-8 steps per action |
| Next.js client → Supabase | Supabase Realtime (authenticated) for dashboard; polling for /live | Never expose service_role key to browser — use anon key + RLS |
| Credit system → All layers | Isolated lib/credits/deduct.ts — called explicitly at end of each billable operation | Credits deducted only on success (completed actions); failed/rejected do not consume credits |

## Build Order Implications

Component dependencies determine the correct phase sequence:

```
Phase 1 — Foundation (unblocks everything)
  Supabase schema + RLS + Auth
  Next.js shell on Vercel + Sentry + Axiom
  Basic dashboard frame (no live data yet)

Phase 2 — Monitoring Pipeline (first value loop)
  snoowrap Reddit integration + structural match
  Signal processor + deduplication
  Supabase Realtime → intent feed on dashboard
  /live page (polling) + live_stats
  [Prerequisite: Phase 1 schema]

Phase 3 — Action Engine (core product loop)
  GoLogin client + Playwright CDP wrapper
  Claude Haiku CU templates (like, follow, DM, reply)
  Supabase DB Webhook → /api/webhooks/actions
  FOR UPDATE SKIP LOCKED concurrency
  Approval queue UI
  job_logs + zombie recovery cron
  [Prerequisite: Phase 1 + Phase 2 signals to act on]

Phase 4 — Intelligence + Sequences (quality of output)
  Claude Sonnet DM generation + quality control
  Follow-up sequence scheduler (hourly cron)
  Reply detection (2h cron via GoLogin + Haiku CU)
  Anti-ban behavioral noise + warmup protocol
  [Prerequisite: Phase 3 action engine working]

Phase 5 — Billing + Growth (monetization)
  Stripe subscriptions + credit packs
  Credit economy (3-layer deduction)
  Prospect pipeline kanban + CSV export
  Daily email digest (Resend)
  Weekly results card (shareable image)
  "Scan my product" landing hook
  Onboarding 3-question flow
  [Prerequisite: Phase 1-4 core loop proven in beta]

Phase 6 — LinkedIn + Account Health (coverage + safety)
  Apify LinkedIn integration
  Account health monitoring + warmup scheduler
  Warmup protocol UI
  [Can overlap with Phase 4-5 after Reddit proven]
```

**Critical path:** Schema → Reddit monitoring → Action engine. Everything else is additive. Do not build the action engine before monitoring provides real signals to act on — you need real data to test CU navigation flows.

## Sources

- repco.ai PRD v3.0 (primary specification — HIGH confidence)
- Supabase Database Webhooks documentation: https://supabase.com/docs/guides/database/webhooks (HIGH confidence)
- GoLogin Cloud API + CDP integration: https://gologin.com/docs/llms-full.txt (HIGH confidence)
- Playwright + Claude Computer Use integration: https://github.com/invariantlabs-ai/playwright-computer-use (MEDIUM confidence)
- Human-in-the-loop agent patterns: https://www.agentpatterns.tech/en/architecture/human-in-the-loop-architecture (MEDIUM confidence)
- Intent detection pipeline architecture: https://towardsdatascience.com/building-a-unified-intent-recognition-engine/ (MEDIUM confidence)
- Makerkit Supabase DB Webhook pattern: https://makerkit.dev/docs/next-supabase-turbo/development/database-webhooks (MEDIUM confidence)
- Social media scraping pipeline design: https://groupbwt.com/blog/web-scraping-in-data-science/ (MEDIUM confidence)

---
*Architecture research for: AI social intent detection + automated outreach (repco.ai)*
*Researched: 2026-04-16*
