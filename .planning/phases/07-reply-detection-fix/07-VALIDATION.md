---
phase: 7
slug: reply-detection-fix
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (happy-dom) |
| **Config file** | `vitest.config.ts` (already present) |
| **Quick run command** | `pnpm test -- --run src/lib/handles/normalize.test.ts src/lib/reply-detection/reply-matching.test.ts` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | RPLY-02 | unit | `pnpm test -- --run src/lib/handles/normalize.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | RPLY-02 | unit | `pnpm test -- --run src/lib/reply-detection/reply-matching.test.ts` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | RPLY-02, RPLY-03, RPLY-04 | integration | `pnpm test -- --run src/lib/reply-detection/handle-reply-detected.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/handles/normalize.ts` — `normalizeHandle(raw, platform)` utility
- [ ] `src/lib/handles/normalize.test.ts` — unit tests covering Reddit (`u/` strip + lowercase) and LinkedIn (lowercase only)
- [ ] `src/lib/reply-detection/handle-reply-detected.test.ts` — integration test stub exercising match → `pipeline_status=replied` → follow-up cancel → Resend call → Realtime emit

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reply alert email actually arrives in inbox within 10 min | RPLY-03 | Resend delivery depends on live provider credentials & inbox filters — cannot stub the provider's actual send latency | Trigger `/api/cron/check-replies` against dev DB with a seeded prospect + inbox reply, wait up to 10 min, confirm email arrives at monitored address; capture timestamp delta |
| Realtime push observed by live browser subscription | RPLY-04 | `use-realtime-replies` runs in browser with WebSocket, requires live Supabase Realtime channel | Open dashboard with DevTools network tab filtering WS frames, trigger cron, observe `replies` channel frame arrival |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`normalize.ts`, `handle-reply-detected.test.ts`)
- [ ] No watch-mode flags (always `--run`)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
