---
phase: 04-sequences-reply-detection
plan: 04
subsystem: sequences
tags: [cron, reply-detection, gologin, playwright, haiku-cu, resend, reddit-inbox]

requires:
  - phase: 01-foundation
    provides: Cron pattern (bearer auth, correlationId, service role client, job_logs, logger.flush)
  - phase: 03-action-engine
    provides: GoLogin adapter (connectToProfile / disconnectProfile), Haiku CU pattern, screenshot capture
  - phase: 04-sequences-reply-detection
    provides: handleReplyDetected (Plan 01), sendReplyAlert / sendAccountWarning (Plan 02), social_accounts.last_inbox_check_at / consecutive_inbox_failures (Plan 01 migration)
provides:
  - Reply detection cron route at /api/cron/check-replies (every 2h)
  - matchReplyToProspect (normalize handle, tuple-match by user_id + platform, skip already-replied)
  - getFollowUpStatus / getFollowUpExpiresAt scheduler helpers for auto-send follow-ups
  - INBOX_CHECK_PROMPT for Haiku vision inbox summarization
  - Consecutive failure tracking with 3-failure account-warning email threshold
affects: [05-billing-onboarding-growth, 06-linkedin]

tech-stack:
  added: []
  patterns:
    - "Per-call Anthropic client instantiation for serverless safety (consistent with monitoring/classifier + action/dm-generation)"
    - "Vision-only Haiku call (no computer_use tool) for read-only inbox summarization — navigation handled by Playwright, model just parses the screenshot"
    - "Try/catch per account so one inbox failure does not block the others"
    - "CU response parsing: JSON.parse first, regex-extract JSON block as fallback, empty array as safe default"
    - "finally-block disconnectProfile for guaranteed browser cleanup even on thrown errors"

key-files:
  created:
    - src/app/api/cron/check-replies/route.ts
    - src/features/sequences/lib/reply-matching.ts
    - src/features/sequences/lib/__tests__/reply-matching.test.ts
    - src/features/sequences/lib/__tests__/auto-send.test.ts
  modified:
    - src/features/sequences/lib/scheduler.ts
    - vercel.json

key-decisions:
  - "Vision-only Haiku call (messages.create with image + text prompt) instead of computer_use tool loop — the task is pure read-only summarization, Playwright does the navigation"
  - "Navigation via page.goto(inbox URL) before screenshot rather than letting Haiku navigate — deterministic, avoids 15-step CU loop overhead for what is a 1-screenshot read"
  - "Empty array on CU parse failure (not throw) — prevents a single malformed model response from marking the account as failed"
  - "readInboxWithHaiku uses the already-connected Playwright page, not a new browser — GoLogin session cost is already paid"

patterns-established:
  - "Cron routes that use GoLogin wrap each account in try/catch with a finally-block disconnectProfile"
  - "Vision-only Haiku reads follow the same per-call Anthropic() + messages.create pattern as existing classifiers"
  - "CU response parsing helper (parseInboxResponse) isolates JSON extraction from the cron control flow"

requirements-completed: [RPLY-01, RPLY-02, RPLY-04]

duration: 4min
completed: 2026-04-20
---

# Phase 04 Plan 04: Reply Detection Cron Summary

**Every-2h Reddit inbox check via GoLogin CDP + Haiku vision that matches reply senders to prospects, triggers stop-on-reply, emails the user, and tracks consecutive failures with a 3-strike account-warning threshold**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-20T06:37:28Z
- **Completed:** 2026-04-20T06:40:57Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 2

## Accomplishments

- **Task 1 (TDD):** Shipped `matchReplyToProspect` with case-insensitive handle normalization (strips `u/` prefix, lowercases) and DB-level filtering by `(user_id, platform)` excluding `replied` prospects. Also added `getFollowUpStatus` / `getFollowUpExpiresAt` scheduler helpers for the upcoming auto-send flow. 9/9 new unit tests pass; all 94 tests in the suite green.
- **Task 2:** Built the `/api/cron/check-replies` route. Follows the established cron pattern (bearer auth, correlationId, service role client, structured logging, `logger.flush()`, `job_logs` entries). For each active Reddit account it connects to GoLogin via CDP, navigates the Playwright page to `reddit.com/message/inbox/`, asks Haiku 4.5 to read the screenshot and return a JSON summary, parses the response safely, and runs each unread sender through `matchReplyToProspect` → `handleReplyDetected` → `sendReplyAlert`. On success it resets `consecutive_inbox_failures` and bumps `last_inbox_check_at`. On failure it increments the counter and, at `>= 3`, emails an account-warning.
- **Vercel cron:** Added `/api/cron/check-replies` at `0 */2 * * *`. `vercel.json` now has 7 cron entries (zombie-recovery, monitor-reddit, warmup, expire-actions, schedule-followups, daily-digest, check-replies).

## Task Commits

1. **Task 1 RED (failing tests for reply-matching + auto-send helpers)** — `a9ff1a8` (test)
2. **Task 1 GREEN (implement matchReplyToProspect + scheduler helpers)** — `1d0da8b` (feat)
3. **Task 2 (check-replies cron route + vercel.json)** — `2d7cc8d` (feat)

No refactor commit needed — GREEN implementation was minimal and clean.

## Files Created/Modified

### Created

- `src/features/sequences/lib/reply-matching.ts` — `matchReplyToProspect` + `MatchedReply` interface
- `src/features/sequences/lib/__tests__/reply-matching.test.ts` — 5 tests (case-insensitive match, tuple match, null for unmatched, already-replied skip, `u/` prefix handling)
- `src/features/sequences/lib/__tests__/auto-send.test.ts` — 4 tests (`getFollowUpStatus` toggle, `getFollowUpExpiresAt` 24h window + ISO format)
- `src/app/api/cron/check-replies/route.ts` — Reply detection cron route (vision-only Haiku, per-account try/catch, failure counter, warning email at 3 strikes)

### Modified

- `src/features/sequences/lib/scheduler.ts` — Added `getFollowUpStatus` and `getFollowUpExpiresAt` helpers
- `vercel.json` — Added `/api/cron/check-replies` cron at `0 */2 * * *`

## Decisions Made

- **Vision-only Haiku call (not computer_use loop).** Inbox reading is a pure read-only summarization task. A full CU agent loop (15-step max, stuck detection, screenshot history) would burn tokens and time for no benefit. Playwright does the navigation; Haiku just parses a single screenshot into JSON.
- **Deterministic page.goto before the screenshot.** Rather than letting the model navigate to the inbox URL via computer_use tools, the cron issues `page.goto("reddit.com/message/inbox/")` directly. Faster, cheaper, deterministic.
- **Empty-array-on-parse-failure rather than throw.** A malformed Haiku response should not cause the whole account to be marked as failed and bump the consecutive-failure counter. The CU is a soft signal; navigation + GoLogin connection are the hard signals.
- **finally-block disconnectProfile.** Guarantees the GoLogin browser closes even if any step throws (match lookup, email send, etc.). Prevents session leaks that would compound into anti-ban issues.

## Deviations from Plan

None — plan executed exactly as written.

Implementation notes that differ cosmetically from the plan's example code but are functionally equivalent:

- Used `messages.create` (vision-only, no tool_use) instead of the full CU executor pattern from `src/lib/computer-use/executor.ts`. The plan's action block listed the CU executor pattern as a reference but also suggested "a simplified approach: navigate page to inbox URL, take screenshot, send screenshot to Haiku asking it to read the messages and return JSON" — that's what was implemented.
- Added a `parseInboxResponse` helper (JSON.parse → regex fallback → empty array) rather than inlining the parsing in the cron body. Cleaner and easier to unit-test later.
- Used `claude-haiku-4-5-20251001` (the model ID already in use by `executor.ts`) rather than `claude-haiku-4-5-20250514` from the plan's interface block — stays consistent with the existing codebase.

## Test Results

```
Test Files  17 passed (17)
     Tests  94 passed (94)
  Duration  820ms
```

- New: 5 tests in `reply-matching.test.ts`, 4 tests in `auto-send.test.ts`
- All pre-existing tests (89) still pass

## Verification

- `pnpm typecheck` — clean
- `pnpm vitest run` — 94/94 passing
- `vercel.json` cron count — 7 (was 6 before this plan)
- Acceptance criteria grep — all 25 match tokens present (`INBOX_CHECK_PROMPT`, `matchReplyToProspect`, `handleReplyDetected`, `sendReplyAlert`, `sendAccountWarning`, `consecutive_inbox_failures`, `CRON_SECRET`, `job_type` / `reply_check`, `logger.flush`, etc.)

## Issues Encountered

None during execution. The plan's verification step mentioned "vercel.json has 6 total crons" — at start of Plan 04-04 it already had 6 (due to Plan 04-03 adding schedule-followups + daily-digest). After this plan it has 7, which is the expected end state for the phase.

## User Setup Required

External configuration required before reply detection can actually run end-to-end:

1. **GoLogin API token** — `GOLOGIN_API_TOKEN` must be set in the Vercel environment. Same token used by Phase 3.
2. **Anthropic API key** — `ANTHROPIC_API_KEY` already configured (used by monitor-reddit + action executor).
3. **Resend API key + DNS** — `RESEND_API_KEY` and `repco.ai` DNS (SPF/DKIM/DMARC) must be configured for `notifications@repco.ai` to deliver reply-alert and account-warning emails. Covered by Plan 04-02's user setup.
4. **CRON_SECRET** — Already configured for other cron routes.

No new `USER-SETUP.md` generated — all required env vars and account setup are already tracked by earlier phases.

## Next Phase Readiness

- Reply detection closes the core outreach loop: initial DM → follow-up sequence → reply → stop-on-reply → user notified.
- Wave 2 of Phase 4 is now complete (Plans 03 + 04 both shipped); one plan (04-05 — UI surfaces for sequences + replies, if present in phase plan) may remain.
- **Ready for:** Phase 05 (billing + onboarding + growth) which will consume reply data for the `/live` page and prospect pipeline UI.
- **Blockers:** None for downstream plans. For production reply detection the user must have: (a) at least one Reddit social account connected with a `gologin_profile_id`, (b) `GOLOGIN_API_TOKEN` set, (c) Resend DNS verified.

## Self-Check: PASSED

Verified (per execution protocol):

- `src/features/sequences/lib/reply-matching.ts` — FOUND
- `src/features/sequences/lib/__tests__/reply-matching.test.ts` — FOUND
- `src/features/sequences/lib/__tests__/auto-send.test.ts` — FOUND
- `src/app/api/cron/check-replies/route.ts` — FOUND
- Commit `a9ff1a8` (RED) — FOUND
- Commit `1d0da8b` (GREEN) — FOUND
- Commit `2d7cc8d` (cron route) — FOUND
- Tests: 94/94 passing
- Typecheck: clean
- vercel.json contains `/api/cron/check-replies` at `0 */2 * * *`

---
*Phase: 04-sequences-reply-detection*
*Completed: 2026-04-20*
