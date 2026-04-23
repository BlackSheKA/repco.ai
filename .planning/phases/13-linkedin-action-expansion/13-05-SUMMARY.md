---
phase: 13-linkedin-action-expansion
plan: 05
subsystem: infra
tags: [supabase, migration, postgres, enum, warmup, cron, playwright, linkedin]

# Dependency graph
requires:
  - phase: 10-linkedin-outreach-execution
    provides: linkedin-connect-executor.ts template, daily_connection_limit, connection_count, sendLinkedInConnection
  - phase: 06-linkedin-ingestion
    provides: prospects.profile_url for LinkedIn, intent_signals.post_url for LinkedIn posts
provides:
  - migration 00017 adding pipeline_status_type='unreachable', prospect prescreen columns, per-action LinkedIn limits + counters, platform-aware check_and_increment_limit RPC, idx_prospects_linkedin_prescreen
  - getWarmupState accepting optional platform arg with LinkedIn progression (day1 browse, day2-3 +like/follow, day4-6 +public_reply+connection_request, day7+ +dm)
  - worker.ts dispatch branching on account.platform with TODO stubs for 13-01 (dm), 13-02 (follow), 13-03 (like + public_reply); connection_request arm unchanged
  - worker.ts broader LinkedIn failure-mode → health/cooldown handling and job_logs.metadata.failure_mode guard
  - /api/cron/linkedin-prescreen hourly cron with classifyPrescreenResult priority ladder
  - fetchPendingActions helper in approval-actions.ts filtering pipeline_status='unreachable' (LNKD-06)
affects: 13-01-linkedin-dm, 13-02-linkedin-follow, 13-03-linkedin-like-comment, 13-04-followup-dm-routing

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Platform-aware warmup progression via optional 3rd arg (back-compat with 2-arg Reddit callers)"
    - "Worker dispatch: outer branch on account.platform, inner switch on action.action_type; Reddit kept on Haiku CU, LinkedIn on deterministic Playwright"
    - "RPC identifier-whitelist pattern: format(%I) with v_column/v_limit_column assigned only from fixed IF/ELSIF branches (T-13-05-02)"
    - "Prescreen cron: abort-on-checkpoint, batch-claim via UPDATE … RETURNING, 4 DOM signals classified by priority ladder"

key-files:
  created:
    - supabase/migrations/00017_phase13_linkedin_expansion.sql
    - src/app/api/cron/linkedin-prescreen/route.ts
    - src/app/api/cron/linkedin-prescreen/__tests__/route.test.ts
  modified:
    - src/features/accounts/lib/types.ts
    - src/features/accounts/lib/__tests__/warmup.test.ts
    - src/lib/action-worker/limits.ts
    - src/lib/action-worker/__tests__/limits.test.ts
    - src/lib/action-worker/worker.ts
    - src/features/actions/actions/approval-actions.ts
    - src/app/(app)/page.tsx
    - vercel.json

key-decisions:
  - "Wide action_counts table stays — added follow_count/like_count/comment_count columns rather than normalize to (action_type, count) rows; keeps check_and_increment_limit a single PL/pgSQL function"
  - "LinkedIn progression ends at day 7 (dm unlocked) per 13-CONTEXT; Reddit keeps day 8 for back-compat"
  - "public_reply semantically covers Reddit reply AND LinkedIn comment — no new enum value; dispatch by account.platform"
  - "Prescreen cron aborts entire run on first /checkpoint/ URL and flags account health=warning; no retry"
  - "unreachable_reason is populated ONLY when pipeline_status='unreachable'; already_connected transitions to 'connected' without writing unreachable_reason (column comment enforces contract)"
  - "fetchPendingActions helper added to approval-actions.ts and consumed by (app)/page.tsx so LNKD-06 filter is enforced at the only read site"

patterns-established:
  - "Platform-aware worker dispatch: if (account.platform === 'linkedin') { connection_request / TODO stubs } else { Haiku CU }"
  - "RPC SECURITY DEFINER with SET search_path='' + identifier whitelist via format(%I) is the standard pattern for action_counts mutation"
  - "Cron handlers with Playwright bump maxDuration to 300 (Vercel Pro); single account per run; batch cap via .limit(N) on the claim query"

requirements-completed: [LNKD-06]

# Metrics
duration: 45min
completed: 2026-04-23
---

# Phase 13 Plan 05: Pre-screen + Scaffold Schema Summary

**Migration 00017 + platform-aware warmup + worker dispatch scaffold + hourly /api/cron/linkedin-prescreen with LNKD-06 approval-queue filter — Wave 1 foundation for Phase 13 LinkedIn Action Expansion.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-23T10:57Z
- **Completed:** 2026-04-23T11:05Z
- **Tasks:** 2 of 3 (Task 3 is BLOCKING human-action checkpoint — migration apply)
- **Files modified:** 9
- **Files created:** 3

## Accomplishments

- Migration 00017 authored: `pipeline_status_type ADD VALUE 'unreachable'`, prospect prescreen columns (`last_prescreen_attempt_at`, `unreachable_reason`), LinkedIn per-action limits on social_accounts (daily_follow_limit=15, daily_like_limit=25, daily_comment_limit=10), counter columns on action_counts (follow_count, like_count, comment_count), RPC `check_and_increment_limit` rewritten to route by (platform, action_type) with safe format(%I) identifier whitelist, partial index for prescreen batch claims.
- Platform-aware warmup: `getWarmupState(warmupDay, completedAt, platform?)` with LinkedIn progression (day 1 browse → day 7+ everything including dm). Reddit unchanged, 2-arg callers still compile and return Reddit schedule.
- Worker dispatch refactored to outer branch on `account.platform`. LinkedIn branch keeps `connection_request` (Phase 10 executor) and stubs `dm`/`followup_dm`/`follow`/`like`/`public_reply` with TODO markers pointing at plans 13-01/02/03. Reddit CU path preserved verbatim for every non-LinkedIn account.
- Worker LinkedIn failure-mode → health/cooldown block broadened from `connection_request`-only to `runPlatform === "linkedin"` so new failure modes (dm/follow/like/comment) land in the same health-transition + `job_logs.metadata.failure_mode` taxonomy.
- `/api/cron/linkedin-prescreen` shipped: Bearer CRON_SECRET gate, service-role client, picks healthy LinkedIn account, claims up to 50 `pipeline_status='new'` prospects (last attempt null or >7 days), visits `/in/{slug}`, inspects DOM, classifies via pure exported `classifyPrescreenResult` helper, updates prospect status, writes per-verdict counts to `job_logs.metadata`. Abort-on-checkpoint flips account health to warning. `logger.flush()` on every return path (4 occurrences — well above the required ≥2).
- LNKD-06 approval-queue filter: `fetchPendingActions(userId)` in `approval-actions.ts` adds `.neq("prospects.pipeline_status", "unreachable")` on an inner join; `(app)/page.tsx` consumes it instead of inline query.
- Hourly cron registered in `vercel.json`.

## Task Commits

1. **Task 1: Migration 00017 + types + limits + warmup + worker dispatch scaffold** — `f744861` (feat)
2. **Task 2: linkedin-prescreen cron + LNKD-06 approval-queue filter** — `43835c8` (feat)
3. **Task 3: Apply migration 00017 to dev + prod** — **BLOCKING human-action checkpoint** (awaiting user)

## Post URL Format Findings

*Task 0 diagnostic output — resolves RESEARCH Open Question A3.*

**Query against dev Supabase (dvmfeswlhlbgzqhtoytl):**
```
GET /rest/v1/intent_signals?select=id,post_url&post_url=like.%25linkedin.com%25&limit=3
→ []  (empty — no LinkedIn intent_signals on dev branch yet)

GET /rest/v1/intent_signals?select=id,post_url&limit=5
→ []  (table empty on dev branch)
```

**Conclusion:** the dev-branch `intent_signals` table contains **zero rows** (LinkedIn or otherwise) at the time of this plan's execution, so there is no on-disk evidence to refute the RESEARCH §4 hypothesis of Form A / Form B URLs:

- Form A: `https://www.linkedin.com/feed/update/urn:li:activity:{NUMERIC}/...`
- Form B: `https://www.linkedin.com/posts/{slug}_{activityId}-...`

Both forms expose a numeric `activity:{id}` recoverable via regex `urn:li:activity:\d+` (Form A) or by extracting the `_{id}` suffix then prefixing `urn:li:activity:` (Form B). Phase 6 LinkedIn ingestion (Apify) is the only write-path to `intent_signals.post_url`; its output format is known from code to be one of the two above.

**Decision:** **no Form C detected → no `post_urn` column added to migration 00017.** Plan 13-03 (Like + Comment executors) proceeds with the URN-based DOM locator strategy documented in RESEARCH §2.3/§2.4:

> Scope selectors to `main [data-id*='urn:li:activity:{extracted_id}']` to avoid the reshare/nested-post mis-selection Landmine #8; fall back to `main > article:first-of-type` (NOT generic `main article`) if the data-id attribute is absent.

Plan 13-03 should extract the URN at the executor entry point (regex on `intent_signals.post_url`) and pass it into the DOM selector. If production LinkedIn data surfaces a Form C in the future, a follow-up migration can add `intent_signals.post_urn TEXT` + backfill — not worth blocking Wave 1 for a hypothetical.

## Files Created/Modified

**Created:**
- `supabase/migrations/00017_phase13_linkedin_expansion.sql` — Schema scaffold (enum + 5 columns + 3 counter columns + RPC rewrite + index)
- `src/app/api/cron/linkedin-prescreen/route.ts` — Hourly prescreen GET + `classifyPrescreenResult` helper
- `src/app/api/cron/linkedin-prescreen/__tests__/route.test.ts` — 3 auth + 5 classifier priority tests

**Modified:**
- `src/features/accounts/lib/types.ts` — `getWarmupState` adds optional `platform` arg; LinkedIn progression branch
- `src/features/accounts/lib/__tests__/warmup.test.ts` — 6 new LinkedIn assertions + Reddit regression guard
- `src/lib/action-worker/limits.ts` — `getDailyUsage` returns optional follow_count/like_count/comment_count
- `src/lib/action-worker/__tests__/limits.test.ts` — fallback shape updated for new counter fields
- `src/lib/action-worker/worker.ts` — platform passed to warmup gate; prompt builders gated behind `platform !== 'linkedin'`; dispatch branched on platform with TODO stubs; failure-mode handling broadened to all LinkedIn actions; `job_logs.metadata.failure_mode` guard broadened to `runPlatform === 'linkedin'`
- `src/features/actions/actions/approval-actions.ts` — `fetchPendingActions` helper with inner-join `.neq` filter on `pipeline_status='unreachable'`
- `src/app/(app)/page.tsx` — consumes `fetchPendingActions` in parallel query block
- `vercel.json` — `/api/cron/linkedin-prescreen` registered at `0 * * * *`

## Decisions Made

None beyond those enumerated in plan `<action>` blocks — all decisions followed the plan verbatim. One minor placement choice: `fetchPendingActions` lives in `approval-actions.ts` (plan specified location) and is consumed at `(app)/page.tsx` (the single read site), giving both the plan-required `grep "neq.*unreachable"` match AND actual enforcement at the read boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing `limits.test.ts` assertion broke after `getDailyUsage` shape change**
- **Found during:** Task 2 post-verification (`pnpm test` full suite)
- **Issue:** `src/lib/action-worker/__tests__/limits.test.ts` asserts the fallback return exactly equals `{ dm_count: 0, engage_count: 0, reply_count: 0 }`. Task 1 (Plan step 1E) added `follow_count/like_count/comment_count` to the fallback, breaking strict-equality.
- **Fix:** Extended the test assertion to include the three new counters (all default 0). Shape-only change, no behavioral assertion touched.
- **Files modified:** `src/lib/action-worker/__tests__/limits.test.ts`
- **Verification:** `pnpm test` — 304/304 pass.
- **Committed in:** `43835c8` (Task 2 commit).

---

**Total deviations:** 1 auto-fixed (1 bug — direct regression from Task 1 change, in-scope per deviation rules).
**Impact on plan:** Single-line test update; no scope creep.

## Issues Encountered

- None.

## Threat Flags

None. All new surface (prescreen cron, RPC rewrite, approval-queue filter) is covered by the `<threat_model>` register in the PLAN.

## Verification Status

| Check | Status |
|---|---|
| `pnpm typecheck` | PASS (clean) |
| `pnpm test` (full suite) | PASS 304/304 |
| `pnpm test -- warmup` | PASS 13/13 (6 new LinkedIn cases green) |
| `pnpm test -- linkedin-prescreen` | PASS 8/8 (3 auth + 5 classifier priority) |
| `logger.flush()` on every return path of prescreen route | PASS (4 occurrences) |
| LNKD-06 grep (`neq.*unreachable` in approval-actions.ts) | PASS |
| Migration 00017 applied to dev | **PENDING — Task 3 checkpoint** |
| Migration 00017 applied to prod | **PENDING — Task 3 checkpoint** |

## User Setup Required

**Migration 00017 must be applied by the user** (Task 3 blocking human-action checkpoint). See the checkpoint message returned by the executor agent — contains exact `supabase link` + `supabase db push` commands for dev branch `dvmfeswlhlbgzqhtoytl` and prod `cmkifdwjunojgigrqwnr`, plus three post-apply verification queries (enum value, column presence, RPC smoke test).

Once the migration is applied, plans 13-01 / 13-02 / 13-03 / 13-04 can execute in Wave 2 — their executors depend on the new counter columns, limit columns, and the `'unreachable'` enum value landing first.

## Next Phase Readiness

- **Wave 2 (13-01, 13-02, 13-03, 13-04)** can start the moment migration 00017 is green on both environments. Executors plug into the worker.ts TODO stubs (typed: `dm|followup_dm`, `follow`, `like`, `public_reply`), inherit the LinkedIn failure-mode → health/cooldown handling, and write counts to the new per-action columns via the already-rewritten RPC.
- **Prescreen cron** goes live on the next hourly boundary after deploy; first few runs are expected to return `{screened: 0, reason: "no_healthy_account"}` until a LinkedIn account reaches `health_status='healthy'`.
- **LNKD-06** is enforced as soon as the migration's enum value lands — any prospect marked `unreachable` by the prescreen (or manually by a user in future) is immediately excluded from the approval queue.

## Self-Check: PASSED

Files checked:
- `supabase/migrations/00017_phase13_linkedin_expansion.sql` — FOUND
- `src/app/api/cron/linkedin-prescreen/route.ts` — FOUND
- `src/app/api/cron/linkedin-prescreen/__tests__/route.test.ts` — FOUND
- `src/features/accounts/lib/types.ts` — FOUND (modified)

Commits checked:
- `f744861` (Task 1) — FOUND in git log
- `43835c8` (Task 2) — FOUND in git log

---
*Phase: 13-linkedin-action-expansion*
*Completed (Task 1-2): 2026-04-23. Task 3 checkpoint pending user action.*
