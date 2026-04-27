---
phase: 19
plan: 19-02-application-integration
subsystem: auth/billing
tags: [auth, signup, ip-capture, rls, plan-config]
requires: [19-01-schema-migration]
provides:
  - PLAN_CONFIG constant + SubscriptionPlan/BillingCycle types
  - normalizeEmail TS mirror of public.normalize_email
  - signInWithEmail IP capture
  - /auth/callback signup_audit IP follow-up
affects: [src/features/auth, src/features/billing, REQUIREMENTS.md, ROADMAP.md]
requirements: [PRIC-05, PRIC-14]
key-files:
  created:
    - src/features/billing/lib/plan-config.ts
    - src/features/billing/lib/plan-config.test.ts
    - src/features/auth/lib/normalize-email.ts
    - src/features/auth/lib/normalize-email.test.ts
  modified:
    - src/features/auth/actions/auth-actions.ts
    - src/app/auth/callback/route.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - headers() awaited (Next 15+ async API) — diverged from plan's sync usage
  - Inline service-role client in /auth/callback (no shared helper extracted) — matches stripe/webhook precedent
  - All audit failures swallowed (D-11 audit-only)
metrics:
  duration: ~10 min
  completed: 2026-04-27
---

# Phase 19 Plan 02: Application Integration Summary

Wires the application layer to the Phase 19 schema: PLAN_CONFIG TS source-of-truth, TS `normalizeEmail` mirroring the SQL function with parity tests, magic-link IP capture, OAuth callback `signup_audit` IP follow-up, and REQUIREMENTS/ROADMAP terminology rewrite.

## New TS files

| File | Purpose |
|------|---------|
| `src/features/billing/lib/plan-config.ts` | `PLAN_CONFIG` literal + `SubscriptionPlan` + `BillingCycle` types |
| `src/features/billing/lib/plan-config.test.ts` | 4 shape-stability tests |
| `src/features/auth/lib/normalize-email.ts` | TS mirror of `public.normalize_email` |
| `src/features/auth/lib/normalize-email.test.ts` | 6 parity cases vs SQL function |

`pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email` → **10 passed**.
`pnpm typecheck` → clean.

## Modified TS files

- `src/features/auth/actions/auth-actions.ts` — added `clientIp()` async helper that reads `await headers()` (Next 15+), splits comma-first, validates `/^[\da-fA-F:.]+$/`, passes via `signInWithOtp({ options: { data: { ip } } })`. `signInWithGoogle` body unchanged.
- `src/app/auth/callback/route.ts` — adds inline service-role client + `signup_audit` UPDATE filtered by `ip IS NULL` (idempotent on re-login per D-11/Pitfall 4). Recomputes `duplicate_flag` against `(email_normalized, ip)`. All audit errors swallowed.

## Doc rewrite scope

- **REQUIREMENTS.md PRIC-04** — wording uses `subscription_plan` / `billing_cycle`; quarterly drop noted; clarifies no `subscription_tier` ENUM exists; `billing_period` column kept (Phase 21 drop).
- **REQUIREMENTS.md PRIC-05** — confirms no `startFreeTrial` action exists in codebase (`grep -r startFreeTrial src/` → 0 matches); trigger writes `signup_audit` row.
- **REQUIREMENTS.md PRIC-14** — full rewrite in new terminology: `signup_audit` table, `normalize_email` SQL fn + TS mirror, denormalized `users.credits_balance_cap` / `credits_included_monthly`, magic-link + OAuth IP capture paths.
- **ROADMAP.md Phase 19** — short summary line + 5 success criteria reworded; added duplicate_flag audit-only semantics + normalize_email reference.

## PRIC-05 grep verification

```
$ grep -rn "startFreeTrial" src/
(no matches; rc=1)
```

## Wave 0 harness post-state

`node scripts/test-trigger-19.mjs --quick` — still 7 OK lines.

## Manual UAT items deferred

Per VALIDATION.md "Manual-Only Verifications", deferred to `/gsd-verify-work`:
1. `pnpm dev --port 3001` magic-link signup → `signup_audit` row has non-null `ip`
2. Google OAuth signup → `signup_audit` row has non-null `ip` (callback follow-up)
3. Repeat magic-link with `kamil.wandtke+test1@gmail.com` then `kamilwandtke+test2@gmail.com` from same machine → second row `duplicate_flag=true`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan called `headers().get(...)` synchronously**
- **Found during:** Task 2 implementation
- **Issue:** Next.js 15+ made `headers()` async (project is on Next 16). Sync call returns a Promise object whose `.get()` is undefined.
- **Fix:** Wrapped `clientIp()` as `async` and used `await headers()`; also widened `signInWithOtp({ options: { data: { ip: await clientIp() } } })`.
- **Files modified:** `src/features/auth/actions/auth-actions.ts`
- **Commit:** ca96c13

## Self-Check: PASSED

- src/features/billing/lib/plan-config.ts FOUND
- src/features/billing/lib/plan-config.test.ts FOUND
- src/features/auth/lib/normalize-email.ts FOUND
- src/features/auth/lib/normalize-email.test.ts FOUND
- Commits eef8fd2, ca96c13, c69f010 FOUND
