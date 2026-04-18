---
phase: 3
slug: action-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run --reporter=verbose --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run --reporter=verbose --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | ACTN-01 | integration | `pnpm vitest run src/features/actions/__tests__/goLogin-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | ACTN-02 | integration | `pnpm vitest run src/features/actions/__tests__/playwright-cdp.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | ACTN-03 | unit | `pnpm vitest run src/features/actions/__tests__/haiku-cu-executor.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | ACTN-04 | integration | `pnpm vitest run src/features/actions/__tests__/action-worker.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | ACTN-05 | unit | `pnpm vitest run src/features/actions/__tests__/state-machine.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 1 | ACTN-06 | integration | `pnpm vitest run src/features/actions/__tests__/screenshot-storage.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | ACTN-07 | unit | `pnpm vitest run src/features/actions/__tests__/dm-generation.test.ts` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | APRV-01 | e2e | manual | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | ABAN-01 | unit | `pnpm vitest run src/features/actions/__tests__/warmup-protocol.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | ABAN-04 | unit | `pnpm vitest run src/features/actions/__tests__/target-isolation.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 3 | ACCT-01 | e2e | manual | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `@vitest/coverage-v8` — install test framework
- [ ] `vitest.config.ts` — configuration with path aliases
- [ ] `src/features/actions/__tests__/` — test directory structure
- [ ] Stub test files for each requirement group

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Approval queue one-click approve/edit/reject | APRV-01 | UI interaction | Open approval queue, verify buttons render, click each action |
| Warmup progress visualization | ACCT-01 | Visual rendering | Check warmup progress bars and health status badges render correctly |
| Screenshot verification display | ACTN-06 | Visual rendering | Execute action, verify screenshot appears in action detail view |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
