---
phase: 12
slug: trial-auto-activation-expiry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 12 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 12-01-01 | 01 | 1 | BILL-01 | migration | `test -f supabase/migrations/00015*.sql && grep -q 'handle_new_user' supabase/migrations/00015*.sql` | ⬜ |
| 12-01-02 | 01 | 1 | BILL-01 | sql-grep | `grep -q 'trial_ends_at' supabase/migrations/00015*.sql && grep -q 'credit_transactions' supabase/migrations/00015*.sql` | ⬜ |
| 12-02-01 | 02 | 1 | ACTN-10 | doc-grep | `grep -q '12h' .planning/REQUIREMENTS.md` in ACTN-10 entry | ⬜ |
| 12-02-02 | 02 | 1 | ACTN-10 | unit | `pnpm vitest run src/lib/action-worker/__tests__/expiry.test.ts` | ⬜ |
| 12-03-01 | 03 | 2 | BILL-01 | grep-assert | `grep -q 'startFreeTrial' src/features/billing/actions/checkout.ts && echo FAIL || echo PASS` | ⬜ |
| 12-03-02 | 03 | 2 | BILL-01 | grep-assert | `grep -q 'canStartTrial' src/app/(app)/billing/page.tsx && echo FAIL || echo PASS` | ⬜ |
| 12-03-03 | 03 | 2 | BILL-01 | typecheck | `pnpm typecheck` | ⬜ |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| New signup auto-provisions trial end-to-end | BILL-01 | Requires real Supabase + auth flow | Sign up with test email; verify users.trial_ends_at set to +3d, users.credits_balance=500, credit_transactions row with description='Free trial credits' |
| Backfill updates existing users | BILL-01 | Requires multi-user DB state | After migration applies: `SELECT count(*) FROM users WHERE trial_ends_at IS NOT NULL AND subscription_active = false` increased |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
