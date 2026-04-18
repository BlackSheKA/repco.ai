---
phase: 5
slug: billing-onboarding-growth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (or "none — Wave 0 installs") |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run && pnpm typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | ONBR-01 | integration | `pnpm vitest run src/features/onboarding` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | ONBR-02 | unit | `pnpm vitest run src/features/onboarding` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | ONBR-03 | unit | `pnpm vitest run src/features/onboarding` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | BILL-01 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | BILL-02 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-02-03 | 02 | 1 | BILL-03 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | BILL-04 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | BILL-05 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-03-03 | 03 | 2 | BILL-06 | unit | `pnpm vitest run src/features/billing` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | PRSP-01 | integration | `pnpm vitest run src/features/prospects` | ❌ W0 | ⬜ pending |
| 05-04-02 | 04 | 2 | PRSP-02 | unit | `pnpm vitest run src/features/prospects` | ❌ W0 | ⬜ pending |
| 05-04-03 | 04 | 2 | PRSP-05 | unit | `pnpm vitest run src/features/prospects` | ❌ W0 | ⬜ pending |
| 05-05-01 | 05 | 3 | GROW-01 | integration | `pnpm vitest run src/features/growth` | ❌ W0 | ⬜ pending |
| 05-05-02 | 05 | 3 | GROW-03 | unit | `pnpm vitest run src/features/growth` | ❌ W0 | ⬜ pending |
| 05-05-03 | 05 | 3 | GROW-04 | unit | `pnpm vitest run src/features/growth` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — Vitest configuration with path aliases
- [ ] `src/features/onboarding/__tests__/` — test stubs for ONBR-01 through ONBR-07
- [ ] `src/features/billing/__tests__/` — test stubs for BILL-01 through BILL-09
- [ ] `src/features/prospects/__tests__/` — test stubs for PRSP-01 through PRSP-06
- [ ] `src/features/growth/__tests__/` — test stubs for GROW-01 through GROW-06

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Onboarding scan animation | ONBR-04 | Visual animation timing | Navigate /onboarding, verify 3-5s animation plays |
| Stripe Checkout redirect | BILL-01 | External hosted page | Click subscribe, verify redirect to Stripe |
| Kanban drag-and-drop | PRSP-01 | Browser DnD interaction | Drag prospect card between columns, verify update |
| /live page polling | GROW-01 | Real-time visual update | Open /live, wait 10s, verify new signals appear |
| Results card image | GROW-04 | Visual image output | Generate card, verify 1200x630 PNG renders correctly |
| Credit sidebar display | BILL-06 | Visual UI element | Check sidebar footer shows credits with color thresholds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
