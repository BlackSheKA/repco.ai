---
phase: 9
slug: cross-platform-approval-audit-trail
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — project has no test framework; validation via typecheck + DB query + manual browser |
| **Config file** | none |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm typecheck && pnpm lint` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** `pnpm typecheck`
- **After wave:** `pnpm typecheck && pnpm lint`
- **Before `/gsd:verify-work`:** Type + lint clean + manual approval queue spot-check in browser
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 1 | APRV-01 | typecheck+grep | `pnpm typecheck && grep -q "linkedin" src/features/actions/components/approval-card.tsx` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 1 | APRV-01 | grep-assert | `grep -q "r/null" src/features/actions/components/approval-card.tsx && echo FAIL || echo PASS` | n/a | ⬜ pending |
| 9-02-01 | 02 | 1 | OBSV-01 | typecheck+grep | `pnpm typecheck && ! grep -E "details:|correlation_id:" src/lib/action-worker/worker.ts \| grep job_logs` | n/a | ⬜ pending |
| 9-02-02 | 02 | 1 | OBSV-01 | grep-assert | `grep -q "try {" src/lib/action-worker/worker.ts && grep -q "finally {" src/lib/action-worker/worker.ts` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Typecheck + grep assertions only.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Approval card renders correct badge for LinkedIn actions | APRV-01 | Visual rendering | Seed a `connection_request` action for a LinkedIn prospect; open `/approval-queue`; confirm blue `LinkedIn` badge, no `r/null`, no `u/` prefix |
| worker.ts writes job_logs row per action run | OBSV-01 | Requires running action; needs DB query | After an action executes, query `SELECT * FROM job_logs WHERE action_id = :id LIMIT 1` — row must exist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
