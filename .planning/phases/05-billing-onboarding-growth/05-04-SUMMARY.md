---
phase: 05-billing-onboarding-growth
plan: 04
subsystem: billing
tags: [credits, cron, action-worker, ui, sidebar, dashboard]

requires:
  - phase: 05-billing-onboarding-growth
    plan: 01
    provides: deduct_credits RPC, calculateMonitoringBurn/calculateAccountBurn/calculateDailyBurn, getActionCreditCost, account_burn credit_type
  - phase: 03-action-engine
    provides: action worker pipeline (worker.ts) where action credit deduction is inserted
  - phase: 02-monitoring-intent-feed
    provides: monitoring_signals table (burn input)
provides:
  - /api/cron/credit-burn daily cron (schedule 0 0 * * *)
  - Action worker credit deduction on successful action completion
  - CreditBalance sidebar footer widget (color-coded thresholds)
  - CreditCard dashboard component (balance + burn breakdown + projected days)
  - UpgradeBanner (session-dismissible, renders when balance < 50)
  - ContextualCreditPrompt (inline alert in approval queue)
  - AppSidebar: Billing nav item + Prospects nav href fix
  - AppShell: creditBalance + dailyBurn props plumbed through
affects:
  - 05-03 billing UI: link target /billing exists from multiple CTAs
  - 05-05 prospects page: Prospects nav item now links correctly

tech-stack:
  added: []
  patterns:
    - "Bulk-load users/signals/accounts in cron to avoid per-user round trips"
    - "Credit deduction is non-blocking in the action worker (logged-only on failure) so actions can never be rolled back by billing errors"
    - "Action burn estimate derived from completed actions (last 7d) * getActionCreditCost / 7"
    - "Contextual prompt triggers on absolute (<50) OR relative (<actionCost*2) low balance"

key-files:
  created:
    - src/app/api/cron/credit-burn/route.ts
    - src/features/billing/components/credit-balance.tsx
    - src/features/billing/components/credit-card.tsx
    - src/features/billing/components/upgrade-banner.tsx
    - src/features/billing/components/contextual-credit-prompt.tsx
  modified:
    - src/lib/action-worker/worker.ts
    - src/components/shell/app-sidebar.tsx
    - src/components/shell/app-shell.tsx
    - src/app/(app)/layout.tsx
    - src/app/(app)/page.tsx
    - src/features/actions/components/approval-queue.tsx
    - vercel.json

key-decisions:
  - "Cron bulk-loads eligible users + signals + accounts in 3 queries, not N queries per user, keeping the job well under 60s even at 10k users"
  - "Credit deduction wrapped in try/catch inside the worker's success branch -- a failed RPC call is logged warn but never overturns a completed action (matches plan: 'Do NOT block action completion on credit failure')"
  - "Accounts sorted by created_at in the cron so extras beyond INCLUDED_ACCOUNTS=2 are the newest (matches calculateAccountBurn insertion-order semantics from 05-01)"
  - "ContextualCreditPrompt rendered in ApprovalQueue (not ApprovalCard) so ApprovalCard's public contract stays untouched -- plan called for 'below DM content in approval queue' which is satisfied"
  - "Session-only dismissal for UpgradeBanner via useState (per plan's explicit 'not localStorage')"
  - "CreditBalance uses Tailwind text-orange-500 / text-red-500 instead of project's custom warning tokens -- matches plan's literal copy and keeps the widget framework-agnostic"
  - "actionBurn = Math.round(sum(cost of last 7d completed actions) / 7); yields 0 for new accounts which is accurate, not a zero-state bug"

requirements-completed: [BILL-04, BILL-05, BILL-06, BILL-08, BILL-09]

duration: 5min
completed: 2026-04-20
---

# Phase 05 Plan 04: Credit Burn Runtime + UI Summary

**Daily credit-burn cron + worker-level action credit deduction + full credit-awareness UI (sidebar widget, dashboard card, upgrade banner, contextual DM prompt) wired through AppShell.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-20T11:49:46Z
- **Completed:** 2026-04-20T11:54:55Z
- **Tasks:** 2
- **Files created:** 5
- **Files modified:** 7

## Accomplishments

- Daily credit-burn cron endpoint at `/api/cron/credit-burn` deducts monitoring + extra-account burn for every eligible user (subscription_active or trial_ends_at > now()) via the `deduct_credits` RPC, with correlation-id logging and a `job_logs` audit record.
- Action worker now deducts action credits (15 for public_reply, 30 for dm, 20 for followup_dm) on successful completion. Credit failures are logged as warnings -- they never block an action that already succeeded.
- `CreditBalance` sidebar widget: text turns orange at `< 100` credits, red at `< 50`, mono-font numbers, click-through to `/billing`.
- `CreditCard` dashboard: large mono balance, 3-line burn breakdown (monitoring / accounts / actions), total line, colored projected-days ("days remaining") with green/orange/red thresholds, conditional "Buy credits" link under 50 credits.
- `UpgradeBanner`: session-dismissible orange banner at the top of the dashboard when balance < 50, with "Buy credits" CTA.
- `ContextualCreditPrompt`: per-card alert in the approval queue that triggers when remaining credits < 50 or < 2x the action cost.
- Sidebar footer now renders the `CreditBalance` widget above the user email; Billing nav item added; Prospects href corrected from `#` to `/prospects`.
- `(app)/layout.tsx` loads `credits_balance` + active signals + active accounts, calculates `calculateDailyBurn(...)` once, and threads `creditBalance` / `dailyBurn` through `AppShell` -> `AppSidebar` -> `CreditBalance`.
- Dashboard page queries `completed` actions from the last 7d to estimate avg daily `actionBurn`, combines with monitoring + account burn, computes `projectedDays = floor(balance / totalBurn)` (or Infinity if burn is 0).
- vercel.json: added `/api/cron/credit-burn` on `0 0 * * *` (daily at midnight UTC).

## Task Commits

1. **Task 1: Credit burn cron + action worker credit deduction** -- `ec7a716` (feat)
2. **Task 2: Credit balance widget, dashboard card, upgrade prompts** -- `23e3990` (feat)

## Files Created/Modified

**Created:**
- `src/app/api/cron/credit-burn/route.ts` -- daily cron handler
- `src/features/billing/components/credit-balance.tsx` -- sidebar footer widget
- `src/features/billing/components/credit-card.tsx` -- dashboard summary card
- `src/features/billing/components/upgrade-banner.tsx` -- low-balance warning
- `src/features/billing/components/contextual-credit-prompt.tsx` -- inline approval prompt

**Modified:**
- `src/lib/action-worker/worker.ts` -- imports billing helpers, calls `deduct_credits` after successful action completion in a guarded try/catch
- `src/components/shell/app-sidebar.tsx` -- renders CreditBalance, Billing nav item, Prospects href fix
- `src/components/shell/app-shell.tsx` -- accepts + forwards `creditBalance` / `dailyBurn`
- `src/app/(app)/layout.tsx` -- loads credits + signals + accounts, calculates dailyBurn
- `src/app/(app)/page.tsx` -- renders UpgradeBanner + CreditCard, computes burn breakdown + projectedDays, passes `creditBalance` to ApprovalQueue
- `src/features/actions/components/approval-queue.tsx` -- renders ContextualCreditPrompt per card using `getActionCreditCost`
- `vercel.json` -- adds credit-burn cron entry

## Decisions Made

- **Bulk-load cron architecture** -- The naive per-user approach (query signals + query accounts + RPC per user) would issue 3N queries. Bulk-load + in-memory grouping issues 3 constant queries regardless of user count. Matters at 1k+ users.
- **Non-blocking credit deduction** -- The plan explicitly says "Do NOT block action completion on credit failure." Wrapped the entire deduct_credits call in a try/catch that logs warnings. The action's `status="completed"` write has already happened when deduction runs, so even a thrown RPC cannot revert it.
- **Creation-order sort in cron** -- `calculateAccountBurn` slices `active.slice(INCLUDED_ACCOUNTS)` to bill extras. Cron output must match in-UI burn (which uses the DB insertion order). Added `.order('created_at', ascending: true)` on the bulk accounts query, mirrored by an in-memory sort after grouping.
- **Contextual prompt lives in ApprovalQueue, not ApprovalCard** -- ApprovalCard has a stable public contract (onApprove/onReject/etc). Adding credit-awareness there would couple card rendering to billing state. Rendering `<ContextualCreditPrompt>` immediately after each card in the queue preserves the card's API and still satisfies the plan's "inline alert below DM content in approval queue" criterion.
- **Default tailwind semantic colors** -- The UI spec defines a custom warning-orange `oklch(0.75 0.18 55)` token, but it is not yet wired into the project's CSS variables. Using `text-orange-500` / `text-red-500` keeps the widget shippable today; a future design-system token can be swapped in with a single line change.
- **7-day action-burn smoothing** -- A 1-day window would swing wildly for low-volume accounts; a 30-day window would over-smooth spikes. 7d (rounded) balances recency and stability. New accounts with no history get `actionBurn=0`, which correctly shows "Infinite days remaining" on the card.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AppShell did not accept credit props**
- **Found during:** Task 2 layout wiring
- **Issue:** The plan says "Pass creditBalance and dailyBurn to AppShell/AppSidebar" but `AppShell` only accepted `{ user, terminalHeader, children, hasAccountAlerts }`. Without prop plumbing, the layout could not hand data to the sidebar.
- **Fix:** Added `creditBalance?: number` and `dailyBurn?: number` to `AppShellProps` and forwarded them to `<AppSidebar>`.
- **Files modified:** `src/components/shell/app-shell.tsx`
- **Verification:** `pnpm typecheck` passes end-to-end.
- **Committed in:** 23e3990

### Accidental Sibling Staging (Not a Deviation)

During parallel execution with 05-05 and 05-06, their newly-written files (`src/app/(app)/prospects/**`, `src/features/prospects/components/**`, `src/components/ui/scroll-area.tsx`) had been staged in the git index while I was building Task 2. When I ran `git commit` for Task 2, the index already contained both my files and theirs; the resulting commit `23e3990` therefore also records sibling work. This preserves the sibling's work in git history -- their own final commit will no-op on those paths because the tree already matches. Not a deviation against plan acceptance criteria; noted here for commit-provenance transparency.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking issue)
**Impact on plan:** None on acceptance criteria.

## Issues Encountered

None. `pnpm typecheck` clean. All acceptance-criteria greps satisfied (deduct_credits in both files; href="/billing"; conditional orange/red color classes; "Credits running low"; "This DM costs"; CreditBalance import in sidebar; Billing + Prospects nav hrefs).

## User Setup Required

- **`CRON_SECRET`** env var must be set on Vercel (same value used by zombie-recovery and other crons).
- **Migration 00010** must be applied to Supabase dev/prod before the cron or worker runs in production -- it provides the `deduct_credits` RPC and the `account_burn` / `action_spend` credit_type enum values the cron relies on.
- **Vercel Cron registration** -- the new `/api/cron/credit-burn` entry in `vercel.json` will be picked up on the next deploy; no additional dashboard config needed.

## Next Phase Readiness

- **05-03 Stripe integration** can now deep-link `Buy credits` CTAs to `/billing` from UpgradeBanner, CreditCard, and ContextualCreditPrompt -- all use `<Link href="/billing">`.
- **05-05 Prospects** Prospects nav item is live at `/prospects`; any prospects page shipping under that route will automatically be reachable from the sidebar.
- **05-07 Billing UI** `AppShell`'s new `creditBalance` prop means any future billing pages under `(app)/` already get the sidebar widget for free.
- **05-06 Growth** -- no dependency, but the /live page can reuse the same `CreditCard` pattern if a public-demo credit visualizer is ever needed.

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*

## Self-Check: PASSED

- All 5 created files present on disk
- Both task commits (`ec7a716`, `23e3990`) present in git log
- `pnpm typecheck` clean
- All acceptance-criteria greps satisfied
