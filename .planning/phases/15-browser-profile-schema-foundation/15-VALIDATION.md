---
phase: 15
slug: browser-profile-schema-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from `15-RESEARCH.md` §Validation Architecture.

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

> Final task IDs assigned by planner. Anchor each verification to the falsifiable command. Plan and wave columns filled in once PLAN.md files exist.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | BPRX-01 | — | RLS owner-only on browser_profiles | manual SQL | `curl -X POST --ssl-no-revoke -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"query":"SELECT relname, relrowsecurity FROM pg_class WHERE relname=''browser_profiles'';"}' https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query` → relrowsecurity=true | ⬜ | ⬜ pending |
| TBD | 01 | 1 | BPRX-01 | — | Column set matches D-01 exactly | manual SQL | `information_schema.columns WHERE table_name='browser_profiles'` returns the 9 D-01 columns and no extras | ⬜ | ⬜ pending |
| TBD | 01 | 1 | BPRX-01 | — | UNIQUE (browser_profile_id, platform) rejects duplicates | manual SQL | Insert two rows with same `(browser_profile_id, 'reddit')` → second returns `23505 unique_violation` | ⬜ | ⬜ pending |
| TBD | 01 | 1 | BPRX-01 | — | NULL `browser_profile_id` allowed multiple times (Postgres default NULLS DISTINCT semantics) | manual SQL | Insert two rows with `(NULL, 'reddit')` → both succeed | ⬜ | ⬜ pending |
| TBD | 01 | 1 | BPRX-02 | — | Legacy columns dropped | manual SQL | `SELECT column_name FROM information_schema.columns WHERE table_name='social_accounts' AND column_name IN ('gologin_profile_id','proxy_id')` → 0 rows | ⬜ | ⬜ pending |
| TBD | 02 | 2 | BPRX-02 | — | All 9 reader sites refactored | grep | `grep -rn "gologin_profile_id\|\.proxy_id" src/ supabase/migrations/00023_browser_profiles.sql --include='*.ts' --include='*.tsx' \| grep -v "src/features/browser-profiles/lib/get-browser-profile.ts" \| grep -v "supabase/migrations/00023_"` returns 0 lines | ⬜ | ⬜ pending |
| TBD | 02 | 2 | BPRX-02 | — | TypeScript compiles after refactor | unit | `pnpm typecheck` exits 0 | ⬜ | ⬜ pending |
| TBD | 02 | 2 | BPRX-02 | — | Existing unit tests pass with updated fixtures | unit | `pnpm vitest run src/lib/action-worker src/app/api/cron` exits 0 | ⬜ | ⬜ pending |
| TBD | 02 | 2 | BPRX-02 | — | Production build succeeds | smoke | `pnpm build` exits 0 | ⬜ | ⬜ pending |
| TBD | 02 | 2 | BPRX-02 | — | Cron routes still respond 200 in dev | manual smoke | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/check-replies` → 200; same for `linkedin-prescreen` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — already exists, no install needed
- [x] Existing test scaffolding under `src/lib/action-worker/__tests__/` and `src/app/api/cron/check-replies/__tests__/` — extend, don't replace
- [ ] Add `mockBrowserProfile()` factory paired with existing `mockSocialAccount()` (location to be determined by planner alongside helper module)

*Existing infrastructure covers all phase requirements; Wave 0 only extends mock factories.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies cleanly to dev Supabase branch | BPRX-01 | Supabase Management API call against live dev branch — cannot run in vitest | Apply via `curl --ssl-no-revoke -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" -d @supabase/migrations/00023_browser_profiles.sql https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query`; expect 2xx |
| RLS owner-only enforcement | BPRX-01 | Requires two distinct authed users; no integration test framework configured | Sign in as user A → insert browser_profile; sign in as user B → `select * from browser_profiles` returns 0 rows from user A |
| Cron route smoke test | BPRX-02 | `pnpm dev --port 3001` is interactive; CI-grade harness not in scope | Boot dev server; curl both cron routes with `$CRON_SECRET` bearer; expect 200 + correlationId in response |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (only `mockBrowserProfile()` factory)
- [ ] No watch-mode flags (use `vitest run`, not `vitest`)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once planner fills Task IDs

**Approval:** pending
