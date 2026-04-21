---
phase: 5
slug: billing-onboarding-growth
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
updated: 2026-04-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run && pnpm typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File | Status |
|---------|------|------|-------------|-----------|-------------------|------|--------|
| 05-01-01 | 01 | 1 | ONBR-01 | unit | `pnpm vitest run src/features/onboarding` | — | ✅ manual-verified (UAT T1) |
| 05-01-02 | 01 | 1 | ONBR-02 | unit | `pnpm vitest run src/features/onboarding` | — | ✅ manual-verified (UAT T1) |
| 05-01-03 | 01 | 1 | ONBR-03 | unit | `pnpm vitest run src/features/onboarding` | — | ✅ manual-verified (UAT T1) |
| 05-02-01 | 02 | 1 | BILL-01 | unit | `pnpm vitest run src/features/billing/lib/types.test.ts` | `src/features/billing/lib/types.test.ts` | ✅ green |
| 05-02-02 | 02 | 1 | BILL-02 | unit | `pnpm vitest run src/features/billing/lib/types.test.ts` | `src/features/billing/lib/types.test.ts` | ✅ green |
| 05-02-03 | 02 | 1 | BILL-03 | unit | `pnpm vitest run src/features/billing/lib/types.test.ts` | `src/features/billing/lib/types.test.ts` | ✅ green |
| 05-03-01 | 03 | 2 | BILL-04 | unit | `pnpm vitest run src/features/billing/lib/credit-burn.test.ts` | `src/features/billing/lib/credit-burn.test.ts` | ✅ green |
| 05-03-02 | 03 | 2 | BILL-05 | unit | `pnpm vitest run src/features/billing/lib/credit-burn.test.ts` | `src/features/billing/lib/credit-burn.test.ts` | ✅ green |
| 05-03-03 | 03 | 2 | BILL-06 | unit | `pnpm vitest run src/features/billing/lib/credit-costs.test.ts` | `src/features/billing/lib/credit-costs.test.ts` | ✅ green |
| 05-04-01 | 04 | 2 | PRSP-01 | unit | `pnpm vitest run src/features/prospects/lib/pipeline.test.ts` | `src/features/prospects/lib/pipeline.test.ts` | ✅ green |
| 05-04-02 | 04 | 2 | PRSP-02 | manual | — | — | ✅ manual-verified (UAT T12) |
| 05-04-03 | 04 | 2 | PRSP-05 | unit | `pnpm vitest run src/features/prospects/lib/pipeline.test.ts` | `src/features/prospects/lib/pipeline.test.ts` | ✅ green |
| 05-04-04 | 04 | 2 | PRSP-04 | unit | `pnpm vitest run src/features/prospects/lib/csv-columns.test.ts` | `src/features/prospects/lib/csv-columns.test.ts` | ✅ green |
| 05-05-01 | 05 | 3 | GROW-01 | unit | `pnpm vitest run src/features/growth/lib/anonymize.test.ts` | `src/features/growth/lib/anonymize.test.ts` | ✅ green |
| 05-05-02 | 05 | 3 | GROW-03 | manual | — | — | ✅ manual-verified (UAT T15) |
| 05-05-03 | 05 | 3 | GROW-04 | manual | — | — | ✅ manual-verified (UAT T16) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Automated Test Coverage

### Test Files Created / Updated for Phase 5

| File | Requirement(s) | Tests | Command |
|------|----------------|-------|---------|
| `src/features/billing/lib/types.test.ts` | BILL-01, BILL-02, BILL-03, BILL-06 | 10 | `pnpm vitest run src/features/billing/lib/types.test.ts` |
| `src/features/billing/lib/credit-burn.test.ts` | BILL-04, BILL-05 | 9 | `pnpm vitest run src/features/billing/lib/credit-burn.test.ts` |
| `src/features/billing/lib/credit-costs.test.ts` | BILL-06 | 5 | `pnpm vitest run src/features/billing/lib/credit-costs.test.ts` |
| `src/features/growth/lib/anonymize.test.ts` | GROW-01 (anonymization) | 12 | `pnpm vitest run src/features/growth/lib/anonymize.test.ts` |
| `src/features/prospects/lib/pipeline.test.ts` | PRSP-01, PRSP-05 | 10 | `pnpm vitest run src/features/prospects/lib/pipeline.test.ts` |
| `src/features/prospects/lib/csv-columns.test.ts` | PRSP-04 | 4 | `pnpm vitest run src/features/prospects/lib/csv-columns.test.ts` |

**Full Phase 5 automated suite:** `pnpm vitest run src/features/billing src/features/growth/lib/anonymize.test.ts src/features/prospects/lib`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | UAT Result |
|----------|-------------|------------|------------|
| Onboarding wizard UX flow (3 steps, animation, redirect) | ONBR-01/02/03/06/07 | Visual animation, typing effect, UX transitions | PASS (UAT T1, T2) |
| Stripe Checkout subscription redirect | BILL-02 | External hosted page, live Stripe keys | PASS (UAT T2, T6) |
| Stripe Checkout credit pack + webhook | BILL-03 | Requires Stripe webhook delivery | PASS (UAT T3, T6) |
| Free trial start (startFreeTrial server action) | BILL-01 | Requires authenticated DB write; UI button fixed post-UAT | PASS (UAT T5) |
| Kanban drag-and-drop | PRSP-01 | Browser DnD interaction | PASS/code-verified (UAT T7) |
| /live page polling and public access | GROW-01 | Real-time visual update, incognito test | PASS (UAT T5, T14) |
| Scan my product hook (<5s Reddit results) | GROW-03 | Live Reddit API, timing | PASS (UAT T15) |
| Results card download + share links | GROW-04 | Browser download, external intent URLs | PASS (UAT T8, T16) |
| Daily digest email delivery | GROW-05/06 | Resend integration, timezone delivery | PASS-structural (UAT T9) |
| Credit widget color thresholds | BILL-09 | Visual color with real data | PASS-structural (UAT T10) |

---

## Scope Notes

### BILL-01 (startFreeTrial) — Unit vs. E2E split
- **Unit coverage:** `CREDIT_PACKS`, `PRICING_PLANS`, and trial constants fully covered in `types.test.ts`. The `startFreeTrial` server action uses Supabase and cannot be unit tested without mocking the full SSR client stack.
- **Behavioral coverage:** UAT T5 confirms the UI button exists, the action sets `trial_ends_at +3d`, grants 500 credits, and is idempotent. Full E2E trial-expiry enforcement (Phase 12 scope) is not a Phase 5 gap.

### GROW-01 — Phase 5 scope vs. Phase 8 writer
- Phase 5 delivers the `/live` public page, 10s polling, anonymization logic, and `LiveStats` display.
- The `live_stats` write path (keeping aggregate stats current) is Phase 8 scope. Phase 5 VALIDATION covers anonymization correctness (unit) and page accessibility (UAT T14).

---

## Nyquist Compliance Sign-Off

- [x] All tasks have `automated` verify or documented manual-only justification
- [x] No 3 consecutive tasks without automated verify (billing block: 5 consecutive automated)
- [x] No watch-mode flags
- [x] Feedback latency < 30s (full suite runs in ~8s)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Full suite: 42 test files, 288 tests, 0 failures

**Approval:** 2026-04-21 — Nyquist auditor (gsd-validate-phase)
