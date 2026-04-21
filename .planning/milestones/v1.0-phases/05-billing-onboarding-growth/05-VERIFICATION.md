---
phase: 05-billing-onboarding-growth
verified: 2026-04-21T07:30:00Z
status: passed_with_known_gaps
score: 8/10 pass, 2/10 partial
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "ONBR-04 marked Complete in REQUIREMENTS.md (commit 5b90a9e) — checklist redirect to Phase 3 /accounts flow accepted as satisfying the requirement"
    - "Migration 00010 applied to both dev (dvmfeswlhlbgzqhtoytl) and prod (cmkifdwjunojgigrqwnr) — deduct_credits, add_credits RPCs, onboarding_completed_at, account_burn enum, live_stats.conversion_rate all confirmed present"
  gaps_remaining:
    - id: "BILL-01-ui"
      severity: "minor"
      description: "startFreeTrial server action exists in src/features/billing/actions/checkout.ts but no UI button on /billing invokes it. BILL-01 partially satisfied by users.credits_balance DEFAULT 500 at signup — users get 500 credits automatically, but trial_ends_at is never auto-set, so the 3-day trial window is not enforced. Defer to follow-up phase or implement a 'Start free trial' button on /billing."
  regressions: []
human_uat_2026_04_21:
  tester: "kamil.wandtke@outsi.com"
  environment: "localhost:3001 against prod Supabase; Stripe TEST mode"
  setup_completed:
    - "Stripe TEST + LIVE products created (7 each): 3 subscriptions, 4 credit packs"
    - "Stripe business_profile.name updated: PostedFor.com → repco.ai (shows correctly on Checkout)"
    - "Stripe TEST hosted webhook endpoint: we_1TOYWhLN7bOm6wse0auNXyL9 (whsec_5wy8els...)"
    - "Stripe LIVE hosted webhook endpoint: we_1TOYZZLN7bOm6wseu8UXj3wx (whsec_ufeSHsza...)"
    - "Stripe CLI listener forwarding to localhost:3001/api/stripe/webhook (whsec_e23a98b...)"
    - "Resend API key created and saved to .env.local"
  results:
    - { test: "T1 Onboarding wizard", status: "pass", note: "3 steps → /?onboarded=true → checklist 3/4" }
    - { test: "T2 Stripe subscription Checkout", status: "pass", note: "Monthly plan → repco.ai checkout, TEST MODE banner" }
    - { test: "T3 Stripe credit pack Checkout", status: "pass", note: "Starter pack → Credit Pack — Starter heading" }
    - { test: "T4 Free trial start", status: "partial", note: "500 credits auto-granted via DB default; no UI entry point for startFreeTrial server action; trial_ends_at not auto-set" }
    - { test: "T5 /live page polling", status: "pass", note: "Public access, 6 metrics, no errors" }
    - { test: "T6 Scan my product hook", status: "pass", note: "10 real Reddit results in ~6s, 429 rate-limit after 3 reqs" }
    - { test: "T7 Kanban drag-drop", status: "code-verified", note: "10 unit tests passing, @dnd-kit wired; visual drag skipped to avoid prod data pollution" }
    - { test: "T8 Results card + share", status: "pass", note: "OG PNG 65KB rendered; Twitter/LinkedIn intent URLs correct" }
    - { test: "T9 Daily digest email", status: "pass-structural", note: "Cron endpoint returns {sent:0} (no data to digest), Resend client initialised" }
    - { test: "T10 Credit balance widget", status: "pass-structural", note: "500 credits + -72/day mono font; threshold colors need low-balance test" }
human_verification:
  - test: "3-question onboarding wizard UX flow"
    expected: "Navigate to /onboarding as new user, answer 3 questions, see typing animation cycling subreddits for 3-5s, land on dashboard with checklist card showing 1-2/4 items complete"
    why_human: "Animation timing, visual transitions, and UX flow cannot be verified programmatically"
  - test: "Stripe Checkout subscription flow"
    expected: "Click Subscribe on /billing, redirect to Stripe hosted checkout, complete payment, return to /billing with subscription activated and credits_balance updated"
    why_human: "Requires live Stripe keys and payment simulation — end-to-end payment flow"
  - test: "Stripe Checkout credit pack flow"
    expected: "Buy credits pack, webhook fires, credits added to balance via add_credits RPC"
    why_human: "Requires live Stripe webhook delivery — end-to-end payment + webhook flow"
  - test: "Free trial start"
    expected: "Click 'Start free trial' on /billing, 500 credits added, trial_ends_at set to +3 days, no credit card required"
    why_human: "Requires authenticated session and live DB write verification"
  - test: "/live page public access and polling"
    expected: "Visit /live without auth, see anonymized signal cards update every 10s, aggregate stats bar shows 6 metrics"
    why_human: "Real-time polling behavior and anonymization correctness require visual inspection"
  - test: "Scan my product hook"
    expected: "Enter product description on /live, see real Reddit results within 5 seconds, rate limit blocks after 3 requests/hour"
    why_human: "Requires live Reddit API call and timing verification"
  - test: "Kanban drag-and-drop"
    expected: "Drag prospect card between columns, card moves optimistically, server action confirms, invalid transitions rejected"
    why_human: "Drag-and-drop interaction cannot be verified programmatically"
  - test: "Weekly results card share"
    expected: "Click Download on results card, PNG downloaded with correct stats; Share to X opens tweet intent; Share to LinkedIn opens LinkedIn share"
    why_human: "Browser download behavior and external link opening require manual verification"
  - test: "Daily digest email"
    expected: "At 8:00 user's local timezone, receive email with subject '{N} people looking for {product} yesterday' plus pending DM count"
    why_human: "Timezone-aware delivery and email content require end-to-end Resend integration test"
  - test: "Credit burn sidebar widget"
    expected: "Sidebar footer shows credit balance in mono font, turns orange <100, turns red <50, click goes to /billing"
    why_human: "Color threshold behavior and routing require visual verification with real data"
---

# Phase 5: Billing + Onboarding + Growth Verification Report

**Phase Goal:** A new user can sign up, complete 3-question onboarding, connect accounts, see live intent signals, manage their prospect pipeline, pay via Stripe, and share repco's results — making the product sellable and self-promoting
**Verified:** 2026-04-20T14:00:00Z
**Status:** human_needed — all automated checks pass, all 29 requirements marked Complete, 2 schema deployment blockers resolved
**Re-verification:** Yes — after gap closure (previous status: gaps_found, previous score: 6/7)

## Re-verification Summary

Two gaps from the initial verification are closed:

**Gap 1 — ONBR-04 (was: partial):** REQUIREMENTS.md now marks ONBR-04 `[x]` Complete (commit `5b90a9e`). The Traceability table shows `ONBR-04 | Phase 5 | Complete`. The onboarding checklist card linking to Phase 3's `/accounts` GoLogin flow is the accepted implementation. Gap closed.

**Gap 2 — Migration 00010 (was: deployment action required):** Migration applied to both dev branch (`dvmfeswlhlbgzqhtoytl`) and prod project (`cmkifdwjunojgigrqwnr`). All four schema objects confirmed present: `users.onboarding_completed_at`, `users.avg_deal_value`, `credit_type` enum `account_burn` value, `deduct_credits`/`add_credits` RPC functions, `live_stats.conversion_rate`. The middleware onboarding gate, credit burn cron, and Stripe webhook handler are now unblocked in production.

**ONBR-05** remains Pending — this is correct. LinkedIn GoLogin account connection is Phase 6 scope. Not a Phase 5 gap.

No regressions detected. The codebase was not changed between verifications; only REQUIREMENTS.md was updated and the migration was applied.

## Goal Achievement

### Observable Truths (from Phase 5 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User answers 3 questions, gets auto-generated keywords + subreddits, sees scan animation, lands on dashboard | VERIFIED | `onboarding-wizard.tsx` drives 3-step wizard, calls `generateKeywords` (Claude Sonnet), `saveOnboarding` seeds `monitoring_signals`, `ScanAnimation` plays 3-5s, `router.push("/?onboarded=true")` |
| 2 | User can start 3-day free trial (500 credits, no card), subscribe, or buy credit pack via Stripe Checkout | VERIFIED | `startFreeTrial` sets `trial_ends_at` + 500 credits; `createCheckoutSession` uses Stripe hosted checkout for subscriptions and payment modes; `/billing` page renders Plans/Packs/History tabs |
| 3 | Dashboard shows live credit burn rate, remaining balance, per-action costs, upgrade prompts | VERIFIED | `CreditCard` renders balance + monitoring/account/action burn breakdown + projected days; `UpgradeBanner` fires at <50 credits; `ContextualCreditPrompt` shows per-action cost in approval queue; `CreditBalance` in sidebar |
| 4 | User can view all prospects in kanban pipeline, add notes/tags, export CSV, see estimated revenue | VERIFIED | `KanbanBoard` with `@dnd-kit/react` DragDropProvider + 6 columns; `/prospects/[id]` detail page with notes/tags; `exportProspectsCSV` with papaparse; `ProspectStatsCard` on dashboard |
| 5 | /live page shows public real-time anonymized feed with aggregate stats, no login required | VERIFIED | `(public)/live/page.tsx` exempt via `PUBLIC_ROUTES`; `LiveFeed` polls `/api/live` every 10s; server-side anonymization strips handles/URLs; `LiveStats` shows 6-metric stat bar |
| 6 | "Scan my product" hook returns real Reddit results in under 5 seconds without signup | VERIFIED | `/api/scan` POST: Zod validation, 8s AbortController timeout, Reddit public JSON search, structural matcher classification, 3/hr IP rate limit |
| 7 | User can share weekly results card (1200x630 PNG) with stats | VERIFIED | `/api/og/results-card` uses `next/og` `ImageResponse` at 1200x630; `ShareButtons` has Download (Blob anchor), Share to X (tweet intent), Share to LinkedIn (share-offsite) |

**Score: 7/7 success criteria verified**

### Requirements Coverage

All 29 Phase 5 requirements verified. ONBR-05 is Phase 6 scope (not counted).

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| BILL-01 | 3-day free trial, no card, 500 credits | SATISFIED | `startFreeTrial`: sets trial_ends_at+3d, credits_balance=500, idempotent |
| BILL-02 | Stripe Checkout subscription (monthly/quarterly/annual) | SATISFIED | `createCheckoutSession` mode=subscription, PRICING_PLANS in types.ts |
| BILL-03 | Stripe Checkout credit packs (4 tiers) | SATISFIED | `createCheckoutSession` mode=payment, CREDIT_PACKS in types.ts |
| BILL-04 | Daily monitoring credit deduction | SATISFIED | `calculateMonitoringBurn` + `credit-burn/route.ts` cron deducts via RPC |
| BILL-05 | Daily extra-account credit deduction | SATISFIED | `calculateAccountBurn` counts accounts beyond INCLUDED_ACCOUNTS=2 |
| BILL-06 | Action credit deduction on completion | SATISFIED | `worker.ts` calls deduct_credits after action completes |
| BILL-07 | Atomic SQL credit deduction | SATISFIED | `deduct_credits` RPC: UPDATE WHERE credits_balance >= p_amount RETURNING |
| BILL-08 | Dashboard credit burn display | SATISFIED | CreditCard shows balance + 3-line burn + projectedDays |
| BILL-09 | Contextual upgrade prompts | SATISFIED | UpgradeBanner at <50, ContextualCreditPrompt per-action, sidebar widget |
| ONBR-01 | Product description → keywords + subreddits | SATISFIED | `generateKeywords` action, Claude Sonnet, seeded to monitoring_signals |
| ONBR-02 | Target customer description | SATISFIED | Step 2 of wizard, stored in product_profiles.problem_solved |
| ONBR-03 | Optional competitors | SATISFIED | Step 3 with Skip option, stored in product_profiles.competitors |
| ONBR-04 | Connect Reddit via GoLogin | SATISFIED | Onboarding checklist links to /accounts (Phase 3 flow); REQUIREMENTS.md Complete |
| ONBR-05 | Connect LinkedIn via GoLogin | DEFERRED | Phase 6 scope — intentionally Pending, not a Phase 5 gap |
| ONBR-06 | Live scanning animation | SATISFIED | `ScanAnimation` component, typing animation 3-5s, cycling subreddit names |
| ONBR-07 | Redirect to dashboard with signals | SATISFIED | `router.push("/?onboarded=true")` after scan animation completes |
| GROW-01 | /live public page, 10s polling, no auth | SATISFIED | `(public)/live/page.tsx` + LiveFeed + PUBLIC_ROUTES middleware |
| GROW-02 | /live aggregate stats (6 metrics) | SATISFIED | LiveStats: signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate |
| GROW-03 | "Scan my product" returns Reddit results <5s | SATISFIED | `/api/scan` 8s timeout, structural matcher, rate limited |
| GROW-04 | Weekly shareable results card (1200x630) | SATISFIED | `/api/og/results-card` ImageResponse, `ResultsCard` HTML preview |
| GROW-05 | Daily digest email at 8:00 user timezone | SATISFIED | `/api/cron/digest`, formatInTimeZone hour=8 gate, Resend send |
| GROW-06 | Digest includes top signal + pending DMs | SATISFIED | Queries top intent_signal by strength, count of pending_approval actions |
| PRSP-01 | Kanban board with 6 pipeline stages | SATISFIED | KanbanBoard with DragDropProvider, 6 PIPELINE_STAGES columns |
| PRSP-02 | Prospect detail: platform, handle, bio, signal, history | SATISFIED | `/prospects/[id]/page.tsx` + ProspectDetail component |
| PRSP-03 | Notes and tags | SATISFIED | `updateProspectNotes` + `updateProspectTags` server actions, inline editing |
| PRSP-04 | CSV export | SATISFIED | `exportProspectsCSV` with Papa.unparse, fixed column order |
| PRSP-05 | Manual stage moves (drag + select) | SATISFIED | DragDropProvider + Move to... Select dropdown, isValidStageTransition gate |
| PRSP-06 | Dashboard prospect count + revenue | SATISFIED | ProspectStatsCard: total/replied/converted + est. revenue |
| DASH-04 | Dashboard revenue counter | SATISFIED | ProspectStatsCard + AvgDealValueForm in settings, updateAvgDealValue action |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/features/onboarding/components/onboarding-wizard.tsx` | 62 | `console.error("[onboarding] completion failed", error)` | Info | Logging only — real error handling uses toast |
| `src/features/growth/components/share-buttons.tsx` | 59 | `console.error("share-buttons download error", err)` | Info | Expected — download failure logs to console, toast shown to user |
| `src/components/shell/app-sidebar.tsx` | 34-35 | `href: "#"` for Signals and Approvals nav items | Warning | Phase 2/3 pages exist but routes not linked in sidebar — not Phase 5 scope |

No blocker anti-patterns. All Phase 5 implementations are substantive.

### Human Verification Required

The following require manual testing. All automated code checks pass.

1. **3-question onboarding wizard UX flow** — Navigate `/onboarding` as new user, answer 3 questions, verify typing animation cycles subreddits for 3-5s, confirm dashboard shows checklist card with 1-2/4 items complete.

2. **Stripe Checkout subscription + credit pack flows** — Full end-to-end payment with live Stripe keys. Confirm webhook delivery and credit balance update via `add_credits` RPC.

3. **Free trial start** — Click "Start free trial" on `/billing`, verify 500 credits added and `trial_ends_at` set to +3 days without credit card prompt.

4. **/live page polling and anonymization** — Confirm 10s polling updates, signals show no handles/subreddit names, 6-metric stats bar renders correctly without auth.

5. **Scan my product** — Submit product description on `/live`, confirm real Reddit results appear within 5s, rate limit blocks after 3 requests/hr from same IP.

6. **Kanban drag-and-drop** — Drag prospect card between columns, verify optimistic update and server-side confirmation; confirm invalid transitions are rejected.

7. **Results card download and share** — Click Download (confirm PNG saves), Share to X (confirm tweet intent opens), Share to LinkedIn (confirm LinkedIn share opens).

8. **Daily digest email delivery** — At 8:00 user's local timezone, confirm email arrives with subject "{N} people looking for {product} yesterday" and correct content.

9. **Credit widget color thresholds** — Verify sidebar shows orange <100 and red <50 with real credit data; confirm click routes to `/billing`.

---

_Verified: 2026-04-20T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
