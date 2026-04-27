---
phase: 16-mechanism-cost-engine-schema
plan: 01
subsystem: billing-cost-engine
tags: [migration, schema, seed, mechanism_costs, monitoring_signals, rls]
requires: []
provides:
  - mechanism_costs table (source of truth for credit costs)
  - mechanism_kind_enum ('signal'|'outbound')
  - monitoring_signals.mechanism_id FK
  - monitoring_signals.frequency interval
  - monitoring_signals.config jsonb
affects:
  - monitoring_signals (legacy signal_type/credits_per_day dropped, all rows wiped)
  - signal_source_type ENUM (dropped)
  - monitoring_signals_user_type_value_unique index (replaced)
tech_stack:
  added:
    - Postgres ENUM mechanism_kind_enum
  patterns:
    - RLS authenticated-SELECT-only (no INSERT/UPDATE/DELETE policies = client writes denied)
    - Atomic single-file migration (Supabase Management API wraps in implicit transaction)
key_files:
  created:
    - supabase/migrations/00024_mechanism_costs.sql
  modified:
    - .planning/ROADMAP.md
decisions:
  - Migration number 00024 (followed 00023_browser_profiles.sql)
  - Both ROADMAP occurrences (line 45 phase bullet + line 73 criterion #1) updated for consistency
metrics:
  duration_seconds: 181
  completed_at: 2026-04-27
  tasks_completed: 3
---

# Phase 16 Plan 01: Mechanism Cost Engine Schema Summary

DB-driven cost engine foundation: created `mechanism_costs` source-of-truth table seeded with 60 rows (32 signal + 28 outbound) and rewrote `monitoring_signals` around `mechanism_id`/`frequency`/`config jsonb`, dropping legacy `signal_type` column and `signal_source_type` ENUM.

## Tasks Completed

| Task | Name | Commit | Notes |
|------|------|--------|-------|
| 1 | Write migration 00024_mechanism_costs.sql | `74dff63` | 13 ordered statements; 60 verbatim seed rows from PRICING.md §5/§6 |
| 2 | Update ROADMAP.md Phase 16 criterion #1 | `223127c` | Updated both line 45 and line 73 (see Deviations) |
| 3 | Apply migration to dev branch effppfiphrykllkpkdbv | (no source change) | Verified via 5 Management API queries |

## Verification Results (dev branch effppfiphrykllkpkdbv)

| Query | Expected | Actual |
|-------|----------|--------|
| `SELECT COUNT(*) FROM mechanism_costs` | 60 | 60 |
| `mechanism_kind` group counts | signal=32, outbound=28 | signal=32, outbound=28 |
| Per-prefix counts | E=2, L=11, M=3, O=2, OL=11, OR=9, OX=8, R=9, T=5 | exact match |
| `monitoring_signals` columns | frequency/mechanism_id/config NOT NULL; no signal_type/credits_per_day | exact match |
| `pg_type` `signal_source_type` | 0 rows | 0 rows |
| `pg_policies` for `mechanism_costs` | 1 row (SELECT, {authenticated}) | exact match |
| `SELECT COUNT(*) FROM monitoring_signals` | 0 (post-wipe) | 0 |

## Deviations from Plan

### 1. [Rule 1 - Bug] ROADMAP.md had two stale "27 signal + 28 outbound" occurrences, not one

- **Found during:** Task 2 (grep for "27 signal + 28 outbound")
- **Issue:** Plan task 2 said "literal 2-character substitution" on criterion #1 only, but `.planning/ROADMAP.md` had the wrong count on BOTH line 45 (Phase 16 bullet in milestone section) and line 73 (criterion #1). Acceptance criterion `! grep -q "27 signal + 28 outbound"` (count == 0) is incompatible with leaving line 45 stale.
- **Fix:** Updated both occurrences to "32 signal + 28 outbound". This brings the Phase 16 milestone bullet in line with the actual seed data and the criterion. Acceptance criterion `grep -c "32 signal + 28 outbound" == 1` is now 2 instead of 1 — but the spirit of the criterion (no remaining "27 signal" references) is satisfied and consistent.
- **Files modified:** `.planning/ROADMAP.md` (lines 45 + 73)
- **Commit:** `223127c`

No other deviations. Migration applied cleanly on first attempt; all 60 seed rows transcribed verbatim from RESEARCH.md §2.

## Auth Gates

None. `SUPABASE_ACCESS_TOKEN` was already set in user environment.

## Self-Check: PASSED

- File `supabase/migrations/00024_mechanism_costs.sql`: FOUND
- Commit `74dff63`: FOUND
- Commit `223127c`: FOUND
- ROADMAP.md updated (verified `grep -c "27 signal + 28 outbound" == 0`)
- Dev branch DB verified via Management API (mechanism_costs.count = 60, signal=32, outbound=28)
