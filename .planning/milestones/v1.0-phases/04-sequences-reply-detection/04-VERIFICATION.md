---
phase: 04-sequences-reply-detection
verified: 2026-04-20T09:15:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 4: Sequences + Reply Detection Verification Report

**Phase Goal:** Prospects who don't reply receive structured follow-ups at day 3, 7, and 14; replies are detected automatically and stop all follow-ups; users are notified by email for replies, account alerts, and daily digests.
**Verified:** 2026-04-20T09:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Follow-up 1 is scheduled at day 3 after initial DM for contacted prospects | VERIFIED | `scheduler.ts` `getNextFollowUpStep` checks `dayOffset: 3`; 14 scheduler tests pass |
| 2  | Follow-up 2 is scheduled at day 7 after initial DM | VERIFIED | `FOLLOW_UP_SCHEDULE` step 2 `dayOffset: 7`; scheduler correctly skips to step 2 on missed step 1 |
| 3  | Follow-up 3 is scheduled at day 14 after initial DM | VERIFIED | `FOLLOW_UP_SCHEDULE` step 3 `dayOffset: 14` |
| 4  | All pending follow-ups are cancelled when a reply is detected | VERIFIED | `stop-on-reply.ts` updates `status = "cancelled"` for `followup_dm` actions; 6 tests pass |
| 5  | Follow-up scheduler cron creates followup_dm actions with correct step and angle | VERIFIED | `schedule-followups/route.ts` calls `findDueFollowUps` then `generateDM` then inserts `followup_dm` with `sequence_step` |
| 6  | Follow-ups go to pending_approval by default or approved when auto-send is enabled | VERIFIED | Cron reads `auto_send_followups`; sets `approved` or `pending_approval` accordingly; 24h `expires_at` set |
| 7  | DM inboxes are checked every 2h via GoLogin + Haiku | VERIFIED | `check-replies/route.ts` imports `connectToProfile`, uses `INBOX_CHECK_PROMPT` with Haiku vision; vercel.json has `"0 */2 * * *"` |
| 8  | Reply senders are matched to prospects and trigger stop-on-reply | VERIFIED | `reply-matching.ts` normalizes handles case-insensitively; cron calls `matchReplyToProspect` → `handleReplyDetected`; 5 matching tests pass |
| 9  | Reply alert email is sent when a reply is detected | VERIFIED | `check-replies` cron calls `sendReplyAlert` after successful `handleReplyDetected`; email subject `u/{handle} replied on {platform}` with "View in repco" CTA |
| 10 | Daily digest email is sent at 8:00 user's local time with yesterday's stats | VERIFIED | `daily-digest/route.ts` uses `formatInTimeZone` to gate on `localHour === 8`; sends signal count, pending count, reply count, top signals |
| 11 | Reply events are pushed to dashboard via Supabase Realtime | VERIFIED | `use-realtime-replies.ts` subscribes to `prospects` UPDATE on transition to `pipeline_status = 'replied'`; fires Sonner toast |
| 12 | Replies section on dashboard shows reply cards with real-time updates | VERIFIED | `RepliesSection` renders `ReplyCard` list, uses `useRealtimeReplies` hook; wired into `page.tsx` between SignalFeed and ApprovalQueue |
| 13 | Auto-send toggle on settings page saves immediately | VERIFIED | `auto-send-toggle.tsx` client component calls `toggleAutoSend` server action; updates `users.auto_send_followups`; Sonner toast confirms |

**Score:** 13/13 truths verified

---

## Required Artifacts

### Plan 04-01: DB Migration + Core Scheduling Logic

| Artifact | Status | Details |
|----------|--------|---------|
| `supabase/migrations/00007_phase4_sequences_notifications.sql` | VERIFIED | Contains all 8 changes: `cancelled` enum, `sequence_stopped` / `last_reply_snippet` / `last_reply_at` / `replied_detected_at` on prospects, `auto_send_followups` + `timezone` on users, `last_inbox_check_at` + `consecutive_inbox_failures` on social_accounts, Realtime enabled, both indexes created |
| `src/features/sequences/lib/types.ts` | VERIFIED | Exports `FOLLOW_UP_SCHEDULE` (3 entries, dayOffsets 3/7/14), `FollowUpStep`, `DueFollowUp`, `SequenceProgress` |
| `src/features/sequences/lib/scheduler.ts` | VERIFIED | Exports `findDueFollowUps`, `getNextFollowUpStep`, `getFollowUpStatus`, `getFollowUpExpiresAt` |
| `src/features/sequences/lib/stop-on-reply.ts` | VERIFIED | Exports `handleReplyDetected`; cancels with `status = "cancelled"`, idempotent on already-replied |
| `src/features/actions/lib/types.ts` | VERIFIED | `ActionStatus` union includes `"cancelled"` |
| `src/features/sequences/lib/__tests__/scheduler.test.ts` | VERIFIED | 14 tests — day 3/7/14 scheduling, sequence_stopped skip, missed-step skip, pending-action skip |
| `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | VERIFIED | 6 tests — cancel, status update, sequence_stopped, snippet storage, idempotency |

### Plan 04-02: Email Notifications

| Artifact | Status | Details |
|----------|--------|---------|
| `src/features/notifications/lib/resend-client.ts` | VERIFIED | Exports `resend` singleton via `new Resend(process.env.RESEND_API_KEY)` |
| `src/features/notifications/emails/reply-alert.tsx` | VERIFIED | 137 lines; exports `ReplyAlertEmail`; contains "View in repco" CTA, `#4338CA` brand color; NO reply text content (locked decision) |
| `src/features/notifications/emails/daily-digest.tsx` | VERIFIED | Exports `DailyDigestEmail`; contains "detected", "awaiting approval", "received" stat labels; "Open repco" CTA |
| `src/features/notifications/emails/account-warning.tsx` | VERIFIED | Exports `AccountWarningEmail`; "48-hour cooldown" for warning state; "Reddit may have restricted" for banned state |
| `src/features/notifications/lib/send-reply-alert.ts` | VERIFIED | Exports `sendReplyAlert(to, prospectHandle, platform)`; imports `ReplyAlertEmail` + `resend` |
| `src/features/notifications/lib/send-daily-digest.ts` | VERIFIED | Exports `sendDailyDigest(to, data)`; imports `DailyDigestEmail` |
| `src/features/notifications/lib/send-account-warning.ts` | VERIFIED | Exports `sendAccountWarning(to, accountHandle, status)`; imports `AccountWarningEmail` |
| `src/features/notifications/lib/__tests__/reply-alert.test.ts` | VERIFIED | 5 tests pass |
| `src/features/notifications/lib/__tests__/daily-digest.test.ts` | VERIFIED | 4 tests pass |
| `src/features/notifications/lib/__tests__/account-warning.test.ts` | VERIFIED | 3 tests pass |

### Plan 04-03: Cron Routes + Auto-Send Toggle

| Artifact | Status | Details |
|----------|--------|---------|
| `src/app/api/cron/schedule-followups/route.ts` | VERIFIED | `runtime = "nodejs"`, `maxDuration = 60`; imports `findDueFollowUps`, `generateDM`; inserts `followup_dm` with `sequence_step`, `expires_at`, status from `auto_send_followups`; logs to `job_logs`; calls `logger.flush()` |
| `src/app/api/cron/daily-digest/route.ts` | VERIFIED | `maxDuration = 30`; uses `formatInTimeZone` to gate on `localHour === 8`; calls `sendDailyDigest`; skips zero-activity users; per-user try/catch |
| `src/features/sequences/actions/toggle-auto-send.ts` | VERIFIED | `"use server"`; exports `toggleAutoSend(enabled: boolean)`; updates `users.auto_send_followups`; calls `revalidatePath("/settings")` |
| `src/features/sequences/components/auto-send-toggle.tsx` | VERIFIED | `"use client"`; exports `AutoSendToggle`; uses shadcn `Switch`; optimistic toggle with revert-on-error; Sonner toast on success |
| `src/app/(app)/settings/page.tsx` (modified) | VERIFIED | Imports + renders `AutoSendToggle`; "Follow-up Sequences" section heading; queries `auto_send_followups` from users table |
| `vercel.json` (modified) | VERIFIED | Contains `schedule-followups` at `"0 */4 * * *"`, `daily-digest` at `"0 * * * *"`, `check-replies` at `"0 */2 * * *"`; 7 total cron entries |

### Plan 04-04: Reply Detection Cron

| Artifact | Status | Details |
|----------|--------|---------|
| `src/app/api/cron/check-replies/route.ts` | VERIFIED | `runtime = "nodejs"`, `maxDuration = 300`; imports `connectToProfile` (GoLogin), `matchReplyToProspect`, `handleReplyDetected`, `sendReplyAlert`, `sendAccountWarning`; `INBOX_CHECK_PROMPT` constant; increments `consecutive_inbox_failures`; triggers `sendAccountWarning` at `>= 3` failures; `finally` block calls `disconnectProfile`; logs to `job_logs`; `logger.flush()` |
| `src/features/sequences/lib/reply-matching.ts` | VERIFIED | Exports `matchReplyToProspect`; normalizes via `replace(/^u\//i, "").toLowerCase()`; filters `neq("pipeline_status", "replied")`; tuple match by `user_id + platform + handle` |
| `src/features/sequences/lib/__tests__/reply-matching.test.ts` | VERIFIED | 5 tests — case-insensitive, tuple match, null for unmatched, already-replied skip, u/ prefix |
| `src/features/sequences/lib/__tests__/auto-send.test.ts` | VERIFIED | 4 tests — `getFollowUpStatus` returns `approved`/`pending_approval`, `getFollowUpExpiresAt` 24h window |

### Plan 04-05: Dashboard UI

| Artifact | Status | Details |
|----------|--------|---------|
| `src/features/sequences/components/replies-section.tsx` | VERIFIED | `"use client"`; exports `RepliesSection`; `role="region"` `aria-label="Replies"`; uses `useRealtimeReplies`; reply count Badge; "No replies yet" empty state |
| `src/features/sequences/components/reply-card.tsx` | VERIFIED | `"use client"`; exports `ReplyCard`; collapsible DM with `aria-expanded`; `border-l-[3px] border-primary` accent stripe; "Sequence stopped -- reply received" badge; "View on Reddit" opens `target="_blank"` |
| `src/features/sequences/components/sequence-timeline.tsx` | VERIFIED | `"use client"`; exports `SequenceTimeline`; steps "DM", "Day 3", "Day 7", "Day 14" via `STEP_LABELS`; `role="list"` on container; AlertDialog with "Stop sequence for u/{prospect}?" title |
| `src/features/sequences/components/inbox-warning-banner.tsx` | VERIFIED | `"use client"`; exports `InboxWarningBanner`; `role="alert"` `aria-live="polite"`; amber-500/10 background, amber-500/30 border; dismiss button with Tooltip; session-local hide via `useState` |
| `src/features/sequences/actions/stop-sequence.ts` | VERIFIED | `"use server"`; exports `stopSequence`; cancels `pending_approval`/`approved` `followup_dm` actions; sets `sequence_stopped = true` scoped to `user_id = auth user`; `revalidatePath("/")` |
| `src/features/sequences/lib/use-realtime-replies.ts` | VERIFIED | Exports `useRealtimeReplies`; subscribes to `prospects` UPDATE; edge-only detection (transition to `replied` with old != `replied`); fires Sonner toast |
| `src/app/(app)/page.tsx` (modified) | VERIFIED | Imports + renders `RepliesSection` and `InboxWarningBanner`; queries `repliedProspects` and `failedAccounts` (`consecutive_inbox_failures > 0`); hydrates reply rows with original DM + post URL |
| `src/features/dashboard/lib/use-realtime-terminal.ts` (modified) | VERIFIED | New entry types `followup`, `inbox`, `reply`; 3 new Realtime channels; "Follow-up N scheduled (day D)", "Follow-up N sent", "Reply received from u/{handle}" terminal events |
| `src/features/dashboard/components/terminal-header.tsx` (modified) | VERIFIED | Color-codes new entry types (followup=primary, reply=green-500, inbox=amber-500) |
| `src/features/dashboard/components/agent-card.tsx` (modified) | VERIFIED | Extended Realtime subscription to listen for prospect reply transitions; flips to `reply` emotional state on `pipeline_status = 'replied'` |

---

## Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `scheduler.ts` | `types.ts` | `import { FOLLOW_UP_SCHEDULE, DueFollowUp }` | WIRED |
| `stop-on-reply.ts` | `actions` table | `update({ status: "cancelled" })` | WIRED |
| `send-reply-alert.ts` | `reply-alert.tsx` | `import { ReplyAlertEmail }` | WIRED |
| `send-reply-alert.ts` | `resend-client.ts` | `import { resend }` | WIRED |
| `schedule-followups/route.ts` | `scheduler.ts` | `import { findDueFollowUps }` | WIRED |
| `schedule-followups/route.ts` | `dm-generation.ts` | `import { generateDM }` | WIRED |
| `daily-digest/route.ts` | `send-daily-digest.ts` | `import { sendDailyDigest }` | WIRED |
| `check-replies/route.ts` | `gologin/adapter.ts` | `import { connectToProfile, disconnectProfile }` | WIRED |
| `check-replies/route.ts` | `stop-on-reply.ts` | `import { handleReplyDetected }` | WIRED |
| `check-replies/route.ts` | `send-reply-alert.ts` | `import { sendReplyAlert }` | WIRED |
| `page.tsx` | `replies-section.tsx` | `import { RepliesSection }` | WIRED |
| `replies-section.tsx` | `use-realtime-replies.ts` | `useRealtimeReplies(initialReplies, userId)` | WIRED |
| `reply-card.tsx` | "View on Reddit" link | `target="_blank" rel="noopener noreferrer"` | WIRED |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| FLLW-01 | 04-01, 04-05 | Schedule follow-up 1 at day 3 (feature/benefit angle) | SATISFIED | `FOLLOW_UP_SCHEDULE[0].dayOffset = 3`; scheduler cron wired end-to-end |
| FLLW-02 | 04-01, 04-05 | Schedule follow-up 2 at day 7 (value/insight angle) | SATISFIED | `FOLLOW_UP_SCHEDULE[1].dayOffset = 7`; step progression tested |
| FLLW-03 | 04-01, 04-05 | Schedule follow-up 3 at day 14 (low-pressure check-in) | SATISFIED | `FOLLOW_UP_SCHEDULE[2].dayOffset = 14`; step 3 angle correct |
| FLLW-04 | 04-01 | Stop all follow-ups when any reply detected | SATISFIED | `handleReplyDetected` cancels all `pending_approval`/`approved` `followup_dm` actions |
| FLLW-05 | 04-03, 04-05 | Each follow-up appears in approval queue before sending | SATISFIED | Default status is `pending_approval`; only `approved` when user enables auto-send |
| RPLY-01 | 04-04 | Check DM inboxes every 2h via GoLogin + Playwright + Haiku CU | SATISFIED | `check-replies` cron at `0 */2 * * *`; uses GoLogin CDP + Haiku vision |
| RPLY-02 | 04-04 | Match reply sender to prospect, update pipeline_status to "replied" | SATISFIED | `matchReplyToProspect` → `handleReplyDetected` sets `pipeline_status = 'replied'` |
| RPLY-03 | 04-02 | Send email notification when a reply is received | SATISFIED | `sendReplyAlert` called after successful `handleReplyDetected` |
| RPLY-04 | 04-04, 04-05 | Push reply event to dashboard via Supabase Realtime | SATISFIED | `use-realtime-replies.ts` subscribes to prospects UPDATE; toast + state update |
| NTFY-01 | 04-02, 04-03 | User receives daily email digest with signal count, top signal, pending DMs | SATISFIED | `daily-digest` cron + `DailyDigestEmail` template with all required stats |
| NTFY-02 | 04-02 | User receives email when a prospect replies | SATISFIED | `sendReplyAlert` with subject `u/{handle} replied on {platform}` |
| NTFY-03 | 04-02 | User receives email alert when account is flagged (warning/banned) | SATISFIED | `sendAccountWarning` sends for both `warning` and `banned` statuses; triggered at 3 consecutive inbox failures |

All 12 requirements satisfied. No orphaned requirements found.

---

## Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `check-replies/route.ts:66,93` | `return []` | Info | Legitimate safe defaults in `parseInboxResponse` helper — empty array prevents false-positive reply detection on malformed Haiku responses |

No blocker or warning anti-patterns found across any Phase 4 files.

---

## Notable Deviations (Non-Blocking)

1. **Terminal event copywriting drift (Plan 04-05):** Terminal lines for follow-up events read `> Follow-up N scheduled (day D)` and `> Follow-up N sent` instead of the plan-specified `> Follow-up N scheduled for u/{prospect} (day D)` — the prospect/account handle was omitted because it would require an additional Supabase fetch per Realtime event. The terminal events fire correctly; the handle portion is missing from the text. Not a goal blocker.

2. **vercel.json cron count (Plan 04-03):** Plan expected 5 total crons; actual count is 7. The extra crons (`expire-actions`, `check-replies`) were added by Phase 3 and Phase 4 Plan 04. Functionally correct — all Phase 4 crons are registered with exact schedules.

---

## Human Verification Required

### 1. Auto-send toggle visual confirmation

**Test:** Run `pnpm dev --port 3001`, navigate to `/settings`. Locate the "Follow-up Sequences" section below the monitoring config.
**Expected:** Switch labeled "Auto-send follow-ups" visible; toggling on/off shows Sonner toast "Auto-send enabled" / "Auto-send disabled".
**Why human:** UI rendering and toast behavior cannot be verified programmatically.

### 2. Replies section empty state rendering

**Test:** With no replied prospects in the database, open the dashboard at `/`.
**Expected:** "Replies" section visible between SignalFeed and ApprovalQueue with "No replies yet" heading and description text.
**Why human:** Visual layout order and empty state rendering require browser verification.

### 3. Reply card collapsible DM

**Test:** With at least one replied prospect, verify the reply card renders correctly.
**Expected:** Top row shows Reddit badge + handle + "replied X ago"; original DM collapsed by default; click to expand; reply text visible with left-accent border; "View on Reddit" opens new tab.
**Why human:** Interactive collapse/expand behavior and new-tab link require browser verification.

### 4. Inbox warning banner conditional display

**Test:** With a social account having `consecutive_inbox_failures > 0`, open the dashboard.
**Expected:** Amber warning banner at top of page; dismiss button hides it for the session (reappears on refresh).
**Why human:** Conditional rendering and session-state dismiss behavior require browser verification.

### 5. Real email delivery (requires Resend DNS setup)

**Test:** Configure `RESEND_API_KEY` in `.env.local` and verify Resend domain DNS. Trigger a reply detection.
**Expected:** Reply alert email delivered to user's inbox from `repco <notifications@repco.ai>`.
**Why human:** Requires live Resend account, DNS configuration (`SPF/DKIM/DMARC` on `repco.ai`), and real Reddit inbox interaction.

---

## Test Results

```
Test Files  7 passed (7)
     Tests  41 passed (41)
  Duration  614ms
```

Breakdown:
- `scheduler.test.ts` — 14 tests (day 3/7/14 scheduling, skips, missed steps)
- `stop-on-reply.test.ts` — 6 tests (cancel, status update, idempotency)
- `reply-matching.test.ts` — 5 tests (case-insensitive, tuple match, null, replied skip)
- `auto-send.test.ts` — 4 tests (`getFollowUpStatus`, `getFollowUpExpiresAt`)
- `reply-alert.test.ts` — 5 tests
- `daily-digest.test.ts` — 4 tests
- `account-warning.test.ts` — 3 tests

---

## Summary

Phase 4 goal is fully achieved. All 13 observable truths are verified in the codebase. The complete pipeline is wired end-to-end:

- **Follow-up scheduling:** DB migration adds sequence tracking columns; scheduler logic identifies due prospects; cron route generates AI content and inserts `followup_dm` actions with 24h expiry; auto-send toggle lets power users skip approval.
- **Reply detection:** GoLogin + Playwright CDP + Haiku vision checks Reddit inboxes every 2h; reply senders are matched case-insensitively to prospect records; stop-on-reply cancels follow-ups and updates pipeline status; reply alert email fires on match.
- **Notifications:** All 3 email templates (reply alert, daily digest, account warning) are branded and functional with correct copy; send functions have full Resend integration; 12 tests pass.
- **Dashboard UI:** Replies section with Supabase Realtime subscription; reply cards with collapsible DM thread; sequence timeline; inbox failure warning banner; terminal header with Phase 4 event types; agent card reply emotional state transition.

Two minor deviations documented: terminal line copywriting (u/handle omitted, non-blocking) and vercel.json cron count discrepancy (7 vs. expected 5, non-functional). Both are cosmetic and do not affect goal achievement.

Production readiness requires: `RESEND_API_KEY` env var + DNS configuration for `notifications@repco.ai`, and at least one connected Reddit account with a `gologin_profile_id` for inbox checking to function.

---

_Verified: 2026-04-20T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
