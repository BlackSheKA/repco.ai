---
phase: 07-reply-detection-fix
plan: 01
subsystem: sequences/reply-detection
tags: [gap-closure, reddit, handle-normalization, reply-cascade]
requirements: [RPLY-02, RPLY-03, RPLY-04]
dependency-graph:
  requires: [phase-04]
  provides:
    - "normalizeHandle(raw, platform) platform-aware util"
    - "matchReplyToProspect with symmetric normalization"
    - "full cron cascade integration coverage"
  affects:
    - "src/app/api/cron/check-replies/route.ts (unblocked — path now reaches handleReplyDetected + sendReplyAlert)"
    - "src/features/sequences/lib/use-realtime-replies.ts (unblocked — UPDATE events now fire)"
tech-stack:
  added: []
  patterns:
    - "Normalize-at-compare-boundary — do not migrate stored data; symmetric normalization on both sides of equality"
    - "Production-shaped test fixtures (handle: 'u/testuser123') so the original bug cannot regress silently"
key-files:
  created:
    - "src/lib/handles/normalize.ts"
    - "src/lib/handles/__tests__/normalize.test.ts"
    - "src/app/api/cron/check-replies/__tests__/route.test.ts"
  modified:
    - "src/features/sequences/lib/reply-matching.ts"
    - "src/features/sequences/lib/__tests__/reply-matching.test.ts"
decisions:
  - "Normalize at compare-boundary (not on write) — UI renders prospect.handle directly, so data migration would silently change every Reddit display surface"
  - "Platform-aware util signature accepts plain `string` (not a Platform union) to match existing DB `platform_type` ENUM call sites"
  - "Symmetric: normalizeHandle called on BOTH sender and stored handle — the inline asymmetric replace was the exact root cause"
  - "Test fixtures use production-shaped `u/`-prefixed handles; a named RPLY-02 regression test makes the bug impossible to re-introduce unnoticed"
  - "Integration test mocks Sentry/GoLogin/Anthropic/Resend/logger but exercises REAL matchReplyToProspect + handleReplyDetected so the mid-layer glue is actually under test"
metrics:
  duration: "~11min"
  completed: 2026-04-21
  tasks: 3
  files_touched: 5
  tests_added: 21
---

# Phase 7 Plan 1: Reply Detection Fix Summary

**One-liner:** Platform-aware `normalizeHandle` util + symmetric normalization in `matchReplyToProspect` + production-shaped test fixtures restore the RPLY-02/03/04 + FLLW-04 cascade that was silently broken by asymmetric `u/` prefix handling.

## Tasks Executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0: normalizeHandle util + unit tests | `a40cb92` | `src/lib/handles/normalize.ts` (new, 26 lines), `src/lib/handles/__tests__/normalize.test.ts` (new, 53 lines) |
| 2 | Wave 1: Patch matchReplyToProspect + rewrite tests with u/-prefixed fixtures | `ca9c16b` | `src/features/sequences/lib/reply-matching.ts` (68 lines), `src/features/sequences/lib/__tests__/reply-matching.test.ts` (184 lines) |
| 3 | Wave 1: End-to-end cascade integration test for check-replies cron | `ce6ac71` | `src/app/api/cron/check-replies/__tests__/route.test.ts` (new, 308 lines) |

## The Diff That Closed The Bug

**Before (`src/features/sequences/lib/reply-matching.ts` line 30, BUGGY):**
```ts
const normalized = senderHandle.replace(/^u\//i, "").toLowerCase()
// ...
const match = prospects.find((p) => p.handle?.toLowerCase() === normalized)
//                                   "u/testuser"            !== "testuser"  ← always false
```

**After (patched):**
```ts
import { normalizeHandle } from "@/lib/handles/normalize"

const normalized = normalizeHandle(senderHandle, platform)
if (!normalized) return null
// ...
const match = prospects.find(
  (p) => normalizeHandle(p.handle, platform) === normalized,
)
// "testuser" === "testuser"  ← match succeeds
```

## Test Counts

| File | Tests | Status |
|------|-------|--------|
| `src/lib/handles/__tests__/normalize.test.ts` | 12 | all passing |
| `src/features/sequences/lib/__tests__/reply-matching.test.ts` | 8 | all passing (incl. named RPLY-02 regression) |
| `src/app/api/cron/check-replies/__tests__/route.test.ts` | 1 | passing — asserts `totalReplies=1`, actions `status='cancelled'`, prospects `pipeline_status='replied'`, `sendReplyAlert("user@example.com","u/alice","Reddit")` |
| **Full repo suite** | **161 / 28 files** | **all passing** |

## Verification

- [x] `pnpm test -- --run src/lib/handles/__tests__/normalize.test.ts` — 12 passed
- [x] `pnpm test -- --run src/features/sequences/lib/__tests__/reply-matching.test.ts` — 8 passed
- [x] `pnpm test -- --run src/app/api/cron/check-replies/__tests__/route.test.ts` — 1 passed
- [x] `pnpm test -- --run` (full suite) — **161 tests across 28 files, 0 failures**
- [x] `pnpm typecheck` — clean exit
- [x] No migration introduced under `supabase/migrations/` (compare-boundary fix, no schema change)
- [x] No UI file modified — `prospect.handle` still renders stored `u/<name>` form in card/detail/CSV
- [x] Inline `senderHandle.replace(/^u\//i, "")` fully removed from `reply-matching.ts`
- [x] `reply-matching.ts` imports `normalizeHandle` from `@/lib/handles/normalize` — called on both sender AND `p.handle`
- [x] Named RPLY-02 regression test present with `handle: "u/testuser123"` + bare sender `"testuser123"` fixture

## Requirements Unblocked

- **RPLY-02** — matchReplyToProspect returns non-null for production-shaped data; `pipeline_status` flips to `replied`
- **RPLY-03** — `sendReplyAlert("user@email","u/handle","Reddit")` now fires from cron once match succeeds (infra already wired in Phase 4)
- **RPLY-04** — `prospects.pipeline_status='replied'` UPDATE fires, which is the exact event `useRealtimeReplies` subscribes to (Realtime hook already wired in Phase 4)
- **FLLW-04** (cascade) — `handleReplyDetected` now runs, cancelling pending/approved `followup_dm` actions (previously never reached)

## Deviations from Plan

**None.** Plan executed exactly as written:

- Task 1 util matches the plan's exact signature and switch-branch structure (reddit / linkedin / default).
- Task 2 patches were applied at the exact line ranges specified, inline normalization fully removed, import added at top, and all 8 prescribed tests present with production-shaped fixtures.
- Task 3 integration test verified actual route import paths (`@/lib/gologin/adapter`, `@/lib/computer-use/screenshot`, `@anthropic-ai/sdk` class, `@/features/notifications/lib/send-reply-alert`, `@/lib/logger` singleton not `createLogger`) and wired each mock correctly — the plan explicitly flagged this as a "verify first" step.

Minor implementation notes (not deviations):
- Added a 12th `normalize` test (`"   "` whitespace-only) beyond the plan's 10-behavior list — tightens the `if (!trimmed) return ""` branch.
- Added a `sequence_stopped: true` assertion in Task 3 alongside `pipeline_status: "replied"` because `handleReplyDetected` writes both in one UPDATE — makes the RPLY-04 trigger assertion stronger.
- Integration test also mocks `sendAccountWarning` (imported by the route) to prevent unmocked-module import failures — pure test plumbing.

## Manual Verification Status

Per `07-VALIDATION.md`, two behaviors remain manual and are deferred to UAT:

| Behavior | Status |
|----------|--------|
| Reply alert email actually arrives in inbox within 10 min (RPLY-03 live Resend) | Deferred to manual UAT (live provider credentials required) |
| Realtime WebSocket frame observed on `replies` channel from the browser (RPLY-04) | Deferred to manual UAT (requires live Supabase WS) |
| Production data sanity query `SELECT DISTINCT substring(handle, 1, 2) FROM prospects WHERE platform = 'reddit'` | Recommended before merge but not executed from executor context |

## Anti-Regression Invariants

Any of these would have prevented the original bug; all are now enforced in CI:

1. **Production-shaped fixture test** — `reply-matching.test.ts` line 35 stores `handle: "u/testuser123"` and senders use bare `"testuser123"`. If Task 2's find-predicate regresses to `p.handle?.toLowerCase() === normalized`, this test fails loudly.
2. **Symmetric-normalization grep** — `grep normalizeHandle src/features/sequences/lib/reply-matching.ts` returns 4 hits (1 import + 1 sender call + 1 predicate call + 1 JSDoc). Dropping either call-site breaks both Task 2 Test A AND Task 3 integration.
3. **End-to-end cron assertion** — Task 3 integration test exercises the REAL `matchReplyToProspect` + `handleReplyDetected` through the cron route. Silent single-side-normalization regression produces `totalReplies=0` and `sendReplyAlertMock.toHaveBeenCalledTimes(0)`.

## Self-Check: PASSED

Verified files exist on disk:
- FOUND: `src/lib/handles/normalize.ts`
- FOUND: `src/lib/handles/__tests__/normalize.test.ts`
- FOUND: `src/features/sequences/lib/reply-matching.ts` (patched)
- FOUND: `src/features/sequences/lib/__tests__/reply-matching.test.ts` (rewritten)
- FOUND: `src/app/api/cron/check-replies/__tests__/route.test.ts`

Verified commits exist:
- FOUND: `a40cb92` feat(07-01): add platform-aware normalizeHandle util
- FOUND: `ca9c16b` fix(07-01): normalize both sides of prospect handle equality (RPLY-02)
- FOUND: `ce6ac71` test(07-01): end-to-end cron cascade integration (RPLY-02/03/04 + FLLW-04)
