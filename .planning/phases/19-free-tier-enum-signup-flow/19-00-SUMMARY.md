---
phase: 19
plan: 19-00-wave-0-test-harness
subsystem: testing/devops
tags: [supabase, harness, dev-branch, smoke-tests]
requires: [.env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN]
provides: [scripts/test-trigger-19.mjs]
affects: [Phase 19 verification flow]
key-files:
  created:
    - scripts/test-trigger-19.mjs
decisions:
  - 50ms settle delay before process.exit() to dodge Node 24 + Windows libuv UV_HANDLE_CLOSING assertion
  - getSupabase() lazy init so read-only commands don't pay supabase-js bring-up cost
  - cleanupTestUser also deletes public.users (no FK CASCADE from auth.users -> public.users)
metrics:
  duration: ~25 min
  completed: 2026-04-27
---

# Phase 19 Plan 00: Wave 0 Test Harness Summary

`scripts/test-trigger-19.mjs` — single-file Node ESM harness that smoke-tests every Phase 19 schema artifact against the dev Supabase branch.

## Subcommands

| Flag | Purpose | Pre-migration | Post-migration |
|------|---------|----------------|----------------|
| `--enums` | subscription_plan + billing_cycle labels | SKIP | OK |
| `--columns` | new users columns + CHECK constraint | SKIP | OK |
| `--audit-table` | signup_audit shape + RLS + zero policies | SKIP | OK |
| `--normalize` | normalize_email 6 canonical inputs | SKIP | OK |
| `--signup` | end-to-end auth.admin.createUser → trigger → users + credit_transactions + signup_audit | SKIP | OK |
| `--duplicate` | gmail dot/plus normalize collision flips duplicate_flag | SKIP | OK |
| `--plan-config` | per-user cap/included defaults | SKIP | OK |
| `--quick` | runs all 7 sequentially, stops on first failure | exit 0, all SKIP | exit 0, all OK |

## Safety gate

Hard-asserts `NEXT_PUBLIC_SUPABASE_URL` includes `effppfiphrykllkpkdbv` and rejects `cmkifdwjunojgigrqwnr`. Exit code 2 on mismatch (T-19-00-01).

## Cleanup invariant

Test users use `phase19-` / `phase19dup` prefixes. Each subcommand deletes its created users in `finally`. `--quick` sweeps any leftover phase19 rows post-run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Node 24 + Windows libuv UV_HANDLE_CLOSING assertion on exit**
- **Found during:** Task 1 verification
- **Issue:** Single-subcommand calls (e.g. `--enums`) crashed on shutdown with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exit code 127, even though stdout was correct
- **Fix:** Added `await new Promise(r => setTimeout(r, 50))` before `process.exit(code)` to give undici keepalive sockets a chance to settle
- **Commit:** f2e3f2c

**2. [Rule 1 - Bug] inet column comparison failure**
- **Found during:** Plan 19-01 Task 2 first --quick run (FAIL signup: audit ip = 203.0.113.10/32)
- **Issue:** PostgreSQL `inet` columns return canonical `host/mask` form (`203.0.113.10/32`); harness compared to bare IP literal
- **Fix:** Switched SELECT to `host(ip)` which returns just the address text
- **Commit:** ad7c8d1

**3. [Rule 1 - Bug] auth.admin.deleteUser does not cascade to public.users**
- **Found during:** Plan 19-01 verification (stale phase19 rows left in public.users after test runs)
- **Issue:** No FK CASCADE from `auth.users` to `public.users` exists in this schema. Deleting auth user leaves the public mirror row, so duplicate detection across runs gets polluted
- **Fix:** `cleanupTestUser` now also runs `DELETE FROM public.users WHERE id=…`
- **Commit:** ad7c8d1

**4. [Rule 1 - Bug] cmdDuplicate fixture didn't normalize-collide**
- **Found during:** Plan 19-01 second --quick run (FAIL duplicate: B duplicate_flag = false)
- **Issue:** Original emailA/emailB used hyphens that survived normalization, so the two emails normalized to different strings
- **Fix:** Reworked fixtures so A relies on dot-strip and B on plus-strip, both yielding `phase19dup{suffix}atest@gmail.com`
- **Commit:** ad7c8d1

## Self-Check: PASSED

- scripts/test-trigger-19.mjs FOUND
- Commit f2e3f2c FOUND
- Commit ad7c8d1 FOUND
