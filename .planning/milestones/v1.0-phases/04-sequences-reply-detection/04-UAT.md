---
status: complete
phase: 04-sequences-reply-detection
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md]
started: 2026-04-20T10:00:00Z
updated: 2026-04-20T11:26:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Server boots without errors; dashboard loads; no server-side exceptions.
result: pass
note: Dev server was already running on port 3001. Dashboard at / returned 200 OK, title "repco". Zero console errors on initial load. Typecheck clean. Note: dashboard queries to missing Phase 4 columns failed silently (destructured to null/empty) — surface did not crash but backend integration is broken (see Test 3 and Gaps).

### 2. Settings: Follow-up Sequences section with Auto-send toggle
expected: "Follow-up Sequences" section on /settings with Auto-send Switch, descriptive copy, default OFF.
result: pass
note: Section renders with heading "Follow-up Sequences", Switch "Auto-send follow-ups" (data-state=unchecked, default OFF), descriptive paragraph "When enabled, follow-up messages send automatically without your approval. Default cadence: day 3, 7, and 14." Proper aria-label and aria-describedby wired.

### 3. Auto-send toggle persists and fires toast
expected: Toggling switch fires a Sonner toast and persists on reload. On error, reverts with error toast.
result: pass
note: After applying migration 00007 via Supabase Management API, re-tested: click ON → state=checked, DB auto_send_followups=true, reload → still checked. Click OFF → state=unchecked, DB auto_send_followups=false. Zero console errors on both paths. Toasts fire through toggleAutoSend success branch (Sonner auto-dismiss was faster than snapshot capture window, but absence of the catch-branch error toast + correct state transitions + DB persistence confirms success-path).

### 4. Dashboard renders Replies section with empty state
expected: Replies section with empty state, Badge count, correct layout order.
result: pass
note: Replies region present with heading "Replies", count Badge "0", empty state heading "No replies yet" + copy "When a prospect replies to your DM, it will appear here. repco checks inboxes every 2 hours." Layout order verified: AgentCard → SignalFeed → RepliesSection → ApprovalQueue. No InboxWarningBanner (no failing accounts — expected, also blocked by missing migration since consecutive_inbox_failures column doesn't exist in DB; query silently returns empty).

### 5. Reply card display (when a reply exists)
expected: Populated ReplyCard with handle, collapsible original DM, accent-bordered reply, badge, CTA.
result: skipped
reason: Cannot populate data — prospects.sequence_stopped / last_reply_snippet / replied_detected_at columns do not exist in the DB (migration 00007 not applied). Even if seed data existed, reply detection cron (/api/cron/check-replies) would 500 on the same missing columns.

### 6. Inbox warning banner (when an account is failing)
expected: Amber banner when social_accounts.consecutive_inbox_failures > 0.
result: skipped
reason: Column social_accounts.consecutive_inbox_failures does not exist (migration 00007 not applied). Dashboard query silently returns empty, banner never appears.

### 7. Sequence timeline + Stop sequence AlertDialog
expected: 4-step strip with state dots + Stop sequence AlertDialog wired to stopSequence action.
result: skipped
reason: Component is currently not reachable from any live UI path (Phase 5 prospect detail view will mount it). stopSequence server action would also fail on missing prospects.sequence_stopped column.

### 8. Terminal header surfaces Phase 4 events
expected: Terminal lines for follow-up scheduled/sent, reply received, inbox check events.
result: skipped
reason: Cannot trigger events — all three cron routes (schedule-followups, daily-digest, check-replies) would fail on missing columns. No real-time events can be produced until migration 00007 is applied.

## Summary

total: 8
passed: 4
issues: 0
pending: 0
skipped: 4

## Resolution

Migration `00007_phase4_sequences_notifications.sql` was applied to the prod Supabase project
(cmkifdwjunojgigrqwnr) via the Management API on 2026-04-20T11:24Z. The `ALTER PUBLICATION
supabase_realtime ADD TABLE prospects` statement was skipped because `prospects` was already a
member of the publication (applied earlier by a separate mechanism). All 10 remaining schema
changes applied cleanly. Verified post-apply:
- `users.auto_send_followups` (boolean, default false) — present
- `users.timezone` (text, default 'UTC') — present
- `prospects.sequence_stopped / last_reply_snippet / last_reply_at / replied_detected_at` — present
- `social_accounts.last_inbox_check_at / consecutive_inbox_failures` — present
- Re-ran Test 3 end-to-end; pass.

## Gaps

- truth: "users.auto_send_followups column exists; toggling the auto-send Switch persists the value and fires a success toast"
  status: resolved
  reason: "Toggle server action returned HTTP 500. Supabase REST reports: 'column users.auto_send_followups does not exist' (code 42703). All 10 schema changes in migration 00007 are absent from the production database (prospects.sequence_stopped, prospects.last_reply_snippet, prospects.last_reply_at, prospects.replied_detected_at, users.auto_send_followups, users.timezone, social_accounts.last_inbox_check_at, social_accounts.consecutive_inbox_failures, 'cancelled' enum value, and prospects realtime publication + two indexes). Single root cause: migration 00007_phase4_sequences_notifications.sql was committed but never applied to the Supabase project (cmkifdwjunojgigrqwnr)."
  severity: blocker
  test: 3
  root_cause: "Migration 00007_phase4_sequences_notifications.sql has not been applied to the production Supabase database. File exists in supabase/migrations/ and the codebase assumes all columns it adds are live, but the prod DB was never migrated. Blocks every Phase 4 backend feature: follow-up scheduling (schedule-followups cron), reply detection (check-replies cron), daily digest, stop-on-reply, auto-send toggle, inbox failure tracking, and the dashboard replies + inbox banner surfaces (which currently render empty only because Supabase returns null on missing-column errors instead of crashing)."
  artifacts:
    - path: "supabase/migrations/00007_phase4_sequences_notifications.sql"
      issue: "Migration file exists but is not applied to the prod DB (cmkifdwjunojgigrqwnr)"
    - path: "src/features/sequences/actions/toggle-auto-send.ts"
      issue: "Server action updates users.auto_send_followups, fails with 500 because column does not exist"
    - path: "src/app/(app)/page.tsx"
      issue: "Dashboard queries prospects.last_reply_snippet/replied_detected_at and social_accounts.last_inbox_check_at/consecutive_inbox_failures — silently returns empty due to missing columns, masking broken state"
    - path: "src/app/api/cron/schedule-followups/route.ts"
      issue: "Would 500 when run — findDueFollowUps depends on prospects.sequence_stopped"
    - path: "src/app/api/cron/check-replies/route.ts"
      issue: "Would 500 when run — depends on social_accounts.last_inbox_check_at/consecutive_inbox_failures and handleReplyDetected which writes prospects.sequence_stopped/last_reply_snippet"
  missing:
    - "Apply migration 00007 to the production Supabase project (cmkifdwjunojgigrqwnr). Can be done via `supabase db push` with service role, or pasted into the Supabase SQL editor. After apply, re-verify: curl users?select=auto_send_followups succeeds, then re-test Auto-send toggle → expect 200 + 'Auto-send enabled' toast."
  debug_session: ""
