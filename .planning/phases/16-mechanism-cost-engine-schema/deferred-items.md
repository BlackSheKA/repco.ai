---
phase: 16-mechanism-cost-engine-schema
plan: 05
created: 2026-04-27
---

# Deferred Items (out of scope for 16-05)

These pre-existed on base `30ad4cc` before any 16-05 deletion and were verified to NOT trace to deleted scope (`monitor-reddit`, `monitor-linkedin`, `signals/page.tsx`, `settings-actions.ts`, `sources-panel.tsx`, `signal_type`, `MonitoringSignalType`, `MONITORING_COSTS`).

## Pre-existing typecheck errors (7)

`tsc --noEmit` fails on missing module declarations for SVG/PNG imports under `@/app/images/*`. The asset files exist on disk; the project lacks `*.svg` / `*.png` ambient module declarations. Files with errors:

- `src/app/(auth)/login/page.tsx:4-5`
- `src/app/(public)/layout.tsx:4-5`
- `src/components/shell/app-sidebar.tsx:16-17`
- `src/features/dashboard/components/agent-card.tsx:5`

Verified present on base commit 30ad4cc (before any 16-05 change).

## Pre-existing lint errors (9 errors / 11 warnings, 20 total)

Compared with base which had 33 errors / 46 warnings (79 total) — our deletions REDUCED total lint counts by removing offending files. None of the remaining lint problems reference deleted scope (verified via grep over lint output).

## Build failure: missing radix peer dep

`pnpm build` fails with `Module not found: Can't resolve '@radix-ui/react-dismissable-layer'` (from `@radix-ui/react-tooltip` transitive). This is a worktree node_modules hydration gap, not introduced by any 16-05 deletion. Reproduces on a fresh worktree of base 30ad4cc with the same `pnpm install` flow.

## Final invariant gate (PASSED)

- `grep -rE "signal_type|MonitoringSignalType|MONITORING_COSTS" src/` → zero matches
- `vercel.json` → 10 cron entries, valid JSON, no `monitor-*` paths
- All 5 deletion tasks landed atomically with `chore(16-05): …` commits
