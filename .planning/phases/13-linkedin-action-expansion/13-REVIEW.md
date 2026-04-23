---
phase: 13-linkedin-action-expansion
depth: standard
status: issues-found
findings_count: 14
created: 2026-04-23
files_reviewed: 17
files_reviewed_list:
  - supabase/migrations/00017_phase13_linkedin_expansion.sql
  - src/app/api/cron/linkedin-prescreen/route.ts
  - src/lib/action-worker/actions/linkedin-dm-executor.ts
  - src/lib/action-worker/actions/linkedin-follow-executor.ts
  - src/lib/action-worker/actions/linkedin-like-executor.ts
  - src/lib/action-worker/actions/linkedin-comment-executor.ts
  - src/lib/action-worker/actions/generate-comment.ts
  - src/lib/action-worker/worker.ts
  - src/lib/action-worker/limits.ts
  - src/lib/action-worker/expiry.ts
  - src/features/accounts/lib/types.ts
  - src/features/actions/actions/approval-actions.ts
  - src/app/(app)/page.tsx
  - src/app/api/cron/schedule-followups/route.ts
  - src/features/sequences/lib/scheduler.ts
  - src/app/api/cron/check-replies/route.ts
  - vercel.json
---

# Phase 13: Code Review Report

**Reviewed:** 2026-04-23
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues-found (no blockers; several highs around correctness + consistency)

## Summary

Phase 13 is solid overall. The migration's RPC uses a proper identifier whitelist for `format(%I)` — SQL-injection attack surface is closed. All cron / RPC bearer auth is in place. The LinkedIn executors share a consistent shape and all route through the same worker dispatcher with correct pipeline_status transitions for the schema after commit `e376bdb`.

Findings cluster around three areas:

1. **Consistency**: the DM executor has an explicit `^https://www.linkedin.com/in/` origin guard (T-13-01-01); the Follow, Like, Comment, and Prescreen executors do not — they will `page.goto()` whatever string the worker passes them. Summaries flag this; it is not fixed.
2. **Correctness**: the prescreen cron writes `last_prescreen_attempt_at=now()` to **every** `detected` LinkedIn prospect before it actually prescreens any of them — so an error after claim silently burns their 7-day re-check window. Also `prescreen.hasMessageSidebar` uses `aria-label*='Message'` which matches the 1st-degree DM button on a profile, but the executor's own 1st-degree check uses `aria-label^='Message'` — these agree by accident.
3. **Quality / dead code**: `fetchPendingActions` is typed/behaviorally slightly different from the call site's expectations; `WarmupState.maxDay: 7` is now a lie for Reddit (which reaches day 8); follow/like/comment executors pass non-linkedin.com URLs straight to `page.goto`, ignoring the already-imported `extractLinkedInSlug` helper.

No Critical / blocker issues. Migration + worker dispatch + RPC are correct and atomic. Recommend fixing H1, H2, H3 before enabling the hourly prescreen cron against real prospects.

## High

### H-01: Prescreen claims all 50 prospects' `last_prescreen_attempt_at` BEFORE visiting any of them

**File:** `src/app/api/cron/linkedin-prescreen/route.ts:123-132`
**Issue:** The batch-claim UPDATE sets `last_prescreen_attempt_at = now()` on up to 50 rows, then the run continues. If the GoLogin connect at line 159 throws, if the 1st iteration hits `/checkpoint/` (line 193 `break`), or if the process is killed mid-loop, the prospects that were never actually visited still have a fresh `last_prescreen_attempt_at` and are locked out of prescreening for the next 7 days. This is the main mechanism for prospects to ever reach `pipeline_status='unreachable'` or `'connected'`, so this is a silent data-loss-of-liveness bug.

Secondary issue: the UPDATE does not scope by account ownership (service role). Two concurrent runs on the same cron tick (e.g. Vercel retry) would each claim overlapping sets because there is no `.is("last_prescreen_attempt_at", null)` test-and-set — they both see rows with `null OR older_than_7d` and both fire the UPDATE. The second UPDATE is a no-op on those rows but it does not prevent double-visiting; duplicate work and duplicate GoLogin sessions.

**Fix:** Update `last_prescreen_attempt_at` per-prospect AFTER classify, not in the batch claim. Replace the batch UPDATE with a SELECT:
```ts
const { data: claimed } = await supabase
  .from("prospects")
  .select("id, handle, profile_url")
  .eq("platform", "linkedin")
  .eq("pipeline_status", "detected")
  .or(`last_prescreen_attempt_at.is.null,last_prescreen_attempt_at.lt.${sevenDaysAgo}`)
  .order("last_prescreen_attempt_at", { ascending: true, nullsFirst: true })
  .limit(50)
// ... then inside the loop, after visit:
await supabase
  .from("prospects")
  .update({ last_prescreen_attempt_at: new Date().toISOString(), ...verdictUpdate })
  .eq("id", prospect.id)
```
For concurrency, move to a `SELECT ... FOR UPDATE SKIP LOCKED` via RPC, or gate the cron with a Postgres advisory lock keyed on `account.id`.

### H-02: Follow / Like / Comment executors accept arbitrary URLs; only DM guards the origin

**Files:**
- `src/lib/action-worker/actions/linkedin-follow-executor.ts:40-55`
- `src/lib/action-worker/actions/linkedin-like-executor.ts:41-48`
- `src/lib/action-worker/actions/linkedin-comment-executor.ts:56-63`

**Issue:** 13-02-SUMMARY explicitly flags this as a threat (T-13-02-01-followup). The DM executor (`linkedin-dm-executor.ts:59-65`) rejects any `profileUrl` that doesn't match `^https://www\.linkedin\.com\/in\//i` as defense-in-depth against a compromised/tampered `prospects.profile_url` or `intent_signals.post_url`. Follow, Like, and Comment do not — they call `page.goto(arbitraryString, ...)` inside an authenticated GoLogin session. An attacker who can write to `intent_signals.post_url` (via SQL injection anywhere else, or a malicious Apify ingestion record) can make the worker visit any origin with the LinkedIn session cookies attached. Depending on CSP behavior and cross-origin handling, this is potentially session-theft-adjacent.

For Like/Comment the `postUrl` is *not* a `/in/` path — it is `/feed/update/...` or `/posts/...` — so the guard for those two needs a different regex. Follow should adopt the DM regex verbatim.

**Fix:**
```ts
// linkedin-follow-executor.ts — mirror DM guard
if (!/^https:\/\/www\.linkedin\.com\/in\//i.test(profilePage)) {
  return { success: false, failureMode: "profile_unreachable", reasoning: "url not under linkedin.com/in/" }
}

// linkedin-like-executor.ts + linkedin-comment-executor.ts
if (!/^https:\/\/www\.linkedin\.com\//i.test(postUrl)) {
  return { success: false, failureMode: "post_unreachable", reasoning: "url not under linkedin.com" }
}
```

### H-03: `WarmupState.maxDay: 7` hardcoded is wrong for Reddit (reaches day 8)

**File:** `src/features/accounts/lib/types.ts:54,122`
**Issue:** The type declaration pins `maxDay: 7` as a literal and `getWarmupState` returns `{ ..., maxDay: 7 }` regardless of platform. But per the Reddit branch (line 106) warmup only completes at `warmupDay >= 8`. So a Reddit account on day 7 reports `maxDay: 7, day: 7, completed: false` — any UI that does `day >= maxDay` will render "complete" one day too early.

**Fix:** Either make `maxDay` platform-aware:
```ts
const maxDay: number = platform === "linkedin" ? 7 : 8
return { day: warmupDay, maxDay, completed, skipped, allowedActions }
```
and widen the TS type from `maxDay: 7` to `maxDay: number`, OR rename semantics (`maxDay` = "last warmup day" vs "first fully-warmed day") and update all consumers. Grep consumers before picking.

### H-04: Follow/Like/Comment pass raw string; `extractLinkedInSlug` return never used for URL construction in Follow

**File:** `src/lib/action-worker/actions/linkedin-follow-executor.ts:40-43`
**Issue:** `slug = extractLinkedInSlug(profileUrl)` is computed but only used as the fallback branch (`profileUrl.startsWith("http") ? profileUrl : ...`). When `profileUrl` is `"https://evil.com/attacker"`, the `startsWith("http")` branch is true and `slug` is discarded — so the origin guard (H-02) is the only defense. Same pattern in DM (but DM has the guard). Combined with H-02, this is the attack vector.

**Fix:** Either drop the `startsWith("http")` branch entirely and always reconstruct from the slug (`https://www.linkedin.com/in/${slug}`), OR keep it and add the H-02 regex. Prefer reconstruct-from-slug: `extractLinkedInSlug` already normalizes, so the http branch is dead code for valid inputs.

### H-05: Worker's warmup `allowedActions` check narrows `action_type` incorrectly — `followup_dm` bypasses the gate

**File:** `src/lib/action-worker/worker.ts:129-138`
**Issue:** The check is:
```ts
if (!warmup.allowedActions.includes(action.action_type as "dm" | "like" | "follow" | "public_reply" | "connection_request"))
```
Note `followup_dm` is missing from the union. `WarmupState.allowedActions` is `("browse" | "like" | "follow" | "public_reply" | "dm" | "connection_request")[]` — it has no `followup_dm` entry, but `allowedActions.includes("followup_dm")` is `false` so `followup_dm` hits the early-return failure branch with "Warmup day N: followup_dm not yet allowed" regardless of the account's day. That's the bug: **a warmed day-10 LinkedIn account cannot execute `followup_dm`** because the allowed set never contains that string.

This is contradicted by the integration test `worker-linkedin-followup.test.ts` which passes — but the test mocks `getWarmupState` to return `followup_dm` in `allowedActions` (13-04-SUMMARY confirms: "getWarmupState (returns `followup_dm` in `allowedActions`)"), which is NOT what the real function returns. Real prod calls will fail.

**Fix:** Either (a) map `followup_dm` → `dm` for the gate check, or (b) add `"followup_dm"` to `WarmupState.allowedActions` and include it in day-7+ sets. Option (a) is less invasive:
```ts
const gateType = action.action_type === "followup_dm" ? "dm" : action.action_type
if (!warmup.allowedActions.includes(gateType as ...)) { ... }
```
Then fix the integration test to stop over-mocking.

## Warning

### W-01: Prescreen's `hasMessageSidebar` selector mismatches DM's 1st-degree check

**File:** `src/app/api/cron/linkedin-prescreen/route.ts:210` vs `src/lib/action-worker/actions/linkedin-dm-executor.ts:99`
**Issue:** Prescreen uses `main button[aria-label*='Message']` (substring match, matches "Messaging"); DM uses `main button[aria-label^='Message']` (prefix). A prospect whose profile shows a "Messaging" label but not "Message" will be classified `already_connected` by prescreen (→ `pipeline_status='connected'`) but will still fail the DM executor's 1st-degree check with `not_connected`. The two should agree.
**Fix:** Use the same selector in both places — prefer `^='Message'`. Extract a shared constant.

### W-02: Comment executor `post_unreachable` regex too permissive — matches any "404" substring

**File:** `src/lib/action-worker/actions/linkedin-comment-executor.ts:75`
**Issue:** `/404|no longer available|page not found/i` against the whole page body will match any comment that contains the literal text "404" (e.g. a post about HTTP error codes or a comment saying "we got a 404"). Real LinkedIn 404 pages present dedicated DOM (`h1.not-found`) — body-text search is both over- and under-inclusive.
**Fix:** Check URL redirect (`/404` in `page.url()`) OR a specific DOM locator (`h1:has-text("Page not found")`) instead of body regex. Same issue in Like executor line 61.

### W-03: Prescreen writes `last_prescreen_attempt_at` but never re-queues prospects whose verdict is `null` past the 7-day window before a flush

**File:** `src/app/api/cron/linkedin-prescreen/route.ts:223-245`
**Issue:** When `classifyPrescreenResult` returns `null` (none of the four verdicts match — prospect is "still a valid candidate"), the prospect's `last_prescreen_attempt_at` is already set by the batch claim, so it won't be re-visited for 7 days. If the profile was briefly unavailable (load error, transient rate-limit) it's a silent 1-week lockout. Combined with H-01, null-verdict prospects are particularly at risk.
**Fix:** Only persist `last_prescreen_attempt_at` when a definitive verdict lands. For `null` verdict, optionally retry after 1 day by writing `last_prescreen_attempt_at = now - 6 days` so it requeues sooner.

### W-04: `generateComment` retry returns the 2nd output unconditionally, even if it still violates QC

**File:** `src/lib/action-worker/actions/generate-comment.ts:100-102`
**Issue:** Summary 13-03 documents this as intentional ("retry cap is 2 calls total"), but it means a comment containing a URL or pitch phrase can still be submitted if the retry also fails QC. Caller (`linkedinCommentExecutor`) only checks `text.length > 1250`, not URL/pitch. Sonnet is usually compliant after retry, but a single bad output lands on a real LinkedIn post.
**Fix:** Return the QC reason on second-call failure too; let the worker fail the action (`failureMode: "qc_failed"`) rather than silently ship a non-compliant comment.

### W-05: Worker fetches prospect data three times for `like` / `public_reply` / `dm` actions

**File:** `src/lib/action-worker/worker.ts:221-225, 265-269, 318-323, 345-352, 369-376, 392-405, 428-441`
**Issue:** Step 10 fetches `prospects.handle + profile_url`, step 12 re-fetches `prospects.handle`, and each LinkedIn dispatch arm re-fetches yet again (some fetch `intent_signal_id` + `profile_url`). That's 3+ `single()` round-trips per LinkedIn action. Not a blocker but unnecessary DB chatter and risk of inconsistent reads if prospect data changes mid-action (e.g. prospect marked `unreachable` between step 10 and step 13 — worker still tries to DM). Out of scope per review guidelines (perf), but the **read-skew correctness risk** (state changing mid-pipeline) is in scope.
**Fix:** Fetch once after step 10 into a typed `prospectRow` local; reuse in steps 12 and 13.

### W-06: `approval-actions.ts:fetchPendingActions` does not bail for unauthenticated user

**File:** `src/features/actions/actions/approval-actions.ts:16-28`
**Issue:** Unlike `approveAction` etc., `fetchPendingActions(userId)` takes `userId` as a parameter and does not verify `supabase.auth.getUser()` matches. The call site at `page.tsx:88` passes `user.id` only after its own auth check, so currently safe, but if another caller passes an attacker-controlled `userId`, RLS is the only defense (which is correct, but the helper should self-verify since every other helper in this file does). Low severity because RLS on `actions` enforces `user_id = auth.uid()`.
**Fix:** Accept no argument and derive `user.id` inline, matching the pattern of siblings.

### W-07: Prescreen RPC and worker `checkAndIncrementLimit` silently return `false` on error

**File:** `src/lib/action-worker/limits.ts:20`
**Issue:** `if (error) return false` — collapses "RPC errored" and "limit reached" into the same failure path. The worker treats both as "daily limit reached" (`runError = "Daily limit reached"` at worker.ts:182). If the RPC function is missing or has a typo, every action will silently fail with a confusing error in job_logs. Minor but logs a red herring during incidents.
**Fix:** Log the RPC error:
```ts
if (error) {
  logger.error("check_and_increment_limit RPC failed", { error: error.message, accountId, actionType })
  return false
}
```

### W-08: Comment executor's post-verify locator uses `:has-text(JSON.stringify(...))` which embeds `"quotes"` around the needle

**File:** `src/lib/action-worker/actions/linkedin-comment-executor.ts:156` and `linkedin-dm-executor.ts:185`
**Issue:** `JSON.stringify("hello world")` returns `'"hello world"'` — the outer quotes are passed verbatim into the Playwright `:has-text(...)` syntax, making it a string-literal match (which is what Playwright actually expects for `:has-text("...")`). This is actually correct Playwright usage (docs: `:has-text("exact")` is a substring match with quotes required), so this is fine — but if the text contains a backslash, double-quote, or control character inside the first 40 chars the JSON-escape will re-encode them (`"hello \"world\""`) and Playwright will look for the literal backslash. Low but real for comments containing quoted text in the first 40 chars.
**Fix:** Use `locator('.comments-comment-list').filter({ hasText: needle })` instead of embedded `:has-text()` — takes the raw string, no escaping concerns.

## Info

### I-01: Migration comment claims dependency on 00014 + 00016 but does not state 00017 prerequisite for Supabase multi-statement enum usage

**File:** `supabase/migrations/00017_phase13_linkedin_expansion.sql:9-10`
**Issue:** Comment says "ALTER TYPE ADD VALUE must run in its own transaction; Supabase migration runner commits each file separately so subsequent DDL sees the new value." But the file ALSO uses `'unreachable'` inside the partial index (line 107) — wait, it uses `'detected'`, not `'unreachable'`. OK, no issue. Just verifying.
**Fix:** None — the index uses the existing `'detected'` value. Leaving as nit.

### I-02: Redundant `ON CONFLICT` column list in RPC

**File:** `supabase/migrations/00017_phase13_linkedin_expansion.sql:78-80`
**Issue:** `INSERT INTO action_counts (...) VALUES (p_account_id, CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0) ON CONFLICT DO NOTHING` — all non-PK columns have `DEFAULT 0` at the column level, so the explicit zeros are redundant. Prefer `INSERT INTO action_counts (account_id, date) VALUES (p_account_id, CURRENT_DATE) ON CONFLICT DO NOTHING` — cleaner and future-proof against column additions.

### I-03: `runStatus = "completed" | "failed"` — `runStatus` write at line 271 is dead after early return

**File:** `src/app/api/cron/linkedin-prescreen/route.ts:80, 271, 309`
**Issue:** The `runStatus` variable is only meaningfully set in the catch block (line 271); the `void runStatus` at line 309 is a comment-acknowledged unused-variable workaround. Delete the variable and comment entirely — it's dead.

### I-04: `AUDIT(13-04)` comments across 4 files are documentation-only but will appear as noise in future greps for business logic

**Files:** `src/app/api/cron/schedule-followups/route.ts`, `src/app/api/cron/check-replies/route.ts`, `src/features/sequences/lib/scheduler.ts`, `src/lib/action-worker/expiry.ts`
**Issue:** Audit trail is valuable during review but these comments (per 13-04 SUMMARY) are load-bearing only until the next phase. Consider consolidating into the ROADMAP/STATE doc and removing the inline comments after LNKD-05 verification.
**Fix:** Optional cleanup — no action required.

### I-05: `maxDuration = 300` and no per-account concurrency guard on prescreen

**File:** `src/app/api/cron/linkedin-prescreen/route.ts:24`
**Issue:** Cron runs hourly with no lock on `account.id`. If a run exceeds 60 minutes (50 prospects × ~10s each = 500s, over the 300s budget → Vercel kills it), the next hourly tick starts a new GoLogin session against the same LinkedIn account in parallel. Anti-bot risk, also H-01's partial-claim issue compounds.
**Fix:** Update the social_accounts `last_used_at` column at start of run OR use a Postgres advisory lock keyed on account id.

---

_Reviewed: 2026-04-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
