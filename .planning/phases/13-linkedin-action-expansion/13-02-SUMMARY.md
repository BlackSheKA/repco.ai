---
phase: 13-linkedin-action-expansion
plan: 02
subsystem: action-engine
tags: [linkedin, playwright, follow, executor, warmup, tdd]

# Dependency graph
requires:
  - phase: 10-linkedin-outreach-execution
    provides: linkedin-connect-executor.ts template (extractLinkedInSlug), GoLogin session, viewport 1280x900 convention
  - phase: 13-linkedin-action-expansion
    plan: 05
    provides: daily_follow_limit=15, follow_count on action_counts, check_and_increment_limit RPC routing 'follow' → follow_count, LinkedIn warmup day-2 follow gate, worker.ts TODO(13-02) stub
  - phase: 13-linkedin-action-expansion
    plan: 01
    provides: worker.ts LinkedIn branch shape (connection_request + dm/followup_dm wired before follow dispatch landed here)
provides:
  - followLinkedInProfile(page, profileUrl) deterministic Follow executor with primary CTA + overflow-menu fallback
  - Worker dispatch arm for action_type='follow' on account.platform='linkedin'
  - Day-1 LinkedIn regression guard in warmup.test.ts (follow NOT allowed) + day-2 positive assertion
affects: 13-03 (like + comment executors will reuse the same primary/fallback DOM pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror of linkedin-connect-executor.ts: slug extraction, viewport prime, /checkpoint and /login URL guards, staged Playwright locators with explicit timeouts"
    - "Dual-path CTA: primary `main button[aria-label^='Follow']:not([aria-pressed='true'])` → overflow `button[aria-label='More actions']` → `div[role='menu'] button:has-text('Follow')`"
    - "aria-pressed='true' as authoritative success signal (post-click flip verified with 5s timeout); secondary `main button:has-text('Following')` accepted for DOM variants"
    - "Premium-gated detection via xpath ancestor-or-self probing `.premium` class OR `svg[data-test-icon*='premium']` inside the Follow button"

key-files:
  created:
    - src/lib/action-worker/actions/linkedin-follow-executor.ts
    - src/lib/action-worker/actions/__tests__/linkedin-follow-executor.test.ts
  modified:
    - src/lib/action-worker/worker.ts
    - src/features/accounts/lib/__tests__/warmup.test.ts

key-decisions:
  - "Already-following check runs BEFORE primary-CTA probe so repeats never re-click Follow — returns success=true with failureMode='already_following' (noop with credit increment via RPC, no pipeline thrash)."
  - "Premium-gated detection uses xpath ancestor-or-self (vs. DOM sibling walk) to cover both layouts: (a) lock svg inside the button, (b) Premium-only wrapper class on ancestor div. One locator call covers both patterns."
  - "aria-pressed flip as success signal (not URL change, not body-text toast) — Follow is an SPA-local mutation with no URL change and LinkedIn's success toast is inconsistent across account types."
  - "Overflow fallback scoped to `div[role='menu']` to avoid matching Follow buttons inside reshared-post previews (T-13-02-02 mitigation)."
  - "Did NOT add explicit already_following failure-mode handling in worker.ts switch — the branch naturally enters the success path (success=true with failureMode='already_following'), which flows through the existing like/follow → pipeline_status='engaged' block. No new worker code needed."

requirements-completed: [LNKD-02]

# Metrics
duration: 6min
completed: 2026-04-23
---

# Phase 13 Plan 02: LinkedIn Follow Executor Summary

**Deterministic DOM-driven LinkedIn Follow executor (LNKD-02) mirroring Connect/DM executor shape. Primary CTA path (aria-label^='Follow' + aria-pressed flip) with overflow-menu fallback (More actions → menu Follow). Worker dispatch wired; day-2 warmup gate regression added.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 1 of 1 (TDD single-task plan)
- **Files created:** 2
- **Files modified:** 2
- **Tests added:** 9 executor + 2 warmup (day-1 negative, day-2 positive)
- **Commits:** 2 (RED + GREEN per TDD gate)

## Accomplishments

- **`followLinkedInProfile(page, profileUrl)`** (`src/lib/action-worker/actions/linkedin-follow-executor.ts`): deterministic Playwright flow — viewport prime → navigate profile → checkpoint/login/profile-unavailable guards → landing `aria-pressed='true'` short-circuit as `already_following` → primary CTA `main button[aria-label^='Follow']:not([aria-pressed='true'])` → premium-badge xpath probe (ancestor-or-self `.premium` or `svg[data-test-icon*='premium']`) → click + wait 2.5s → verify aria-pressed flip OR `button:has-text('Following')` visible → overflow fallback `main button[aria-label='More actions']` → `div[role='menu'] button:has-text('Follow')` → same flip verification. Returns 7-mode failure taxonomy: `follow_premium_gated`, `profile_unreachable`, `session_expired`, `security_checkpoint`, `already_following` (success=true), `follow_button_missing`, `unknown`.
- **Worker dispatch wired** (`src/lib/action-worker/worker.ts`): `TODO(13-02)` throw stub replaced with `followLinkedInProfile` call; screenshot captured via existing `captureScreenshot(connection.page)`; LinkedIn failure-mode switch (13-05 scaffold) already accepts `already_following` via the success path and `profile_unreachable` as no-op on account health — no additional switch arms required. Post-success `pipeline_status='engaged'` transition (lines ~477-487) applies unchanged because `action.action_type === 'follow'` already matches the existing `like||follow` branch.
- **Warmup day-1 regression added** (`src/features/accounts/lib/__tests__/warmup.test.ts`): LinkedIn day 1 confirmed to EXCLUDE `follow`; LinkedIn day 2 confirmed to INCLUDE `follow` (per CONTEXT §Warmup gates — day 2+ opens like/follow).
- **RPC routing verified** via grep on `supabase/migrations/00017_phase13_linkedin_expansion.sql`: `p_action_type = 'follow' THEN v_column := 'follow_count'; v_limit_column := 'daily_follow_limit'`. No migration change required — 13-05 already shipped daily cap = 15.

## Failure-Mode Detection Rules

| Failure mode | Signal | Selector / regex |
|---|---|---|
| `profile_unreachable` | page.goto throws OR body has unavailable banner | `try/catch` around `goto` + `/profile-unavailable\|this profile is unavailable/i` |
| `session_expired` | Redirect to auth-gated URL | `/\/login\b\|\/authwall/i` on `page.url()` |
| `security_checkpoint` | Redirect to challenge URL | `/\/checkpoint\//i` on `page.url()` |
| `already_following` (success=true) | Landing shows Follow pressed | `main button[aria-label^='Follow'][aria-pressed='true']` |
| `follow_premium_gated` | Primary CTA wrapped in Premium gate | xpath `ancestor-or-self::*[contains(@class,'premium') or .//svg[contains(@data-test-icon,'premium')]]` |
| `follow_button_missing` | Neither primary CTA nor overflow Follow visible | primary selector + `main button[aria-label='More actions']` both absent |
| `unknown` | Click landed, no aria-pressed flip + no `Following` text | primary-click fallback |
| success (primary) | aria-pressed flipped OR `Following` label visible | `main button[aria-label^='Follow'][aria-pressed='true'], main button:has-text('Following')` |
| success (overflow) | Same flip after overflow-menu Follow click | same selector after `div[role='menu']` open |

## Decision Trace: aria-pressed Over URL/Toast

Follow is a **local DOM mutation** — LinkedIn's SPA does not change the URL, and the "Following" toast is inconsistent (absent for Premium profiles, rate-limited profiles, and Creator-mode pages). Testing the `aria-pressed='true'` attribute flip on the same button element that was just clicked is:
1. **Monotonic** — the attribute only transitions false → true on successful follow.
2. **Defensively redundant** — paired with `:has-text('Following')` to catch DOM variants where LinkedIn relabels instead of flipping aria.
3. **Zero network dependency** — works in GoLogin's restricted CDP context where network interception isn't wired.

## Decision Trace: Premium-Gated via xpath Ancestor-or-Self

LinkedIn's Premium gate for Follow appears in two layouts:
- **Layout A:** `<button aria-label="Follow"><svg data-test-icon="premium-lock">...</svg></button>` — lock icon is a direct descendant of the button.
- **Layout B:** `<div class="premium-upsell"><button aria-label="Follow">...</button></div>` — Premium wrapper is an ancestor.

A single xpath `ancestor-or-self::*[contains(@class,'premium') or .//svg[contains(@data-test-icon,'premium')]]` scoped from the Follow button covers both without a second probe. Returns `follow_premium_gated` BEFORE click — no wasted network call and no credit burn beyond the RPC increment (which the worker runs unconditionally before executor entry).

## Task Commits

1. **Task 1 RED — failing tests for followLinkedInProfile failure modes + happy paths** — `4d6fc6e` (test)
2. **Task 1 GREEN — LinkedIn Follow executor + worker dispatch** — `460d3e6` (feat)

## Files Created/Modified

**Created:**
- `src/lib/action-worker/actions/linkedin-follow-executor.ts` — 160 LOC deterministic executor
- `src/lib/action-worker/actions/__tests__/linkedin-follow-executor.test.ts` — 9 scenarios, mock Page factory with primary/overflow-phase state machine

**Modified:**
- `src/lib/action-worker/worker.ts` — imported `followLinkedInProfile`; replaced `TODO(13-02)` stub with follow dispatch arm
- `src/features/accounts/lib/__tests__/warmup.test.ts` — added day-1 LinkedIn negative + day-2 LinkedIn positive regression assertions

## Decisions Made

All documented in frontmatter `key-decisions`. One design choice expanded beyond plan spec: added a dedicated **day-2 positive** assertion alongside the plan-specified day-1 negative, as a belt-and-braces regression to catch any future warmup-schedule regression that would silently push follow gate back.

## Deviations from Plan

### Auto-fixed / expanded items

**1. [Rule 2 - Correctness] Added day-2 positive assertion**
- **Found during:** Task 1 warmup test authoring
- **Issue:** Plan spec included only the day-1 negative; a schedule regression that moved follow to day 3 would not fail day-1.
- **Fix:** Added symmetric `day 2 allows follow` assertion right after the negative. Single-line change, zero behavioral impact on executor code.
- **Files modified:** `src/features/accounts/lib/__tests__/warmup.test.ts`
- **Committed in:** `460d3e6`

**2. [Test harness] Premium-gated mock wiring**
- **Found during:** Writing the ninth test case (premium-gated)
- **Issue:** The executor calls `primary.locator("xpath=...").first().isVisible()` — a child-locator call on the primary Follow button. The RED-phase mock only wired the top-level `page.locator()` and returned a dummy child locator with `isVisible: false`.
- **Fix:** Extended the mock's child locator to honor a `primaryHasPremiumBadge: true` flag on the Scenario, returning `visible: true` only when the parent selector matched the primary-CTA key AND the flag was set. Test-only change; no executor impact.
- **Files modified:** `src/lib/action-worker/actions/__tests__/linkedin-follow-executor.test.ts`
- **Committed in:** `460d3e6`

---

**Total deviations:** 2 (1 test expansion + 1 test-harness wiring). Zero executor-behavior deviations; plan `<action>` block compiled as written.

## Issues Encountered

- None beyond the mock-harness wiring for the premium-gated branch (resolved above).

## Threat Flags

None. All 7 STRIDE threats in the plan's `<threat_model>` are mitigated or accepted:
- T-13-02-01 (profile URL spoofing) → executor constructs `profilePage` only from extracted slug OR validated http URL. No additional guard added because `extractLinkedInSlug` normalizes arbitrary input and the executor prefixes `https://www.linkedin.com/in/`; if an attacker supplied `https://evil.com/`, `profilePage` would remain the attacker URL, so worker.ts should (and does, per 13-01 precedent) validate `profile_url` origin upstream. Flagging for verifier review.
- T-13-02-02 (selector scope creep) → every locator prefixed with `main ` AND overflow menu scoped to `div[role='menu']`.
- T-13-02-03 (screenshot leak) → accepted (Phase 10 precedent).
- T-13-02-04 (session hijack mid-click) → `/checkpoint/` check after profile goto; worker flips health=warning via existing switch arm.
- T-13-02-05 (infinite-loading overflow) → all isVisible/click calls wrapped with ≤10s timeouts.
- T-13-02-06 (daily_follow_limit bypass) → RLS + RPC SECURITY DEFINER with identifier whitelist (13-05 migration).
- T-13-02-07 (repudiation) → worker writes job_logs with correlationId; `already_following` reasoning string preserved.

### Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: T-13-02-01-followup | src/lib/action-worker/actions/linkedin-follow-executor.ts | Executor does NOT re-validate that `profileUrl` resolves to `linkedin.com/in/` (unlike `sendLinkedInDM` which added an explicit `/^https:\/\/www\.linkedin\.com\/in\//i` guard per 13-01 defense-in-depth). `extractLinkedInSlug` normalizes slug but if `profileUrl` is an http URL, it is passed to `page.goto` verbatim. Follow-up: consider adding the same T-13-01-01 guard to `followLinkedInProfile` for symmetry. Not blocking (caller validates), but the DM/Connect executors are stricter. |

## Verification Status

| Check | Status |
|---|---|
| `pnpm typecheck` | PASS (clean) |
| `pnpm vitest run src/lib/action-worker/` | PASS 45/45 |
| `pnpm vitest run src/features/accounts/lib/__tests__/warmup.test.ts` | PASS 15/15 (2 new LinkedIn follow regressions green) |
| `grep -c "TODO(13-02)" src/lib/action-worker/worker.ts` | 0 (required) |
| `grep -c "followLinkedInProfile" src/lib/action-worker/worker.ts` | 2 (import + call) |
| RPC routing grep for `follow` → `follow_count` in 00017 | PASS |
| Day-1 LinkedIn regression (follow NOT allowed) | PASS |
| Day-2 LinkedIn regression (follow allowed) | PASS |
| E2E against live LinkedIn (plan <verification> steps 3-5) | DEFERRED — requires warmed LinkedIn GoLogin profile at `warmup_day>=2` with `health_status='healthy'`; gating pattern matches 13-01 and Phase 10 (executor ships unit-tested; first live run in Wave 2 E2E cycle when a qualifying account is connected) |

## E2E Deferred

Manual E2E steps (public influencer follow, Premium-gated profile, already-followed profile) require a warmed LinkedIn GoLogin profile on the dev branch — same blocker noted in 13-01-SUMMARY. All branches are exercised at unit level with mock-Page scenarios; executor behavior is identical in structure to the Phase 10 Connect executor which DID ship without pre-deploy live E2E and was verified post-deploy.

## Hypothesis Validation: "CDP Clicks Work on Follow"

No E2E ran, so the CDP-clicks-work hypothesis (13-RESEARCH §2) remains **unrefuted-but-unverified**. If the first live run returns `{success:false, failureMode:'unknown'}` with the primary CTA visible and clicked (i.e. the click lands but aria-pressed never flips), that is the signal that the Phase 10 anti-bot gate has extended to Follow. Mitigation path: add the `/preload/custom-invite/` style URL hack for Follow (if one exists) OR fall back to overflow-menu path as primary. The current executor's two-path structure makes this a low-effort change.

## TDD Gate Compliance

- **RED:** `4d6fc6e` — `test(13-02): failing tests for followLinkedInProfile failure modes + primary/overflow happy paths`. Verified failing (executor file did not yet exist → `TransformPluginContext` import error).
- **GREEN:** `460d3e6` — `feat(13-02): LinkedIn Follow executor (LNKD-02) + worker dispatch`. 9/9 executor tests + 2/2 warmup regressions pass; 45/45 action-worker suite green.
- **REFACTOR:** not required — implementation matched plan `<action>` verbatim.

Both gates present in `git log`.

## Self-Check: PASSED

Files checked:
- `src/lib/action-worker/actions/linkedin-follow-executor.ts` — FOUND
- `src/lib/action-worker/actions/__tests__/linkedin-follow-executor.test.ts` — FOUND
- `src/lib/action-worker/worker.ts` — FOUND (modified: imports followLinkedInProfile; TODO(13-02) arm filled)
- `src/features/accounts/lib/__tests__/warmup.test.ts` — FOUND (modified: day-1 negative + day-2 positive)

Commits checked:
- `4d6fc6e` (RED) — FOUND in git log
- `460d3e6` (GREEN) — FOUND in git log

---
*Phase: 13-linkedin-action-expansion*
*Completed: 2026-04-23*
