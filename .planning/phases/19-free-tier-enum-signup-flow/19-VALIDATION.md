---
phase: 19
slug: free-tier-enum-signup-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node script (`scripts/test-trigger-19.mjs`) + `pnpm typecheck` + `pnpm lint` |
| **Config file** | none — Wave 0 creates the test script |
| **Quick run command** | `node scripts/test-trigger-19.mjs --quick` |
| **Full suite command** | `pnpm typecheck && pnpm lint && node scripts/test-trigger-19.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck`
- **After every plan wave:** Run `node scripts/test-trigger-19.mjs --quick`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-00-01 | 00 | 0 | — | — | Trigger test harness available | unit | `test -f scripts/test-trigger-19.mjs` | ❌ W0 | ⬜ pending |
| 19-01-01 | 01 | 1 | PRIC-04 | — | New ENUMs `subscription_plan`, `billing_cycle` exist with correct values | migration | `node scripts/test-trigger-19.mjs --enums` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | PRIC-04 | — | `users.subscription_plan` defaults to `free`; `users.billing_cycle` nullable with CHECK constraint | migration | `node scripts/test-trigger-19.mjs --columns` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 1 | PRIC-14 | — | `users.credits_balance_cap` and `credits_included_monthly` populated correctly per plan | migration | `node scripts/test-trigger-19.mjs --plan-config` | ❌ W0 | ⬜ pending |
| 19-01-04 | 01 | 1 | PRIC-14 | — | `signup_audit` table exists with RLS service-role only | migration | `node scripts/test-trigger-19.mjs --audit-table` | ❌ W0 | ⬜ pending |
| 19-01-05 | 01 | 1 | PRIC-05 | — | `handle_new_user` trigger atomically writes user + 250 cr + credit_transactions audit row | trigger-integration | `node scripts/test-trigger-19.mjs --signup` | ❌ W0 | ⬜ pending |
| 19-01-06 | 01 | 1 | PRIC-14 | — | `normalize_email()` Postgres fn matches TS impl | unit | `node scripts/test-trigger-19.mjs --normalize` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | PRIC-14 | — | Server signup action passes `x-forwarded-for` IP via signUp metadata | typecheck + grep | `pnpm typecheck && grep -q "x-forwarded-for" src/features/auth/actions/*.ts` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 2 | PRIC-14 | — | OAuth callback writes `signup_audit` follow-up with IP idempotently | typecheck + grep | `pnpm typecheck && grep -q "signup_audit" src/app/auth/callback/route.ts` | ✅ | ⬜ pending |
| 19-02-03 | 02 | 2 | PRIC-14 | — | Duplicate `(email_normalized, ip)` flagged with `duplicate_flag=true` (no hard reject) | trigger-integration | `node scripts/test-trigger-19.mjs --duplicate` | ❌ W0 | ⬜ pending |
| 19-02-04 | 02 | 2 | PRIC-14 | — | `PLAN_CONFIG` const exists in `src/features/billing/lib/plan-config.ts` | grep | `grep -q "PLAN_CONFIG" src/features/billing/lib/plan-config.ts` | ❌ | ⬜ pending |
| 19-02-05 | 02 | 2 | PRIC-05 | — | `startFreeTrial` server action does NOT exist in codebase | grep | `! grep -r "startFreeTrial" src/` | ✅ | ⬜ pending |
| 19-02-06 | 02 | 2 | PRIC-04 | — | REQUIREMENTS.md PRIC-04/PRIC-14 reworded; ROADMAP Phase 19 success criteria reworded | grep | `grep -q "subscription_plan" .planning/REQUIREMENTS.md && grep -q "subscription_plan" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/test-trigger-19.mjs` — Node service-role trigger integration harness with subcommands: `--enums`, `--columns`, `--plan-config`, `--audit-table`, `--signup`, `--normalize`, `--duplicate`, `--quick` (runs all)
- [ ] Harness uses dev branch (`effppfiphrykllkpkdbv`) via `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`
- [ ] Cleans up test users after each scenario (delete from `auth.users` cascades)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google OAuth signup writes `signup_audit` follow-up with non-null IP | PRIC-14 | OAuth flow requires real browser redirect to Google | UAT: complete Google sign-in via `pnpm dev --port 3001`, then verify `signup_audit` has row with non-null `ip` for the new `auth.users.id` |
| Gmail-aware normalization parity (`kamil.wandtke+x@gmail.com` ≡ `kamilwandtke@gmail.com`) | PRIC-14 | DB function vs TS function output equivalence — automated parity test in Wave 0 covers algorithmic parity, manual UAT confirms real-world Gmail aliases collide | UAT: sign up with `kamil.wandtke+test1@gmail.com`, then `kamilwandtke+test2@gmail.com` from same IP; verify second row has `duplicate_flag=true` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
