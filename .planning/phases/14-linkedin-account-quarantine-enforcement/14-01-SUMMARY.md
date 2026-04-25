---
phase: 14-linkedin-account-quarantine-enforcement
plan: 01
subsystem: action-worker
tags: [linkedin, quarantine, action-worker, claim-action, defense-in-depth]
requires:
  - 00006_phase3_action_engine.sql (claim_action base)
  - 00017_phase13_linkedin_expansion.sql (Phase 13 schema)
  - src/lib/action-worker/worker.ts (existing pipeline)
provides:
  - claim_action RPC variant that filters quarantined accounts
  - executeAction quarantine guard (failure_mode='account_quarantined')
affects:
  - supabase/migrations/00018_phase14_quarantine_enforcement.sql
  - src/lib/action-worker/worker.ts
  - src/lib/action-worker/__tests__/worker-quarantine.test.ts
requirements: [LNKD-02, LNKD-06]
key-decisions:
  - "Two-layer defense: RPC-level filter (atomic with FOR UPDATE SKIP LOCKED) + worker-level re-check before any GoLogin call"
  - "Lock narrowed to FOR UPDATE OF a so quarantine joins on social_accounts do not block unrelated dispatches"
  - "failure_mode='account_quarantined' is a free-form metadata string — no enum migration"
  - "Guard runs BEFORE active-hours check so quarantined accounts are not silently re-queued"
metrics:
  tasks_completed: 3
  tasks_pending_checkpoint: 1
  tests_added: 6
  tests_total: 374
---

# Phase 14 Plan 01: Account Quarantine Enforcement Summary

Make `social_accounts.health_status` and `cooldown_until` actually gate dispatch — Phase 13 wrote those columns, but nothing read them at execution time. This plan closes the loop with two layers: a `claim_action` RPC that filters quarantined accounts atomically with the row claim, and a worker-level guard that re-checks before any GoLogin connection so a stale webhook or post-claim health flip cannot burn a session on an already-flagged profile.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Migration 00018 — `claim_action` joins social_accounts | 68ef5e6 | `supabase/migrations/00018_phase14_quarantine_enforcement.sql` |
| 2 | worker.ts quarantine guard (defense-in-depth) | 7b2336f | `src/lib/action-worker/worker.ts` |
| 3 | Vitest coverage — 6 tests across Reddit + LinkedIn | b0c7cca | `src/lib/action-worker/__tests__/worker-quarantine.test.ts` |

## What shipped

### 1. `claim_action` RPC body (00018)

```sql
CREATE OR REPLACE FUNCTION public.claim_action(p_action_id uuid)
RETURNS SETOF public.actions AS $$
  UPDATE public.actions
  SET status = 'executing', executed_at = now()
  WHERE id = (
    SELECT a.id
    FROM public.actions a
    JOIN public.social_accounts sa ON sa.id = a.account_id
    WHERE a.id = p_action_id
      AND a.status = 'approved'
      AND sa.health_status NOT IN ('warning','banned')
      AND (sa.cooldown_until IS NULL OR sa.cooldown_until <= now())
    FOR UPDATE OF a SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';
```

Key choice: `FOR UPDATE OF a SKIP LOCKED` (lock only the actions row) instead of the original `FOR UPDATE SKIP LOCKED` which would have also locked `social_accounts` rows being read by other concurrent dispatches.

### 2. worker.ts guard (lines 78–128)

Inserted between the existing `social_accounts.select('*')` block and the GoLogin-profile check. Runs before active-hours, before warmup, before target isolation, before limits, before noise injection, before GoLogin connect. Mirrors the finally-block job_logs schema EXACTLY:

```ts
// Phase 14: account-quarantine guard (LNKD-02, LNKD-06).
if (account) {
  const isQuarantined =
    account.health_status === "warning" ||
    account.health_status === "banned" ||
    (account.cooldown_until !== null &&
      account.cooldown_until !== undefined &&
      new Date(account.cooldown_until).getTime() > Date.now())
  if (isQuarantined) {
    runError = "account_quarantined"
    runStatus = "failed"
    runPlatform = account.platform as string
    await updateActionStatus(supabase, actionId, "failed", "account_quarantined")
    await supabase.from("job_logs").insert({
      job_type: "action" as const,
      status: "failed",
      user_id: runUserId,
      action_id: runActionId,
      started_at: new Date(startMs).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startMs,
      error: "account_quarantined",
      metadata: {
        correlation_id: correlationId,
        platform: runPlatform,
        action_type: runActionType,
        failure_mode: "account_quarantined",
      },
    })
    logger.warn("Action blocked: account quarantined", { ... })
    await logger.flush()
    return { success: false, error: "account_quarantined" }
  }
}
```

### 3. Tests — `worker-quarantine.test.ts`

Six tests in describe block `executeAction quarantine guard (Phase 14)`:

| # | Test | Asserts |
|---|------|---------|
| 1 | `blocks dispatch when account.health_status='warning' (linkedin)` | result `{success:false, error:'account_quarantined'}`; `connectToProfile` NOT called; `actions.update {status:'failed', error:'account_quarantined'}`; `job_logs.insert` carries `job_type='action'` + `metadata.failure_mode='account_quarantined'` + `metadata.platform='linkedin'` |
| 2 | `blocks dispatch when account.health_status='banned' (linkedin)` | same as #1 |
| 3 | `blocks dispatch when account.cooldown_until is in the future (linkedin)` | health=`healthy`, cooldown=now+1h; same blocking assertions |
| 4 | `blocks dispatch when account.health_status='warning' (reddit)` | platform-agnostic gating; `executeCUAction` also NOT called; `metadata.platform='reddit'` |
| 5 | `does NOT block when account.cooldown_until is in the past` | cooldown=now−1h, healthy; `connectToProfile` IS called |
| 6 | `does NOT block when account is healthy with no cooldown` | green path Reddit; `connectToProfile` IS called |

## Verification

- `pnpm vitest run` → **374 tests passing** (368 baseline + 6 new), 51 files
- Quarantine acceptance greps:
  - `account_quarantined` in worker.ts: 5 hits (≥3 required)
  - `"action_execution"` in worker.ts: 0 hits (forbidden enum value absent)
  - `JOIN public.social_accounts` in 00018: 1 hit
  - LinkedIn quarantine WRITERS still present (lines 665, 680)
- `pnpm typecheck`: no errors in `worker.ts` or new test file. (Pre-existing svg-import errors in `src/app/(auth)/login/page.tsx`, `src/app/(public)/layout.tsx`, `src/components/shell/app-sidebar.tsx` are unrelated to this plan and reproducible on the base commit — out of scope per deviation rules.)

## Pending — Task 4 (BLOCKING checkpoint)

Schema push required before the RPC layer of defense takes effect:

1. `supabase link --project-ref dvmfeswlhlbgzqhtoytl` → `supabase db push` (dev)
2. Run `/tmp/14-smoke.sql` (transactional BEGIN/ROLLBACK) — expect 0/0/0/1/1 across warning/banned/cooldown_future/cooldown_past/healthy and PRE==POST counts
3. Re-run for prod `cmkifdwjunojgigrqwnr`
4. Reply `dev-applied` / `prod-applied` with output

The worker guard (Task 2) is already effective without the schema push — it operates on data already loaded by `from('social_accounts').select('*')`. The RPC push only adds the second layer of defense at row-claim time.

## Deviations from Plan

None — all three executor tasks shipped per spec. Task 4 (schema push) is the planned [BLOCKING] checkpoint and is being returned to the user.

## Self-Check: PASSED

- Migration file present: `supabase/migrations/00018_phase14_quarantine_enforcement.sql`
- Worker guard present at worker.ts:78–128
- Test file present: `src/lib/action-worker/__tests__/worker-quarantine.test.ts`
- Commits 68ef5e6, 7b2336f, b0c7cca present in git log
- 374/374 vitest pass; quarantine subset 6/6
