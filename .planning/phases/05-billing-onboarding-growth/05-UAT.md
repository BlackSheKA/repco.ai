---
status: complete
phase: 05-billing-onboarding-growth
source: 05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md, 05-06-SUMMARY.md, 05-07-SUMMARY.md
started: 2026-04-21T00:00:00Z
updated: 2026-04-21T07:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Onboarding Gate
expected: As a newly registered user (no onboarding completed), navigating to any app route (e.g. /) redirects to /onboarding. Conversely, a user who has completed onboarding and tries to visit /onboarding directly is bounced back to /.
result: pass

### 2. Onboarding Wizard Flow
expected: The /onboarding page shows a full-screen overlay wizard with 3 steps: (1) Describe your product — text input, Enter to advance; (2) Who are your competitors? — textarea, Enter to advance; (3) Claude generates keywords/subreddits and a scan animation plays (typing effect cycling through subreddits for 3-5s) before revealing a signal count or zero-state message. On completion, user lands on /?onboarded=true.
result: skipped
reason: Requires fresh account (no onboarding_completed_at); current account already onboarded.

### 3. Onboarding Checklist on Dashboard
expected: After landing on /?onboarded=true, the dashboard shows an OnboardingChecklist card with a progress bar (0/4–4/4) and 4 items: Connect a Reddit account, Describe your product, Keywords generated, Get your first signal. Items that are complete show a checkmark. When all 4 are complete, a Dismiss button appears; clicking it hides the checklist permanently (localStorage).
result: pass

### 4. Billing Page
expected: Navigating to /billing shows a two-column layout: left 2/3 has Tabs (Plans / Credit Packs / History), right 1/3 shows current credit balance and projected runway. Plans tab shows monthly/quarterly/annual toggle with 3 plan cards (Save 29% / Save 49% badges on non-monthly). Credit Packs tab shows 4 pack cards with Geist Mono credit counts and per-credit cost. History tab shows an invoice table (empty state if none).
result: pass

### 5. Free Trial
expected: On the billing page Plans tab, clicking "Start free trial" (if trial not already started) calls the server action, grants 500 credits, and sets a 3-day trial. A trial banner appears showing "Trial · {n} days left". The button changes to indicate an active plan/trial. No credit card required.
result: issue
reported: "No 'Start free trial' button exists anywhere in the UI. The startFreeTrial server action is implemented in checkout.ts but is never imported or called from any UI component (BillingPageClient, plan-card, or billing page)."
severity: major

### 6. Stripe Checkout
expected: Clicking Subscribe on a plan card (or Buy credits on a pack) redirects to Stripe's hosted Checkout page in the same tab. The Stripe session is created via the server action; the URL shows checkout.stripe.com. (Full end-to-end Stripe transaction is optional to complete — redirect occurring is sufficient.)
result: skipped
reason: Stripe env vars not configured in dev environment; buttons exist but redirect would fail.

### 7. Credit Balance Sidebar Widget
expected: The app sidebar footer area shows a CreditBalance widget displaying the user's current credit balance as a monospace number. The number turns orange when < 100 and red when < 50. Clicking it navigates to /billing.
result: pass

### 8. Credit Card Dashboard Component
expected: The dashboard shows a CreditCard with: large monospace balance, 3-line burn breakdown (Monitoring burn / Account burn / Action burn) with a Total line, and a colored "days remaining" indicator (green = healthy, orange = < 30d, red = < 7d). When balance < 50, a "Buy credits" link appears. An UpgradeBanner (orange, dismissible) appears at the top of the dashboard when balance < 50.
result: pass

### 9. Billing & Prospects Nav Items
expected: The app sidebar navigation contains a "Billing" item linking to /billing and a "Prospects" item linking to /prospects. Both are clickable and navigate to the correct routes.
result: pass

### 10. Prospect Kanban Board
expected: Navigating to /prospects shows a horizontal kanban board with 6 columns: new_lead, contacted, replied, interested, converted, rejected. Each column has a count badge. Cards display prospect handle, platform, and a "Move to…" dropdown. On desktop, cards have a drag handle. Empty state ("No prospects yet" + Connect account CTA) shows when no prospects exist.
result: pass

### 11. Move Prospect Stage
expected: Using the "Move to…" Select dropdown on a prospect card shows only valid stage transitions (e.g. you cannot move backward from "replied" to "new_lead"). Selecting a valid stage updates the card's column immediately (optimistic UI). If the move fails, the card reverts and a toast error appears.
result: skipped
reason: No prospects in database to test with.

### 12. Prospect Detail Page
expected: Clicking a prospect card navigates to /prospects/[id]. The page shows a two-column layout (above lg): left 2/3 has conversation history, right 1/3 has contact info, notes textarea (auto-saves on blur), and tags input (saves on Enter or blur). An intent signal card shows intent strength and suggested angle.
result: skipped
reason: No prospects in database to test with.

### 13. CSV Export
expected: On the /prospects page, clicking "Export CSV" downloads a file named with today's date (e.g. prospects-2026-04-21.csv) containing columns: handle, platform, pipeline_status, display_name, bio, notes, tags, created_at.
result: pass

### 14. /live Public Page (No Auth)
expected: Visiting /live in an incognito window (no login) renders the page without a redirect. The page shows: repco logo + "Sign up free" button in a minimal header, a 6-metric stat bar (Posts scanned / Signals / Active users / DMs sent / Reply rate / Conversion rate), and an anonymized signal feed that refreshes every 10 seconds. No author handles, post URLs, or subreddit names are visible — only generic intent descriptions.
result: pass

### 15. Scan My Product Form
expected: On /live, a "Scan my product" form accepts a product description. Submitting it runs a Reddit search and shows up to 10 classified results with intent strength. Loading state shows during the 8-second max fetch. If rate-limited (3/hour), a toast says "Try again in a few minutes". After results, a Sign-up CTA appears.
result: pass

### 16. Dashboard Results Card + Share Buttons
expected: The dashboard shows a ResultsCard with an HTML preview mirroring the OG card style: 6 weekly stats (Posts scanned, Signals, DMs sent, Replies, Reply rate, Conversions) and 3 share buttons: Download (downloads PNG), Share to X (opens twitter.com/intent/tweet), Share to LinkedIn (opens linkedin.com sharing URL).
result: pass

### 17. Prospect Stats Card
expected: The dashboard shows a ProspectStatsCard with Total / Replied / Converted prospect counts. If avg_deal_value is set in settings, an "Est. revenue" line shows (avg_deal_value × converted). If avg_deal_value is null, a "Set in Settings" CTA appears.
result: pass

### 18. Settings Avg Deal Value
expected: Navigating to /settings shows a "Revenue Tracking" section with an "Average deal value" input field. Entering a dollar amount and saving updates the ProspectStatsCard on the dashboard to show estimated revenue.
result: pass

## Summary

total: 18
passed: 12
issues: 1
pending: 0
skipped: 5

## Gaps

- truth: "Billing page Plans tab has a 'Start free trial' button that triggers the startFreeTrial server action"
  status: failed
  reason: "User reported: No 'Start free trial' button exists anywhere in the UI. The startFreeTrial server action is implemented in checkout.ts but is never imported or called from any UI component (BillingPageClient, plan-card, or billing page)."
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
