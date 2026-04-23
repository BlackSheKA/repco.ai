---
phase: 13-linkedin-action-expansion
plan: 01
subsystem: action-engine
tags: [linkedin, playwright, dm, executor, warmup, tdd]

# Dependency graph
requires:
  - phase: 10-linkedin-outreach-execution
    provides: linkedin-connect-executor.ts template (extractLinkedInSlug), GoLogin session, viewport 1280x900 convention
  - phase: 13-linkedin-action-expansion
    plan: 05
    provides: platform-aware check_and_increment_limit RPC (dm→dm_count/daily_dm_limit), LinkedIn warmup day-7 dm gate, worker.ts platform dispatch scaffold with TODO(13-01) arms
provides:
  - sendLinkedInDM(page, profileUrl, message) deterministic DM executor (1st-degree only) with 8-mode failure taxonomy
  - Worker dispatch arms for action_type='dm' and 'followup_dm' on account.platform='linkedin'
  - Day-6 LinkedIn regression guard in warmup.test.ts
affects: 13-04 (followup_dm routing will reuse this executor)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror of linkedin-connect-executor.ts: slug extraction, viewport prime, /checkpoint and /login URL guards, staged Playwright locators with explicit timeouts"
    - "Defense-in-depth origin check (T-13-01-01): refuse to navigate if profile URL is not https://www.linkedin.com/in/…"
    - "Two-tier Send locator: primary .msg-form__send-button class; fallback scoped button:has-text('Send') inside composer section"
    - "Dual success signal: thread-DOM li.msg-s-message-list__event matches typed prefix (primary); 'message sent' toast copy (secondary)"

key-files:
  created:
    - src/lib/action-worker/actions/linkedin-dm-executor.ts
    - src/lib/action-worker/actions/__tests__/linkedin-dm-executor.test.ts
  modified:
    - src/lib/action-worker/worker.ts
    - src/features/accounts/lib/__tests__/warmup.test.ts

key-decisions:
  - "No auto-swap on not_connected failure — user re-approves as connection_request per 13-CONTEXT.md §Non-1st-degree DM handling. Approval-contract integrity over convenience."
  - "Did NOT use /messaging/thread/new/?recipient={slug} URL hack — per 13-RESEARCH.md §2 it is an unverified hypothesis and the Phase 10 anti-bot gate was Connect-button-specific (Landmine #1). Profile-page Message click is the verified baseline."
  - "message_disabled banner checked BEFORE Message button click (banner renders at profile level, not after open) — more robust and saves an anti-bot interaction against a restricted target."
  - "Step 10 navigation broadened from action_type==='connection_request' gate to platform==='linkedin' — every LinkedIn executor (including dm) now receives the viewport prime + profile goto, keeping sendLinkedInDM's responsibilities scoped to DM flow only."
  - "Happy-path verification uses DUAL signal (thread DOM || toast body text) rather than URL redirect, because LinkedIn's SPA keeps the same URL after Send; either signal alone is flaky."

requirements-completed: [LNKD-01]

# Metrics
duration: 12min
completed: 2026-04-23
---

# Phase 13 Plan 01: LinkedIn DM Executor Summary

**Deterministic DOM-driven LinkedIn DM executor (1st-degree only) mirroring `linkedin-connect-executor.ts`; worker.ts `TODO(13-01)` arms filled for `dm` + `followup_dm` on LinkedIn accounts; 8-mode failure taxonomy surfaces in `job_logs.metadata.failure_mode`.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 1 of 1 (TDD single-task plan)
- **Files created:** 2
- **Files modified:** 2
- **Tests added:** 8 (executor) + 1 (warmup regression)
- **Commits:** 2 (RED + GREEN per TDD gate)

## Accomplishments

- **`sendLinkedInDM(page, profileUrl, message)`** (`src/lib/action-worker/actions/linkedin-dm-executor.ts`): deterministic Playwright flow — viewport prime → navigate profile → checkpoint/login URL guards → Message-button 1st-degree check → message_disabled banner pre-check → click Message → wait for `.msg-form__contenteditable` → type message via `page.keyboard.type` (delay 15ms) → click primary Send (`.msg-form__send-button`) OR fallback (`section:has(.msg-form__contenteditable) button:has-text('Send')`) → post-send URL/banner checks → dual success signal (thread DOM match on typed prefix; OR 'message sent' / 'you sent' toast). All 8 taxonomy modes surface: `not_connected`, `message_disabled`, `session_expired`, `security_checkpoint`, `weekly_limit_reached`, `dialog_never_opened`, `send_button_missing`, `unknown`.
- **Worker dispatch wired** (`src/lib/action-worker/worker.ts`): two `TODO(13-01)` throw stubs replaced with `sendLinkedInDM` call for `action.action_type === 'dm' || 'followup_dm'` inside the LinkedIn platform branch. Final screenshot captured via existing `captureScreenshot(connection.page)` helper. Existing post-success `pipeline_status='contacted'` transition (lines ~450-454) executes unchanged because the LinkedIn DM branch feeds the same `result.success` path. Existing LinkedIn-specific failure-mode → health/cooldown block (lines ~490-528) handles `security_checkpoint`/`session_expired`→warning and `weekly_limit_reached`→cooldown+24h with no additional code.
- **Step 10 navigation broadened** so LinkedIn `dm`/`followup_dm` also receive the profile goto + viewport 1280x900 prime (previously gated to `connection_request` only).
- **Warmup day-6 regression test** added to `src/features/accounts/lib/__tests__/warmup.test.ts` confirming LinkedIn day 6 excludes `dm` while retaining `public_reply` + `connection_request`.
- **No code change required** in `limits.ts` — migration 00017 already routes `dm`/`followup_dm` → `dm_count`/`daily_dm_limit` platform-aware (verified by RPC source inspection: `ELSIF p_action_type IN ('dm','followup_dm') THEN v_column := 'dm_count'; v_limit_column := 'daily_dm_limit'`).
- **T-13-01-01 mitigation landed**: early-return `{success:false, failureMode:'not_connected'}` when the resolved profile URL does not match `^https://www\.linkedin\.com/in/` — defense-in-depth against prospect.profile_url tampering.

## Failure-Mode Detection Rules

| Failure mode | Signal | Selector / regex |
|---|---|---|
| `not_connected` | Message button absent on profile | `main button[aria-label^='Message']` not visible |
| `message_disabled` | Banner on profile body before Message click | `/limited who can message\|has restricted who can message/i` |
| `session_expired` | Redirect to auth-gated URL after profile goto | `/\/login\b\|\/authwall/i` on `page.url()` |
| `security_checkpoint` | Redirect to challenge URL (before OR after Send) | `/\/checkpoint\//i` on `page.url()` |
| `dialog_never_opened` | Composer contenteditable never mounts after Message click | `div.msg-form__contenteditable[contenteditable='true']` not visible within 7s |
| `send_button_missing` | Neither primary nor fallback Send button visible | `.msg-form__send-button` AND `section:has(div.msg-form__contenteditable) button:has-text('Send')` both not visible |
| `weekly_limit_reached` | Banner on post-send body | `/weekly.*(message\|limit)\|reached.*limit/i` |
| `unknown` | Send clicked but neither thread-DOM match nor toast copy found | fallback |
| success | Thread DOM contains typed prefix OR body has toast | `li.msg-s-message-list__event:has-text(<first 40 chars>)` OR `/message sent\|you sent/i` |

## Decision Trace: Non-1st-Degree Handling

Per `13-CONTEXT.md §Non-1st-degree DM handling`, when the Message button is absent on a prospect profile (prospect is not a 1st-degree connection):

1. Executor returns `{success:false, failureMode:'not_connected'}`.
2. Worker writes `failure_mode='not_connected'` to `job_logs.metadata`.
3. Worker marks `action.status='failed'` (no pipeline transition — prospect stays at its current stage).
4. **No auto-swap** to `connection_request`. The user re-approves the prospect via the approval queue as a connection request.

Rationale: auto-swapping would silently change the action contract the user approved. The approval queue surfaces `failure_mode='not_connected'` as a UI badge (outside this plan's scope) so the user can re-approve with intent.

Grep-verified: `grep -q "action_type.*=.*connection_request" src/lib/action-worker/worker.ts` inside the new DM branch returns no match.

## Decision Trace: Why Not `/messaging/thread/new/?recipient={slug}`

Per `13-RESEARCH.md §2`:

> The URL hack for DM (analog to the `/preload/custom-invite/?vanityName=` path that unlocked Connect in Phase 10) is an **unverified hypothesis**. The Phase 10 anti-bot gate was **Connect-button-specific** — the reason `page.click()` fails on Connect is `isTrusted:false` rejection on that particular button's event listener. The Message button in Phase 10 testing responded normally to `page.click()` on both profile pages and search results.

Profile-page Message click is therefore the verified baseline for LNKD-01. If a future anti-bot regression lands on the Message button, the URL hack can be added as a fallback — the current executor's structure (`messageBtn.click → composer wait`) maps cleanly to `page.goto(thread/new?recipient=slug) → composer wait` with no other changes.

## Task Commits

1. **Task 1 RED — failing tests for sendLinkedInDM failure modes + happy path** — `2159339` (test)
2. **Task 1 GREEN — LinkedIn DM executor + worker dispatch** — `35b5400` (feat)

## Files Created/Modified

**Created:**
- `src/lib/action-worker/actions/linkedin-dm-executor.ts` — 180 LOC deterministic executor
- `src/lib/action-worker/actions/__tests__/linkedin-dm-executor.test.ts` — 8 scenarios, mock Page factory with Send-priority selector matching

**Modified:**
- `src/lib/action-worker/worker.ts` — imported `sendLinkedInDM`; replaced two TODO stubs with dm/followup_dm dispatch; broadened step-10 LinkedIn navigation gate from `connection_request` to `platform==='linkedin'`
- `src/features/accounts/lib/__tests__/warmup.test.ts` — added day-6 LinkedIn regression assertion

## Decisions Made

All documented in frontmatter `key-decisions`. No novel decisions beyond plan spec — the plan's `<action>` block was concrete enough to follow verbatim except for one test-harness mechanical fix (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Test harness] Selector-match priority in mock Page factory**
- **Found during:** First GREEN test run (send_button_missing case failed)
- **Issue:** The fallback Send selector (`section:has(div.msg-form__contenteditable) button:has-text('Send')`) contains both the composer key (`msg-form__contenteditable`) and the fallback key (`button:has-text('Send')`). The original `Object.keys()` iteration order returned the composer spec first (visible:true), causing the executor to click the fallback button instead of returning `send_button_missing`.
- **Fix:** Mock `selectorMatch` now prefers Send-related keys when the selector string contains "send", falling back to non-Send keys otherwise. Preserves existing behavior for all other selectors; surgical change to the mock only.
- **Files modified:** `src/lib/action-worker/actions/__tests__/linkedin-dm-executor.test.ts` (test harness only)
- **Verification:** 8/8 executor tests green; 313/313 full suite.
- **Committed in:** `35b5400`

### Process deviations from plan spec

**Plan-§E warmup change left in 13-05 as-shipped** — the plan said to verify `"dm"` already present in the LinkedIn day-7+ `allowedActions` array AND that warmup.test.ts asserts it. Both verified via `grep` and test run. No change to `types.ts`; added only the new day-6 regression test (plan-required).

---

**Total deviations:** 1 auto-fixed (test-harness only, no executor behavior impact).

## Issues Encountered

- Selector-priority test harness bug (resolved above). Otherwise the plan's concrete implementation block compiled and ran correctly on first GREEN pass.

## Threat Flags

None. All 7 STRIDE threats in the plan's `<threat_model>` are mitigated or accepted:
- T-13-01-01 (profile URL spoofing) → executor guard added (see Accomplishments).
- T-13-01-02 (DM content tampering) → verbatim typing, no interpolation.
- T-13-01-03 (DM body in Sentry) → `reasoning` only ever contains short diagnostics, never the message body.
- T-13-01-04 (session hijack on checkpoint) → single-attempt; worker flips health to warning.
- T-13-01-05 (hostile profile DoS) → all locator ops have explicit 3-10s timeouts.
- T-13-01-06 (missing telemetry on auto-swap) → no auto-swap; `not_connected` surfaces distinctly.
- T-13-01-07 (privilege elevation) → accepted; no new privilege surface.

No new surface beyond the plan's threat register was introduced.

## Verification Status

| Check | Status |
|---|---|
| `pnpm typecheck` | PASS (clean) |
| `pnpm vitest run src/lib/action-worker/` | PASS 41/41 |
| `pnpm vitest run src/features/accounts/lib/__tests__/warmup.test.ts` | PASS 13/13 |
| `pnpm vitest run` (full suite) | PASS 313/313 |
| `grep -c "TODO(13-01)" src/lib/action-worker/worker.ts` | 0 (required) |
| `grep -c "sendLinkedInDM" src/lib/action-worker/worker.ts` | 2 (import + call) |
| `grep -q "action_type.*=.*connection_request"` inside DM branch | no match (no auto-swap) |
| Day-6 LinkedIn regression for dm | PASS |
| E2E against live LinkedIn (plan <verification> step 4-6) | DEFERRED — no warmed LinkedIn account available on dev branch; ship gated behind Wave 2 E2E cycle |

## E2E Deferred

The plan's manual E2E steps (live 1st-degree send, non-1st-degree fail-clean, signed-out session-expired) require a warmed LinkedIn GoLogin profile at `warmup_day>=7` with `health_status='healthy'`, which is not yet provisioned on the dev branch. All three scenarios are exercised at the unit-test level via mock-Page scenarios covering each failure mode. The first live run will happen as part of the Wave 2 E2E cycle once a qualifying account is connected — gating pattern matches Phase 10 (connection_request shipped without live E2E; verified post-deploy).

## TDD Gate Compliance

- **RED:** `2159339` — `test(13-01): failing tests for sendLinkedInDM failure modes + happy path`. Verified failing (`TransformPluginContext` error because executor file did not yet exist).
- **GREEN:** `35b5400` — `feat(13-01): LinkedIn DM executor (LNKD-01) + worker dispatch`. 8/8 executor tests pass; 313/313 full suite.
- **REFACTOR:** not required — implementation matched plan spec on first GREEN pass (after the 1-line test-harness fix noted under Deviations).

Both gates present in `git log`.

## Self-Check: PASSED

Files checked:
- `src/lib/action-worker/actions/linkedin-dm-executor.ts` — FOUND
- `src/lib/action-worker/actions/__tests__/linkedin-dm-executor.test.ts` — FOUND
- `src/lib/action-worker/worker.ts` — FOUND (modified: imports sendLinkedInDM; dispatch arms filled)
- `src/features/accounts/lib/__tests__/warmup.test.ts` — FOUND (modified: day-6 regression test)

Commits checked:
- `2159339` (RED) — FOUND in git log
- `35b5400` (GREEN) — FOUND in git log

---
*Phase: 13-linkedin-action-expansion*
*Completed: 2026-04-23*
