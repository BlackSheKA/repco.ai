---
phase: 16
slug: mechanism-cost-engine-schema
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-27
approved: 2026-04-27
---

> **Coverage rationale (post-planning):** Every invariant in the Per-Task Verification Map below is satisfied by at least one `<automated>` `<verify>` block in plans 01–05. Mapping: DB invariants → PLAN 01 Task 3 + Task 4 acceptance grep + dev-branch curl verification queries. Code invariants → PLAN 03 Task 1/2 + PLAN 05 Task 5 final grep gate. Cost engine invariants → PLAN 02 Task 02-02 (cache) + PLAN 03 Task 2 (credit-burn.test.ts unit cases R1×6h=4, R1×1h×2=48, E1 flat 5, E1+R1=9, inactive=0, unknown=0, empty=0). Cron route invariant → PLAN 03 Task 2 grep on `.select(...)`. Refactor invariants → PLAN 04 Tasks 04-01 + 04-02. Wave 0 requirement (`mechanism-costs.test.ts` exists with at least one failing-then-passing test) → satisfied by PLAN 02 Task 02-02 which writes the test file from scratch as the cache helper is created (single-wave creation; no separate Wave 0 needed because tests are co-created with the helper module).
>
> **Wave-3 build-gate exemption:** PLAN 05 Task 5 chains `pnpm build` (typically 30–90s on Next.js 16). This intentionally exceeds the 30-second feedback-latency target stated below — it is the final wave gate before phase completion, not an inner-loop test. Per-task verifications inside Waves 1 and 2 stay under the latency target.

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source invariants live in `16-RESEARCH.md` `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` (existing — covers `**/*.test.ts`) |
| **Quick run command** | `pnpm test src/features/billing` |
| **Full suite command** | `pnpm test && pnpm typecheck && pnpm lint && pnpm build` |
| **Estimated runtime** | ~25–40 seconds (full); ~5 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test src/features/billing` + `pnpm typecheck`
- **After every plan wave:** Run full suite (`pnpm test && pnpm typecheck && pnpm lint && pnpm build`)
- **Before `/gsd-verify-work`:** Full suite + dev-branch DB invariant queries (see RESEARCH §10 / Validation Architecture DB invariants)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Plan-phase fills exact task IDs after PLAN.md files are written. Skeleton below maps the locked validation invariants from RESEARCH.md to verification commands. Planner expands the table during plan generation.

| Concern | Requirement | Test Type | Automated Command | Notes |
|---------|-------------|-----------|-------------------|-------|
| 32 signal seed rows | PRIC-01 | DB query | `curl … "SELECT COUNT(*) FROM mechanism_costs WHERE mechanism_kind='signal'"` → 32 | Manual via Supabase Mgmt API after dev-branch push |
| 28 outbound seed rows | PRIC-01 | DB query | same with `mechanism_kind='outbound'` → 28 | |
| Per-prefix counts | PRIC-01 | DB query | `SELECT substring(mechanism_id from '^[A-Z]+'), COUNT(*) GROUP BY 1` matches R=9, M=3, L=11, T=5, E=2, O=2, OR=9, OL=11, OX=8 | |
| `mechanism_kind_enum` exists | PRIC-01 | DB query | `SELECT enum_range(NULL::mechanism_kind_enum)` → `{signal,outbound}` | |
| `signal_source_type` dropped | PRIC-02 | DB query | `SELECT 1 FROM pg_type WHERE typname='signal_source_type'` → 0 rows | |
| `monitoring_signals` columns | PRIC-02 | DB query | `information_schema.columns` shows `frequency`, `mechanism_id`, `config`; not `signal_type`, `credits_per_day` | |
| FK + ON DELETE RESTRICT | PRIC-02 | DB query | `pg_constraint` shows FK on `monitoring_signals.mechanism_id` → `mechanism_costs.mechanism_id` confdeltype='r' | |
| Unique index recreated | PRIC-02 | DB query | `pg_indexes` has `monitoring_signals_user_mech_value_unique`; not `..._user_type_value_unique` | |
| RLS policy on `mechanism_costs` | PRIC-01 | DB query | `pg_policies` exactly 1 row for `mechanism_costs`, FOR SELECT, TO authenticated | |
| `monitoring_signals` wiped | D-10 | DB query | `SELECT COUNT(*) FROM monitoring_signals` → 0 immediately post-migration | |
| `MONITORING_COSTS` removed | PRIC-03 | grep | `grep -r "MONITORING_COSTS" src/` → 0 hits | Post-refactor |
| `MonitoringSignalType` removed | PRIC-03 | grep | `grep -r "MonitoringSignalType" src/` → 0 hits | |
| `signal_type` removed from src | PRIC-02/03 | grep | `grep -r "signal_type" src/` → 0 hits | |
| `mechanism-costs.ts` exists | PRIC-03 | file existence | `test -f src/features/billing/lib/mechanism-costs.ts` → 0 | |
| `getMechanismCost` cache hit | PRIC-03 | unit (vitest) | `pnpm test src/features/billing/lib/mechanism-costs.test.ts` — assert mock counter == 1 across N calls | |
| `invalidateMechanismCostCache` triggers re-fetch | PRIC-03 | unit (vitest) | same test file — counter becomes 2 after invalidate + call | |
| `calculateMonitoringBurn` R1 6h × 1 = 4 | PRIC-03 | unit (vitest) | `pnpm test src/features/billing/lib/credit-burn.test.ts` | Per RESEARCH §Cost engine invariants |
| `calculateMonitoringBurn` R1 1h × 2 = 48 | PRIC-03 | unit (vitest) | same file | |
| E1 stacking flat 5 cr/day | PRIC-03 | unit (vitest) | same file | |
| E1 + R1 6h = 9 | PRIC-03 | unit (vitest) | same file | |
| Inactive signals → 0 | PRIC-03 | unit (vitest) | same file | |
| Unknown mechanism_id → 0 | PRIC-03 | unit (vitest) | same file | |
| Cadence parser 7 buckets | PRIC-03 | unit (vitest) | same file — 15min/30min/1h/2h/4h/6h/24h | |
| Empty input → 0 | PRIC-03 | unit (vitest) | same file | |
| Deleted dirs gone | PRIC-02 | filesystem | `test ! -d src/app/api/cron/monitor-reddit && test ! -d src/app/api/cron/monitor-linkedin && test ! -d src/app/\(app\)/signals && test ! -d src/features/monitoring/actions && test ! -d src/features/monitoring/components` | All 5 must succeed |
| `vercel.json` cleaned | D-19 | grep | `grep -E "monitor-reddit\|monitor-linkedin" vercel.json` → 0 hits | |
| `credit-burn` cron route shape | PRIC-03 | grep | `grep -E "mechanism_id, frequency, active" src/app/api/cron/credit-burn/route.ts` → 1 hit | |
| Roadmap criterion #1 updated | D-09 | grep | `grep "32 signal + 28 outbound" .planning/ROADMAP.md` → 1 hit | |
| Build green | all | command | `pnpm build` → exit 0 | |
| Typecheck green | all | command | `pnpm typecheck` → exit 0 | |
| Lint green | all | command | `pnpm lint` → exit 0 | |

*Status filled by planner per task: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/features/billing/lib/mechanism-costs.test.ts` — new test file for cache helper (Wave 0 must create the file with at least one failing test that imports the helper to confirm the module exists; subsequent waves add behavioral tests)
- [ ] `src/features/billing/lib/credit-burn.test.ts` — exists; **rewrite around mechanism_id**, removing all `signal_type` literal references. Wave 0 substitutes the test file shape; expanded coverage in later waves.

*Existing vitest infrastructure (`vitest.config.ts`, `@vitest/ui`, `happy-dom`) covers all phase requirements — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dev-branch migration apply succeeds | PRIC-01/02 | Requires Supabase Management API call (out-of-process) | Run RESEARCH §9 PowerShell/bash recipe; expect HTTP 201 + verification SELECTs return expected counts |
| `vercel.json` cron entries removed do not break prod cron | D-19 | Vercel cron only runs on `main` branch deploys; verified at deploy-to-production time | Confirmed by absence in `vercel.json` and `vercel.json` schema validation; full check at `/deploy-to-production` step |

*All other behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify (per-task table populated by planner)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (mechanism-costs.test.ts created)
- [ ] No watch-mode flags (uses `vitest run` — non-watch)
- [ ] Feedback latency < 40 seconds
- [ ] `nyquist_compliant: true` set in frontmatter (after planner expansion + executor passes)

**Approval:** approved 2026-04-27 (coverage validated against plans 01–05; wave-3 build-gate latency exemption documented in frontmatter prologue)
