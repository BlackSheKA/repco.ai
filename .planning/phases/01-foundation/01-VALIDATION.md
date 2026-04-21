---
phase: 1
slug: foundation
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-17
finalized: 2026-04-21
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Nyquist Pass Summary (2026-04-21)

This pass closed all Phase 1 Nyquist gaps. Vitest was already installed and configured (vitest.config.ts, vitest.setup.ts). Thirteen focused unit tests were written in `src/lib/__tests__/phase-01-foundation.test.ts` covering the four Phase 1 requirements: OBSV-01 (correlation ID generation), OBSV-02 (10-minute staleness boundary), OBSV-03 (logger flush no-op, UUID uniqueness), and OBSV-04 (all threshold branches of `checkActionThresholds` with mocked Supabase). All 13 tests pass. External integrations (Sentry dashboard, Axiom dashboard, Vercel deploy, OAuth flow, DB migrations) remain in the Manual-Only Verifications table with step-by-step instructions.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test -- --run` |
| **Phase 1 test file** | `src/lib/__tests__/phase-01-foundation.test.ts` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | OBSV-01 | unit | `pnpm test src/lib/__tests__/phase-01-foundation.test.ts` | ✅ | ✅ green |
| 01-02-01 | 02 | 1 | OBSV-02 | unit | `pnpm test src/lib/__tests__/phase-01-foundation.test.ts` | ✅ | ✅ green |
| 01-03-01 | 03 | 2 | OBSV-03 | unit | `pnpm test src/lib/__tests__/phase-01-foundation.test.ts` | ✅ | ✅ green |
| 01-03-02 | 03 | 2 | OBSV-04 | unit | `pnpm test src/lib/__tests__/phase-01-foundation.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest` + `@testing-library/react` — installed (confirmed in package.json devDependencies)
- [x] `vitest.config.ts` — configured with path aliases matching tsconfig
- [x] `vitest.setup.ts` — shared test setup (imports `@testing-library/jest-dom/vitest`)
- [x] Test files for each requirement area — created in this Nyquist pass

*Existing infrastructure covered all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Auth flow (magic link signup/login/logout) | OBSV-01 (job_logs) | Requires a running Next.js server + real Supabase credentials + email inbox | 1. Run `pnpm dev --port 3001`. 2. Navigate to `http://localhost:3001`. 3. Confirm redirect to `/login`. 4. Enter a valid email and click "Send magic link". 5. Confirm "Check your email" message appears. 6. Click the magic link from inbox. 7. Confirm app shell loads at `/`. 8. Click "Sign out" and confirm redirect to `/login`. |
| Google OAuth flow | OBSV-01 | OAuth redirect flow requires running server + Google OAuth client configured in Supabase | 1. Run `pnpm dev --port 3001`. 2. Navigate to `/login`. 3. Click "Continue with Google". 4. Confirm Google consent screen appears. 5. Authenticate. 6. Confirm redirect to authenticated `/` with app shell. |
| Vercel deployment accessible | OBSV-01 | External infra verification — Vercel dashboard required | 1. Open Vercel dashboard for `repco` project. 2. Confirm latest deployment status is "Ready". 3. Visit the production URL. 4. Confirm app loads and `/login` redirect works. |
| Sentry error captured | OBSV-03 | Requires Sentry dashboard access | 1. Run `pnpm dev --port 3001`. 2. Trigger an unhandled error (e.g., visit `/api/cron/zombie-recovery` without auth header in browser). 3. Log in to Sentry. 4. Confirm a new error event appears within 60 seconds with a `correlation_id` tag. |
| Axiom log entry present | OBSV-03 | Requires Axiom dashboard access | 1. Ensure `AXIOM_TOKEN` is set in `.env.local`. 2. Run `pnpm dev --port 3001`. 3. Make any authenticated request (e.g., visit `/`). 4. Log in to Axiom. 5. Query the `repco` dataset. 6. Confirm a log entry appears with `correlationId`, `level`, and `message` fields. |
| Zombie recovery cron resets stale actions | OBSV-02 | Requires live DB + cron execution | 1. In Supabase Studio, manually set an `actions` row `status = 'executing'` and `executed_at = now() - interval '11 minutes'`. 2. Call `GET /api/cron/zombie-recovery` with header `Authorization: Bearer <CRON_SECRET>`. 3. Confirm response JSON contains `stuckCount: 1`. 4. Query `actions` table — row should now have `status = 'failed'`. 5. Query `job_logs` — confirm a new `job_type = 'action', status = 'timeout'` row was inserted. |
| OBSV-04 Sentry alert rules configured | OBSV-04 | One-time deployment step — Sentry API required | 1. Set env vars: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`. 2. Run `npx tsx scripts/sentry-alert-rules.ts`. 3. Log in to Sentry → Alerts → Alert Rules. 4. Confirm two rules exist with fingerprints `obsv04-low-success-rate` and `obsv04-high-timeout-rate`, each with a mail action. |
| DB schema + RLS policies live | OBSV-01 | Requires Supabase project access | 1. In Supabase Studio (project `cmkifdwjunojgigrqwnr`), go to Table Editor. 2. Confirm all 11 tables exist: `users`, `credit_transactions`, `monitoring_signals`, `product_profiles`, `social_accounts`, `intent_signals`, `prospects`, `actions`, `action_counts`, `live_stats`, `job_logs`. 3. In Database → RLS, confirm Row Level Security is enabled on all 11 tables. 4. Confirm migrations 00001–00004 appear in the migrations list. |

*External integrations, browser-visual tests, and one-time deployment steps cannot be automated.*

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: all 4 tasks have automated verification
- [x] Wave 0 dependencies resolved (vitest already installed)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (740ms measured)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** finalized 2026-04-21 — 13/13 unit tests passing, 8 manual verifications documented
