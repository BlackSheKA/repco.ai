---
phase: 04-sequences-reply-detection
plan: 02
subsystem: notifications
tags: [resend, react-email, transactional-email, notifications]

requires:
  - phase: 01-foundation
    provides: environment config pattern (.env.example), feature module layout
provides:
  - Resend client singleton for transactional email delivery
  - Three branded React Email templates (reply alert, daily digest, account warning)
  - Three send functions with typed inputs and error propagation
  - Full Vitest coverage (12 tests) with mocked Resend client
affects: [04-sequences-reply-detection, 05-billing-onboarding-growth]

tech-stack:
  added: [resend@^6.12.0, "@react-email/components@^1.0.12", date-fns-tz@^3.2.0]
  patterns:
    - "React Email component rendering via createElement to preserve props for test introspection"
    - "Per-feature notifications module with emails/ (templates) and lib/ (senders + client)"
    - "Resend client singleton using process.env.RESEND_API_KEY at module scope"
    - "Send functions throw on Resend error, return data on success (caller handles logging)"

key-files:
  created:
    - src/features/notifications/lib/resend-client.ts
    - src/features/notifications/emails/reply-alert.tsx
    - src/features/notifications/emails/daily-digest.tsx
    - src/features/notifications/emails/account-warning.tsx
    - src/features/notifications/lib/send-reply-alert.ts
    - src/features/notifications/lib/send-daily-digest.ts
    - src/features/notifications/lib/send-account-warning.ts
    - src/features/notifications/lib/__tests__/reply-alert.test.ts
    - src/features/notifications/lib/__tests__/daily-digest.test.ts
    - src/features/notifications/lib/__tests__/account-warning.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - .env.example

key-decisions:
  - "No reply body in reply alert email (CONTEXT.md locked decision); email only signals the reply and links to dashboard"
  - "Inline Inter font stack rather than Google Fonts import (email clients don't support @import)"
  - "createElement(Component, props) in send functions so callArgs.react.props is introspectable in tests; also keeps send-*.ts as .ts (no JSX/TSX)"
  - "Resend from address: repco <notifications@repco.ai> (brand-first naming, standard transactional subdomain)"
  - "Badge rendered as inline span (email-safe) with amber tokens for warning, red tokens for banned"

patterns-established:
  - "Notifications feature module: emails/<template>.tsx + lib/send-<template>.ts + lib/resend-client.ts"
  - "Branded email CSS tokens kept in module-local `colors` objects (no runtime CSS variables — email clients unsupported)"
  - "Vitest mock pattern for Resend: vi.mock('../resend-client', ...) with mockSend = vi.fn()"

requirements-completed: [NTFY-01, NTFY-02, NTFY-03, RPLY-03]

duration: 9min
completed: 2026-04-20
---

# Phase 04 Plan 02: Email Notifications Summary

**Resend + React Email transactional email module with 3 branded templates (reply alert, daily digest, account warning) and 12/12 passing tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-20T06:20:39Z
- **Completed:** 2026-04-20T06:29:46Z
- **Tasks:** 2
- **Files created:** 10
- **Files modified:** 3

## Accomplishments

- Installed Resend SDK + React Email components + date-fns-tz (timezone-aware digest support)
- Created three branded email templates matching UI-SPEC copywriting contract exactly:
  - **ReplyAlertEmail** — "u/{handle} replied on {platform}" with "View in repco" CTA, NO reply text (locked decision)
  - **DailyDigestEmail** — signal/pending/reply stats (reply count green when > 0), top 3 signals with subreddit + intent strength, "Open repco" CTA
  - **AccountWarningEmail** — amber warning / red banned status badge with appropriate cooldown or admin-check copy, "View account" CTA
- Shipped three typed send functions (`sendReplyAlert`, `sendDailyDigest`, `sendAccountWarning`) with Resend error propagation
- Wrote 12 Vitest tests mocking the Resend client; all pass
- Added `RESEND_API_KEY` to `.env.example`

## Task Commits

1. **Task 1: Install Resend + React Email, create Resend client and all 3 email templates** — `e725830` (feat)
2. **Task 2 RED: Failing tests for email send functions** — `e1e9c15` (test)
3. **Task 2 GREEN: Implement email send functions with Resend** — `ce0dbc3` (feat)

No refactor commit needed — GREEN implementation was already minimal.

## Files Created/Modified

### Created

- `src/features/notifications/lib/resend-client.ts` — Resend singleton
- `src/features/notifications/emails/reply-alert.tsx` — Reply alert template
- `src/features/notifications/emails/daily-digest.tsx` — Daily digest template
- `src/features/notifications/emails/account-warning.tsx` — Account warning template
- `src/features/notifications/lib/send-reply-alert.ts` — Reply alert sender
- `src/features/notifications/lib/send-daily-digest.ts` — Daily digest sender
- `src/features/notifications/lib/send-account-warning.ts` — Account warning sender
- `src/features/notifications/lib/__tests__/reply-alert.test.ts` — 5 tests
- `src/features/notifications/lib/__tests__/daily-digest.test.ts` — 4 tests
- `src/features/notifications/lib/__tests__/account-warning.test.ts` — 3 tests

### Modified

- `package.json` — Added resend, @react-email/components, date-fns-tz
- `pnpm-lock.yaml` — Updated lockfile
- `.env.example` — Added `RESEND_API_KEY`

## Decisions Made

- **No reply body in reply alert email** — per CONTEXT.md locked decision, email only contains handle + platform and links to dashboard. Keeps email footprint minimal and forces prospect engagement through the app.
- **Inline Inter font stack** — no `@import` of Google Fonts because major email clients (Outlook, Apple Mail) strip or break it. Template uses Inter first with robust system-font fallbacks.
- **`createElement(Component, props)` instead of calling `Component(props)`** — in the send functions, this keeps the React element's `.props` introspectable (needed by tests) and avoids converting `.ts` files to `.tsx`. Resend accepts React elements and renders them itself.
- **`repco <notifications@repco.ai>` from address** — brand-first display name with a standard transactional subdomain. Requires DNS (SPF/DKIM/DMARC) setup before going live; documented as a user-setup concern.

## Deviations from Plan

None - plan executed exactly as written.

The plan was followed task-by-task. The only implementation detail that differed from the example code in the plan was using `createElement(Component, props)` instead of `Component({...props})` in the send functions — this was required so Vitest assertions can inspect `callArgs.react.props`. Functionally equivalent for Resend.

## Issues Encountered

- **Pre-existing TypeScript error from parallel plan 04-01** — At start of execution, `pnpm typecheck` failed on `src/features/sequences/lib/__tests__/scheduler.test.ts` because Plan 04-01 committed its test file before its implementation. Logged to `deferred-items.md` as out-of-scope. Resolved on its own by the time this plan finished (Plan 04-01 shipped its implementation in parallel). Final `pnpm typecheck` passes cleanly.
- **Temporary TDD RED failure logged by Plan 04-01's agent** — The orchestrator's other agent observed this plan's RED commit (`e1e9c15`) as a new typecheck error and logged it to `deferred-items.md`. This was expected TDD behavior; GREEN commit (`ce0dbc3`) resolved it and the entry is now marked RESOLVED.

## User Setup Required

External service configuration needed before emails can actually send:

1. **Resend account + API key**
   - Sign up at https://resend.com
   - Create API key, add to `.env.local` as `RESEND_API_KEY=re_...`
2. **DNS configuration for `repco.ai`**
   - Add Resend-provided SPF, DKIM, DMARC records
   - Verify domain in Resend dashboard so `notifications@repco.ai` can send
3. **Test send** (after config)
   - `curl -X POST $SITE/api/...` once a send-triggering route exists (future plan)

No `USER-SETUP.md` generated — these steps are standard Resend onboarding and will be covered when the cron routes that import these sender functions land (Plan 04-03 / 04-04).

## Next Phase Readiness

- Notification module is self-contained and ready to be imported by any server-side caller (cron, API route, server action).
- No follow-up/reply logic depends on this plan — independent delivery surface.
- **Ready for:** Plan 04-03 (reply detection cron) and Plan 04-04 (daily digest cron) can both `import { sendReplyAlert, sendDailyDigest } from "@/features/notifications/lib/..."` without further scaffolding.
- **Blockers:** None for downstream plans. For production email delivery the user must add `RESEND_API_KEY` and configure DNS (see User Setup Required).

## Self-Check: PASSED

Verified (per execution protocol):

- `src/features/notifications/lib/resend-client.ts` — FOUND
- `src/features/notifications/emails/reply-alert.tsx` — FOUND
- `src/features/notifications/emails/daily-digest.tsx` — FOUND
- `src/features/notifications/emails/account-warning.tsx` — FOUND
- `src/features/notifications/lib/send-reply-alert.ts` — FOUND
- `src/features/notifications/lib/send-daily-digest.ts` — FOUND
- `src/features/notifications/lib/send-account-warning.ts` — FOUND
- `src/features/notifications/lib/__tests__/reply-alert.test.ts` — FOUND
- `src/features/notifications/lib/__tests__/daily-digest.test.ts` — FOUND
- `src/features/notifications/lib/__tests__/account-warning.test.ts` — FOUND
- Commit `e725830` — FOUND
- Commit `e1e9c15` — FOUND
- Commit `ce0dbc3` — FOUND
- Tests: 12/12 passing
- Typecheck: clean

---
*Phase: 04-sequences-reply-detection*
*Completed: 2026-04-20*
