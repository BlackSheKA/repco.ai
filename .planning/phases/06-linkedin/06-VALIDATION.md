---
phase: 6
slug: linkedin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source invariants: `06-RESEARCH.md §8 Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (to be installed in Wave 0 — project has no test framework yet per CLAUDE.md) |
| **Config file** | `vitest.config.ts` (Wave 0 installs) |
| **Quick run command** | `pnpm vitest run src/features/monitoring --reporter=dot` |
| **Full suite command** | `pnpm vitest run --reporter=default` |
| **Estimated runtime** | ~15 seconds (unit + integration only; no live Apify) |

---

## Sampling Rate

- **After every task commit:** Run quick run command against changed feature dir.
- **After every plan wave:** Run full suite.
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

Populated by gsd-planner when PLAN.md is created. Template rows:

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-W0 | 01 | 0 | — | install | `pnpm add -D vitest @vitest/ui` | ❌ W0 | ⬜ pending |
| 06-01-SCHEMA | 01 | 1 | MNTR-02 | integration | `pnpm vitest run src/features/monitoring/__tests__/schema.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-APIFY | 01 | 1 | MNTR-02 | unit | `pnpm vitest run src/features/monitoring/lib/linkedin-adapter.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-MATCHER | 01 | 1 | MNTR-02 | unit | `pnpm vitest run src/features/monitoring/lib/linkedin-matcher.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-CANARY | 01 | 2 | MNTR-02 | integration | `pnpm vitest run src/features/monitoring/__tests__/canary.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-INGEST | 01 | 2 | MNTR-02 | integration | `pnpm vitest run src/features/monitoring/__tests__/linkedin-ingestion.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-CRON | 01 | 2 | MNTR-02 | integration | `pnpm vitest run src/app/api/cron/monitor-linkedin/route.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-FEED | 01 | 3 | MNTR-02 | manual | browser check `/dashboard` filter + LinkedIn badge | n/a | ⬜ pending |
| 06-01-STALE | 01 | 3 | MNTR-02 | unit | `pnpm vitest run src/features/dashboard/components/staleness-banner.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install vitest: `pnpm add -D vitest @vitest/ui @vitejs/plugin-react happy-dom`
- [ ] Create `vitest.config.ts` with path alias `@/*` → `./src/*` mirroring tsconfig
- [ ] Create `src/features/monitoring/__fixtures__/apify-linkedin/success.json`
- [ ] Create `src/features/monitoring/__fixtures__/apify-linkedin/canary-success.json`
- [ ] Create `src/features/monitoring/__fixtures__/apify-linkedin/canary-empty.json`
- [ ] Create `src/features/monitoring/__fixtures__/apify-linkedin/schema-drift.json`
- [ ] Add `"test": "vitest run"` script to package.json

---

## Critical Invariants (from RESEARCH.md §8)

Each MUST have at least one automated test referenced in the Per-Task Verification Map:

1. Canary zero → no user runs executed.
2. Canary failure fires Sentry alert exactly once per sustained outage (fingerprint dedup).
3. LinkedIn signal renders with `#0A66C2` badge when `platform === 'linkedin'`.
4. Dedup by `post_url` — repeat cron on same post_url does NOT insert duplicate.
5. Freshness cutoff 48h enforced.
6. `apify_run_id` non-null on every LinkedIn signal row.
7. Exactly one `job_logs` row per cron invocation (`cron: 'monitor-linkedin'`).
8. Hashtag normalization — `#AI` in post text matches keyword `ai`.
9. Actioning a LinkedIn signal creates `actions.action_type = 'connection_request'` (not `'dm'`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Feed filter — select LinkedIn | MNTR-02 | Requires browser + Realtime subscription | Sign in → go to `/dashboard` → open platform filter → select "LinkedIn" → verify only LinkedIn signals visible and LinkedIn blue badges rendered |
| Staleness banner appearance | MNTR-02 | Depends on real `job_logs` timing | Manually insert `job_logs` row with `finished_at = now() - 9h` → reload dashboard → verify amber banner shows "delayed" copy |
| Apify live smoke (pre-ship) | MNTR-02 | Requires live Apify token | Trigger `POST /api/cron/monitor-linkedin` with bearer, observe `job_logs` row + signals appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
