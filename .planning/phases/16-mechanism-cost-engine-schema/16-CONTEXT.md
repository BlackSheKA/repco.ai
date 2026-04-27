# Phase 16: Mechanism Cost Engine Schema - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace hardcoded `MONITORING_COSTS` constants with a DB-driven cost engine. A new `mechanism_costs` table is the single source of truth for every credit calculation; `monitoring_signals` is rewritten around `mechanism_id` + `frequency` + `config jsonb`; `credit-burn.ts` computes `daily_burn = unit_cost × scans_per_day(cadence) × num_sources` from cached DB lookup.

In scope:
- New `mechanism_costs` table (RLS-readable to all authenticated users; service-role write only)
- Seed 60 rows (32 signal: R1–R9 + M1–M3 + L1–L11 + T1–T5 + E1/E2 + O1/O2; 28 outbound: OR1–OR9 + OL1–OL11 + OX1–OX8)
- `monitoring_signals` rewrite: ADD `frequency interval NOT NULL DEFAULT '6 hours'`, `mechanism_id text NOT NULL REFERENCES mechanism_costs(mechanism_id)`, `config jsonb NOT NULL DEFAULT '{}'`; DROP `signal_type`, DROP `credits_per_day`; DROP TYPE `signal_source_type`; pre-DROP wipe of all rows
- New helper module `src/features/billing/lib/mechanism-costs.ts` with module-level cached `getMechanismCost(id)` + `getAllMechanismCosts()` + `invalidateMechanismCostCache()`
- Rewrite `src/features/billing/lib/credit-burn.ts` to consume the helper; new `MonitoringSignalInput` shape: `{ mechanism_id, frequency, active }`
- Remove `MONITORING_COSTS`, `MonitoringSignalType` from `src/features/billing/lib/types.ts`
- **Delete** signal management surface entirely (clean slate for Phase 22 redesign):
  - `src/app/api/cron/monitor-reddit/route.ts` + test
  - `src/app/api/cron/monitor-linkedin/route.ts` + test
  - `src/app/(app)/signals/page.tsx`
  - `src/features/monitoring/actions/settings-actions.ts` (and any other actions that read/write `signal_type`)
  - `src/features/monitoring/components/*` if they reference the deleted page
  - `vercel.json` entries for `monitor-reddit` (line 18) + `monitor-linkedin` (line 46)
- Update `.planning/ROADMAP.md` Phase 16 success criterion #1: change "27 signal + 28 outbound" → "32 signal + 28 outbound" (in same commit)

Out of scope (other phases):
- Free tier ENUM + `users.credits_balance_cap` / `credits_included_monthly` columns (Phase 19 / PRIC-04, PRIC-05)
- `free_tier_allowed` enforcement in UI / signal creation flow (Phase 21)
- New `/signals` redesign + 27-mechanism configurator (Phase 22)
- Outbound cost engine wired into action execution / `actions.mechanism_id` FK (Faza F → later phase)
- Monthly credit grant cron, Stripe price refresh (Phase 19+)
- `auth.users` wipe (Phase 20 / BPRX-10)

</domain>

<decisions>
## Implementation Decisions

### mechanism_costs schema

- **D-01:** Single unified cost column `unit_cost integer NOT NULL`. Discriminator `mechanism_kind` ENUM `('signal','outbound')` tells callers whether the value is cr/scan or cr/action. PRICING.md §5/§6 always have exactly one number per row, so two columns is wasted state. (Reasoning: cleaner queries, one source of truth per row, no CHECK constraint juggling.)
- **D-02:** `mechanism_id text PRIMARY KEY` using literal PRICING.md notation: `'R1'`, `'M1'`, `'OL2'`, `'E1'`, `'O1'`, etc. No CHECK regex (lean toward minimal — typos surface immediately when seed fails to FK from `monitoring_signals`).
- **D-03:** Phase 16 columns (locked):
  ```
  mechanism_id      text PRIMARY KEY
  unit_cost         integer NOT NULL                       -- cr/scan or cr/action depending on kind
  mechanism_kind    mechanism_kind_enum NOT NULL           -- 'signal' | 'outbound'
  premium           boolean NOT NULL DEFAULT false
  requires_gologin  boolean NOT NULL DEFAULT false
  free_tier_allowed boolean NOT NULL DEFAULT false
  description       text                                    -- human label, optional, sourced from PRICING.md table cell
  created_at        timestamptz NOT NULL DEFAULT now()
  ```
  No `daily_cap_per_account`, `risk_level`, `execution_method` — those land when the outbound burn engine actually consumes them (Faza F / Phase 22+).
- **D-04:** New ENUM `mechanism_kind_enum AS ENUM ('signal','outbound')` lives in `00001_enums.sql`-style alongside existing ENUMs. Add via fresh migration (do NOT edit `00001_enums.sql` — sequential migration convention).
- **D-05:** RLS on `mechanism_costs`: `SELECT` allowed to `authenticated` role (every user can read costs to render UI); `INSERT/UPDATE/DELETE` denied to all client roles (seed via migration only, future updates via service-role + migrations).

### Seed (60 rows)

- **D-06:** 32 signal rows: R1–R9 (9), M1–M3 (3), L1–L11 (11), T1–T5 (5), E1 (1), E2 (1), O1 (1), O2 (1). Modifiers/operations are seeded as `mechanism_kind='signal'` with `unit_cost=0` and the appropriate flags (`free_tier_allowed=true`, `requires_gologin=false` unless table says otherwise). E1 signal stacking is seeded with `unit_cost=5` (PRICING.md §5 calls it "5 cr/day flat" — burn engine treats it as a special-case outside per-scan math; documented in seed comment).
- **D-07:** 28 outbound rows: OR1–OR9 (9), OL1–OL11 (11), OX1–OX8 (8). All marked `mechanism_kind='outbound'`, `free_tier_allowed=false` (per PRICING.md §6 "Free tier — outbound restrictions"), `requires_gologin` per PRICING.md §6 risk/method column.
- **D-08:** Costs sourced verbatim from PRICING.md §5 / §6 tables. Where the table shows ranges (e.g., OL8 "20 (with thoughts) / 5 (simple)"), seed the **higher** value (20) and capture the split as a TODO in the deferred section — Phase 22 calibrates.
- **D-09:** Roadmap success criterion #1 updated in same commit as the seed: `.planning/ROADMAP.md` Phase 16 criterion #1 reads "32 signal + 28 outbound rows" not "27 + 28". Roadmap is the verification spec; keep it truthful.

### monitoring_signals rewrite

- **D-10:** **Wipe + drop** strategy (Phase 15 D-06 precedent, project memory `project_users_are_test_data`):
  1. `DELETE FROM monitoring_signals;` (all dev rows are test data)
  2. `ALTER TABLE monitoring_signals ADD COLUMN frequency interval NOT NULL DEFAULT '6 hours'`
  3. `ALTER TABLE monitoring_signals ADD COLUMN mechanism_id text NOT NULL REFERENCES mechanism_costs(mechanism_id) ON DELETE RESTRICT`
  4. `ALTER TABLE monitoring_signals ADD COLUMN config jsonb NOT NULL DEFAULT '{}'`
  5. `ALTER TABLE monitoring_signals DROP COLUMN signal_type`
  6. `ALTER TABLE monitoring_signals DROP COLUMN credits_per_day`
  7. `DROP TYPE signal_source_type`
  8. `DROP INDEX monitoring_signals_user_type_value_unique` (from 00022 — references dropped column); replace with `CREATE UNIQUE INDEX monitoring_signals_user_mech_value_unique ON monitoring_signals (user_id, mechanism_id, value) WHERE active = true`
- **D-11:** `value text NOT NULL` column kept as-is — still the per-source identifier (subreddit name, keyword, profile URL). One row per source: `num_sources` for burn math is `COUNT(*) WHERE mechanism_id=X AND active=true` per user.
- **D-12:** `frequency` is Postgres `interval`. The 7 documented cadences (`15min`, `30min`, `1h`, `2h`, `4h`, `6h`, `24h`) are enforced **in TS at write time via Zod**, NOT via DB CHECK. PRICING.md §1 may evolve.
- **D-13:** `config jsonb` is **opaque at the DB layer** (no CHECK, no schema validation in Postgres). Per-mechanism Zod schemas live next to mechanism handlers — defined now only for the mechanisms that actually need config (e.g., L4 needs `last_n_posts_to_track`); skipped for trivial ones (R1's `value=subreddit` is enough). Plan-phase decides exact Zod scope.

### Cost engine

- **D-14:** New module `src/features/billing/lib/mechanism-costs.ts` exporting:
  - `getMechanismCost(id: string): Promise<MechanismCost | null>`
  - `getAllMechanismCosts(): Promise<Map<string, MechanismCost>>`
  - `invalidateMechanismCostCache(): void` (test helper)
  - `MechanismCost` type matches the table columns exactly.
- **D-15:** **Module-level Map cache, lazy-loaded once per process.** First call selects all 60 rows into a `Map<mechanism_id, MechanismCost>`; subsequent calls hit memory. Survives across requests on warm Vercel functions. No TTL — data only changes via migration. Matches Phase 02 `module-level Supabase client singleton` and Phase 05 `bulk-load users/signals/accounts` patterns from STATE.md.
- **D-16:** Cadence → scans/day mapping is a **TS const + parser in `credit-burn.ts`**:
  ```
  const SCANS_PER_DAY: Record<CadenceBucket, number> = {
    '15min': 96, '30min': 48, '1h': 24, '2h': 12, '4h': 6, '6h': 4, '24h': 1
  }
  function intervalToCadenceBucket(pgInterval: string): CadenceBucket
  ```
  Frequency stays as Postgres `interval` per PRIC-02; bucketing happens in TS. No `cadence_buckets` table, no `scans_per_day(interval)` SQL function (config-as-code is the project default).
- **D-17:** New `calculateMonitoringBurn` signature:
  ```ts
  calculateMonitoringBurn(signals: Array<{ mechanism_id: string; frequency: string; active: boolean }>): Promise<number>
  ```
  Async because it needs `getMechanismCost`. Unknown `mechanism_id` contributes 0 (fail-safe, mirrors current behavior). E1 signal stacking (`unit_cost=5` cr/day flat) is special-cased: if any active signal has `mechanism_id='E1'`, add 5 cr to total once, regardless of cadence.
- **D-18:** `calculateAccountBurn` and `INCLUDED_ACCOUNTS=2` / `ACCOUNT_COSTS={reddit:3, linkedin:5}` are **untouched** in this phase. Account burn migration to `mechanism_costs` (if ever) is post-v1.2.

### Refactor / deletion scope

- **D-19:** Files **deleted** (clean slate for Phase 22 redesign):
  - `src/app/api/cron/monitor-reddit/route.ts`
  - `src/app/api/cron/monitor-linkedin/route.ts`
  - `src/app/api/cron/monitor-linkedin/route.test.ts`
  - `src/app/(app)/signals/page.tsx`
  - `src/features/monitoring/actions/settings-actions.ts` (and any other action under `src/features/monitoring/actions/` that reads or writes `signal_type`)
  - `src/features/monitoring/components/*` files that import from the deleted page or settings actions (let plan-phase enumerate after grep)
  - `vercel.json` cron entries for `monitor-reddit` (line 18 area) and `monitor-linkedin` (line 46 area)
- **D-20:** Files **rewritten** (must compile after migration):
  - `src/features/billing/lib/credit-burn.ts` — new signature per D-17
  - `src/features/billing/lib/credit-burn.test.ts` — rewrite test inputs around `mechanism_id` instead of `signal_type`
  - `src/features/billing/lib/types.ts` — remove `MONITORING_COSTS` const + `MonitoringSignalType` type; keep `ActionCreditType`, `CREDIT_COSTS`, `ACCOUNT_COSTS`, `INCLUDED_ACCOUNTS`, `PRICING_PLANS`, `CREDIT_PACKS` (Phase 19+ touches those)
  - `src/app/api/cron/credit-burn/route.ts` — change `.select("user_id, signal_type, active")` to `.select("user_id, mechanism_id, frequency, active")`; pass new shape to `calculateMonitoringBurn`
- **D-21:** Any other consumer that grep finds for `signal_type`, `MonitoringSignalType`, `MONITORING_COSTS`, or `signal_source_type` after the migration: refactor or delete. Plan-phase enumerates the final list. Build must be green at end of phase.

### Migration mechanics

- **D-22:** Single sequential migration `supabase/migrations/00024_mechanism_costs.sql` (Phase 15 takes `00023_browser_profiles.sql`; if Phase 15 lands first the number is correct, if Phase 16 lands first this becomes `00023_…` — plan-phase verifies at execute time).
- **D-23:** Migration file order inside the SQL: ENUM → CREATE TABLE mechanism_costs → RLS policies → INSERT 60 seed rows → DELETE FROM monitoring_signals → ALTER TABLE adds → ALTER TABLE drops → DROP TYPE signal_source_type → DROP/RECREATE unique index. Atomic (single transaction).
- **D-24:** Apply on dev branch `effppfiphrykllkpkdbv` first via Supabase Management API (`curl --ssl-no-revoke` per Windows convention, recipe in `reference_supabase_management_api`). Never touch prod (`cmkifdwjunojgigrqwnr`) until v1.2 cutover phase ships.
- **D-25:** Commit scope `feat(16): …`. Two suggested commits (plan-phase decides):
  1. `feat(16): mechanism_costs table + 60-row seed + monitoring_signals rewrite`
  2. `refactor(16): rewrite credit-burn around mechanism_id; delete signal cron routes + UI`

### Claude's Discretion

- **Cache invalidation hook for tests** — plain function export vs `vi.mock` reset is fine; pick whichever is cleanest for the test framework once one is chosen.
- **`description` column population** — copy human label from PRICING.md table cell (e.g., R1 → "Subreddit firehose"). Plan-phase decides exact wording per row.
- **Index design on mechanism_costs** — `mechanism_id` is PK so primary index covers most lookups. Add `idx_mechanism_costs_kind_premium` only if the burn engine or a future query needs it; skip otherwise.
- **Unique index on monitoring_signals** — D-10 step 8 specifies `(user_id, mechanism_id, value) WHERE active = true`. Plan-phase verifies this matches actual write patterns once `settings-actions.ts` deletion clarifies what (if anything) writes to the table during Phase 16.
- **E1 special-casing location** — implement inside `calculateMonitoringBurn` (D-17) or as a separate `calculateSignalStackingBurn` helper. Either is fine; pick what reads cleanest.
- **Whether to keep `src/features/monitoring/` directory at all** — if every file gets deleted, drop the empty dirs. If `__fixtures__` or `lib/` survives, keep them.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pricing spec (binding)

- `.planning/PRICING.md` §1 — cadence → scans/day table (7 buckets); burn formula
- `.planning/PRICING.md` §5 — per-mechanism signal cost matrix (R1–R9, M1–M3, L1–L11, T1–T5, E1, E2, O1, O2) — **source of truth for unit_cost values + premium / requires_gologin flags on signal rows**
- `.planning/PRICING.md` §6 — outbound cost matrix (OR1–OR9, OL1–OL11, OX1–OX8) — **source of truth for unit_cost on outbound rows + free_tier_allowed=false invariant**
- `.planning/PRICING.md` §10 — hard switch / wipe rationale; clean slate ENUM rebuild
- `.planning/PRICING.md` §11 Faza A — implementation phasing for cost engine; this phase implements Faza A (excluding `free_tier_allowed` enforcement which is Faza B / Phase 19+)

### Requirements (locked)

- `.planning/REQUIREMENTS.md` PRIC-01 — `mechanism_costs` table column set + seed coverage (note: row count discrepancy resolved per D-09)
- `.planning/REQUIREMENTS.md` PRIC-02 — `monitoring_signals` rewrite shape
- `.planning/REQUIREMENTS.md` PRIC-03 — server-side burn engine + `MONITORING_COSTS` removal + `getMechanismCost()` cached helper
- `.planning/ROADMAP.md` "Phase 16: Mechanism Cost Engine Schema" — 4 success criteria (criterion #1 to be updated in this phase per D-09)

### Project context

- `.planning/PROJECT.md` "Current Milestone: v1.2 — Survival + Foundation" — Track 2 (Pricing) framing; why Phase 16 unblocks Phases 19, 21, 22
- `CLAUDE.md` §Database — sequential migration naming, RLS-on-every-new-table, `TIMESTAMPTZ DEFAULT now()`, ENUM convention
- `CLAUDE.md` §Environments — apply migrations to dev branch first; `--ssl-no-revoke` on Windows; never run destructive SQL on prod
- `CLAUDE.md` §Critical Rules — service role client server-side only

### Existing code (refactor / delete targets — confirmed via grep)

- `supabase/migrations/00001_enums.sql:37` — `signal_source_type` ENUM (DROP target)
- `supabase/migrations/00002_initial_schema.sql:40-52` — `monitoring_signals` table definition (mutated this phase)
- `supabase/migrations/00022_monitoring_signals_unique.sql` — unique index on `(user_id, signal_type, value)` (DROP + recreate target)
- `src/features/billing/lib/credit-burn.ts` — full rewrite per D-17/D-20
- `src/features/billing/lib/credit-burn.test.ts` — full rewrite
- `src/features/billing/lib/types.ts` — remove `MONITORING_COSTS` + `MonitoringSignalType`
- `src/app/api/cron/credit-burn/route.ts` — line 21 (`signal_type: string`), line 92 (`.select(...)` query) — refactor
- `src/app/api/cron/monitor-reddit/route.ts` — line 82, 87, 90, 93 — **DELETE entire file**
- `src/app/api/cron/monitor-linkedin/route.ts` — lines 109, 137, 147, 150 — **DELETE entire file** (+ test file)
- `src/app/(app)/signals/page.tsx` — lines 33, 41 — **DELETE entire file**
- `src/features/monitoring/actions/settings-actions.ts` — line 66 — **DELETE entire file** (+ any other actions in same dir that touch `signal_type`)
- `vercel.json` — entries for `/api/cron/monitor-reddit` (line 18) + `/api/cron/monitor-linkedin` (line 46) — **DELETE both**

### Project memory (binding for this phase)

- `project_users_are_test_data` — pre-launch wipe is acceptable; no migration backfill needed
- `feedback_dev_branch_no_touch` — never delete/recreate `effppfiphrykllkpkdbv`; apply migrations to it but do not rotate it
- `feedback_supabase_branch_persistence` — branches must remain `persistent:true`
- `reference_supabase_management_api` — curl recipe for migration apply (Windows `--ssl-no-revoke`)
- `feedback_supabase_mocked_tests_mask_column_drift` — after migration, grep every column referenced in code; rewritten tests must NOT mock around the new shape blindly

### Excluded refs (deliberately not loaded)

- `.planning/ANTI-BAN-ARCHITECTURE.md` — Track 1 (Phases 15/17/18) territory; orthogonal to cost engine
- `.planning/SIGNAL-DETECTION-MECHANISMS.md` — runtime mechanism behavior spec; PRICING.md §5 already extracts the cost data this phase needs
- `.planning/OUTBOUND-COMMUNICATION-MECHANISMS.md` — runtime outbound spec; PRICING.md §6 has the costs; Faza F territory
- `.planning/MARKETING.md` — pricing positioning, not implementation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Module-level cached singleton pattern** — Phase 02's Supabase client singleton (referenced in STATE.md decisions) and Phase 05's bulk-load helpers are the prior art for D-15's lazy `Map` cache.
- **RLS policy template** for "authenticated SELECT, no client write" — adapt from `live_stats` (Phase 08 anon SELECT) or `mechanism_costs` will be the first table with this exact "all auth users read, only service role writes" shape — plan-phase verifies.
- **Sequential migration mechanics** — Phase 15 establishes `00023_browser_profiles.sql`; Phase 16 follows with `00024_mechanism_costs.sql` (or `00023_…` if Phase 16 lands first).
- **Zod at API boundaries pattern** (CLAUDE.md §Conventions) — D-13's per-mechanism config validation slots into existing Zod usage.

### Established Patterns

- **`signal_type` is read in 4 active places** beyond the burn engine: monitor-reddit cron, monitor-linkedin cron, signals page, settings actions. All deleted this phase per D-19 → no orphan reads to chase post-migration.
- **`monitoring_signals` writes** currently happen via `settings-actions.ts` and the onboarding wizard (Phase 05). Onboarding wizard write path needs verification in plan-phase — if it inserts `signal_type='reddit_keyword'` etc., it either gets refactored to `mechanism_id='R4'` (or the relevant mapping) OR included in the deletion if the wizard step itself is being rebuilt in Phase 22.
- **Vercel cron entries** in `vercel.json` are simple JSON path/schedule pairs; deletion is just removing the two object entries plus comma cleanup.

### Integration Points

- **`credit-burn` cron route** (`/api/cron/credit-burn/route.ts`) — only consumer of `calculateMonitoringBurn` after deletions; signature change in D-17 cascades exactly here.
- **Onboarding wizard signal seeding** (Phase 05 P02 in STATE.md: "competitor keywords seeded as reddit_keyword signals alongside generated ones") — likely reads/writes `signal_type`. Plan-phase must enumerate; if it writes signals, it's either (a) refactored to write `mechanism_id` or (b) part of the Phase 22 redesign and deleted along with the rest. Decide based on grep.
- **`actions` table** — has `action_type` column today; `mechanism_costs` outbound rows exist for Phase 22+ to wire `actions.mechanism_id` FK. Phase 16 only seeds the rows; no FK added to `actions` here.
- **`live_stats` / dashboard** — currently shows monitoring counts, not burn breakdown (per `feedback_credit_ui_no_burn_math`). No UI cascade from this phase.

</code_context>

<specifics>
## Specific Ideas

- **Migration file:** `supabase/migrations/00024_mechanism_costs.sql` (assuming Phase 15 lands first; otherwise `00023_…`). Single atomic transaction per D-23.
- **Seed format:** `INSERT INTO mechanism_costs (mechanism_id, unit_cost, mechanism_kind, premium, requires_gologin, free_tier_allowed, description) VALUES (...), (...), ...;` — one VALUES list of 60 tuples, grouped by section comments matching PRICING.md §5 / §6 layout for human readability.
- **OL8 cost ambiguity:** seed `unit_cost=20` (with-thoughts variant); split logic deferred to Phase 22 outbound burn engine. Add inline SQL comment.
- **E1 signal stacking cost:** seeded as `mechanism_kind='signal'`, `unit_cost=5`; runtime burn engine adds 5 cr/day flat once if any E1 row is active for the user (D-17 special case).
- **Helper module path:** `src/features/billing/lib/mechanism-costs.ts` (sits next to `credit-burn.ts`, `credit-costs.ts`, `types.ts`).
- **Roadmap edit:** `.planning/ROADMAP.md` line 70, change "27 signal + 28 outbound rows" → "32 signal + 28 outbound rows". Same commit as the seed migration.
- **No new env vars** introduced this phase.

</specifics>

<deferred>
## Deferred Ideas

- **`free_tier_allowed` enforcement at write time** — column is seeded this phase, but the `INSERT INTO monitoring_signals` paths that gate on it land in Phase 19/21 (free tier ENUM + signup flow + UI gating).
- **Outbound cost engine** — `mechanism_kind='outbound'` rows are seeded but no caller reads them yet. Faza F (post v1.2 unless re-prioritized) wires `actions.mechanism_id` FK + `getActionCreditCost(mechanism_id)` + per-action deduction with refund-on-failure semantics.
- **`daily_cap_per_account`, `risk_level`, `execution_method` columns on mechanism_costs** — added when the outbound burn engine consumes them (Faza F / Phase 22+). PRICING.md §6 has all 28 caps when ready.
- **OL8 repost cost split** (`with_thoughts=20cr` / `simple=5cr`) — Phase 22 calibration after first 100 reposts; for now seed the higher value.
- **OC1 sequence orchestration / OC3 variant pool / OC4 reply detection** as `mechanism_kind` rows — Faza G; not in §5/§6 cost tables, all 0 cr.
- **Engage pool cap sharing semantics** (per-platform pools vs cross-platform) — Phase 22 outbound engine decision per PRICING.md §12.
- **Postgres `scans_per_day(interval)` SQL function** — only build when a SQL view or RPC needs server-side burn aggregation; today everything goes through TS engine.
- **CHECK constraint on cadence values** — TS Zod is the gate now; revisit if a non-TS writer ever inserts into `monitoring_signals`.
- **Per-mechanism Zod schemas for `config jsonb`** — only define for mechanisms that actually need config in Phase 22's `/signals` redesign. R1's `value=subreddit` is enough; L4 will need `last_n_posts_to_track` etc.
- **`/signals` UI redesign + 27-mechanism configurator** — Phase 22 (Faza C in PRICING.md §11).
- **Replacement crons for monitor-reddit / monitor-linkedin** — Phase 22 rebuilds these around `mechanism_id` dispatch. Phase 16 deletes; Phase 22 rebuilds. New signal ingestion is paused between the two phases (acceptable per `project_users_are_test_data`).

</deferred>

---

*Phase: 16-mechanism-cost-engine-schema*
*Context gathered: 2026-04-27*
