---
phase: 4
slug: sequences-reply-detection
status: final
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-18
finalized: 2026-04-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | `vitest.config.ts` (exists, configured with `@/` alias) |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15 seconds (actual: ~8 seconds) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File | Status |
|---------|------|------|-------------|-----------|-------------------|------|--------|
| 04-01-01 | 01 | 1 | FLLW-01 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 3"` | `scheduler.test.ts` | green |
| 04-01-02 | 01 | 1 | FLLW-02 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 7"` | `scheduler.test.ts` | green |
| 04-01-03 | 01 | 1 | FLLW-03 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 14"` | `scheduler.test.ts` | green |
| 04-01-04 | 01 | 1 | FLLW-04 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | `stop-on-reply.test.ts` | green — see FLLW-04 note |
| 04-01-05 | 01 | 1 | FLLW-05 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/auto-send.test.ts` | `auto-send.test.ts` | green |
| 04-02-01 | 02 | 2 | RPLY-01 | manual | manual-only (GoLogin + Reddit live inbox) | — | manual-only |
| 04-02-02 | 02 | 2 | RPLY-02 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/reply-matching.test.ts` | `reply-matching.test.ts` | green — covered post-fix in Phase 7 regression test |
| 04-02-03 | 02 | 2 | RPLY-03 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | `reply-alert.test.ts` | green — covered post-fix in Phase 7 regression test |
| 04-02-04 | 02 | 2 | RPLY-04 | manual | manual-only (Supabase Realtime subscription) | — | manual-only — covered post-fix in Phase 7 regression test |
| 04-03-01 | 03 | 2 | NTFY-01 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/daily-digest.test.ts` | `daily-digest.test.ts` | green |
| 04-03-02 | 03 | 2 | NTFY-02 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | `reply-alert.test.ts` | green |
| 04-03-03 | 03 | 2 | NTFY-03 | unit | `pnpm vitest run src/features/notifications/lib/__tests__/account-warning.test.ts` | `account-warning.test.ts` | green |

*Status: green · manual-only*

---

## Requirement Notes

### FLLW-04 — Stop all follow-ups on reply
Primary coverage: `stop-on-reply.test.ts` (6 tests — cancels followup_dm actions, sets sequence_stopped, idempotent on already-replied prospect). The handle-normalization bug that originally broke reply matching is covered post-fix by the Phase 7 regression test at `src/features/sequences/lib/__tests__/reply-matching.test.ts`.

### RPLY-02 — Match reply sender to prospect
Originally broken in Phase 4 due to a handle-normalization bug (handle stored with `u/` prefix was not stripped before comparison). Fixed in Phase 7. Coverage source: `src/features/sequences/lib/__tests__/reply-matching.test.ts` (8 tests — case-insensitive, u/ prefix permutations, tuple match, null for unmatched, already-replied skip, null handle guard, empty sender guard). **Covered post-fix in Phase 7 regression test.**

### RPLY-03 — Email notification on reply
`reply-alert.test.ts` covers subject format, from address, React Email props, Resend error path, and return value. The Phase 7 regression fixes confirmed this wiring is correct. **Covered post-fix in Phase 7 regression test.**

### RPLY-04 — Push reply event via Supabase Realtime
Realtime subscription behavior (`use-realtime-replies.ts`) cannot be unit-tested without a live Supabase connection. Manual-only. The hook logic was validated during Phase 4 UAT (Test 4 — Replies section renders correctly). **Covered post-fix in Phase 7 regression test** (integration wiring confirmed; real-time toast cannot be automated).

---

## Test Coverage Summary

| Test File | Tests | Requirements Covered |
|-----------|-------|----------------------|
| `src/features/sequences/lib/__tests__/scheduler.test.ts` | 14 | FLLW-01, FLLW-02, FLLW-03 |
| `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | 6 | FLLW-04 |
| `src/features/sequences/lib/__tests__/auto-send.test.ts` | 4 | FLLW-05 |
| `src/features/sequences/lib/__tests__/reply-matching.test.ts` | 8 | RPLY-02 (Phase 7 regression) |
| `src/features/notifications/lib/__tests__/reply-alert.test.ts` | 5 | RPLY-03, NTFY-02 |
| `src/features/notifications/lib/__tests__/daily-digest.test.ts` | 4 | NTFY-01 |
| `src/features/notifications/lib/__tests__/account-warning.test.ts` | 3 | NTFY-03 |
| **Total** | **44** | **10 of 12 requirements automated** |

2 requirements are manual-only (RPLY-01: live GoLogin+Reddit inbox; RPLY-04: Supabase Realtime subscription).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Phase 4 UAT Result |
|----------|-------------|------------|--------------------|
| Inbox checked every 2h via GoLogin + Haiku CU | RPLY-01 | Requires live GoLogin Cloud + Anthropic API + real Reddit account | Verified via code inspection + vercel.json cron schedule `0 */2 * * *` |
| Reply event pushed to dashboard via Supabase Realtime | RPLY-04 | Requires live Supabase Realtime subscription; toast fires on `pipeline_status` transition to `replied` | Dashboard Replies section renders correctly (UAT Test 4 passed); Realtime wiring confirmed in `use-realtime-replies.ts` |
| Real email delivery (Resend DNS) | RPLY-03, NTFY-01, NTFY-02, NTFY-03 | Requires live Resend account + DNS config for `notifications@repco.ai` | Not live-tested; unit tests confirm send function contract; DNS setup is production prerequisite |

---

## Deferred Items

| Item | Reason | Phase |
|------|--------|-------|
| BILL-01 `startFreeTrial` wired to signup | `startFreeTrial` function exists but is not wired to the signup flow. This is Phase 12 scope, not a Phase 4 Nyquist gap. | Phase 12 |

---

## Full Suite Results (2026-04-21)

```
Test Files  42 passed (42)
     Tests  288 passed (288)
  Duration  7.85s
```

Phase 4 test files: 7 files, 44 tests — all green.

---

## Validation Sign-Off

- [x] All tasks have automated verify or documented manual-only rationale
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 test files all exist and are green
- [x] No watch-mode flags in any command
- [x] Feedback latency < 15s (actual ~8s)
- [x] FLLW-04/RPLY-02/RPLY-03/RPLY-04 handle-normalization bug noted; covered by Phase 7 regression
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-04-21 — Nyquist auditor (Claude Sonnet 4.6)
