---
phase: 05-billing-onboarding-growth
plan: 03
subsystem: billing
tags: [stripe, checkout, webhook, subscription, credit-pack, billing-ui]

requires:
  - phase: 01-foundation
    provides: users table billing columns (stripe_customer_id, billing_period, subscription_active, credits_balance, trial_ends_at), credit_transactions, service-role client pattern, logger
  - phase: 05-billing-onboarding-growth-01
    provides: PRICING_PLANS, CREDIT_PACKS, billing types, add_credits RPC
provides:
  - createCheckoutSession server action (subscriptions + credit packs)
  - startFreeTrial server action (3-day trial, 500 credits, no card)
  - cancelSubscription + getInvoices server actions
  - /api/stripe/webhook route (raw-body signature verify, 4 event types)
  - PlanCard / CreditPackCard / BillingHistory components
  - BillingPageClient (Stripe redirect, cancel AlertDialog, toast)
  - /billing page (2-col responsive, Tabs: Plans / Packs / History)
affects: [05-04-credit-burn-cron, 05-07-billing-ui (deferred follow-ups), dashboard sidebar credit balance]

tech-stack:
  added:
    - stripe@22.0.2
    - "@stripe/stripe-js@9.2.0"
    - shadcn/ui tabs primitive
    - shadcn/ui table primitive
  patterns:
    - "Stripe Checkout (hosted) via server action + redirect() — zero PCI scope"
    - "Raw request.text() + stripe.webhooks.constructEvent for signature-verified webhook"
    - "Credit-pack credits embedded in Checkout Session metadata so webhook can apply them atomically via add_credits RPC"
    - "Stripe v22 breaking change: current_period_end moved to SubscriptionItem — read via subscription.items.data[0].current_period_end"
    - "BillingPageClient catches NEXT_REDIRECT thrown by server-action redirect so toasts do not show on successful redirects"

key-files:
  created:
    - src/features/billing/actions/checkout.ts
    - src/features/billing/actions/manage-subscription.ts
    - src/app/api/stripe/webhook/route.ts
    - src/features/billing/components/plan-card.tsx
    - src/features/billing/components/credit-pack-card.tsx
    - src/features/billing/components/billing-history.tsx
    - src/features/billing/components/billing-page-client.tsx
    - src/app/(app)/billing/page.tsx
    - src/components/ui/tabs.tsx
    - src/components/ui/table.tsx
  modified: []

key-decisions:
  - "BillingPageClient wraps all client interactions so the server page stays RSC; one component serves three views (plans / packs / cancel) to share toast + transition state"
  - "Credit pack metadata stored on Checkout Session (credit_pack_credits + credit_pack_name) rather than deriving from price ID in webhook — keeps webhook logic simple and explicit"
  - "Subscription activation webhook re-retrieves the Subscription to get the price ID (Checkout Session alone does not always expose it) and maps back to billing_period via PRICING_PLANS"
  - "Stripe v22 current_period_end relocation handled as single-line adapter (subscription.items.data[0].current_period_end) — no shared helper yet since only one caller"
  - "Trial reuses the existing users.trial_ends_at + users.credits_balance columns (set from Phase 01 + 05-01) so no new migration needed"
  - "subscription.active webhook status check treats both 'active' and 'trialing' as active (keeps account live during Stripe-managed trials if we ever enable them)"

requirements-completed: [BILL-01, BILL-02, BILL-03]

duration: 7min
completed: 2026-04-20
---

# Phase 05 Plan 03: Stripe Billing Integration Summary

**Hosted Stripe Checkout for subscriptions + credit packs, raw-body signature-verified webhook (4 event types), free-trial server action, and /billing management page with plans / packs / history tabs, trial status, credit balance, and cancel-via-AlertDialog.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-20T11:49:34Z
- **Completed:** 2026-04-20T11:57:00Z
- **Tasks:** 2
- **Files created:** 10

## Accomplishments

- Stripe Checkout flow for subscriptions and one-time credit pack purchases (`createCheckoutSession`)
- Free-trial server action (`startFreeTrial`): 3-day trial, 500 credits, no credit card, idempotent
- Subscription management: cancel-at-period-end (`cancelSubscription`) + invoice listing (`getInvoices`)
- Webhook handler at `/api/stripe/webhook`: raw-body HMAC verification, 4 event types, service-role writes, structured logging, logger flush before response
- `/billing` page: 2-column responsive layout (2/3 tabs, 1/3 credit balance), Plans/Credit Packs/History tabs, trial banner, cancel AlertDialog with PRD copy
- shadcn tabs + table primitives added (first use in project)
- `pnpm typecheck` clean
- Webhook path already exempt in middleware (`/api/stripe/webhook` in `PUBLIC_ROUTES`) — no middleware change needed

## Task Commits

1. **Task 1: Stripe checkout, subscription mgmt, webhook** — `3fe204d` (feat)
2. **Task 2: /billing page with plans, credit packs, history** — `25acc06` (feat)
3. **Follow-up: Plan card savings-badge clarification** — `fe8ac9e` (docs)

## Files Created/Modified

- `src/features/billing/actions/checkout.ts` — `createCheckoutSession` (subscription + payment modes, customer get-or-create, pack metadata) + `startFreeTrial`
- `src/features/billing/actions/manage-subscription.ts` — `cancelSubscription` (cancel_at_period_end, v22 period-end read) + `getInvoices` (20 most-recent, PDF URLs)
- `src/app/api/stripe/webhook/route.ts` — `request.text()` body, `stripe.webhooks.constructEvent`, handlers for `checkout.session.completed` (sub + pack), `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- `src/features/billing/components/plan-card.tsx` — period-specific price label, Save 29%/49% success-green badge, Subscribe / Current plan button
- `src/features/billing/components/credit-pack-card.tsx` — Geist Mono credit count, per-credit cost, Buy credits CTA
- `src/features/billing/components/billing-history.tsx` — shadcn Table, status badges, PDF links, empty state
- `src/features/billing/components/billing-page-client.tsx` — period toggle (default annual), checkout redirect + NEXT_REDIRECT guard, cancel AlertDialog with PRD copy, success/canceled toasts
- `src/app/(app)/billing/page.tsx` — RSC query (profile + signals + accounts + invoices), daily burn, projected runway, trial banner logic
- `src/components/ui/tabs.tsx` / `src/components/ui/table.tsx` — shadcn primitives (first use in project)

## Decisions Made

- **Metadata-driven pack credits**: Credit-pack credit amount is looked up in the server action (from `CREDIT_PACKS` by price ID) and written to Session metadata. Webhook reads metadata directly — no need to reverse-lookup or query Stripe Product data. Simpler + resilient to pack catalog changes.
- **v22 SubscriptionItem relocation**: `Subscription.current_period_end` was removed in Stripe 22. Accessed via `subscription.items.data[0].current_period_end` in `cancelSubscription`. Single call site — no shared helper until a second caller appears.
- **Single client component for three views**: `BillingPageClient` takes a `view` prop (`plans | packs | cancel`). Keeps transition state, toasts, and Stripe handlers in one place; avoids prop-drilling through a server-component tree.
- **NEXT_REDIRECT guard in transitions**: Server-action `redirect()` throws `NEXT_REDIRECT` in Next.js. `startTransition` callbacks catch the error and filter that specific message so no false "checkout failed" toast appears when Stripe redirect succeeds.
- **`trialing` counts as active in webhook**: `customer.subscription.updated` sets `subscription_active = true` for both `active` and `trialing` — future-proof if Stripe-managed trials are ever layered on top of our own free trial.

## Deviations from Plan

None — plan executed exactly as written. All task acceptance criteria satisfied:

- `checkout.ts` contains `"use server"`, `stripe.checkout.sessions.create`, `stripe.customers.create`, `startFreeTrial`, `trial_ends_at`
- `manage-subscription.ts` exports `cancelSubscription` and `getInvoices`
- Webhook uses `request.text()` (not `request.json()`), `stripe.webhooks.constructEvent`, handles all 4 events, creates service-role client with `SUPABASE_SERVICE_ROLE_KEY`
- `/billing` page imports `Tabs`, queries users table, 2-col `lg:grid-cols` layout
- `plan-card.tsx` renders "$49/mo", "Save 29%", "Save 49%"
- `credit-pack-card.tsx` renders `pack.name` + `pack.credits`
- `billing-history.tsx` uses `Table` from `@/components/ui/table`
- Cancel AlertDialog copy: "Your plan stays active until the end of the billing period. You will not be charged again."
- Trial badge: "Trial · {n} days left"
- `pnpm typecheck` passes

### Auto-fixed Issues

None — no deviations required.

## Issues Encountered

- **Transient sibling-agent type error** (noted during Task 2 typecheck): `src/app/(app)/page.tsx` briefly referenced a `creditBalance` prop on `ApprovalQueue` that did not yet exist. Those files are claimed by sibling 05-04 per the parallel-execution notice, so left untouched. The error resolved itself once the sibling committed their matching `approval-queue.tsx` update. Final `pnpm typecheck` clean.

## User Setup Required

All eight Stripe env vars listed in the plan's `user_setup` block:

1. `STRIPE_SECRET_KEY` — Stripe Dashboard → Developers → API keys
2. `STRIPE_WEBHOOK_SECRET` — created after registering the webhook endpoint
3. `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_QUARTERLY` / `STRIPE_PRICE_ANNUAL` — subscription product prices ($49 / $105q / $300y)
4. `STRIPE_PRICE_PACK_STARTER` / `_GROWTH` / `_SCALE` / `_AGENCY` — one-time pack prices ($29 / $59 / $149 / $399)

Dashboard config:

- Create 3 subscription products + 4 one-time credit-pack products
- Register webhook endpoint at `{SITE_URL}/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

Note: migration 00010 (from 05-01) must be applied to Supabase so `add_credits` RPC is callable from the webhook. (Same note as 05-01 summary.)

## Next Phase Readiness

- Credit burn cron (05-04) can call `deduct_credits` RPC (from 05-01); webhook already handles `add_credits` for pack purchases
- `/live` page (05-06) and prospect pipeline (05-05) both consume nothing from this plan — parallel-safe
- Any future sidebar credit-balance component can link to `/billing` (route is now live)
- Billing UI plan 05-07 (if kept) will refine visuals; functional flow is already working

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*

## Self-Check: PASSED

- All 10 listed files exist on disk
- All 3 task commits present in git log (3fe204d, 25acc06, fe8ac9e)
- `pnpm typecheck` clean
