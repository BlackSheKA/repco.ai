---
phase: 16-mechanism-cost-engine-schema
verified: 2026-04-27T12:56:09Z
status: passed
score: 30/30 must-haves verified
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 16: Mechanism Cost Engine Schema — Verification Report

**Phase Goal:** Replace hardcoded `MONITORING_COSTS` with a DB-driven cost engine. `mechanism_costs` is the single source of truth (60 rows, 32 signal + 28 outbound). `monitoring_signals` rewritten around `mechanism_id + frequency + config`. `credit-burn.ts` reads from cached helper. Legacy monitoring stack deleted (clean slate for Phase 22).

**Verified:** 2026-04-27T12:56:09Z
**Status:** PASSED
**Re-verification:** No — initial verification
**HEAD:** `33c2d5e` (development)
**Migration target:** dev branch `effppfiphrykllkpkdbv` (prod `cmkifdwjunojgigrqwnr` UNTOUCHED, per environment rules)

---

## Goal Achievement

### Observable Truths (mapped to PRIC-01 / PRIC-02 / PRIC-03)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `mechanism_costs` table seeded with 60 rows (32 signal + 28 outbound) | VERIFIED | Dev-branch query returned `[{signal:32},{outbound:28}]` |
| 2 | Per-prefix counts match PRICING.md (R=9, M=3, L=11, T=5, E=2, O=2, OR=9, OL=11, OX=8) | VERIFIED | Dev-branch `GROUP BY substring(mechanism_id from '^[A-Z]+')` returned exact match |
| 3 | `mechanism_kind_enum` exists, `signal_source_type` dropped | VERIFIED | `pg_type` query: legacy=false, new=true |
| 4 | `monitoring_signals` has new shape (frequency, mechanism_id, config) and lacks `signal_type`, `credits_per_day` | VERIFIED | `information_schema.columns` returned: id, user_id, value, active, created_at, frequency, mechanism_id, config |
| 5 | FK `monitoring_signals.mechanism_id` → `mechanism_costs.mechanism_id` ON DELETE RESTRICT | VERIFIED | `pg_constraint`: `monitoring_signals_mechanism_id_fkey` confdeltype='r' |
| 6 | Unique index recreated as `(user_id, mechanism_id, value) WHERE active=true` | VERIFIED | `pg_indexes`: `monitoring_signals_user_mech_value_unique` present; legacy `_user_type_value_unique` absent |
| 7 | `monitoring_signals` wiped during migration | VERIFIED | `SELECT count(*)` → 0 |
| 8 | RLS on `mechanism_costs`: SELECT to authenticated only, no client writes | VERIFIED | `pg_policy`: 1 row, polcmd='r' (SELECT), polroles={authenticated} |
| 9 | `mechanism-costs.ts` helper module exists with cached `getMechanismCost`/`getAllMechanismCosts`/`invalidateMechanismCostCache` | VERIFIED | `src/features/billing/lib/mechanism-costs.ts` (40 lines) implements module-level Map cache |
| 10 | `credit-burn.ts` consumes the helper and uses new MonitoringSignalInput shape | VERIFIED | `src/features/billing/lib/credit-burn.ts` imports `getMechanismCost`; `MonitoringSignalInput = { mechanism_id, frequency, active }`; E1 special case implemented (line 83-89) |
| 11 | `MONITORING_COSTS` removed from src/ | VERIFIED | grep returned 0 hits |
| 12 | `MonitoringSignalType` removed from src/ | VERIFIED | grep returned 0 hits |
| 13 | `signal_type` removed from src/ | VERIFIED | grep returned 0 hits |
| 14 | `signal_source_type` removed from src/ | VERIFIED | grep returned 0 hits |
| 15 | `monitor-reddit` cron route deleted | VERIFIED | `src/app/api/cron/monitor-reddit/` does not exist |
| 16 | `monitor-linkedin` cron route + test deleted | VERIFIED | `src/app/api/cron/monitor-linkedin/` does not exist |
| 17 | `/signals` page deleted | VERIFIED | `src/app/(app)/signals/` does not exist |
| 18 | `settings-actions.ts` deleted | VERIFIED | `src/features/monitoring/actions/` does not exist |
| 19 | `sources-panel.tsx` deleted | VERIFIED | `src/features/monitoring/components/` does not exist |
| 20 | `vercel.json` cron entries cleaned | VERIFIED | 10 crons (was 12); no `monitor-*` paths; node parse OK |
| 21 | `credit-burn` cron route uses new select shape | VERIFIED | `src/app/api/cron/credit-burn/route.ts:93` `.select("user_id, mechanism_id, frequency, active")` |
| 22 | ROADMAP.md criterion #1 says "32 signal + 28 outbound" | VERIFIED | line 45: "seeded with 32 signal + 28 outbound rows" |
| 23 | `mechanism-costs.test.ts` exists and passes | VERIFIED | vitest: 4 files / 45 tests passed in 1.21s |
| 24 | `credit-burn.test.ts` rewritten around mechanism_id | VERIFIED | tests pass; module imports `mechanism-costs` |
| 25 | Cadence parser covers 7 buckets (15min/30min/1h/2h/4h/6h/24h) | VERIFIED | `credit-burn.ts:33-52` `intervalToCadenceBucket` handles all 7 |
| 26 | E1 stacking flat 5 cr/day, single-add semantic | VERIFIED | `credit-burn.ts:83-89` early-continue with `e1Counted` boolean |
| 27 | Unknown mechanism_id / unknown cadence → 0 (fail-safe) | VERIFIED | `credit-burn.ts:92,96` early-continue on null |
| 28 | `pnpm typecheck` exits 0 (after stale `.next` clean) | VERIFIED | Stale `.next/types/validator.ts` referenced deleted routes; clean rebuild → exit 0 |
| 29 | `pnpm build` exits 0 | VERIFIED | Build completed; route manifest shows `monitor-*` removed and 10 crons present |
| 30 | Migration applied to dev branch only (prod untouched) | VERIFIED | All Supabase Management API queries hit `effppfiphrykllkpkdbv`; no prod calls made |

**Score:** 30/30 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/00024_mechanism_costs.sql` | Single atomic migration: ENUM + table + RLS + 60-row seed + monitoring_signals rewrite | VERIFIED | File present; structure matches D-22/D-23 |
| `src/features/billing/lib/mechanism-costs.ts` | Cached helper with 3 exports | VERIFIED | Exports: `getAllMechanismCosts`, `getMechanismCost`, `invalidateMechanismCostCache`; `MechanismCost` interface |
| `src/features/billing/lib/mechanism-costs.test.ts` | Cache hit/invalidation tests | VERIFIED | Passes |
| `src/features/billing/lib/credit-burn.ts` | Async, mechanism_id-driven, E1 special case | VERIFIED | New signature; SCANS_PER_DAY const; intervalToCadenceBucket; calculateMonitoringBurn |
| `src/features/billing/lib/credit-burn.test.ts` | Rewritten around mechanism_id | VERIFIED | Passes |
| `src/features/billing/lib/types.ts` | No MONITORING_COSTS, no MonitoringSignalType | VERIFIED | Only `ActionCreditType`, `CREDIT_COSTS`, `ACCOUNT_COSTS`, `INCLUDED_ACCOUNTS`, `PRICING_PLANS`, `CREDIT_PACKS` survive |
| `src/app/api/cron/credit-burn/route.ts` | New select shape | VERIFIED | Line 93 `.select("user_id, mechanism_id, frequency, active")` |
| Deleted: `monitor-reddit/route.ts`, `monitor-linkedin/route.ts` + test, `(app)/signals/page.tsx`, `monitoring/actions/`, `monitoring/components/sources-panel.tsx` | All removed | VERIFIED | Filesystem checks all pass |
| `vercel.json` | 10 cron entries, no monitor-* | VERIFIED | node-validated; matches summary |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `credit-burn.ts` | `mechanism-costs.ts` | `import { getMechanismCost }` | WIRED | Used in line 91 inside `calculateMonitoringBurn` |
| `credit-burn` cron route | `credit-burn.ts` | `import { calculateMonitoringBurn, calculateAccountBurn }` | WIRED | Used in lines 138-139 with new `MonitoringSignalRow` shape (matches DB select) |
| `mechanism-costs.ts` | `mechanism_costs` table | `supabase.from("mechanism_costs").select("*")` | WIRED | Single bulk-load on first call; cached in module-level Map |
| `monitoring_signals.mechanism_id` | `mechanism_costs.mechanism_id` | FK ON DELETE RESTRICT | WIRED | `pg_constraint` confirms |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `getMechanismCost` | `_cache: Map<string, MechanismCost>` | `mechanism_costs` table (60 rows seeded) | Yes — DB returned 60 rows on test connection | FLOWING |
| `calculateMonitoringBurn` | per-signal `cost.unit_cost × SCANS_PER_DAY[bucket]` | helper + DB | Yes — verified by 45 passing unit tests including R1×6h=4, R1×1h×2=48, E1=5, E1+R1=9, inactive=0, unknown=0 | FLOWING |
| `credit-burn` cron | `signalsByUser`, `accountsByUser` | bulk `select("user_id, mechanism_id, frequency, active")` | Conditional — depends on real users; data shape matches new schema; current dev table is empty (post-wipe), expected per D-10 | FLOWING (shape correct) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Billing tests pass | `pnpm test src/features/billing` | 4 files / 45 tests passed in 1.21s | PASS |
| Typecheck (after `.next` clean) | `rm -rf .next && pnpm typecheck` | exit 0, no errors | PASS |
| Build | `pnpm build` | Built successfully; route manifest shows no `monitor-*` and 10 crons | PASS |
| DB count signal | `SELECT COUNT(*) WHERE mechanism_kind='signal'` | 32 | PASS |
| DB count outbound | same with `'outbound'` | 28 | PASS |
| DB monitoring_signals empty | `SELECT count(*) FROM monitoring_signals` | 0 | PASS |
| RLS policy exact | `pg_policy` for mechanism_costs | 1 row: select / authenticated | PASS |
| Final invariant grep | `grep -rE "signal_type\|MonitoringSignalType\|MONITORING_COSTS" src/` | 0 hits | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PRIC-01 | 16-01 | `mechanism_costs` table column set + 60-row seed coverage | SATISFIED | Truths #1, #2, #3, #8 all verified in dev branch |
| PRIC-02 | 16-01, 16-04, 16-05 | `monitoring_signals` rewrite shape + signal_type/source_type removed | SATISFIED | Truths #4, #5, #6, #7, #11–#19 all verified |
| PRIC-03 | 16-02, 16-03, 16-04 | Cached helper + DB-driven burn engine + MONITORING_COSTS removed | SATISFIED | Truths #9, #10, #11, #21, #23–#27 all verified; 45 tests green |

No orphaned requirements: `.planning/REQUIREMENTS.md` Phase 16 column lists exactly PRIC-01/02/03; all three claimed by plans 16-01..16-05 collectively.

### Anti-Patterns Found

None in phase scope. Lint reports 53 problems repo-wide (24 errors / 29 warnings) — none trace to phase 16 deleted scope. The single match for `monitor-linkedin` is inside `.claude/worktrees/agent-a1ba0f9d552e1d420/...` (orphaned executor worktree), outside the source tree.

### Human Verification Required

None. All truths verifiable programmatically (DB queries, grep, vitest, build).

### Deferred Items (Step 9b — addressed by later phases)

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | Outbound burn engine consuming `mechanism_kind='outbound'` rows | Phase 22+ (Faza F) | CONTEXT D-18, deferred section |
| 2 | `free_tier_allowed` enforcement at write-time | Phase 19/21 | CONTEXT line 28-29 |
| 3 | `/signals` UI redesign + 27-mechanism configurator | Phase 22 | CONTEXT line 30 |
| 4 | Replacement crons for monitor-reddit / monitor-linkedin | Phase 22 | deferred-items section "Replacement crons" |

These are intentionally out of scope and do NOT count as gaps.

---

## Gaps Summary

No gaps. All 30 must-haves verified. Phase delivered exactly what was planned:

1. DB schema: 60 rows seeded (32+28), per-prefix counts match, monitoring_signals rewritten with FK to mechanism_costs, RLS correct, legacy ENUM dropped, table wiped per D-10.
2. Code: cached helper module + rewritten credit-burn engine + cron route updated to new select shape; 45 tests green.
3. Deletions: monitor-reddit/linkedin crons, signals page, monitoring actions/components all gone; vercel.json cleaned to 10 entries.
4. Invariant grep: zero references to legacy `signal_type` / `MonitoringSignalType` / `MONITORING_COSTS` / `signal_source_type` in `src/`.
5. ROADMAP criterion #1 updated to "32 signal + 28 outbound" per D-09.

### Notes on `deferred-items.md` (16-05)

The deferred items file documented three pre-existing failures observed during 16-05's final gate. Re-running the gates on the merged main worktree:

- **`pnpm typecheck`** — Reports stale errors only when `.next/types/validator.ts` exists referencing deleted route paths. Removing `.next/` and re-running yields **exit 0**. The SVG/PNG ambient-declaration errors mentioned in the doc did NOT reproduce. Likely the deferred doc captured a worktree-local state; main is clean.
- **`pnpm lint`** — 24 errors / 29 warnings remain repo-wide; none trace to phase-16 deleted scope (verified via grep over lint output). Confirms doc's claim that deletions did not introduce new lint problems.
- **`pnpm build`** — Builds successfully on main worktree; the `@radix-ui/react-dismissable-layer` failure was indeed a worktree node_modules hydration gap. No phase-16 fingerprint.

The deferred-items file is consistent with phase scope hygiene (CLAUDE.md §3 surgical-changes rule). No deferred item should block phase closure.

---

## Verdict

**PASSED.** Phase 16 — Mechanism Cost Engine Schema — fully delivered against ROADMAP success criteria, PRIC-01/02/03, and CONTEXT D-01 through D-25. Schema lives in dev branch; legacy stack excised; cost engine DB-driven and tested.

Ready to mark phase complete and proceed to Phase 17 (already planned per `82af623`).

---

_Verified: 2026-04-27T12:56:09Z_
_Verifier: Claude (gsd-verifier, Opus 4.7 1M)_
