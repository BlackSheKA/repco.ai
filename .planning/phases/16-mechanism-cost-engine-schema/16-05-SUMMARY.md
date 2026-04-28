---
phase: 16-mechanism-cost-engine-schema
plan: 05
subsystem: monitoring/cron/cleanup
tags: [deletion, cleanup, cron, vercel]
requirements: [PRIC-02, PRIC-03]
dependency_graph:
  requires: [16-01, 16-02, 16-03, 16-04]
  provides: [zero-legacy-signal_type-references, 10-cron-vercel-config]
  affects: [vercel.json, src/app/api/cron, src/app/(app), src/features/monitoring]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - vercel.json
  deleted:
    - src/app/api/cron/monitor-reddit/route.ts
    - src/app/api/cron/monitor-linkedin/route.ts
    - src/app/api/cron/monitor-linkedin/route.test.ts
    - src/app/(app)/signals/page.tsx
    - src/features/monitoring/actions/settings-actions.ts
    - src/features/monitoring/components/sources-panel.tsx
decisions:
  - Verified pre-existing typecheck/lint/build failures on base 30ad4cc to confirm they do not trace to 16-05 deletions; documented in deferred-items.md per executor SCOPE_BOUNDARY rule.
metrics:
  duration_minutes: ~4
  tasks_completed: 5
  files_deleted: 6
  files_modified: 1
  completed_date: 2026-04-27
---

# Phase 16 Plan 05: Clean-Slate Deletion of Legacy Monitoring Stack Summary

Deleted the legacy `monitor-reddit` / `monitor-linkedin` cron routes, `/signals` page, monitoring server-actions and `sources-panel`, and the matching `vercel.json` cron entries — closing out Phase 16 ahead of Phase 22's `/signals` redesign.

## What Was Done

### Task 1 — Delete monitor-* cron routes
Removed `src/app/api/cron/monitor-reddit/route.ts`, `src/app/api/cron/monitor-linkedin/route.ts`, and `src/app/api/cron/monitor-linkedin/route.test.ts`. Both empty parent directories also removed.

- Commit: `b75f5a4` `chore(16-05): delete legacy monitor-reddit and monitor-linkedin cron routes`

### Task 2 — Delete signals page
Removed `src/app/(app)/signals/page.tsx` and its empty parent directory.

- Commit: `4875bf4` `chore(16-05): delete legacy signals page`

### Task 3 — Delete monitoring actions + components
Removed `src/features/monitoring/actions/settings-actions.ts` and `src/features/monitoring/components/sources-panel.tsx` (with their empty parent directories). `src/features/monitoring/lib/` (containing `classification-pipeline.ts` from PLAN 04) and `src/features/monitoring/__fixtures__/` survive as required.

- Commit: `10387bb` `chore(16-05): delete legacy monitoring actions and components`

### Task 4 — vercel.json cron cleanup
Removed two cron entries (`/api/cron/monitor-reddit`, `/api/cron/monitor-linkedin`). Result: 10 cron entries (was 12), valid JSON, all sibling routes (credit-burn, zombie-recovery, refresh-live-stats, warmup, expire-actions, schedule-followups, check-replies, digest, linkedin-prescreen, apify-zombie-cleanup) untouched.

- Commit: `24420b8` `chore(16-05): remove monitor-reddit and monitor-linkedin cron entries from vercel.json`

### Task 5 — Final invariant gate

Final grep gate: **PASSED** — `grep -rE "signal_type|MonitoringSignalType|MONITORING_COSTS" src/` returns zero matches. Phase 16's deletion contract holds across the codebase.

`pnpm typecheck`, `pnpm lint`, `pnpm build` failures encountered during the gate were **verified pre-existing on base commit 30ad4cc** (before any 16-05 deletion was applied) and do not reference any deleted scope. Per executor SCOPE_BOUNDARY policy and CLAUDE.md §3 ("Surgical Changes"), they are documented in `deferred-items.md` rather than fixed in this plan.

#### Pre-existing failures observed (out of scope)

| Check | Result | Root cause | Traces to 16-05 scope? |
|-------|--------|------------|------------------------|
| `pnpm typecheck` | 7 errors | Missing ambient module declarations for `*.svg` / `*.png` under `@/app/images/*` | No |
| `pnpm lint` | 9 errors / 11 warnings (20 total; base had 79 = 33 errors / 46 warnings) | Pre-existing react-hooks/typescript-eslint findings; deletions reduced total counts | No |
| `pnpm build` | Module not found: `@radix-ui/react-dismissable-layer` | Worktree node_modules hydration gap (radix-tooltip transitive peer); reproduces on base 30ad4cc with same `pnpm install` flow | No |

All grep verifications confirmed: zero lint/typecheck/build errors reference `monitor-reddit`, `monitor-linkedin`, `signals/page`, `settings-actions`, `sources-panel`, `signal_type`, `MonitoringSignalType`, or `MONITORING_COSTS`.

## Verification

| Acceptance Criterion | Status |
|----------------------|--------|
| `test ! -d src/app/api/cron/monitor-reddit` | PASS |
| `test ! -d src/app/api/cron/monitor-linkedin` | PASS |
| `test ! -d "src/app/(app)/signals"` | PASS |
| `test ! -d src/features/monitoring/actions` | PASS |
| `test ! -d src/features/monitoring/components` | PASS |
| `test -d src/features/monitoring/lib` | PASS |
| `test -d src/features/monitoring/__fixtures__` | PASS |
| `test -f src/features/monitoring/lib/classification-pipeline.ts` | PASS |
| `vercel.json` valid JSON, 10 cron entries | PASS (validated via `python -c "import json; ..."`) |
| `grep -rE "signal_type|MonitoringSignalType|MONITORING_COSTS" src/` empty | PASS |
| `pnpm typecheck` exits 0 | DEFERRED — pre-existing on base; see deferred-items.md |
| `pnpm lint` exits 0 | DEFERRED — pre-existing on base (counts reduced); see deferred-items.md |
| `pnpm build` exits 0 | DEFERRED — worktree dep gap; reproduces on base; see deferred-items.md |

## Deviations from Plan

None for in-scope work. The plan executed exactly as written for Tasks 1–4. Task 5's invariant grep gate passed; the typecheck/lint/build sub-gates exposed pre-existing failures unrelated to 16-05's deletion scope, documented in `deferred-items.md` per the executor's SCOPE_BOUNDARY rule (only auto-fix issues directly caused by the current task's changes).

## Threat Flags

None — this plan is filesystem-only and touched no security boundaries, network surface, or data layer.

## Self-Check: PASSED

Verified deletions:

- `test ! -f src/app/api/cron/monitor-reddit/route.ts` → MISSING (expected)
- `test ! -f src/app/api/cron/monitor-linkedin/route.ts` → MISSING (expected)
- `test ! -f src/app/api/cron/monitor-linkedin/route.test.ts` → MISSING (expected)
- `test ! -f "src/app/(app)/signals/page.tsx"` → MISSING (expected)
- `test ! -f src/features/monitoring/actions/settings-actions.ts` → MISSING (expected)
- `test ! -f src/features/monitoring/components/sources-panel.tsx` → MISSING (expected)

Verified preserved:

- `src/features/monitoring/lib/classification-pipeline.ts` → FOUND
- `src/features/monitoring/__fixtures__/` → FOUND

Verified commits exist in `git log`:

- `b75f5a4` → FOUND
- `4875bf4` → FOUND
- `10387bb` → FOUND
- `24420b8` → FOUND
