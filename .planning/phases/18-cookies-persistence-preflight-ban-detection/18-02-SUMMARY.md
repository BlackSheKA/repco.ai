---
phase: 18
plan: 02
subsystem: action-worker / preflight
tags: [preflight, browserbase, cookies, worker, ban-detection]
requires: [18-01]
provides:
  - module:reddit-preflight
  - worker:preflight-gate
  - worker:cookies-jar-backup
  - type-extension:HealthStatus
affects:
  - src/features/accounts/lib/types.ts
  - src/features/accounts/lib/health.ts
  - src/features/accounts/components/health-badge.tsx
  - src/lib/action-worker/worker.ts
tech-stack:
  added: []
  patterns: [discriminated-union-result, cache-ttl-via-db-columns, best-effort-side-effect]
key-files:
  created:
    - src/features/accounts/lib/reddit-preflight.ts
    - src/features/accounts/lib/reddit-preflight.test.ts
  modified:
    - src/features/accounts/lib/types.ts
    - src/features/accounts/lib/health.ts
    - src/features/accounts/components/health-badge.tsx
    - src/lib/action-worker/worker.ts
decisions:
  - Skipped plan Tasks 1 + 2 entirely — src/lib/gologin/* was deleted in Phase 17.5; cookies persistence is now native to Browserbase via browserSettings.context.persist=true
  - Replaced GoLogin setCookies-before-connect with Browserbase auto-restore (no code needed)
  - Replaced saveCookiesAndRelease wrapper with best-effort context.cookies() dump on success path; releaseSession already runs unconditionally in worker finally (T-17.5-LIFECYCLE-01)
  - Dropped 30-60s success-path idle (Browserbase session timeout handles slot lifecycle; idle would just burn billable session-seconds)
  - Extended HealthStatus TS union with needs_reconnect + captcha_required to match the ENUM landed in migration 00026 (plan 18-01)
metrics:
  duration: ~25 min
  completed: 2026-04-27
  tasks: 2 (Browserbase-adapted from original 4)
  files: 6
---

# Phase 18 Plan 02: Cookies Persistence + Reddit Preflight Summary

Preflight + cookies-backup layer wired into the Browserbase-era action worker. Reddit accounts are now pre-checked via direct fetch to `about.json` BEFORE Browserbase session creation; definitive ban signals flip `social_accounts.health_status='banned'` with zero credit burn and zero concurrent-slot consumption. Browserbase contexts continue to auto-persist cookies via `browserSettings.context.persist=true`; `browser_profiles.cookies_jar` is now an optional backup/audit snapshot dumped on success paths.

## Browserbase Adaptation (vs. original GoLogin-era plan)

The plan was authored when GoLogin was the active vendor. Phase 17.5 deleted `src/lib/gologin/` entirely. The four-task GoLogin-shaped plan was reduced to two Browserbase-shaped tasks:

| Original task | Adapted outcome |
|---|---|
| Task 1: Add `getCookies` / `setCookies` REST wrappers to `src/lib/gologin/client.ts` | **Skipped.** Browserbase has no analogous endpoints; cookies are persisted natively in the context. |
| Task 2: Add `saveCookiesAndRelease` wrapper with 30-60s idle to `src/lib/gologin/adapter.ts` | **Skipped.** `releaseSession` already runs unconditionally in the worker `finally` block (T-17.5-LIFECYCLE-01). 30-60s idle dropped — would burn billable session-seconds for no anti-bot benefit (Browserbase session timeout handles this). |
| Task 3: Reddit preflight discriminated-union helper + tests | **Implemented as authored** (platform-correct — `about.json` direct fetch is unaffected by the vendor swap). |
| Task 4: Wire 4 worker.ts insertion points | **Reduced to 3 insertion points:** quarantine-guard extension, preflight gate, cookies-jar backup dump on success. The `setCookies` restore-before-connect step is unnecessary (Browserbase auto-restores). The `saveCookiesAndRelease` swap reduced to a `await context.cookies()` dump + `supabase.update({ cookies_jar })` inside the success branch. |

## Tasks Completed

| Commit | Description |
|---|---|
| `ed7d3bf` | feat(18-02) preflight module + tests + HealthStatus extension |
| `ed34607` | feat(18-02) worker quarantine-guard + preflight gate + cookies backup |

## Worker.ts Insertion Points (post-edit)

| Edit | Line range (post-edit) | Code |
|---|---|---|
| Extended quarantine guard IN-list | ~99-108 | adds `needs_reconnect` + `captcha_required` |
| Reddit preflight gate | ~136-220 | runs after quarantine, before browser-profile resolution |
| Cookies-jar backup dump | ~643-672 | best-effort `context.cookies()` write inside `if (result.success)` block |

## Tests

`src/features/accounts/lib/reddit-preflight.test.ts` — 10 tests passing:

1. V-09 cache hit (status=ok within 1h) skips fetch
2. Expired cache → fetch IS called and cache row updated
3. 200 + is_suspended:true → banned/suspended (cache row written)
4. 200 + total_karma<5 → banned/low_karma
5. 200 + total_karma>=5 → ok
6. 404 → banned/404
7. 403 → banned/403
8. V-08 503-twice → transient (2 fetch calls)
9. 503 once then 200 → ok
10. 429-twice → transient with rate_limited error

`pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts src/lib/action-worker/__tests__/` → **47/47 pass** (10 preflight + 37 worker).

## Verification

- `pnpm typecheck` — exit 0
- 10 preflight unit tests pass
- All worker unit tests still pass (no regressions)
- Quarantine guard extension verified by grep (both new ENUM values present)
- Preflight gate verified by grep (`runRedditPreflight`, `health_status: "banned"`, `preflight_transient`)

## V-IDs Coverage

| V-ID | Status |
|---|---|
| V-08 (transient retry) | ✅ unit test |
| V-09 (1h cache hit) | ✅ unit test |
| V-04 (success-path idle 30-60s) | ❌ DROPPED (Browserbase session timeout owns lifecycle) |
| V-05/V-06/V-07 (real-net integration) | DEFERRED to manual QA (`INTEGRATION=1` not added) |
| V-10 (banned → no Browserbase session) | DEFERRED to plan 03 + manual QA |
| V-17 (quarantine extends to needs_reconnect / captcha_required) | DEFERRED to plan 03 (detector populates the ENUM) |
| V-26 (cookies restore before connect) | ❌ DROPPED — Browserbase auto-restores; no equivalent step needed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Tasks 1+2 entire scope unimplementable**
- **Found during:** read-first
- **Issue:** Plan instructs editing `src/lib/gologin/client.ts` and `src/lib/gologin/adapter.ts`; both were deleted in Phase 17.5 (`268fc35`). Browserbase SDK has no `getCookies`/`setCookies` REST endpoints — cookies are persisted as part of the context state by Browserbase itself.
- **Fix:** Skip Tasks 1+2. Replace plan-spec cookie restore-before-connect with no-op (Browserbase auto-restore via `browserSettings.context.persist=true`, already wired in `createSession`). Replace plan-spec `saveCookiesAndRelease` wrapper with a best-effort `await context.cookies()` dump inside the worker success branch — purely a backup/audit path; Browserbase still owns runtime persistence.
- **Files affected:** none (work removed).
- **Commits:** N/A — these tasks produced no code.

**2. [Rule 3 — Blocking] Extending `HealthStatus` TS union breaks badge + display switch**
- **Found during:** Task 4 typecheck
- **Issue:** Adding `needs_reconnect` and `captcha_required` to the `HealthStatus` union surfaced two compile errors: `health-badge.tsx` HEALTH_STYLES record was incomplete, `health.ts` `getHealthDisplay` switch lacked exhaustive cases.
- **Fix:** Added matching entries (amber color family) in both files.
- **Files modified:** `src/features/accounts/components/health-badge.tsx`, `src/features/accounts/lib/health.ts`
- **Commit:** `ed7d3bf`

**3. [Rule 1 — Bug] Preflight `transient` previously had no `job_logs` audit row in original plan**
- **Found during:** Task 4 worker wiring
- **Issue:** Plan's transient-branch only writes `updateActionStatus(...)` but not a `job_logs` row, leaving operational telemetry blind for transient preflight failures.
- **Fix:** Added a parallel `job_logs.insert` for the transient branch with `failure_mode: 'preflight_transient'` + `preflight_error` field. Mirrors the banned-branch shape.
- **Commit:** `ed34607`

## Hand-off to Plan 18-03

Plan 03 owns:
1. Ban detector that writes `health_status='needs_reconnect'` and `'captcha_required'` (the new ENUM values just wired into the quarantine guard).
2. Account-warning email job (`account_warning_email` job_type from migration 00026).
3. Optional UI surfacing of preflight status (`last_preflight_at`/`last_preflight_status` columns).
4. Real-net integration tests behind `INTEGRATION=1` (V-05/V-06/V-07 deferred from this plan).
5. Manual QA of V-10 (banned → no Browserbase session) on dev branch.

## Self-Check: PASSED

- `src/features/accounts/lib/reddit-preflight.ts` — FOUND
- `src/features/accounts/lib/reddit-preflight.test.ts` — FOUND
- Commit `ed7d3bf` — FOUND
- Commit `ed34607` — FOUND
- `pnpm typecheck` — exit 0
- `pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts src/lib/action-worker/__tests__/` — 47/47 pass
- `grep -n "src/lib/gologin" src/` — 0 hits (confirmed not resurrected)
