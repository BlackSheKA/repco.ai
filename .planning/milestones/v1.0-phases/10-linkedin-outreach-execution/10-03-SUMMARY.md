---
phase: 10-linkedin-outreach-execution
plan: "03"
subsystem: accounts/connection-flow
tags: [linkedin, onboarding, connection-flow, platform-aware, copy]
dependency_graph:
  requires: [10-01]
  provides: [ONBR-05-copy-parity]
  affects: [connection-flow.tsx, account-list.tsx, account-card.tsx]
tech_stack:
  added: []
  patterns: [platform-label-derivation, conditional-jsx-rendering]
key_files:
  modified:
    - src/features/accounts/components/connection-flow.tsx
    - src/features/accounts/components/account-list.tsx
    - src/features/accounts/components/account-card.tsx
decisions:
  - platform prop threaded through ConnectionFlow -> AccountList -> AccountCard to ensure reconnect paths also carry platform
  - AccountCard onReconnect signature extended to pass platform (account.platform already in scope)
  - platformLabel derived as simple ternary (linkedin -> "LinkedIn", else "Reddit") — no lookup table needed for 2 platforms
metrics:
  duration: 3min
  completed_date: "2026-04-21"
  tasks_completed: 1
  files_modified: 3
---

# Phase 10 Plan 03: Platform-Aware ConnectionFlow Copy Summary

**One-liner:** Replaced hardcoded "Checking Reddit login status" with dynamic `platformLabel` and added conditional LinkedIn 2FA guidance in ConnectionFlow step-1.

## What Was Built

`ConnectionFlowProps` gains a required `platform: "reddit" | "linkedin"` prop. A `platformLabel` constant is derived from it ("LinkedIn" or "Reddit") and used in the step-2 spinner copy. The step-1 instruction list conditionally renders a LinkedIn 2FA/email-verification guidance sentence when `platform === "linkedin"`. The platform is threaded through from `AccountList` (which tracks `newAccountPlatform` state) and `AccountCard` (whose `onReconnect` callback now passes `account.platform` as the third argument).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add platform prop and replace hardcoded Reddit copy | 798a9d4 | connection-flow.tsx, account-list.tsx, account-card.tsx |

## Deviations from Plan

**1. [Rule 2 - Missing functionality] AccountCard onReconnect signature updated to pass platform**

- **Found during:** Task 1
- **Issue:** The plan said to find the ConnectionFlow call site and pass `platform`. The call site in `account-list.tsx` has two code paths: `submitHandle` (always Reddit) and `handleReconnect` (called by `AccountCard`). `AccountCard` already has `account.platform` in scope but `onReconnect` only passed `accountId` and `profileId`. Without threading platform through, the reconnect path would default to "reddit" for LinkedIn accounts.
- **Fix:** Extended `AccountCard.onReconnect` prop type to `(accountId, profileId, platform)` and passed `account.platform` at the call site. `AccountList.handleReconnect` updated to match the new signature.
- **Files modified:** account-card.tsx, account-list.tsx
- **Commit:** 798a9d4

## Verification Results

```
grep 'platformLabel' connection-flow.tsx       -> PASS
grep 'Checking {platformLabel} login status'   -> PASS
no literal "Checking Reddit" remains           -> PASS
2FA guidance present in step-1                 -> PASS
pnpm typecheck                                 -> exit 0 (PASS)
```

## Self-Check: PASSED

- `src/features/accounts/components/connection-flow.tsx` — exists, contains `platformLabel`
- `src/features/accounts/components/account-list.tsx` — exists, contains `newAccountPlatform`
- `src/features/accounts/components/account-card.tsx` — exists, contains updated `onReconnect` signature
- Commit `798a9d4` — exists in git log
