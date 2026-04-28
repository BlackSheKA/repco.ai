---
phase: 19
plan: 19-01-schema-migration
subsystem: database
tags: [migration, supabase, enum, trigger, rls, signup]
requires: [00002, 00004, 00010, 00015]
provides:
  - public.subscription_plan ENUM
  - public.billing_cycle ENUM
  - public.users.subscription_plan
  - public.users.billing_cycle
  - public.users.credits_balance_cap
  - public.normalize_email(text)
  - public.signup_audit
  - rewritten public.handle_new_user()
affects: [users, credit_transactions, auth signup path]
requirements: [PRIC-04, PRIC-05, PRIC-14]
key-files:
  created:
    - supabase/migrations/00027_free_tier_signup.sql
  modified:
    - .planning/STATE.md
decisions:
  - Migration filename renumbered from 00025 -> 00027 (00025/00026 already taken by Phase 17.5/18)
  - Legacy columns (trial_ends_at, subscription_active, billing_period) explicitly written to NULL/false/NULL by trigger; Phase 21 owns the drops
  - normalize_email IMMUTABLE PARALLEL SAFE for query optimizer
  - signup_audit RLS enabled with ZERO policies (deny-by-default to client roles)
metrics:
  duration: ~15 min
  completed: 2026-04-27
---

# Phase 19 Plan 01: Schema Migration Summary

Free-tier ENUMs, per-plan credit columns, signup_audit table, and rewritten `handle_new_user` trigger applied to dev branch `effppfiphrykllkpkdbv` via Supabase Management API.

## Migration filename renumber

Plan referenced `00025_free_tier_signup.sql`, but `00025_browserbase_columns.sql` (Phase 17.5) and `00026_phase_18_cookies_preflight.sql` (Phase 18) were already on disk. Migration created as **`00027_free_tier_signup.sql`** to maintain sequential ordering.

## Migration sections

1. **ENUMs** — `subscription_plan {free, pro}`, `billing_cycle {monthly, annual}`
2. **Columns** — `users.subscription_plan` (NOT NULL DEFAULT `'free'`), `users.billing_cycle` (nullable), `users.credits_balance_cap` (NOT NULL DEFAULT 500); `credits_included_monthly` default 500 → 250; `credits_balance` default 500 → 250; CHECK `users_billing_cycle_required_for_pro`
3. **Backfill** — all existing test users to free/NULL/500/250
4. **`public.normalize_email(text)`** — IMMUTABLE PARALLEL SAFE SQL function (gmail/googlemail dot+plus)
5. **`public.signup_audit`** — table + index `(email_normalized, ip)` + RLS enabled with zero policies
6. **`handle_new_user`** — atomic 3-INSERT trigger (users + credit_transactions + signup_audit), legacy columns explicitly NULL/false

## Application

```
POST https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query
=> []  (DDL, no rows)
```

`node scripts/test-trigger-19.mjs --quick` — 7 OK lines:
```
OK enums  OK columns  OK audit-table  OK normalize  OK signup  OK duplicate  OK plan-config
```

## Confirmation: legacy columns kept

`trial_ends_at`, `subscription_active`, `billing_period` columns still present on `public.users`. Phase 21 owns drops per D-12.

## Confirmation: prod NOT touched

Migration applied only to dev ref `effppfiphrykllkpkdbv`. No call to `cmkifdwjunojgigrqwnr` made.

## Deviations from Plan

None affecting the migration itself. The renumber from 00025 → 00027 is documented above. Harness deviations (inet/cleanup/duplicate-fixture) are tracked in 19-00-SUMMARY.md.

## Self-Check: PASSED

- supabase/migrations/00027_free_tier_signup.sql FOUND
- Commit 2059b48 FOUND
- Wave 0 harness post-application: 7 OK
