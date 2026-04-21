---
phase: 10-linkedin-outreach-execution
plan: "04"
subsystem: action-worker
tags:
  - linkedin
  - computer-use
  - connection-request
  - worker
dependency_graph:
  requires:
    - 10-01 (ActionType union extended, warmup gate union)
    - 10-02 (daily_connection_limit migration, credit cost)
  provides:
    - LinkedIn Connect CU prompt generator (linkedin-connect.ts)
    - connection_request executor arm in worker.ts
  affects:
    - src/lib/action-worker/worker.ts
    - src/lib/computer-use/actions/linkedin-connect.ts
    - src/features/actions/lib/TODO-phase6-connection-request.md
tech_stack:
  added: []
  patterns:
    - Platform-aware navigation branch in step 10 (LinkedIn vs Reddit)
    - Local variable stash (linkedinProfileHandle) to avoid re-fetching prospect in step 12
    - LinkedIn failure mode detection with account health transitions
    - failure_mode in job_logs.metadata for LinkedIn ops slicing
key_files:
  created:
    - src/lib/computer-use/actions/linkedin-connect.ts
  modified:
    - src/lib/action-worker/worker.ts
    - src/features/actions/lib/TODO-phase6-connection-request.md
decisions:
  - Always use "Add a note" path — "Send without note" has worse acceptance rates (locked in 10-CONTEXT.md)
  - Two-step Connect discovery in prompt (header button OR More dropdown) handles LinkedIn A/B test running 18+ months
  - already_connected sets action.status=failed + prospect.pipeline_status=connected (not a technical error)
  - weekly_limit_reached sets cooldown_until only — no health_status change (expected throttle, not account issue)
  - security_checkpoint/session_expired both set health_status=warning (account-level risk)
  - Local var linkedinProfileHandle instead of connection object property cast — cleaner compile
metrics:
  duration: 2min
  completed_date: "2026-04-21"
  tasks_completed: 3
  files_changed: 3
---

# Phase 10 Plan 04: LinkedIn Connect Executor Summary

LinkedIn Connect CU prompt generator and connection_request worker arm delivering end-to-end LinkedIn connection request execution via GoLogin + Playwright + Haiku CU with 5 failure modes, pipeline_status transitions, and ops-sliceable job_logs metadata.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create linkedin-connect.ts CU prompt generator | 7a2d2ad | src/lib/computer-use/actions/linkedin-connect.ts |
| 2 | Add connection_request arm to worker.ts | 1ace7ad | src/lib/action-worker/worker.ts |
| 3 | Mark TODO-phase6-connection-request.md as complete | 1dbf51a | src/features/actions/lib/TODO-phase6-connection-request.md |

## What Was Built

### linkedin-connect.ts
Exports `getLinkedInConnectPrompt(profileSlug, note, displayName?)` — a Haiku CU step-by-step prompt that:
- Handles Connect button in profile header AND More dropdown (both A/B placements)
- Always uses "Add a note" path (never "Send without note")
- Pastes exact `note` content without modification
- Verifies success via "Pending" button state or "Invitation sent" toast
- Reports 5 failure mode strings: `already_connected`, `security_checkpoint`, `session_expired`, `weekly_limit_reached`, `profile_unreachable`

### worker.ts connection_request arm
Six targeted changes to `src/lib/action-worker/worker.ts`:

1. **Import** — `getLinkedInConnectPrompt` imported alongside existing Reddit prompt functions
2. **Warmup gate cast** — extended to `"dm" | "like" | "follow" | "public_reply" | "connection_request"` 
3. **Step 10 navigation** — platform-aware: LinkedIn goes to `prospect.profile_url`; fails fast with logged error if `profile_url` is null; stashes `linkedinProfileHandle` local var
4. **Step 12 prompt dispatch** — `connection_request` branch calls `getLinkedInConnectPrompt(slug, content)`
5. **Step 15 success** — `connection_request` sets `pipeline_status = contacted`
6. **Step 15 failure** — LinkedIn-specific handling:
   - `already_connected` → `pipeline_status = connected` on prospect
   - `security_checkpoint` / `session_expired` → `health_status = warning` on account + logger.warn
   - `weekly_limit_reached` → `cooldown_until = now + 24h` on account (no health change)
   - `failure_mode` field in `job_logs.metadata` for all connection_request failures

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files exist and all commits verified:
- FOUND: src/lib/computer-use/actions/linkedin-connect.ts (7a2d2ad)
- FOUND: src/lib/action-worker/worker.ts (1ace7ad)
- FOUND: src/features/actions/lib/TODO-phase6-connection-request.md (1dbf51a)
- FOUND: .planning/phases/10-linkedin-outreach-execution/10-04-SUMMARY.md
