---
phase: 10-linkedin-outreach-execution
plan: "02"
subsystem: database-migration
tags: [migration, linkedin, daily-limits, action-counts, sql-function]
dependency_graph:
  requires:
    - 00006_phase3_action_engine.sql (check_and_increment_limit function)
    - 00011_phase6_linkedin.sql (connection_request enum value)
  provides:
    - daily_connection_limit column on social_accounts
    - connection_count column on action_counts
    - updated check_and_increment_limit function handling connection_request
  affects:
    - src/lib/action-worker/limits.ts (checkAndIncrementLimit RPC caller)
tech_stack:
  added: []
  patterns:
    - CREATE OR REPLACE FUNCTION for safe re-runnable SQL function updates
    - ADD COLUMN IF NOT EXISTS for idempotent column additions
key_files:
  created:
    - supabase/migrations/00014_phase10_linkedin_limits_and_credits.sql
  modified: []
decisions:
  - "daily_connection_limit DEFAULT 20 keeps well below LinkedIn's ~100-pending-invites soft cap over a rolling week"
  - "connection_count uses same per-column SELECT FOR UPDATE + UPDATE atomic pattern as existing dm/engage/reply counters"
  - "CREATE OR REPLACE FUNCTION is safe to re-run; existing callers (dm/follow/reply/engage) unaffected"
  - "UPSERT row now includes connection_count column to avoid null in new rows"
metrics:
  duration: "2min"
  completed_date: "2026-04-21"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 02: Migration 00014 LinkedIn Daily Limits Summary

**One-liner:** SQL migration adding `daily_connection_limit` + `connection_count` columns and extending `check_and_increment_limit` to handle `connection_request` action type via atomic per-column SELECT FOR UPDATE pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration 00014 with column additions and updated limit function | 055cabf | supabase/migrations/00014_phase10_linkedin_limits_and_credits.sql |

## What Was Built

Migration file `supabase/migrations/00014_phase10_linkedin_limits_and_credits.sql` containing:

1. `ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS daily_connection_limit integer NOT NULL DEFAULT 20` — cap per account per day, well below LinkedIn's ~100-pending-invites soft cap.

2. `ALTER TABLE public.action_counts ADD COLUMN IF NOT EXISTS connection_count integer NOT NULL DEFAULT 0` — daily counter tracking connection requests sent per account.

3. `CREATE OR REPLACE FUNCTION check_and_increment_limit(...)` — fully replaces the Phase 3 original with a new `ELSIF p_action_type = 'connection_request'` arm that maps to `connection_count` / `daily_connection_limit`. The INSERT upsert for today's row is updated to include `connection_count` so new rows carry the correct default. Existing callers for dm/engage/reply/public_reply are unchanged.

## Verification Results

All acceptance criteria passed:
- File exists: PASS
- `daily_connection_limit` present: PASS
- `connection_count` present: PASS
- `connection_request` arm present: PASS
- ADD COLUMN count = 2: PASS
- `$$` delimiters balanced (2 occurrences): PASS

## Deviations from Plan

None — plan executed exactly as written. Migration content matches the plan specification verbatim.

## Self-Check: PASSED

- `supabase/migrations/00014_phase10_linkedin_limits_and_credits.sql`: FOUND
- commit `055cabf`: FOUND
