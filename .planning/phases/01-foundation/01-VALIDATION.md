---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | OBSV-01 | integration | `pnpm test -- --run` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | OBSV-02 | integration | `pnpm test -- --run` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | OBSV-03 | integration | `pnpm test -- --run` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | OBSV-04 | unit | `pnpm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `@testing-library/react` — install test framework
- [ ] `vitest.config.ts` — configure with path aliases matching tsconfig
- [ ] `src/__tests__/setup.ts` — shared test setup
- [ ] Stub test files for each requirement area

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auth flow (signup/login/logout) | OBSV-01 | Requires Supabase Auth UI interaction | 1. Navigate to /login 2. Sign up with email 3. Check magic link 4. Log out |
| Vercel deployment accessible | OBSV-01 | External infra verification | 1. Visit production URL 2. Confirm app loads |
| Sentry error appears | OBSV-03 | Requires Sentry dashboard check | 1. Trigger error 2. Check Sentry dashboard |
| Axiom log appears | OBSV-03 | Requires Axiom dashboard check | 1. Trigger request 2. Check Axiom dataset |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
