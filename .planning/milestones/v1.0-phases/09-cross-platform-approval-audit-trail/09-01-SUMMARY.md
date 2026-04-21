---
phase: 09-cross-platform-approval-audit-trail
plan: "01"
subsystem: approval-queue
tags: [approval-card, platform-badge, linkedin, reddit, bug-fix]
dependency_graph:
  requires: []
  provides: [platform-aware-approval-card]
  affects: [approval-queue]
tech_stack:
  added: []
  patterns: [inline-platform-switch, inline-style-dynamic-badge-color]
key_files:
  created: []
  modified:
    - src/features/actions/components/approval-card.tsx
decisions:
  - "Inline ternary platformMeta switch (not Record lookup) — simplest and most readable for a two-platform case"
  - "Inline hex backgroundColor via style prop — avoids CSS variable registration for a bug-fix phase (per CONTEXT.md discretion)"
  - "Subreddit span omitted for LinkedIn via existing null guard — zero extra code needed"
metrics:
  duration: 2min
  completed_date: "2026-04-21"
  tasks_completed: 1
  files_modified: 1
---

# Phase 09 Plan 01: APRV-01 Platform-Aware Approval Card Summary

**One-liner:** Platform-aware badge rendering in ApprovalCard — LinkedIn shows #0A66C2 badge and bare author handle; Reddit unchanged; `r/null` eliminated.

## What Was Built

Fixed `approval-card.tsx` which hardcoded a Reddit orange badge and `u/` prefix for all platforms. LinkedIn approval rows were rendering `Reddit` badge color, `r/null` subreddit, and `u/` prefix — all wrong.

Added an inline `platformMeta` switch immediately after `const author` that produces three values based on `signal.platform`:

- `badgeColor` — `#0A66C2` for LinkedIn, `#FF4500` for Reddit
- `badgeLabel` — `"LinkedIn"` or `"Reddit"`
- `authorPrefix` — `""` (bare) for LinkedIn, `"u/"` for Reddit

The Badge component now uses `style={{ backgroundColor: platformMeta.badgeColor }}` with `onMouseOver`/`onMouseOut` handlers for hover state, since the color is dynamic. The existing `{signal.subreddit && (...)}` null guard naturally omits the subreddit span for LinkedIn (subreddit is null). Author prefix is `{platformMeta.authorPrefix}{author}`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add platform-aware badge, source row, and author prefix | cea2360 | src/features/actions/components/approval-card.tsx |

## Verification Results

```
PASS: linkedin found
PASS: 0A66C2 found
PASS: no r/null
PASS: platformMeta found
TypeScript: exits 0 (no errors)
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `src/features/actions/components/approval-card.tsx` exists and contains all changes
- [x] Commit `cea2360` exists: `feat(09-01): platform-aware badge, source row, and author prefix in ApprovalCard`
- [x] All four acceptance greps pass
- [x] TypeScript compiles clean
