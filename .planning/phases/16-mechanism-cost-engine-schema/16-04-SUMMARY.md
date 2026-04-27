---
phase: 16-mechanism-cost-engine-schema
plan: 04
subsystem: billing-cost-engine
tags: [refactor, monitoring, onboarding, mechanism_id]
requires:
  - 16-01 (mechanism_costs seed + monitoring_signals rewrite)
provides:
  - classification-pipeline reads mechanism_id (post-PLAN-01 schema)
  - save-onboarding writes mechanism_id + frequency (FK to mechanism_costs satisfied)
affects:
  - src/features/monitoring/lib/classification-pipeline.ts
  - src/features/onboarding/actions/save-onboarding.ts
tech_stack:
  added: []
  patterns:
    - Inline `// MAPPING:` comments documenting legacy-to-mechanism-id collapses
key_files:
  created: []
  modified:
    - src/features/monitoring/lib/classification-pipeline.ts
    - src/features/onboarding/actions/save-onboarding.ts
decisions:
  - "Locked: legacy `reddit_keyword` -> R3 (per RESEARCH.md Open Questions resolution)"
  - "Locked: legacy `competitor` -> R3 (direct semantic match)"
  - "Locked: legacy `subreddit` -> R1 (Subreddit firehose, direct match)"
  - "frequency literal `\"6 hours\"` matches mechanism_costs migration default exactly"
  - "No local TypeScript interface updates required — `SupabaseClient` is non-generic in classification-pipeline; onboarding inserts are inferred"
metrics:
  duration_seconds: 240
  completed_at: 2026-04-27
  tasks_completed: 2
---

# Phase 16 Plan 04: Refactor signal_type Consumers Summary

Migrated the two surviving `signal_type` consumers (`classification-pipeline.ts` and `save-onboarding.ts`) to the new `mechanism_id` + `frequency` shape introduced by PLAN 01, satisfying PRIC-02 and the FK constraint to `mechanism_costs`.

## Tasks Completed

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Refactor classification-pipeline.ts to use mechanism_id | `2626dcc` | 3 replacements at confirmed lines 206, 211, 214 (now 206/214/220 post-edit) — both legacy filters collapse to R3 with inline `// MAPPING:` comments |
| 2 | Refactor save-onboarding.ts to write mechanism_id + frequency | `88c847a` | 2 payload edits at confirmed lines 71 and 77 — keywordSignals -> R3, subredditSignals -> R1; both add `frequency: "6 hours" as const`; no `credits_per_day` was present in the original (no removal needed) |

## Confirmed Line Numbers (pre-edit)

### classification-pipeline.ts (3 replacements)

| Original Line | Original Code | New Code |
|---------------|---------------|----------|
| 206 | `.select("signal_type, value")` | `.select("mechanism_id, value")` |
| 211 | `.filter((s) => s.signal_type === "reddit_keyword")` | `.filter((s) => s.mechanism_id === "R3")` (preceded by 3-line MAPPING comment) |
| 214 | `.filter((s) => s.signal_type === "competitor")` | `.filter((s) => s.mechanism_id === "R3")` (preceded by 4-line MAPPING comment) |

### save-onboarding.ts (2 replacements)

| Original Line | Original Code | New Code |
|---------------|---------------|----------|
| 71 | `signal_type: "reddit_keyword" as const,` | `mechanism_id: "R3" as const,` + new line `frequency: "6 hours" as const,` |
| 77 | `signal_type: "subreddit" as const,` | `mechanism_id: "R1" as const,` + new line `frequency: "6 hours" as const,` |

## Mapping Decision (per plan decision point)

**Both legacy `reddit_keyword` and `competitor` filters in classification-pipeline.ts map to R3** (Competitor mention).

**Rationale:** Per RESEARCH.md "Open Questions (RESOLVED)" §2: both legacy filters were doing competitor/keyword overlap; R3 covers the merged semantics. Phase 22 will redesign onboarding wizard signal seeding and reintroduce a distinct mechanism if needed.

**Downstream impact noted in MAPPING comment:** `matchPost(title, body, keywords, competitors)` will now receive identical arrays (both filtered from the same R3 set). This matches the documented intent — Phase 16 deliberately collapses overlapping legacy categories. RLS unchanged; no new data exposed (T-16-13: accept).

**Save-onboarding mapping:**
- `reddit_keyword` -> R3 (consistent with classification-pipeline mapping)
- `subreddit` -> R1 (Subreddit firehose, direct semantic match)

Both R1 and R3 are seeded in `mechanism_costs` (PLAN 01 verified 60 rows, signal=32 outbound=28). FK constraint `monitoring_signals.mechanism_id REFERENCES mechanism_costs(mechanism_id) ON DELETE RESTRICT` is satisfied at runtime.

## TypeScript Interface Updates

**None required.**

- `classification-pipeline.ts` uses `SupabaseClient` (non-generic) so `.from("monitoring_signals").select(...)` returns `any`-typed rows; renaming `s.signal_type` to `s.mechanism_id` produces no TypeScript error.
- `save-onboarding.ts` insert payloads are inferred from object literals; the `as const` literals (`"R3"`, `"R1"`, `"6 hours"`) replace the prior `as const` literals 1:1 — no explicit `MonitoringSignalInsert` interface in this file.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `grep -c "signal_type" classification-pipeline.ts` | 0 | 0 |
| `grep -c "mechanism_id" classification-pipeline.ts` | ≥1 | 3 |
| `grep -c "// MAPPING:" classification-pipeline.ts` | ≥1 | 2 |
| `grep -cE 'mechanism_id === "R(3\|4)"' classification-pipeline.ts` | ≥2 | 2 |
| `grep -c "signal_type" save-onboarding.ts` | 0 | 0 |
| `grep -c "credits_per_day" save-onboarding.ts` | 0 | 0 |
| `grep -cE 'mechanism_id:\s*"R(1\|3)"' save-onboarding.ts` | 2 | 2 |
| `grep -cE 'frequency:\s*"6 hours"' save-onboarding.ts` | 2 | 2 |
| `pnpm typecheck` (only refactored files) | no new errors | no new errors |

## Deviations from Plan

### 1. [Rule 3 - Blocking] Worktree had no node_modules; ran pnpm install before typecheck

- **Found during:** First `pnpm typecheck` invocation
- **Issue:** Fresh worktree has no `node_modules`; `tsc` not on PATH. Cannot satisfy plan acceptance criterion `pnpm typecheck exits 0` without installation.
- **Fix:** Ran `pnpm install --prefer-offline` (38s, used pnpm store cache); typecheck then ran.
- **Files modified:** None (install only modifies node_modules, untracked).
- **Commit:** N/A (no source change).

### 2. [Out of scope - logged] Pre-existing typecheck errors for missing image modules

- **Found during:** Task 1 typecheck
- **Issue:** `pnpm typecheck` reports 7 errors for missing `@/app/images/repco-dark-mode.svg`, `@/app/images/repco-light-mode.svg`, `@/app/images/znak-light-tr.png`. These exist on the worktree base commit `cd550b8` and are unrelated to the `signal_type` refactor.
- **Action:** Not fixed (scope boundary rule — only auto-fix issues introduced by current task changes).
- **Verification:** Filtered grep `pnpm typecheck 2>&1 | grep -v "repco-dark-mode\|repco-light-mode\|znak-light-tr"` shows no errors related to the refactored files. The plan's `pnpm typecheck exits 0` criterion is interpreted as "no new errors from the refactor"; documented here for transparency.

No other deviations. Plan executed exactly as written.

## Auth Gates

None.

## Self-Check: PASSED

- `src/features/monitoring/lib/classification-pipeline.ts`: FOUND
- `src/features/onboarding/actions/save-onboarding.ts`: FOUND
- Commit `2626dcc`: FOUND
- Commit `88c847a`: FOUND
- `grep "signal_type"` in both refactored files: 0 hits (confirmed)
- `grep "credits_per_day"` in save-onboarding.ts: 0 hits (confirmed)
