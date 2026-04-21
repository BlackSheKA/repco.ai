# Phase 5: Billing + Onboarding + Growth - Research

**Researched:** 2026-04-18
**Domain:** Stripe billing, onboarding UX, kanban drag-and-drop, OG image generation, public pages
**Confidence:** HIGH

## Summary

Phase 5 is the largest phase in the project, spanning five sub-plans across four distinct domains: onboarding, billing/credits, prospect pipeline, and PLG growth features. The core technical challenges are Stripe integration (webhooks, subscriptions, credit packs), atomic credit deduction SQL, drag-and-drop kanban with @dnd-kit, and PNG image generation for shareable results cards via next/og (Satori).

The existing codebase provides strong patterns to follow: feature module structure, server actions for mutations, Supabase Realtime for live updates, shadcn/ui components, and the Vercel Cron + CRON_SECRET pattern for scheduled jobs. The database schema already includes all necessary tables (users with billing fields, credit_transactions, prospects, product_profiles, live_stats) and all 12 ENUM types.

**Primary recommendation:** Use Stripe Checkout (hosted) for zero PCI scope, Route Handlers for webhooks with raw body signature verification, @dnd-kit/react for kanban, and next/og ImageResponse for results card generation. All credit operations must use atomic SQL (UPDATE ... SET credits_balance = credits_balance - $cost WHERE credits_balance >= $cost RETURNING).

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- 3-question onboarding: product description, target customer, competitors (optional skip on competitors)
- One question per screen -- clean, focused, minimal
- Account connection (GoLogin) happens AFTER onboarding, on the dashboard -- not during the onboarding wizard
- After 3 questions: simulated scanning animation (typing animation "Scanning r/SaaS..." for 3-5s), then reveal real Reddit results all at once
- Zero results handling: encouraging message + suggested broader keywords
- After onboarding lands on dashboard: persistent checklist card showing setup progress. Dismissible after all items complete
- Claude auto-generates keywords + subreddits from product description -- user can edit later in Settings
- Stripe Checkout (hosted page) for all payment flows -- subscriptions and credit packs. Zero PCI scope
- Custom /billing management page -- NOT Stripe Customer Portal
- Credit balance displayed in TWO locations: sidebar footer (always visible) + dashboard credit card (detailed breakdown)
- Upgrade prompts: BOTH banner + contextual (at <100 credits orange sidebar, at <50 warning banner, contextual at point of action)
- Trial: 3-day free, no credit card, 500 credits, full product access
- Pricing: single plan with 3 billing periods (monthly $49, quarterly $35/mo, annual $25/mo)
- Credit packs: Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399
- Dedicated /prospects route in sidebar nav (separate from dashboard)
- Kanban columns: detected, engaged, contacted, replied, converted, rejected
- Drag-and-drop between columns + "Move to..." dropdown for keyboard/mobile
- Prospect detail view: full page at /prospects/[id] (not a drawer)
- CSV export: button on kanban page, exports all prospects (or filtered view)
- Revenue counter: manual avg deal value input in Settings. Revenue = conversions x avg deal value
- /live page: public, no auth required, polling every 10s
- Full anonymization on /live: hide author handles, subreddit names, post excerpts
- "Scan my product" landing hook: two inputs (product description + optional competitor)
- Weekly results card: auto-generated 1200x630 PNG with stats
- Results card sharing: download image + "Share to X" and "Share to LinkedIn" buttons

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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ONBR-01 | Product description -> auto-generated keywords + subreddits | Anthropic SDK pattern (already in project), Claude prompt for keyword extraction |
| ONBR-02 | Target customer description | Simple form input, stored in product_profiles |
| ONBR-03 | Optional competitor naming | Form input with skip option, stored in product_profiles.competitors |
| ONBR-04 | Connect Reddit via GoLogin profile session | Existing GoLogin integration from Phase 3, post-onboarding checklist item |
| ONBR-05 | Connect LinkedIn via GoLogin profile session | Same GoLogin pattern, Phase 6 scope for LinkedIn monitoring |
| ONBR-06 | Live scanning animation with real signals | Simulated typing animation + real snoowrap API call for initial results |
| ONBR-07 | Redirect to dashboard with first intent signals | Server action redirect after onboarding completion |
| BILL-01 | 3-day free trial, no card, 500 credits | Users table already has trial_ends_at, credits_balance defaults to 500 |
| BILL-02 | Subscription via Stripe Checkout (3 billing periods) | Stripe Checkout hosted mode, stripe npm package v22 |
| BILL-03 | Credit packs via Stripe Checkout | One-time payment mode in Stripe Checkout Sessions |
| BILL-04 | Monitoring credit deduction daily | Vercel Cron job, atomic SQL on credit_transactions + users.credits_balance |
| BILL-05 | Account credit deduction daily | Same cron, counts social_accounts beyond 2 included |
| BILL-06 | Action credit deduction on completion | Inline atomic deduction in action completion handler |
| BILL-07 | Atomic SQL for credit deduction | PostgreSQL UPDATE ... WHERE credits_balance >= cost RETURNING pattern |
| BILL-08 | Dashboard credit burn display | Server component query + client display with real-time Supabase subscription |
| BILL-09 | Contextual upgrade prompts | Client-side credit balance checks at action approval points |
| GROW-01 | /live public page with polling | Public route outside (app) group, setInterval 10s fetch |
| GROW-02 | /live aggregate stats | Query live_stats table (already exists) |
| GROW-03 | "Scan my product" hook | API route with snoowrap search + Claude classification, rate limited |
| GROW-04 | Weekly shareable results card | next/og ImageResponse for 1200x630 PNG generation |
| GROW-05 | Daily email digest | Vercel Cron + Resend (from Phase 4) |
| GROW-06 | Digest content (top signals, pending DMs) | Supabase query for user's daily stats |
| PRSP-01 | Kanban board with 6 stages | @dnd-kit/react for drag-and-drop, shadcn/ui cards |
| PRSP-02 | Prospect detail view | Full page at /prospects/[id] with all prospect data |
| PRSP-03 | Notes and tags | Inline editable fields, server actions for persistence |
| PRSP-04 | CSV export | Server action generating CSV from Supabase query |
| PRSP-05 | Manual stage moves | Drag-and-drop + "Move to..." select dropdown |
| PRSP-06 | Dashboard prospect stats | Server component query for counts by pipeline_status |
| DASH-04 | Revenue counter on dashboard | conversions count x avg_deal_value from user settings |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe | 22.0.2 | Server-side Stripe API (subscriptions, checkout, webhooks) | Official Node.js SDK, pinned API version 2026-03-25.dahlia |
| @stripe/stripe-js | 9.2.0 | Client-side Stripe.js (redirect to Checkout) | Official client SDK for redirectToCheckout |
| @dnd-kit/react | 0.4.0 | Drag-and-drop kanban board | Modern React 19 compatible, lightweight, accessible |
| next/og (ImageResponse) | built-in | PNG image generation for results cards | Built into Next.js 16, uses Satori + Resvg, zero extra deps |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| resend | 6.12.0 | Email sending (daily digest, results card) | Should be available from Phase 4 |
| papaparse | 5.5.3 | CSV generation for prospect export | Handles edge cases (commas in fields, Unicode) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit/react | @dnd-kit/core + @dnd-kit/sortable | Legacy API (pre-React 19), more boilerplate; @dnd-kit/react is the newer rewrite |
| @dnd-kit/react | pragmatic-drag-and-drop | Atlassian's lib, also React 19 compatible, but less community examples for kanban |
| papaparse | Manual CSV | Edge cases with escaping commas, quotes, Unicode -- not worth hand-rolling |
| next/og ImageResponse | canvas (node-canvas) | Requires native deps, won't run on Vercel serverless |
| next/og ImageResponse | Puppeteer screenshot | Heavy, slow, overkill for styled cards |

**Installation:**
```bash
pnpm add stripe @stripe/stripe-js @dnd-kit/react papaparse
pnpm add -D @types/papaparse
```

Note: `resend` should already be installed from Phase 4. `next/og` is built into Next.js 16.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── features/
│   ├── onboarding/
│   │   ├── actions/          # Server actions: save answers, generate keywords, run initial scan
│   │   ├── components/       # OnboardingWizard, QuestionScreen, ScanAnimation, ChecklistCard
│   │   └── lib/              # Prompts for keyword generation, types
│   ├── billing/
│   │   ├── actions/          # Server actions: create checkout session, cancel subscription
│   │   ├── components/       # PricingCards, CreditBalance, CreditHistory, UpgradePrompt
│   │   └── lib/              # Stripe helpers, credit calculation, types
│   ├── prospects/
│   │   ├── actions/          # Server actions: update stage, add notes/tags, export CSV
│   │   ├── components/       # KanbanBoard, KanbanColumn, ProspectCard, ProspectDetail
│   │   └── lib/              # Pipeline types, CSV generation
│   └── growth/
│       ├── actions/          # Server actions: scan product
│       ├── components/       # LiveFeed, ScanForm, ResultsCard, ShareButtons
│       └── lib/              # Anonymization helpers, stats queries
├── app/
│   ├── (app)/
│   │   ├── onboarding/       # /onboarding route (protected, first-run only)
│   │   ├── billing/          # /billing route (subscription management)
│   │   ├── prospects/
│   │   │   ├── page.tsx      # Kanban board
│   │   │   └── [id]/
│   │   │       └── page.tsx  # Prospect detail
│   │   └── settings/         # Add avg deal value input
│   ├── (public)/
│   │   └── live/             # /live page (no auth, public)
│   ├── api/
│   │   ├── stripe/
│   │   │   └── webhook/
│   │   │       └── route.ts  # Stripe webhook handler
│   │   ├── scan/
│   │   │   └── route.ts      # "Scan my product" public API
│   │   ├── og/
│   │   │   └── results-card/
│   │   │       └── route.tsx  # Results card image generation
│   │   └── cron/
│   │       ├── credit-burn/
│   │       │   └── route.ts  # Daily monitoring + account credit deduction
│   │       └── digest/
│   │           └── route.ts  # Daily email digest
```

### Pattern 1: Stripe Checkout via Server Action
**What:** Create Stripe Checkout Sessions using server actions, redirect client-side
**When to use:** All subscription and credit pack purchases

```typescript
// src/features/billing/actions/checkout.ts
"use server"

import Stripe from "stripe"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function createCheckoutSession(priceId: string, mode: "subscription" | "payment") {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode,
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/billing?canceled=true`,
    ...(mode === "subscription" && {
      subscription_data: {
        trial_period_days: undefined, // Trial handled at signup, not checkout
      },
    }),
  })

  redirect(session.url!)
}
```

### Pattern 2: Stripe Webhook Handler (Route Handler)
**What:** Receive and verify Stripe webhook events
**When to use:** All async Stripe events (payment success, subscription changes, invoice failures)

```typescript
// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  // CRITICAL: Use request.text() not request.json() for signature verification
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Service role client for admin operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  switch (event.type) {
    case "checkout.session.completed":
      // Handle subscription activation or credit pack purchase
      break
    case "customer.subscription.updated":
      // Handle plan changes, cancellations
      break
    case "customer.subscription.deleted":
      // Handle subscription end
      break
    case "invoice.payment_failed":
      // Handle failed payment
      break
  }

  return NextResponse.json({ received: true })
}
```

### Pattern 3: Atomic Credit Deduction
**What:** Deduct credits with race-condition safety using PostgreSQL atomic operations
**When to use:** All credit deductions (monitoring burn, account burn, action costs)

```sql
-- Atomic deduction: returns updated row only if sufficient balance
UPDATE users
SET credits_balance = credits_balance - $1,
    updated_at = now()
WHERE id = $2
  AND credits_balance >= $1
RETURNING credits_balance;

-- If no row returned, insufficient credits
```

```typescript
// Supabase RPC function for atomic deduction
// Create as a Supabase migration
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_type credit_type,
  p_description text
) RETURNS integer AS $$
DECLARE
  v_new_balance integer;
BEGIN
  UPDATE users
  SET credits_balance = credits_balance - p_amount,
      updated_at = now()
  WHERE id = p_user_id
    AND credits_balance >= p_amount
  RETURNING credits_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN -1; -- Insufficient credits
  END IF;

  INSERT INTO credit_transactions (user_id, type, amount, description)
  VALUES (p_user_id, p_type, -p_amount, p_description);

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;
```

### Pattern 4: Kanban with @dnd-kit/react
**What:** Drag-and-drop kanban board using the new @dnd-kit/react API
**When to use:** Prospect pipeline board

```typescript
// @dnd-kit/react uses a simpler API than the legacy @dnd-kit/core
// DragDropProvider wraps the board, Draggable and Droppable handle items/columns
// Key: must add "use client" directive since DragDropProvider uses React context
```

### Pattern 5: Results Card Image Generation
**What:** Generate 1200x630 PNG using next/og ImageResponse
**When to use:** Weekly results card, shareable stats

```typescript
// src/app/api/og/results-card/route.tsx
import { ImageResponse } from "next/og"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postsScanned = searchParams.get("scanned") ?? "0"
  const signals = searchParams.get("signals") ?? "0"
  // ... more params

  return new ImageResponse(
    (
      <div style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
        // Only flexbox, limited CSS subset
      }}>
        {/* Card content with stats */}
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
```

### Pattern 6: Public Routes (no auth)
**What:** Routes outside the (app) route group that skip auth middleware
**When to use:** /live page, "Scan my product" API

The middleware already excludes specific paths. For /live:
- Create under `(public)` route group or at app root level
- Update middleware matcher to exclude `/live` and `/api/scan`
- No Supabase auth needed -- use anon key or service role for public data queries

### Anti-Patterns to Avoid
- **Storing Stripe price IDs in client code:** Keep in server-side config or environment variables
- **Using request.json() in webhook handler:** Breaks Stripe signature verification; always use request.text()
- **Deducting credits with separate read-then-write:** Race condition; always use atomic SQL
- **Polling with useEffect + fetch for kanban:** Use Supabase Realtime for prospect status changes instead
- **Rendering full HTML for results card:** ImageResponse only supports flexbox + limited CSS; no grid, no complex layouts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment processing | Custom payment form | Stripe Checkout (hosted) | PCI compliance, fraud detection, 3DS |
| CSV generation | String concatenation | papaparse | Commas in fields, Unicode, proper escaping |
| Image generation | node-canvas or puppeteer | next/og ImageResponse | Runs on Vercel serverless, cached at CDN |
| Drag-and-drop | Custom mouse/touch event handlers | @dnd-kit/react | Accessibility (keyboard, screen readers), touch support |
| Credit deduction | SELECT then UPDATE | PostgreSQL atomic UPDATE...RETURNING | Race conditions under concurrent requests |
| Webhook signature verification | Custom HMAC | stripe.webhooks.constructEvent | Timing-safe comparison, replay protection |
| Email HTML | Template strings | React Email (via Resend) | Consistent rendering across email clients |

**Key insight:** Every hand-rolled solution in this phase has a well-tested library alternative. The biggest risk is credit deduction race conditions -- use atomic SQL, not application-level locks.

## Common Pitfalls

### Pitfall 1: Stripe Webhook Body Parsing
**What goes wrong:** Webhook signature verification fails with "No signatures found matching the expected signature for payload"
**Why it happens:** Next.js App Router automatically parses request body as JSON. Stripe needs raw text for HMAC verification.
**How to avoid:** Always use `await request.text()` in the webhook route handler, never `await request.json()`
**Warning signs:** 400 errors from webhook endpoint in Stripe dashboard

### Pitfall 2: Credit Balance Race Conditions
**What goes wrong:** Two concurrent actions both check balance >= cost, both pass, user goes negative
**Why it happens:** Read-then-write pattern with no locking
**How to avoid:** Single atomic UPDATE statement with WHERE credits_balance >= cost, or use a PostgreSQL function
**Warning signs:** Negative credit balances in users table

### Pitfall 3: Trial Expiry Without Grace Period
**What goes wrong:** User's trial expires mid-session, actions fail immediately
**Why it happens:** No grace period or warning before hard cutoff
**How to avoid:** Check trial_ends_at on each request, show warning 24h before expiry, 24h grace period after expiry
**Warning signs:** Support tickets from users who "suddenly lost access"

### Pitfall 4: Stripe Customer ID Duplication
**What goes wrong:** Multiple Stripe customers created for the same user
**Why it happens:** Race condition between checking for existing customer and creating new one
**How to avoid:** Use idempotency keys or check-then-create in a single server action with early return
**Warning signs:** Multiple Stripe customers with same email

### Pitfall 5: /live Page Overwhelming Public API
**What goes wrong:** Public /live page with 10s polling creates high DB load
**Why it happens:** No caching, every poll hits Supabase directly
**How to avoid:** Cache live_stats at the API/edge level with 10s stale-while-revalidate. Use Next.js fetch cache or Vercel Edge Config
**Warning signs:** High Supabase connection count, slow /live page loads

### Pitfall 6: ImageResponse CSS Limitations
**What goes wrong:** Results card renders incorrectly or throws errors
**Why it happens:** Satori only supports flexbox (display: flex) and a CSS subset. No grid, no position: absolute (except on root), limited font support
**How to avoid:** Design card using only flexbox. Test with simple layouts first. Load custom fonts via fetch in the route handler
**Warning signs:** Blank images, layout completely wrong

### Pitfall 7: Onboarding State Persistence
**What goes wrong:** User refreshes mid-onboarding, loses progress
**Why it happens:** Onboarding state only in React state, not persisted
**How to avoid:** Save each answer to product_profiles immediately via server action on "Next" click. Track onboarding_completed flag on users table
**Warning signs:** Duplicate partial product profiles, users stuck on onboarding

### Pitfall 8: Middleware Auth Bypass for Public Routes
**What goes wrong:** /live page redirects to /login, or /api/scan requires auth
**Why it happens:** Middleware intercepts all routes and redirects unauthenticated users
**How to avoid:** Update middleware to exclude /live, /api/scan, /api/stripe/webhook, /api/og/* from auth checks
**Warning signs:** 302 redirects to /login from public endpoints

## Code Examples

### Onboarding Keyword Generation with Claude

```typescript
// src/features/onboarding/actions/generate-keywords.ts
"use server"

import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"

export async function generateKeywords(productDescription: string, targetCustomer: string, competitors: string[]) {
  const client = new Anthropic() // Per-call instantiation for serverless

  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Given this product: "${productDescription}"
Target customer: "${targetCustomer}"
Competitors: ${competitors.length ? competitors.join(", ") : "none specified"}

Generate:
1. 5-10 Reddit search keywords (short phrases people would use when looking for this type of product)
2. 3-5 relevant subreddits where these discussions happen
3. 2-3 competitor-mention keywords (e.g., "alternative to [competitor]")

Return as JSON: { "keywords": string[], "subreddits": string[], "competitor_keywords": string[] }`
    }],
  })

  // Parse and save to product_profiles + monitoring_signals
  const supabase = await createClient()
  // ... save results
}
```

### Credit Balance Sidebar Component

```typescript
// src/features/billing/components/credit-balance.tsx
"use client"

import { cn } from "@/lib/utils"
import Link from "next/link"

interface CreditBalanceProps {
  balance: number
  dailyBurn: number
}

export function CreditBalance({ balance, dailyBurn }: CreditBalanceProps) {
  return (
    <Link
      href="/billing"
      className={cn(
        "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
        balance < 50 && "text-red-500",
        balance >= 50 && balance < 100 && "text-orange-500",
        balance >= 100 && "text-muted-foreground"
      )}
    >
      {balance.toLocaleString()} credits
      {dailyBurn > 0 && (
        <span className="ml-1 opacity-70">
          &middot; -{dailyBurn}/day
        </span>
      )}
    </Link>
  )
}
```

### CSV Export Server Action

```typescript
// src/features/prospects/actions/export-csv.ts
"use server"

import Papa from "papaparse"
import { createClient } from "@/lib/supabase/server"

export async function exportProspectsCSV() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { data: prospects } = await supabase
    .from("prospects")
    .select("handle, platform, pipeline_status, display_name, bio, notes, tags, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  const csv = Papa.unparse(prospects ?? [], {
    header: true,
    columns: ["handle", "platform", "pipeline_status", "display_name", "bio", "notes", "tags", "created_at"],
  })

  return csv
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @dnd-kit/core + sortable | @dnd-kit/react (rewrite) | 2025-2026 | Simpler API, built-in React 19 support |
| @vercel/og package | next/og built-in import | Next.js 14+ | No extra dependency, same Satori engine |
| Stripe Customer Portal | Custom billing page | Common pattern | Full UX control, keeps users in-app |
| stripe.webhooks.constructEvent sync | Same API, async-safe | Stable | Always use request.text() for raw body |

**Deprecated/outdated:**
- react-beautiful-dnd: Deprecated, no React 19 support, do NOT use
- @vercel/og standalone package: Still works but prefer next/og import for Next.js projects
- Stripe legacy Charges API: Use Checkout Sessions and Payment Intents

## Open Questions

1. **Onboarding completion flag**
   - What we know: Need to track whether user has completed onboarding
   - What's unclear: Whether to add an `onboarding_completed` boolean to users table or infer from product_profiles existence
   - Recommendation: Add `onboarding_completed_at timestamptz` to users table via migration -- explicit is better than inferred

2. **Trial expiry cron vs middleware check**
   - What we know: trial_ends_at already exists on users table
   - What's unclear: Whether to check trial expiry in middleware (blocks all routes) or in individual pages/actions
   - Recommendation: Check in middleware for route-level gating, show trial expiry banner in dashboard via server component

3. **Avg deal value storage**
   - What we know: Revenue counter needs user-configured avg deal value
   - What's unclear: Where to store it -- users table column or product_profiles
   - Recommendation: Add `avg_deal_value integer` to users table (it's a billing/revenue concept, not product-specific)

4. **"Scan my product" rate limiting**
   - What we know: Public API endpoint that calls snoowrap + Claude, costs real API credits
   - What's unclear: How aggressively to rate limit
   - Recommendation: IP-based rate limiting (3 scans per IP per hour) via Vercel Edge Config or in-memory Map in the route handler. Consider Upstash Redis if needed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | vitest.config.ts (exists, basic setup with path aliases) |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-07 | Atomic credit deduction (no negative balance) | unit | `pnpm vitest run src/features/billing/lib/credits.test.ts -x` | No - Wave 0 |
| BILL-04 | Monitoring credit burn calculation | unit | `pnpm vitest run src/features/billing/lib/credit-burn.test.ts -x` | No - Wave 0 |
| BILL-05 | Account credit burn calculation | unit | `pnpm vitest run src/features/billing/lib/credit-burn.test.ts -x` | No - Wave 0 |
| BILL-06 | Action credit cost mapping | unit | `pnpm vitest run src/features/billing/lib/credit-costs.test.ts -x` | No - Wave 0 |
| ONBR-01 | Keyword generation from product description | unit | `pnpm vitest run src/features/onboarding/lib/keywords.test.ts -x` | No - Wave 0 |
| PRSP-04 | CSV export format correctness | unit | `pnpm vitest run src/features/prospects/lib/csv-export.test.ts -x` | No - Wave 0 |
| PRSP-05 | Pipeline stage transition validation | unit | `pnpm vitest run src/features/prospects/lib/pipeline.test.ts -x` | No - Wave 0 |
| GROW-03 | Scan product API response format | integration | `pnpm vitest run src/features/growth/lib/scan.test.ts -x` | No - Wave 0 |
| BILL-02 | Stripe checkout session creation | manual-only | Manual: create test subscription in Stripe test mode | N/A |
| BILL-09 | Upgrade prompts at credit thresholds | manual-only | Manual: verify UI at balance < 100, < 50 | N/A |
| GROW-01 | /live page polling | manual-only | Manual: verify 10s polling in browser dev tools | N/A |
| GROW-04 | Results card image generation | manual-only | Manual: verify /api/og/results-card renders correct PNG | N/A |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run && pnpm typecheck`
- **Phase gate:** Full suite green + typecheck before /gsd:verify-work

### Wave 0 Gaps
- [ ] `src/features/billing/lib/credits.test.ts` -- covers BILL-07 atomic deduction logic
- [ ] `src/features/billing/lib/credit-burn.test.ts` -- covers BILL-04, BILL-05 daily burn calculation
- [ ] `src/features/billing/lib/credit-costs.test.ts` -- covers BILL-06 action cost mapping
- [ ] `src/features/prospects/lib/csv-export.test.ts` -- covers PRSP-04 CSV format
- [ ] `src/features/prospects/lib/pipeline.test.ts` -- covers PRSP-05 stage transitions
- [ ] Migration: `onboarding_completed_at` and `avg_deal_value` columns on users table

## Sources

### Primary (HIGH confidence)
- package.json -- verified current project dependencies and versions
- supabase/migrations/* -- verified existing schema (users, credit_transactions, prospects, live_stats tables)
- src/middleware.ts -- verified current auth middleware pattern
- src/components/shell/app-sidebar.tsx -- verified current sidebar structure for credit balance integration

### Secondary (MEDIUM confidence)
- [Stripe + Next.js 2026 guide](https://dev.to/sameer_saleem/the-ultimate-guide-to-stripe-nextjs-2026-edition-2f33) -- Server action patterns for Checkout
- [Stripe subscription lifecycle](https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d) -- Webhook handling best practices
- [dnd-kit React 19 issue](https://github.com/clauderic/dnd-kit/issues/1654) -- "use client" requirement for DragDropProvider
- [Vercel OG image docs](https://vercel.com/docs/og-image-generation) -- ImageResponse API and CSS limitations
- [next/og ImageResponse docs](https://nextjs.org/docs/app/api-reference/functions/image-response) -- Built-in Next.js image generation
- npm registry -- verified stripe@22.0.2, @dnd-kit/react@0.4.0, @stripe/stripe-js@9.2.0, papaparse@5.5.3

### Tertiary (LOW confidence)
- @dnd-kit/react kanban examples -- most community examples still use legacy @dnd-kit/core; @dnd-kit/react 0.4.0 API may differ

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified on npm registry with current versions
- Architecture: HIGH -- patterns derived from existing codebase (feature modules, server actions, cron routes)
- Stripe integration: HIGH -- well-documented, stable APIs, multiple 2026 guides confirm patterns
- Kanban/dnd-kit: MEDIUM -- @dnd-kit/react is relatively new (0.4.0), fewer production examples than legacy API
- Image generation: HIGH -- next/og built into Next.js, Satori limitations well-documented
- Pitfalls: HIGH -- common issues well-documented across multiple sources
- Credit deduction: HIGH -- PostgreSQL atomic operations are well-understood pattern

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable domain, Stripe SDK updates frequently but API is stable)
