---
phase: 2
slug: reddit-monitoring-intent-feed
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
updated: 2026-04-21
---

# Phase 2 — Validation Strategy

> Per-phase validation contract. Nyquist audit completed 2026-04-21.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (happy-dom, path aliases, `@testing-library/jest-dom`) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File | Status |
|---------|-------------|-----------|-------------------|------|--------|
| 02-01-01 | MNTR-01 | unit | `npx vitest run src/features/monitoring/lib/__tests__/reddit-adapter.test.ts` | `src/features/monitoring/lib/__tests__/reddit-adapter.test.ts` | green |
| 02-01-02 | MNTR-03 | unit | `npx vitest run src/features/monitoring/lib/__tests__/structural-matcher.test.ts` | `src/features/monitoring/lib/__tests__/structural-matcher.test.ts` | green |
| 02-01-03 | MNTR-04 | unit | `npx vitest run src/features/monitoring/lib/__tests__/sonnet-classifier.test.ts` | `src/features/monitoring/lib/__tests__/sonnet-classifier.test.ts` | green |
| 02-02-01 | MNTR-05 | unit | `npx vitest run src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` | `src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` | green |
| 02-02-02 | MNTR-07 | unit | `npx vitest run src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | `src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | green |
| 02-03-01 | FEED-02 | component | `npx vitest run src/features/dashboard/components/__tests__/flame-indicator.test.tsx` | `src/features/dashboard/components/__tests__/flame-indicator.test.tsx` | green |
| 02-03-02 | FEED-03, FEED-04 | manual | see Manual-Only section | — | manual-verified (UAT pass) |
| 02-03-03 | FEED-05 | manual | see Manual-Only section | — | manual-verified (UAT pass) |
| 02-04-01 | AGNT-02 | unit | `npx vitest run src/features/dashboard/lib/__tests__/agent-state.test.ts` | `src/features/dashboard/lib/__tests__/agent-state.test.ts` | green |
| 02-04-02 | AGNT-03 | unit | `npx vitest run src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | `src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | green |
| 02-04-03 | DASH-01 | unit | `npx vitest run src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | `src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | green |
| 02-04-04 | DASH-03 | component | `npx vitest run src/features/dashboard/components/__tests__/staleness-banner.test.tsx` | `src/features/dashboard/components/__tests__/staleness-banner.test.tsx` | green |
| 02-05-01 | MNTR-06 | manual | see Manual-Only section | — | manual-verified (UAT pass) |

*Status: green · manual-verified · deferred*

---

## Test Files Added by Nyquist Audit (2026-04-21)

| File | Requirement | Tests | Notes |
|------|-------------|-------|-------|
| `src/features/monitoring/lib/__tests__/reddit-adapter.test.ts` | MNTR-01 | 4 | snoowrap credential guard, r/ prefix stripping, result aggregation |
| `src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` | MNTR-05 | 5 | 48h freshness filter, dedup by permalink, subreddit prefix storage |
| `src/features/dashboard/lib/__tests__/agent-state.test.ts` | AGNT-02 | 13 | All 7 states, priority chain, getAgentMessage |
| `src/features/dashboard/lib/__tests__/terminal-text-rules.test.ts` | DASH-01, AGNT-03, MNTR-07 | 13 | transformJobLog text rules, post_content field contract |
| `src/features/dashboard/components/__tests__/flame-indicator.test.tsx` | FEED-02 | 6 | Cold/warm/hot tiers, Classifying state, aria-label, N/10 display |

---

## Pre-existing Tests Covering Phase 2 Requirements

| File | Requirements Covered |
|------|---------------------|
| `src/features/monitoring/lib/__tests__/structural-matcher.test.ts` | MNTR-03 (9 tests) |
| `src/features/monitoring/lib/__tests__/sonnet-classifier.test.ts` | MNTR-04 (4 tests) |
| `src/features/dashboard/components/__tests__/staleness-banner.test.tsx` | DASH-03 adjacent (3 tests) |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | UAT Status |
|----------|-------------|------------|------------|
| Real-time feed updates via Supabase Realtime | MNTR-06, DASH-03 | Requires live Supabase Realtime connection | PASS — UAT test 11 |
| Reddit API authentication with live credentials | MNTR-01 | Requires real Reddit OAuth env vars at runtime | Infrastructure dependency — cron code is correct |
| Contact action creates prospect + optimistic UI | FEED-03 | Requires Supabase DB write with RLS | PASS — UAT test 10 |
| Dismiss and restore signal | FEED-04 | Requires Supabase DB write | PASS — UAT tests 8, 9 |
| Filter bar platform/strength URL sync | FEED-05 | URL param sync requires browser routing | PASS — UAT test 7 |
| Dashboard real-time signal card appearance | DASH-03 | End-to-end Supabase Realtime + browser | PASS — UAT test 6 |
| Agent card emotional state transitions | AGNT-01 | Requires live data and 30s polling | PASS — UAT test 12 |

---

## Deferred Bugs (Not Blocking Phase Completion)

| ID | File | Bug | Severity | Disposition |
|----|------|-----|----------|-------------|
| BUG-02-01 | `src/features/dashboard/components/signal-card.tsx` (line 86) | Originally double-prefix `r/r/SaaS` — **fixed** prior to UAT | Cosmetic | Fixed |
| BUG-02-02 | `src/features/dashboard/lib/use-realtime-terminal.ts` (line 160) | Originally `content_snippet` field mismatch — **fixed** to `post_content` | Warning | Fixed |

---

## Full Suite Result

```
Test Files  39 passed (39)
     Tests  262 passed (262)
  Duration  ~10 seconds
```

Command: `npx vitest run`

---

## Validation Sign-Off

- [x] All Phase 2 requirements have automated test or manual-verified UAT entry
- [x] No 3 consecutive tasks without automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Both implementation bugs from 02-VERIFICATION.md confirmed fixed

**Approval:** 2026-04-21 — Nyquist audit by gsd-nyquist-auditor
