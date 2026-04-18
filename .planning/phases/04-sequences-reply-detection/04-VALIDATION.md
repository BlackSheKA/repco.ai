---
phase: 4
slug: sequences-reply-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (exists, configured with `@/` alias) |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | FLLW-01 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 3"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | FLLW-02 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 7"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | FLLW-03 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 14"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | FLLW-04 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-05 | 01 | 1 | FLLW-05 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/auto-send.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | RPLY-01 | integration | Manual -- requires GoLogin + Anthropic API | manual-only | ⬜ pending |
| 04-02-02 | 02 | 2 | RPLY-02 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/reply-matching.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-03 | 02 | 2 | RPLY-03 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-04 | 02 | 2 | RPLY-04 | integration | Manual -- requires Supabase Realtime | manual-only | ⬜ pending |
| 04-03-01 | 03 | 2 | NTFY-01 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/daily-digest.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | NTFY-02 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-03 | 03 | 2 | NTFY-03 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/account-warning.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/features/sequences/lib/__tests__/scheduler.test.ts` — stubs for FLLW-01, FLLW-02, FLLW-03
- [ ] `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` — stubs for FLLW-04
- [ ] `src/features/sequences/lib/__tests__/auto-send.test.ts` — stubs for FLLW-05
- [ ] `src/features/sequences/lib/__tests__/reply-matching.test.ts` — stubs for RPLY-02
- [ ] `src/features/notifications/lib/__tests__/reply-alert.test.ts` — stubs for RPLY-03, NTFY-02
- [ ] `src/features/notifications/lib/__tests__/daily-digest.test.ts` — stubs for NTFY-01
- [ ] `src/features/notifications/lib/__tests__/account-warning.test.ts` — stubs for NTFY-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inbox checked every 2h via CU | RPLY-01 | Requires GoLogin Cloud + Anthropic API + live Reddit account | 1. Trigger `/api/cron/check-replies` manually 2. Verify GoLogin session starts 3. Verify CU navigates to inbox 4. Verify reply data returned |
| Reply event pushed via Realtime | RPLY-04 | Requires running Supabase Realtime subscription | 1. Open dashboard in browser 2. Insert reply record in DB 3. Verify toast notification appears 4. Verify reply card renders in Replies section |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
