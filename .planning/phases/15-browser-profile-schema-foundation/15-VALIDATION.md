---
phase: 15
slug: browser-profile-schema-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
updated: 2026-04-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from `15-RESEARCH.md` §Validation Architecture. Task IDs assigned 2026-04-27 alongside PLAN files.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (already configured) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm vitest run --reporter=dot` |
| **Full suite command** | `pnpm typecheck && pnpm vitest run` |
| **Estimated runtime** | ~30 seconds (typecheck + unit tests; no E2E in this phase) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` (catches column-rename regressions in <10s)
- **After every plan wave:** Run `pnpm vitest run` (full unit suite)
- **Before `/gsd-verify-work`:** `pnpm typecheck && pnpm vitest run && pnpm build` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-T1 | 01 | 1 | BPRX-01 | T-15-01 | Migration file authored with 4 RLS policies + UNIQUE constraint + DROP legacy columns | grep | `grep -c "CREATE POLICY" supabase/migrations/00023_browser_profiles.sql` → 4 | ✅ | ⬜ pending |
| 15-01-T2 | 01 | 1 | BPRX-01 | T-15-01 | Dev branch has browser_profiles with 9 D-01 columns + RLS=true + 4 policies | manual SQL | `curl ... information_schema.columns WHERE table_name='browser_profiles'` → 9 rows; `pg_class.relrowsecurity` → true; `pg_policies count` → 4 | ✅ | ⬜ pending |
| 15-01-T2 | 01 | 1 | BPRX-01 | T-15-04 | Unique constraint `one_account_per_platform` exists; legacy columns dropped | manual SQL | `pg_constraint WHERE conname='one_account_per_platform'` → 1 row; `information_schema.columns ... IN ('gologin_profile_id','proxy_id')` → 0 rows | ✅ | ⬜ pending |
| 15-01-T3 | 01 | 1 | BPRX-01 | T-15-02 | Helper module + types contract authored, helper takes SupabaseClient as parameter (no singleton import) | grep | `grep -c "export async function getBrowserProfileForAccount" src/features/browser-profiles/lib/get-browser-profile.ts` → 1; `grep -c "import.*createClient" src/features/browser-profiles/lib/get-browser-profile.ts` → 0 | ✅ | ⬜ pending |
| 15-02-T1 | 02 | 2 | BPRX-02 | T-15-03 | account-actions.ts (connect, delete, start, stop) refactored — no legacy column refs | grep | `grep -E "gologin_profile_id\|\.proxy_id" src/features/accounts/actions/account-actions.ts` → 0 matches | ✅ | ⬜ pending |
| 15-02-T2 | 02 | 2 | BPRX-02 | T-15-03 | account-card.tsx + worker.ts + 2 cron routes refactored; production source typechecks | unit | `pnpm typecheck` errors restricted to `__tests__` paths only | ✅ | ⬜ pending |
| 15-02-T3 | 02 | 2 | BPRX-02 | T-15-03 | All 9 reader sites refactored; full typecheck/test/build green; global grep gate = 0 | unit + smoke | `pnpm typecheck && pnpm vitest run --reporter=dot && pnpm build` exits 0; `grep -rn "gologin_profile_id\|\.proxy_id" src/ --include='*.ts' --include='*.tsx' | grep -v "browser-profiles/lib/get-browser-profile.ts" | grep -v "accounts/lib/types.ts" | wc -l` → 0 | ✅ | ⬜ pending |
| 15-02-T3 | 02 | 2 | BPRX-02 | — | Cron routes return 200 against dev server with $CRON_SECRET | manual smoke | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/check-replies` → 200; same for `linkedin-prescreen` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — already exists, no install needed
- [x] Existing test scaffolding under `src/lib/action-worker/__tests__/` and `src/app/api/cron/check-replies/__tests__/` — extend, don't replace
- [x] `mockBrowserProfile()` factory — defined inline in each test file alongside the `vi.mock` of the helper (Plan 02 Task 3)

*Existing infrastructure covers all phase requirements; Wave 0 is satisfied.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to dev Supabase branch | BPRX-01 | Supabase Management API call against live dev branch — cannot run in vitest | Plan 01 Task 2: apply via curl + Node JSON.stringify recipe (RESEARCH §8); expect 2xx + array of `{"command":...}` entries |
| RLS owner-only enforcement (cross-user isolation) | BPRX-01 | Requires two distinct authed users; no integration test framework configured | Defer to Phase 17 when allocator creates real rows under different auth contexts. Phase 15 verifies via `pg_policies count = 4` (structural). |
| Cron route smoke test | BPRX-02 | `pnpm dev --port 3001` is interactive; CI-grade harness not in scope | Plan 02 Task 3 Step 6: boot dev server; curl both cron routes with `$CRON_SECRET` bearer; expect 200 + correlationId |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`mockBrowserProfile()` factory inlined per test file)
- [x] No watch-mode flags (use `vitest run`, not `vitest`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — task IDs filled, ready for execute-phase
