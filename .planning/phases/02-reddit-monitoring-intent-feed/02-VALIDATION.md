---
phase: 2
slug: reddit-monitoring-intent-feed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | MNTR-01 | integration | `npx vitest run src/lib/reddit/__tests__/adapter.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | MNTR-03 | unit | `npx vitest run src/lib/reddit/__tests__/config.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | MNTR-04 | integration | `npx vitest run src/app/api/cron/__tests__/ingest.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | MNTR-05 | unit | `npx vitest run src/lib/classification/__tests__/structural.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | MNTR-06 | unit | `npx vitest run src/lib/classification/__tests__/sonnet.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | MNTR-07 | unit | `npx vitest run src/lib/classification/__tests__/dedup.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | FEED-01, FEED-02 | component | `npx vitest run src/features/feed/__tests__/signal-card.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | FEED-03, FEED-04 | component | `npx vitest run src/features/feed/__tests__/filter.test.tsx` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | FEED-05 | integration | `npx vitest run src/features/feed/__tests__/realtime.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | AGNT-01, AGNT-02 | component | `npx vitest run src/features/agent/__tests__/persona.test.tsx` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | AGNT-03 | unit | `npx vitest run src/features/agent/__tests__/state-machine.test.ts` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 2 | DASH-01, DASH-02, DASH-03 | component | `npx vitest run src/features/dashboard/__tests__/layout.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest` + `@testing-library/react` — install test framework
- [ ] `vitest.config.ts` — configure with happy-dom, path aliases
- [ ] `src/lib/reddit/__tests__/adapter.test.ts` — snoowrap adapter stubs
- [ ] `src/lib/classification/__tests__/structural.test.ts` — structural classifier stubs
- [ ] `src/features/feed/__tests__/signal-card.test.tsx` — feed component stubs
- [ ] `src/features/agent/__tests__/persona.test.tsx` — agent persona stubs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-time feed updates | DASH-03 | Requires Supabase Realtime connection | Open dashboard in browser, insert signal via Supabase SQL editor, verify card appears without refresh |
| Reddit API authentication | MNTR-01 | Requires real Reddit OAuth credentials | Run cron endpoint with valid credentials, verify posts ingested |
| Agent emotional state transitions | AGNT-03 | Visual verification of state rendering | Trigger state changes, verify avatar/mood displays correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
