---
status: partial
phase: 13-linkedin-action-expansion
source: [13-VERIFICATION.md]
started: 2026-04-23
updated: 2026-04-24T07:30:00Z
---

## Current Test

[2026-04-24T09:45 — all 3 UAT-surfaced bugs fixed and verified live on prod:
 - authwall detector wired into 4 executors + prescreen classifier (PR #3, deploy dpl_nrpruurup)
 - detector timeout + body-text fallback added after flaky first retry (PR #4, deploy dpl_7agiadu7l)
 - GoLogin releaseProfile() replaces disconnectProfile no-op — 3 back-to-back executor runs now work without "max parallel cloud launches" 403
 - post-fix retest: 3/3 DM runs through logged-out linkedin-6966fe1e correctly return session_expired (was not_connected pre-fix)
 - account health state machine auto-flipped linkedin-6966fe1e to `warning` after repeated session_expired failures — exactly the intended system protection]

## Tests

### 1. LinkedIn DM executor E2E against a 1st-degree target from warmed GoLogin profile
expected: Action transitions to status=completed; prospect.pipeline_status='contacted'; DM visible in LinkedIn inbox
result: blocked
blocked_by: no_1st_degree_target + gologin_plan_limit
reason: "No prospect in prod DB is confirmed 1st-degree to either account (aleksander-azarow was previously stamped 'contacted' from a connection_request that turns out to have never been accepted — see Test 2). Additionally, `linkedin-6966fe1e` account is LOGGED OUT of LinkedIn (screenshot from Test 2 shows 'Join LinkedIn' signup wall at /in/aleksander-azarow-09ab6a225 instead of the profile)."

### 2. LinkedIn DM executor E2E against a non-1st-degree target
expected: job_logs.metadata.failure_mode='not_connected'; NO auto-swap to connection_request; action.status='failed'
result: post_fix_pass (still inconclusive for stated intent)
post_fix_evidence: |
  2026-04-24 post-authwall-fix on prod (dpl_7agiadu7l): 3/3 DM runs against
  the logged-out `linkedin-6966fe1e` profile correctly returned
  `session_expired` instead of misleading `not_connected`. Account health
  auto-flipped to `warning` after repeated failures (ABAN-07 state machine).
  Runs: 4bb5cee7 (122s), 0bf90359 (257s), d518dd25 (213s) — deterministic.
  The DM executor's failure-mode taxonomy is now correctly partitioned:
  session_expired ≠ not_connected.
stated_intent_still_blocked_on: "Need a confirmed non-1st-degree target
  viewed from a LOGGED-IN session to validate the `not_connected` branch.
  Both currently-logged-in targets (via rich-repco) need assignment fixup +
  day-0 warmup bump (already done for rich-repco). Deferred — follows from
  user re-logging linkedin-6966fe1e OR testing via rich-repco against a
  fresh non-1st-degree prospect."
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
  status: fixed
  reason: "classifyPrescreenResult returns null (valid candidate) when all three DOM signals are absent. This state matches BOTH the intended happy path (viewable profile with Message button just below 1500ms locator timeout, or no UI for connect because already-connected via different UI variant) AND the undesired 'session logged out so LinkedIn serves signup wall' state. The classifier silently keeps such prospects as 'detected', masking the underlying session failure."
  severity: major
  test: 7
  fix: "Added shared detectLinkedInAuthwall helper (URL + DOM landmark + body-text fallback). PrescreenState gained `isAuthwall` field; classifier gained `account_logged_out` verdict with priority right below checkpoint. Cron flips account health=warning and breaks the run (mirrors security_checkpoint). Prospects are NOT stamped with last_prescreen_attempt_at on this path so they get re-classified on the next cron tick with a healthy account. PR #3 (commit 0b57aa6), strengthened in PR #4 (commit 0095a08). Deployed prod dpl_7agiadu7l."
  artifacts: [src/lib/action-worker/actions/linkedin-authwall.ts, src/app/api/cron/linkedin-prescreen/route.ts]

- truth: "LinkedIn DM executor distinguishes non-1st-degree from logged-out state"
  status: fixed
  reason: "Same underlying issue — linkedin-dm-executor.ts detects absence of Message button selector and maps to `not_connected`. The dm executor has no signal that would differentiate 'target is non-1st-degree (expected 2nd/3rd degree UX)' from 'account is logged out so we can't see any profile at all'. On prod Test 2, action a036bf22 reported not_connected despite the screenshot showing LinkedIn's signup wall."
  severity: major
  test: 2
  fix: "Applied the same detectLinkedInAuthwall preflight to DM / Follow / Like / Comment executors — all now emit `session_expired` when the authwall is detected before reading target-specific DOM signals. Live retest: 3/3 DM runs via logged-out account returned session_expired (was not_connected pre-fix). Account health auto-flipped to warning after repeated failures via ABAN-07 state machine."
  artifacts: [src/lib/action-worker/actions/linkedin-dm-executor.ts, src/lib/action-worker/actions/linkedin-follow-executor.ts, src/lib/action-worker/actions/linkedin-like-executor.ts, src/lib/action-worker/actions/linkedin-comment-executor.ts]

- truth: "GoLogin profile `linkedin-6966fe1e` has an authenticated LinkedIn session"
  status: open_operational
  reason: "Screenshot from Test 2 run (screenshot_url stored at supabase storage for action a036bf22) shows LinkedIn 'Join LinkedIn' signup wall when visiting /in/aleksander-azarow-09ab6a225, proving the GoLogin profile session is no longer logged in. Any executor run against this account will hit the login wall and produce misleading failure modes."
  severity: blocker
  test: 1, 2, 3, 4, 5, 6
  remediation: "User must log in manually via GoLogin profile 69e8dd25ddc8c6b0ca0c99bf to LinkedIn and set social_accounts.session_verified_at."
  artifacts: [https://cmkifdwjunojgigrqwnr.supabase.co/storage/v1/object/sign/screenshots/actions/a036bf22-10f7-47e2-900c-a644d80405ab/step-1.png]

- truth: "GoLogin Cloud plan supports enough parallel launches for executor UAT"
  status: fixed
  reason: "During Test 3 retry, GoLogin Cloud returned HTTP 503 wrapping 403 `You've reached max parallel cloud launches limit. To run more update your plan`. Session from the previous DM run (Test 2) was still consuming a slot. Retry after 90s did not free it."
  severity: major
  test: 3, 4, 5, 6 (any live executor UAT)
  fix: "Root cause was `disconnectProfile(browser)` being an intentional no-op. Added `releaseProfile(connection)` that closes CDP AND calls GoLogin stopCloudBrowser(profileId) to free the parallel-launch slot. Wired into worker.ts, linkedin-prescreen, check-replies finally blocks. GoLoginConnection now includes profileId. Live retest: 3 back-to-back DM executor runs with no `max parallel launches` 403. PR #3 (commit 0b57aa6)."
  artifacts: [src/lib/gologin/adapter.ts]

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
