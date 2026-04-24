---
status: partial
phase: 13-linkedin-action-expansion
source: [13-VERIFICATION.md]
started: 2026-04-23
updated: 2026-04-24T07:30:00Z
---

## Current Test

[testing paused — discovered 2 new prod issues during live UAT: (a) GoLogin account `linkedin-6966fe1e` is logged out of LinkedIn (executor hits signup wall, misclassifies results); (b) GoLogin Cloud plan at "max parallel cloud launches limit" blocks repeated executor runs. Plus 1 new classifier bug: prescreen DOM classifier cannot distinguish "valid 1st-degree prospect" from "logged-out session with no buttons visible" — both return verdict=null.]

## Tests

### 1. LinkedIn DM executor E2E against a 1st-degree target from warmed GoLogin profile
expected: Action transitions to status=completed; prospect.pipeline_status='contacted'; DM visible in LinkedIn inbox
result: blocked
blocked_by: no_1st_degree_target + gologin_plan_limit
reason: "No prospect in prod DB is confirmed 1st-degree to either account (aleksander-azarow was previously stamped 'contacted' from a connection_request that turns out to have never been accepted — see Test 2). Additionally, `linkedin-6966fe1e` account is LOGGED OUT of LinkedIn (screenshot from Test 2 shows 'Join LinkedIn' signup wall at /in/aleksander-azarow-09ab6a225 instead of the profile)."

### 2. LinkedIn DM executor E2E against a non-1st-degree target
expected: job_logs.metadata.failure_mode='not_connected'; NO auto-swap to connection_request; action.status='failed'
result: inconclusive
evidence: |
  Ran DM action a036bf22 against aleksander-azarow via `linkedin-6966fe1e` on prod (dpl_1f93rxmnl).
  - HTTP response: {"success":false,"error":"not_connected"}, duration 159s
  - action.status=failed, action.error="not_connected", action.executed_at=2026-04-24T07:02:46Z
  - job_logs.metadata.failure_mode="not_connected", action_type remained "dm" (NO swap to connection_request) ✓
  - Screenshot captured at step-1 ✓
  STRUCTURALLY matches Test 2 expected outcome.
  HOWEVER — the screenshot reveals the page visited was NOT aleksander's profile; it was LinkedIn's "Join LinkedIn" signup wall. Meaning `linkedin-6966fe1e` GoLogin profile session is not authenticated. The `not_connected` verdict therefore reflects "no Message button because LinkedIn is blocking us from seeing any profile at all" rather than the intended "target profile is viewable but has no Message button because not 1st-degree".
  The executor's failure-mode taxonomy + dispatch + no-auto-swap semantics ARE verified. The test's STATED purpose (distinguishing non-1st-degree from other failure modes) is NOT fully verified.
related_issue: "gologin_account_logged_out"

### 3. LinkedIn Follow executor E2E (standard + Premium-gated profile)
expected: Standard — Follow button toggles; prospect.pipeline_status='engaged'. Premium-gated — failure_mode='follow_premium_gated'
result: inconclusive
evidence: |
  Attempt 1 (via `linkedin-6966fe1e` → williamhgates): failed with `follow_button_missing` in 121s; screenshot shows "Join LinkedIn" signup wall — same logout issue as Test 2.
  Attempt 2 (via `rich-repco` → williamhgates, after reassignment): failed with `GoLogin connection failed: 403 "You've reached max parallel cloud launches limit"`. Retry after 90s cooldown still 503/403.
  The executor's origin guard + failure-mode detection cannot be asserted under these conditions.
related_issues: [gologin_account_logged_out, gologin_plan_parallel_limit]

### 4. LinkedIn Like executor E2E on a normal, 404, and private post
expected: Normal — React pressed-flip verified. 404/private — failure_mode='post_unreachable' or 'post_deleted'
result: blocked
blocked_by: no_post_urls + gologin_plan_limit + gologin_account_logged_out
reason: "Like executor resolves post_url via prospects.intent_signal_id → intent_signals.post_url. Prod intent_signals table has no LinkedIn post URL rows seeded. No curated test posts (normal/404/private) in DB. Additionally constrained by GoLogin plan + account login state."

### 5. LinkedIn Comment executor E2E on commentable + comment-disabled post
expected: Commentable — Quill fill + submit succeeds, comment appears. Disabled — failure_mode='comment_disabled'
result: blocked
blocked_by: no_post_urls + gologin_plan_limit + gologin_account_logged_out
reason: "Same structural blockers as Test 4: no post URLs in intent_signals, GoLogin constraints."

### 6. followup_dm scheduling end-to-end for a LinkedIn prospect
expected: schedule-followups cron creates followup_dm action; worker warmup gate (H-05) allows it on LinkedIn day ≥7; sendLinkedInDM dispatched
result: blocked
blocked_by: no_eligible_contacted_prospect + gologin_account_logged_out
reason: "schedule-followups cron creates followup_dm rows for prospects with pipeline_status='contacted' at day 3/7/14 after contact. aleksander-azarow is contacted but (a) only 2 days ago (no checkpoint hits), (b) wasn't actually contacted successfully per Test 2 finding (executor hit signup wall). Dispatch path verified via unit tests (worker-linkedin-followup.test.ts, 290-tests-passing suite), not live."

### 7. Pre-screen cron against real 'detected' LinkedIn prospects
expected: Creator-mode profile → pipeline_status='unreachable', reason='creator_mode_no_connect'; 1st-degree → 'connected'; 404 → 'unreachable'/profile_unreachable; checkpoint → account health='warning' and run aborts
result: pass_with_caveat
evidence: |
  Round 1 (2026-04-23T16:00:27Z, dpl_rg4fo2xhs, pre-fix): silent failure — returned no_healthy_account despite 2 healthy accounts. Root cause: non-existent column in order clause. Fixed in commit 0df91b1.
  Round 2 (2026-04-23T16:16:10Z, dpl_1f93rxmnl, post-fix): screened:1, 20.7s. rich-repco account selected, kamilwandtke prospect visited, verdict=null, last_prescreen_attempt_at stamped per-prospect, job_log row written, no checkpoints.
caveat: |
  **NEW BUG SURFACED:** classifyPrescreenResult in route.ts:44-53 returns null (valid candidate) when all three DOM signals (Message / Connect / Follow button) are absent. But this DOM state ALSO occurs when the account session is logged out — LinkedIn serves a signup/login wall instead of the profile. The classifier cannot distinguish "valid happy path" from "logged-out blind". On this run, we cannot prove rich-repco was actually authenticated; the null verdict is consistent with both states.
  Severity: major (silent false-negative risk — prospects kept as 'detected' when in reality no classifier signal was ever obtained).
fix_applied: "src/app/api/cron/linkedin-prescreen/route.ts:91 — `last_used_at` → `session_verified_at`. Deployed via PR #2 (merge 975576f) on dpl_1f93rxmnl."

### 8. Security checkpoint handling (session burn avoidance)
expected: First checkpoint detection flips social_accounts.health_status='warning'; no retry inside executor; run/cron aborts
result: skipped
reason: "Cannot intentionally trigger a LinkedIn checkpoint from UAT. Route.ts:191-196 handles checkpoint structurally (update account health='warning', break loop). Unit tests in linkedin-prescreen route.test.ts (8/8) cover the structural branch; live trigger requires organic LinkedIn anti-bot flag."

## Summary

total: 8
passed: 1 (Test 7, with classifier caveat)
issues: 0 (explicit — but 3 new issues surfaced in gaps below)
pending: 0
skipped: 1 (Test 8)
blocked: 3 (Tests 1, 4, 5, 6 partially; Tests 2, 3 inconclusive)
inconclusive: 2 (Tests 2, 3)

## Gaps

- truth: "Pre-screen cron picks a healthy LinkedIn account and classifies prospects"
  status: fixed
  reason: "Route ordered by non-existent column `social_accounts.last_used_at`; PostgREST 42703 silently collapsed to `no_healthy_account` on prod (2 healthy accounts present)."
  severity: blocker
  test: 7
  fix: "src/app/api/cron/linkedin-prescreen/route.ts:91 — swap to `session_verified_at` (existing column, same LRU semantic). Commit 0df91b1, PR #2 merged to main, deployed prod as dpl_1f93rxmnl."
  artifacts: [src/app/api/cron/linkedin-prescreen/route.ts]

- truth: "Prescreen classifier distinguishes viewable-profile results from no-access results"
  status: open_new_finding
  reason: "classifyPrescreenResult returns null (valid candidate) when all three DOM signals are absent. This state matches BOTH the intended happy path (viewable profile with Message button just below 1500ms locator timeout, or no UI for connect because already-connected via different UI variant) AND the undesired 'session logged out so LinkedIn serves signup wall' state. The classifier silently keeps such prospects as 'detected', masking the underlying session failure."
  severity: major
  test: 7
  remediation_suggestion: "Add a login-wall detector to PrescreenState (e.g. `urlContainsAuthwall: /linkedin.com\\/(login|signup|join)/.test(currentUrl)` OR a check for specific signup-wall markup). Treat as a different failure mode — either a new verdict `account_logged_out` that flips social_accounts.health_status='warning' immediately, or at minimum log it as a warning + skip the prospect without stamping last_prescreen_attempt_at."
  artifacts: [src/app/api/cron/linkedin-prescreen/route.ts:44-53, src/app/api/cron/linkedin-prescreen/route.ts:204-234]

- truth: "LinkedIn DM executor distinguishes non-1st-degree from logged-out state"
  status: open_new_finding
  reason: "Same underlying issue — linkedin-dm-executor.ts detects absence of Message button selector and maps to `not_connected`. The dm executor has no signal that would differentiate 'target is non-1st-degree (expected 2nd/3rd degree UX)' from 'account is logged out so we can't see any profile at all'. On prod Test 2, action a036bf22 reported not_connected despite the screenshot showing LinkedIn's signup wall."
  severity: major
  test: 2
  remediation_suggestion: "Before classifying as not_connected, verify the executor is viewing a profile page, not an auth wall. Add a precondition check (URL pattern for /in/{slug}/ + profile-header DOM signal) and emit a distinct failure_mode `session_expired` when the check fails — already in the taxonomy per worker.ts:612-615, just not wired in the DM executor."
  artifacts: [src/lib/action-worker/actions/linkedin-dm-executor.ts]

- truth: "GoLogin profile `linkedin-6966fe1e` has an authenticated LinkedIn session"
  status: open_operational
  reason: "Screenshot from Test 2 run (screenshot_url stored at supabase storage for action a036bf22) shows LinkedIn 'Join LinkedIn' signup wall when visiting /in/aleksander-azarow-09ab6a225, proving the GoLogin profile session is no longer logged in. Any executor run against this account will hit the login wall and produce misleading failure modes."
  severity: blocker
  test: 1, 2, 3, 4, 5, 6
  remediation: "User must log in manually via GoLogin profile 69e8dd25ddc8c6b0ca0c99bf to LinkedIn and set social_accounts.session_verified_at."
  artifacts: [https://cmkifdwjunojgigrqwnr.supabase.co/storage/v1/object/sign/screenshots/actions/a036bf22-10f7-47e2-900c-a644d80405ab/step-1.png]

- truth: "GoLogin Cloud plan supports enough parallel launches for executor UAT"
  status: open_operational
  reason: "During Test 3 retry, GoLogin Cloud returned HTTP 503 wrapping 403 `You've reached max parallel cloud launches limit. To run more update your plan`. Session from the previous DM run (Test 2) was still consuming a slot. Retry after 90s did not free it."
  severity: major
  test: 3, 4, 5, 6 (any live executor UAT)
  remediation_suggestion: "Either (a) upgrade GoLogin plan, (b) ensure `disconnectProfile` is always called — particularly on fast-fail paths (origin guard, preflight rejections) where the worker may exit without going through the finally block, (c) reduce MAX_RETRIES or BASE_DELAY_MS in adapter for preflight failures, or (d) add an ops ping to check active parallel sessions before triggering a burst of UAT actions."
  artifacts: [src/lib/gologin/adapter.ts:30-75]

- truth: "Tests 1-6 exercise DM / Follow / Like / Comment / followup_dm executors end-to-end"
  status: blocked
  reason: "Cannot complete live UAT until (a) both GoLogin profiles are re-logged-in to LinkedIn, (b) GoLogin plan parallelism is resolved or sessions are explicitly disconnected between runs, (c) diverse prospects + intent_signal rows are seeded (non-1st-degree confirmed, Premium-gated creator, normal/404/private posts, commentable/disabled posts)."
  severity: major
  test: 1, 2, 3, 4, 5, 6
  artifacts: [src/lib/action-worker/actions/linkedin-*-executor.ts]

- truth: "Security checkpoint burns the session safely"
  status: not_exercised
  reason: "Checkpoint path cannot be triggered from UAT without engineered malfunction; structural code verified by unit tests. Awaits live occurrence to validate end-to-end."
  severity: minor
  test: 8
  artifacts: [src/app/api/cron/linkedin-prescreen/route.ts:191-196]
