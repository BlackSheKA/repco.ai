---
phase: 7
slug: reply-detection-fix
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-21
finalized: 2026-04-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 (happy-dom) |
| **Config file** | `vitest.config.ts` (already present) |
| **Quick run command** | `pnpm test -- --run src/lib/handles/__tests__/normalize.test.ts src/features/sequences/lib/__tests__/reply-matching.test.ts` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | RPLY-02 | unit | `pnpm test -- --run src/lib/handles/__tests__/normalize.test.ts` | ✅ | ✅ green |
| 07-01-02 | 01 | 1 | RPLY-02 | unit | `pnpm test -- --run src/features/sequences/lib/__tests__/reply-matching.test.ts` | ✅ | ✅ green |
| 07-01-03 | 01 | 1 | RPLY-02, RPLY-03, RPLY-04, FLLW-04 | integration | `pnpm test -- --run src/app/api/cron/check-replies/__tests__/route.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/handles/normalize.ts` — `normalizeHandle(raw, platform)` utility
- [x] `src/lib/handles/__tests__/normalize.test.ts` — unit tests covering Reddit (`u/` strip + lowercase) and LinkedIn (lowercase only)
- [x] `src/app/api/cron/check-replies/__tests__/route.test.ts` — integration test exercising match → `pipeline_status=replied` → follow-up cancel → Resend call → Realtime emit

---

## Automated Test Results (Verified 2026-04-21)

| Test File | Tests | Result | Command |
|-----------|-------|--------|---------|
| `src/lib/handles/__tests__/normalize.test.ts` | 12/12 | green | `pnpm test -- --run src/lib/handles/__tests__/normalize.test.ts` |
| `src/features/sequences/lib/__tests__/reply-matching.test.ts` | 8/8 | green | `pnpm test -- --run src/features/sequences/lib/__tests__/reply-matching.test.ts` |
| `src/app/api/cron/check-replies/__tests__/route.test.ts` | 1/1 | green | `pnpm test -- --run src/app/api/cron/check-replies/__tests__/route.test.ts` |
| **Total (Phase 7 scope)** | **21/21** | **green** | |

Full suite (161/161) also green at finalization. Typecheck clean (exit 0).

---

## Requirements Coverage

| Requirement | Description | Test File | Coverage Type | Status |
|-------------|-------------|-----------|---------------|--------|
| RPLY-02 | System matches reply sender to prospect record and updates `pipeline_status` to `"replied"` | `reply-matching.test.ts` (RPLY-02 regression test, line 31) + `route.test.ts` (integration, totalReplies=1 + pipeline_status='replied') | automated | green |
| RPLY-03 | System sends email notification to user when a reply is received | `route.test.ts` (asserts `sendReplyAlert("user@example.com","u/alice","Reddit")`) | automated (call args) + manual (live delivery) | green |
| RPLY-04 | System pushes reply event to dashboard via Supabase Realtime | `route.test.ts` (asserts prospects UPDATE with `pipeline_status='replied'`) | automated (DB write) + manual (live WS frame) | green |
| FLLW-04 | System stops all follow-ups immediately when any reply is detected | `route.test.ts` (asserts actions UPDATE with `status='cancelled'`) | automated | green |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Status | Evidence |
|----------|-------------|------------|--------|----------|
| Reply alert email actually arrives in inbox within 10 min | RPLY-03 | Resend delivery depends on live provider credentials and inbox filters — cannot stub the provider's actual send latency | passed (UAT) | Resend accepted from=notifications@repco.ai to=kamil.wandtke@outsi.com (id=ba8b5721-1404-4ba5-b780-7995f3c3da87, 559ms) after repco.ai domain verification. |
| Realtime push observed by live browser subscription | RPLY-04 | `use-realtime-replies` runs in browser with WebSocket, requires live Supabase Realtime channel | passed (UAT) | Seeded throwaway prospect on prod, subscribed to `prospects-replies-<user_id>` channel, UPDATE `pipeline_status='replied'`, frame arrived in 737ms with correct payload. |

Both manual items closed via live prod smoke tests on 2026-04-21T14:50:00Z. See `07-VERIFICATION.md` for full UAT evidence.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`src/lib/handles/normalize.ts`, `src/lib/handles/__tests__/normalize.test.ts`, `src/app/api/cron/check-replies/__tests__/route.test.ts`)
- [x] No watch-mode flags (always `--run`)
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-21 — 21/21 automated tests green, 2/2 manual UAT items passed
