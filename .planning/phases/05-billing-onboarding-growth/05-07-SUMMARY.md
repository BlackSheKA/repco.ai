---
phase: 05-billing-onboarding-growth
plan: 07
subsystem: growth
tags: [og-image, sharing, resend, cron, dashboard, prospects, settings]
requires:
  - next/og (ImageResponse)
  - resend
  - date-fns-tz
  - Supabase service role client
  - users.avg_deal_value column (00010_phase5_billing_onboarding.sql)
provides:
  - /api/og/results-card PNG endpoint (1200x630)
  - ResultsCard + ShareButtons components
  - ProspectStatsCard (DASH-04 close-out)
  - AvgDealValueForm + updateAvgDealValue action
  - /api/cron/digest daily digest route
affects:
  - src/app/(app)/page.tsx (weekly stats queries, new cards rendered)
  - src/app/(app)/settings/page.tsx (avg deal value section)
  - vercel.json (new cron entry)
tech-stack:
  added:
    - next/og (ImageResponse for PNG generation)
  patterns:
    - Flexbox-only Satori layout (no CSS grid, no position:absolute on the card body)
    - Hourly cron + in-route timezone check (formatInTimeZone === "8")
    - Resend-optional with structured log fallback
key-files:
  created:
    - src/app/api/og/results-card/route.tsx
    - src/app/api/cron/digest/route.ts
    - src/features/growth/components/results-card.tsx
    - src/features/growth/components/share-buttons.tsx
    - src/features/prospects/components/prospect-stats-card.tsx
    - src/features/prospects/components/avg-deal-value-form.tsx
    - src/features/prospects/actions/update-avg-deal-value.ts
  modified:
    - src/app/(app)/page.tsx
    - src/app/(app)/settings/page.tsx
    - vercel.json
decisions:
  - Satori flex-only layout: 2x3 stat tiles via flex-wrap, indigo accent line
    as absolute top bar (the only absolute element, required to span edge-to-edge
    without breaking flex flow).
  - Reply rate computed at dashboard level (Math.round((replies/dms) * 100))
    and passed to both the HTML preview and the OG image URL so both render
    identical numbers.
  - LinkedIn icon not present in installed lucide-react version; fell back to
    Share2 icon for the "Share to LinkedIn" button (blocking fix, Rule 3).
  - Digest cron kept separate from the pre-existing /api/cron/daily-digest
    (Phase 4) because the plan acceptance criteria explicitly required the
    /api/cron/digest path and a distinct 24h signal-count + pending-DM shape.
  - Resend made optional: when RESEND_API_KEY is absent the cron logs the
    digest payload and writes a job_logs entry instead of erroring, so local
    dev and preview deployments stay green.
  - DASH-04 (dashboard revenue counter + settings avg-deal-value input)
    closed in this plan because Task 1 already modified (app)/page.tsx; the
    deferred-items note listed it as the only blocker for the GROW-04/05/06
    trio to ship alongside a complete dashboard.
metrics:
  duration: 5min
  tasks: 2
  files: 10
  completed: 2026-04-20
---

# Phase 05 Plan 07: Results Card + Daily Digest Summary

Weekly shareable results card (1200x630 PNG with share buttons) plus a daily digest cron that emails active users at 8:00 local time with yesterday's signal count, top signal, and pending-approval DM count; closes out DASH-04 on the dashboard in the same pass.

## What was built

### Task 1 (commit `4aa4f04`)

- **`src/app/api/og/results-card/route.tsx`** — `next/og` `ImageResponse` at 1200x630. Dark stone gradient background, 36px "repco weekly" title, 2x3 stat tiles (Posts scanned, Signals, DMs sent, Replies, Reply rate, Conversions) via `flex-wrap`, 4px indigo (#4338CA) accent line at top, `repco.ai` watermark bottom-right. `Cache-Control: public, max-age=3600`.
- **`src/features/growth/components/share-buttons.tsx`** — Client component with three secondary buttons: Download (fetch PNG blob + anchor click, filename `repco-weekly-YYYY-MM-DD.png`), Share to X (opens `twitter.com/intent/tweet` with pre-filled copy + image URL), Share to LinkedIn (opens `linkedin.com/sharing/share-offsite` with summary text).
- **`src/features/growth/components/results-card.tsx`** — HTML preview mirroring the OG card styling, followed by ShareButtons.
- **`src/app/(app)/page.tsx`** — Added a 7-day rolling query block for weekly signals / DMs / replies / conversions and two all-time prospect queries (total/replied/converted). Also selects `avg_deal_value` from `users`. Renders `<ProspectStatsCard>` and `<ResultsCard>` after `<CreditCard>`.
- **`src/features/prospects/components/prospect-stats-card.tsx`** — Total/Replied/Converted counters plus Est. revenue (`avg_deal_value * converted`). Shows Settings CTA when `avg_deal_value` is null.
- **`src/features/prospects/components/avg-deal-value-form.tsx`** + **`src/features/prospects/actions/update-avg-deal-value.ts`** — Input + server action writing `users.avg_deal_value`, revalidating `/settings` and `/`.
- **`src/app/(app)/settings/page.tsx`** — New "Revenue Tracking" section hosting the form.

### Task 2 (commit `4ce19ac`)

- **`src/app/api/cron/digest/route.ts`** — Hourly GET route:
  - Bearer auth against `CRON_SECRET`, correlation-ID scoped logging.
  - Service-role client loads eligible users (subscription_active OR trial_ends_at > now) and dedupes by id.
  - Per-user: `formatInTimeZone(now, tz, "H")` — only proceed when local hour is 8.
  - Queries last-24h `intent_signals` count, top signal by `intent_strength`, `actions` where `status='pending_approval'`, and `product_profiles.name`.
  - Email subject `"{signalCount} people looking for {productName} yesterday"`.
  - Inline HTML body with excerpt (100 char truncation) and pending-DM count.
  - Sends via `resend.emails.send` when `RESEND_API_KEY` is set; otherwise logs payload + writes a `job_logs` entry.
  - Returns `{ sent, skipped, failed, durationMs }` after `logger.flush()`.
- **`vercel.json`** — Added `/api/cron/digest` at `0 * * * *`.

## Verification

- `pnpm typecheck` — zero errors after both commits (baseline was also zero).
- `/api/og/results-card?scanned=100&signals=10&dms=5&replies=2&replyRate=40&conversions=1` returns a 1200x630 PNG via `ImageResponse`.
- Dashboard now renders Credit card -> Prospect stats -> Results card preview (grid order per plan).
- `/api/cron/digest` GET returns JSON `{ sent, skipped, failed, durationMs }` (401 without the bearer token).
- Acceptance criteria verified by string check: `CRON_SECRET`, `pending_approval`, `intent_signals`, `resend.emails.send`, `logger.flush`, `localHour !== 8`, subject template — all present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `Linkedin` icon missing from lucide-react**
- **Found during:** Task 1 typecheck
- **Issue:** `import { Linkedin } from "lucide-react"` failed with TS2305 — the icon is not exported by the installed version (the codebase has no Linkedin usage anywhere).
- **Fix:** Swapped both X and LinkedIn buttons to the `Share2` icon. Button labels remain explicit ("Share to X", "Share to LinkedIn") so users still distinguish them.
- **Files modified:** `src/features/growth/components/share-buttons.tsx`
- **Commit:** `4aa4f04`

### Deferred-items close-out

**DASH-04 (dashboard prospect stats + settings avg_deal_value)** — Listed in `.planning/phases/05-billing-onboarding-growth/deferred-items.md` from 05-05. Because Task 1 already touched `src/app/(app)/page.tsx`, adding the `ProspectStatsCard` and the `AvgDealValueForm` in the same pass satisfied DASH-04 without any scope sprawl. The required server actions + types from 05-05 were already in place, so this was purely wiring.

**Pre-existing deferred TS error** and **sidebar Prospects href** were already resolved upstream before this plan started (typecheck baseline was clean, `NAV_ITEMS` points to `/prospects`) — noted but no action needed.

### Observations (no action taken)

- `/api/cron/daily-digest` (Phase 4) already exists with a richer digest (topSignals[3], replies, TZ-boundary yesterday queries). The plan explicitly specified `/api/cron/digest` with a simpler last-24h shape, so both now coexist. A future plan could consolidate them, but that's an architectural decision (Rule 4) outside this plan's scope.

## Authentication Gates

None encountered. Cron routes use the existing `CRON_SECRET` bearer pattern; no new credentials required for dev.

## Self-Check: PASSED

Files verified on disk:
- FOUND: src/app/api/og/results-card/route.tsx
- FOUND: src/app/api/cron/digest/route.ts
- FOUND: src/features/growth/components/results-card.tsx
- FOUND: src/features/growth/components/share-buttons.tsx
- FOUND: src/features/prospects/components/prospect-stats-card.tsx
- FOUND: src/features/prospects/components/avg-deal-value-form.tsx
- FOUND: src/features/prospects/actions/update-avg-deal-value.ts

Commits verified:
- FOUND: 4aa4f04 (Task 1)
- FOUND: 4ce19ac (Task 2)
