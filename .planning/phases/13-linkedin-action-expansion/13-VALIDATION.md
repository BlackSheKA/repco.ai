---
phase: 13
slug: linkedin-action-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — 290 tests) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- <path>` |
| **Full suite command** | `pnpm typecheck && pnpm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <affected file>`
- **After every plan wave:** Run `pnpm typecheck && pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green + live E2E against real LinkedIn target
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Filled in by planner — one row per task. Each plan's tasks must map to a REQ-ID (LNKD-01..06) and a test command or manual-verify step.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LNKD-01 | — | — | unit | `pnpm test -- linkedin-dm-executor` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/action-worker/actions/__tests__/linkedin-dm-executor.test.ts` — stubs for LNKD-01 failure modes
- [ ] `src/lib/action-worker/actions/__tests__/linkedin-follow-executor.test.ts` — stubs for LNKD-02
- [ ] `src/lib/action-worker/actions/__tests__/linkedin-like-executor.test.ts` — stubs for LNKD-03 (like)
- [ ] `src/lib/action-worker/actions/__tests__/linkedin-comment-executor.test.ts` — stubs for LNKD-03 (comment)
- [ ] `src/app/api/cron/linkedin-prescreen/__tests__/route.test.ts` — stubs for LNKD-05
- [ ] Shared Playwright fixtures — mock page object with selector queries

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DM to 1st-degree succeeds | LNKD-01 | Requires warmed LinkedIn account + real test target | Approve DM action in UI → observe `status=completed` + message in LinkedIn inbox |
| DM to non-1st-degree fails with `not_connected` | LNKD-01 | Requires real non-1st-degree target | Approve DM → expect `failure_mode=not_connected` in job_logs |
| Follow public profile succeeds | LNKD-02 | Real target + visible Follow state | Approve Follow → refresh profile → "Following" visible |
| Like visible on post | LNKD-03 | Real post URN | Approve Like → reload post → reaction count +1 |
| Comment visible on post | LNKD-03 | Real post URN + Sonnet output review | Approve Comment → reload post → text appears |
| Followup DM routes LinkedIn through new executor | LNKD-04 | Cron + time backdating | Backdate `actions.created_at` 3d → trigger cron → expect `followup_dm` row executes via linkedin-dm |
| Pre-screen marks Creator-mode as `unreachable` | LNKD-05 | Requires Creator-mode test target | Seed `pipeline_status=new` + known Creator slug → trigger cron → expect `unreachable / creator_mode_no_connect` |
| `pipeline_status=unreachable` prospects skipped by approval queue | LNKD-06 | Queue rendering + filter logic | Seed 2 prospects (one unreachable, one new) → verify only `new` appears for approval |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all executor stubs + prescreen route stub
- [ ] No watch-mode flags (`pnpm test` single-run)
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
