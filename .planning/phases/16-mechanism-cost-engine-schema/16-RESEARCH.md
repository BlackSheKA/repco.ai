# Phase 16: Mechanism Cost Engine Schema — Research

**Conducted:** 2026-04-27
**Status:** Ready for planning
**Source:** Direct orchestrator research (researcher agent timed out twice on this phase — CONTEXT.md is exceptionally thorough and this RESEARCH.md fills only the gaps the planner needs).

> Decisions D-01..D-25 in CONTEXT.md are LOCKED. This document does not re-litigate them; it provides the concrete code/SQL data the planner needs to write tasks.

---

## 1. Migration Number

**Rule:** Next sequential after the highest existing migration when the migration is committed.

```
ls supabase/migrations/ | tail -5
00018_phase14_quarantine_enforcement.sql
00019_linkedin_source_types.sql
00020_apify_runs.sql
00021_apify_runs_processing_status.sql
00022_monitoring_signals_unique.sql   ← current highest
```

Phase 15 (browser_profiles) is unmerged on `development` and unwritten to disk. **At plan-execute time, the planner's executor must:**

1. `ls supabase/migrations/ | tail -1` immediately before writing the new migration file
2. If `00023_browser_profiles.sql` exists → write `00024_mechanism_costs.sql`
3. Otherwise → write `00023_mechanism_costs.sql`

**Plan should embed this check as a pre-write step**, not hardcode `00024`.

---

## 2. The 60 Seed Rows (verbatim from PRICING.md §5/§6)

### 32 Signal rows (`mechanism_kind='signal'`)

PRICING.md §5 columns: `mechanism_id | description | unit_cost | unit | flags`

| id  | unit_cost | premium | requires_gologin | free_tier_allowed | description |
| --- | --------- | ------- | ---------------- | ----------------- | ----------- |
| R1  | 1  | false | false | true  | Subreddit firehose |
| R2  | 2  | false | false | true  | Post-watch comments (R1-dependent) |
| R3  | 1  | false | false | true  | Competitor mention |
| R4  | 1  | false | false | true  | Question pattern (custom) |
| R5  | 1  | false | false | true  | Tracked user activity |
| R6  | 2  | false | false | true  | Tracked user engagement |
| R7  | 1  | false | true  | true  | Own Reddit engagement (gologin) |
| R8  | 1  | false | true  | true  | Reddit mentions/tags (gologin) |
| R9  | 0  | false | false | true  | Trending posts modifier (free enhancer on R1) |
| M1  | 0  | false | false | true  | Author quality pre-filter (free, default on) |
| M2  | 0  | false | false | true  | Cross-subreddit ICP (free, optional) |
| M3  | 0  | false | false | true  | Subreddit tier multiplier (free, default on) |
| L1  | 1  | false | false | true  | Keyword post search |
| L2  | 1  | false | false | true  | Auto-disc reactions (per scan per active tracked post) |
| L3  | 1  | false | false | true  | Auto-disc comments (per scan per active tracked post) |
| L4  | 1  | false | false | true  | Profile reactions (scales with last_n_posts_to_track) |
| L5  | 1  | false | false | true  | Profile comments (per scan per active post per profile) |
| L6  | 3  | false | true  | true  | Own LinkedIn engagement (gologin) |
| L7  | 1  | false | false | true  | New posts from profile |
| L8  | 1  | false | false | true  | Job change detection (24h cadence) |
| L9  | 1  | false | false | true  | Hiring signals (24h cadence) |
| L10 | 1  | false | true  | true  | Connection requests scan (gologin) |
| L11 | 1  | false | true  | true  | LinkedIn mentions (gologin) |
| T1  | 1  | true  | false | false | Keyword tweet search (X/Twitter premium) |
| T2  | 1  | true  | false | false | Competitor mention X |
| T3  | 2  | true  | false | false | Own tweets engagement (gologin optional) |
| T4  | 3  | true  | false | false | Tracked X profile |
| T5  | 2  | true  | false | false | Trending topic |
| E1  | 5  | false | false | true  | Signal stacking composite (5 cr/day FLAT — special case in burn engine) |
| E2  | 0  | false | false | true  | Negative feedback loop (free, default on) |
| O1  | 0  | false | false | true  | Health monitoring (free infrastructure) |
| O2  | 0  | false | false | true  | Onboarding presets (one-time AI gen, included) |

**Total: 32 signal rows.** Matches D-06 (R1–R9: 9, M1–M3: 3, L1–L11: 11, T1–T5: 5, E1: 1, E2: 1, O1: 1, O2: 1).

**T1–T5 `premium=true`** — X/Twitter tier is post-MVP (per PRICING.md positioning); seed `free_tier_allowed=false` for T-rows.

### 28 Outbound rows (`mechanism_kind='outbound'`, `free_tier_allowed=false` for ALL)

PRICING.md §6 columns: `mechanism_id | description | unit_cost | daily_cap | risk | execution_method`

| id   | unit_cost | premium | requires_gologin | description |
| ---- | --------- | ------- | ---------------- | ----------- |
| OR1  | 30 | false | true  | Reddit DM (Haiku CU) |
| OR2  | 15 | false | true  | Top-level comment (Haiku CU) |
| OR3  | 15 | false | true  | Reply to comment (Haiku CU) |
| OR4  | 0  | false | true  | Upvote (DOM, engage pool) |
| OR5  | 0  | false | true  | Downvote (UI hidden — seed unit_cost=0) |
| OR6  | 30 | false | true  | Submit own post (DOM) |
| OR7  | 10 | false | true  | Crosspost (Haiku CU) |
| OR8  | 0  | false | true  | User follow (DOM) |
| OR9  | 0  | false | true  | Subreddit join (DOM) |
| OL1  | 20 | false | true  | LinkedIn connection request with note (URL-hack + DOM) |
| OL2  | 30 | false | true  | LinkedIn DM 1° connection (DOM) |
| OL3  | 0  | true  | true  | InMail (post-MVP TBD — seed unit_cost=0, premium=true) |
| OL4  | 0  | false | true  | Reaction (DOM, engage pool) |
| OL5  | 15 | false | true  | LinkedIn top-level comment (DOM) |
| OL6  | 15 | false | true  | LinkedIn reply (Haiku CU) |
| OL7  | 0  | false | true  | Profile follow (DOM, engage pool) |
| OL8  | 20 | false | true  | Repost — seed HIGHER value (with-thoughts variant); D-08 split deferred to Phase 22 |
| OL9  | 25 | false | true  | LinkedIn original post publish (DOM) |
| OL10 | 0  | false | true  | Endorse skill (DOM) |
| OL11 | 30 | false | true  | Recommendation request/write (Haiku CU) |
| OX1  | 10 | true  | true  | X reply (DOM) |
| OX2  | 15 | true  | true  | X quote tweet (DOM) |
| OX3  | 0  | true  | true  | X like (DOM, engage pool) |
| OX4  | 5  | true  | true  | X retweet simple (DOM) |
| OX5  | 25 | true  | true  | X DM (DOM) |
| OX6  | 0  | true  | true  | X follow profile (DOM, engage pool) |
| OX7  | 20 | true  | true  | X original tweet (DOM/Haiku CU) |
| OX8  | 5  | true  | true  | X list add (Haiku CU) |

**Total: 28 outbound rows.** OR9 + OL11 + OX8 = 9 + 11 + 8 (matches D-07).

**Special-case notes for SQL comments:**
- `OR5` (Downvote): UI hidden — `unit_cost=0` is a placeholder; flag with `-- hard exclude (UI hidden)`
- `OL3` (InMail): TBD post-MVP — `unit_cost=0`, `premium=true`; flag as TODO
- `OL8` (Repost): split deferred — seed `unit_cost=20`; flag with `-- D-08: split (with-thoughts=20 / simple=5) deferred to Phase 22`
- `OX1–OX8` `premium=true` (X tier post-MVP)
- All outbound rows: `free_tier_allowed=false` (PRICING.md §6 invariant per D-07)
- All outbound rows: `requires_gologin=true` (every outbound action runs through a managed browser per anti-ban architecture)

---

## 3. Grep Enumeration (LIVE src/ tree, worktrees excluded)

### `signal_type` / `MonitoringSignalType` / `MONITORING_COSTS` / `signal_source_type` references

| File | Lines | Classification | Notes |
| ---- | ----- | -------------- | ----- |
| `src/features/billing/lib/types.ts` | 20, 27 | **REWRITE** | Remove `MonitoringSignalType` type + `MONITORING_COSTS` const (D-20) |
| `src/features/billing/lib/credit-burn.ts` | 4, 6, 10, 29 | **REWRITE** | New signature per D-17 |
| `src/features/billing/lib/credit-burn.test.ts` | 12, 13, 14, 21, 32, 33, 79 | **REWRITE** | Rewrite around `mechanism_id` (D-20) |
| `src/app/api/cron/credit-burn/route.ts` | 21, 92 | **REFACTOR** | `.select(...)` → `mechanism_id, frequency, active`; pass new shape to `calculateMonitoringBurn` (D-20) |
| `src/app/api/cron/monitor-reddit/route.ts` | 82, 87, 90, 93 | **DELETE FILE** | D-19 |
| `src/app/api/cron/monitor-linkedin/route.ts` | 109, 137, 147, 150 | **DELETE FILE** | D-19 |
| `src/app/api/cron/monitor-linkedin/route.test.ts` | 35, 50, 71, 75, 204, 205 | **DELETE FILE** | D-19 (test for deleted route) |
| `src/app/(app)/signals/page.tsx` | 33, 41 | **DELETE FILE** | D-19 |
| `src/features/monitoring/actions/settings-actions.ts` | 66, 72, 92 | **DELETE FILE** | D-19 |
| `src/features/monitoring/components/sources-panel.tsx` | (imports settings-actions) | **DELETE FILE** | Orphaned by signals/page.tsx + settings-actions deletion (only consumer is the deleted page) |
| `src/features/monitoring/lib/classification-pipeline.ts` | 206, 211, 214 | **REFACTOR** ⚠ | NOT in CONTEXT.md D-19 list. Imported by `webhooks/apify/route.ts` and `monitor-*` crons. Refactor `signal_type` → `mechanism_id`; map `'reddit_keyword' → 'R3'` (competitor mention) or `'R4'` (question pattern), `'competitor' → 'R3'`. **Planner: confirm exact mapping with grep of how the filtered values are used downstream.** |
| `src/features/onboarding/actions/save-onboarding.ts` | 71, 77 | **REFACTOR** ⚠ | Onboarding writes `signal_type: 'reddit_keyword'` and `signal_type: 'subreddit'`. Map to mechanism_ids: `'subreddit' → 'R1'` (Subreddit firehose), `'reddit_keyword' → 'R3'` (Competitor mention) — based on closest semantic match in PRICING.md §5. Also write `frequency: '6 hours'::interval` (default) and `mechanism_id` instead. **Planner: pick exact mapping.** |
| `supabase/migrations/00001_enums.sql` | line 37 (`signal_source_type`) | **DROP** in new migration | D-23: `DROP TYPE signal_source_type` |
| `supabase/migrations/00019_linkedin_source_types.sql` | (extends ENUM) | **HISTORICAL** — leave as-is | Old migrations stay; the new migration drops the type |
| `supabase/migrations/00022_monitoring_signals_unique.sql` | (unique index) | **DROP + RECREATE** | D-10 step 8 |
| `supabase/migrations/00002_initial_schema.sql` | `monitoring_signals` table | **MUTATED** by new migration | Original CREATE stays; new migration ALTERs |

**Files NOT requiring touches in this phase (despite living under `src/features/monitoring/`):**
- `src/features/monitoring/lib/reddit-adapter.ts`
- `src/features/monitoring/lib/linkedin-adapter.ts`
- `src/features/monitoring/lib/ingestion-pipeline.ts`
- `src/features/monitoring/lib/linkedin-ingestion-pipeline.ts`
- `src/features/monitoring/lib/linkedin-canary.ts`
- `src/features/monitoring/lib/structural-matcher.ts`
- `src/features/monitoring/lib/types.ts`
- `src/features/monitoring/__fixtures__/*`

These are still consumed by `src/app/api/webhooks/apify/route.ts` and `src/app/api/scan/route.ts`. **They must NOT be deleted, even if their `monitor-*` cron callers are.** CONTEXT.md D-19 is correct in listing only the cron route files (not the lib/ directory).

### Cross-cutting consumer warning

`src/app/api/webhooks/apify/route.ts` imports:
- `runIngestionForUser` (NOT deleted)
- `classifyPendingSignals` (REFACTOR — uses `signal_type`)
- adapters / pipelines (NOT deleted)

`src/app/api/scan/route.ts` imports:
- `matchPost` (NOT deleted)

→ Build will only stay green if `classification-pipeline.ts` is refactored, not deleted.

---

## 4. Existing Unique Index (exact)

**File:** `supabase/migrations/00022_monitoring_signals_unique.sql`

```sql
CREATE UNIQUE INDEX monitoring_signals_user_type_value_unique
  ON monitoring_signals (user_id, signal_type, value)
  WHERE active = true;
```

**Replacement (in new migration):**

```sql
DROP INDEX monitoring_signals_user_type_value_unique;

CREATE UNIQUE INDEX monitoring_signals_user_mech_value_unique
  ON monitoring_signals (user_id, mechanism_id, value)
  WHERE active = true;
```

**Order constraint:** Must DROP the index BEFORE `DROP COLUMN signal_type` (otherwise the index references a non-existent column and the ALTER will fail).

---

## 5. RLS Policy SQL for `mechanism_costs`

**Pattern:** "All authenticated users SELECT; no client INSERT/UPDATE/DELETE." Closest analog in repo is `live_stats` (Phase 08) which has anon SELECT — a tighter pattern. For this phase use:

```sql
ALTER TABLE mechanism_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mechanism_costs_select_authenticated"
  ON mechanism_costs
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies.
-- With RLS enabled and no policies for those operations, all client-side writes are denied.
-- Service role bypasses RLS, so seed/migration-driven writes work.
```

Verify in plan-checker: `pg_policies` should show exactly 1 policy on `mechanism_costs` after migration.

---

## 6. Test Framework Status

`package.json` (read at orchestrator time):

- `"test": "vitest run"`, `"test:watch": "vitest"`
- devDeps: `vitest@^4.1.4`, `@vitest/ui`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`
- Existing test: `src/features/billing/lib/credit-burn.test.ts` uses `import { describe, it, expect } from "vitest"` — **vitest is the project test framework.**

**CLAUDE.md "No test framework configured yet" is stale** — the planner should treat vitest as the active framework. The credit-burn rewrite (D-20) keeps `.test.ts` co-located. Cache invalidation in tests via plain function export `invalidateMechanismCostCache()` (D-14) — no `vi.mock` needed for the helper itself; tests `import { invalidateMechanismCostCache } from "./mechanism-costs"` and call it in `beforeEach`.

For Supabase mocking inside `mechanism-costs.test.ts`, follow the pattern in `credit-burn.test.ts` siblings (none of which mock Supabase — all current tests are pure). The new test will need a Supabase mock; recommend module-level `vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))` with the mock returning `{ from: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: SEED, error: null }) }) }`. **Project memory `feedback_supabase_mocked_tests_mask_column_drift` applies** — mocked tests must not paper over column shape. The test fixture `SEED` MUST include every column from the migration's `CREATE TABLE`.

---

## 7. Cache Invalidation Pattern

**Project precedent:** No existing module-level cache helper exports a `reset()` function in the live codebase (the Supabase server client uses Next's per-request `cookies()` so it's already per-request). This is a new pattern.

**Recommended shape** (matches D-14):

```ts
// src/features/billing/lib/mechanism-costs.ts
let _cache: Map<string, MechanismCost> | null = null

export async function getAllMechanismCosts(): Promise<Map<string, MechanismCost>> {
  if (_cache) return _cache
  const supabase = createServiceRoleClient()  // service role: read-only is fine, RLS bypass not strictly needed but consistent
  const { data, error } = await supabase.from("mechanism_costs").select("*")
  if (error) throw new Error(`mechanism_costs lookup failed: ${error.message}`)
  _cache = new Map(data.map((row) => [row.mechanism_id, row]))
  return _cache
}

export async function getMechanismCost(id: string): Promise<MechanismCost | null> {
  const map = await getAllMechanismCosts()
  return map.get(id) ?? null
}

export function invalidateMechanismCostCache(): void {
  _cache = null
}
```

**Client choice:** `createClient()` (the SSR/route handler client, NOT service role) is sufficient since RLS allows authenticated SELECT. But for cron routes that already use service role, calling `getMechanismCost` from a service-role context still works because service role also has SELECT. **Planner decision: use the regular SSR client; service-role-only is overkill for a public-readable lookup table.**

---

## 8. Cross-Feature Import Audit (for deletion side-effects)

`grep "from \"@/features/monitoring" src/`:

| Importer | Imports | Action |
| -------- | ------- | ------ |
| `src/app/(app)/signals/page.tsx` | `SourcesPanel` from components | **Page itself is deleted** — no fix needed |
| `src/features/monitoring/components/sources-panel.tsx` | `*` from `actions/settings-actions` | **Component itself is deleted** alongside actions |
| `src/app/api/cron/monitor-reddit/route.ts` | `runIngestionForUser`, `classifyPendingSignals`, `startAsyncSearch`, `MonitoringConfig` | **Route itself is deleted** |
| `src/app/api/cron/monitor-linkedin/route.ts` | `runCanaryCheck`, `runLinkedInIngestionForUser`, `classifyPendingSignals`, linkedin-adapter, `MonitoringConfig` | **Route itself is deleted** |
| `src/app/api/webhooks/apify/route.ts` | `*` from reddit-adapter, linkedin-adapter, ingestion-pipeline, linkedin-ingestion-pipeline, `classifyPendingSignals` | **STAYS** — webhooks/apify must keep building. `classifyPendingSignals` must be refactored, not deleted. |
| `src/app/api/scan/route.ts` | `matchPost` from structural-matcher | **STAYS** — no signal_type usage |

**`src/features/dashboard/components/agent-card.tsx`** (modified per git status): `Grep` for `signal` / `monitoring` shows no imports of the monitoring feature. No cascade.

**Empty directory cleanup:**
- `src/features/monitoring/actions/` becomes empty after `settings-actions.ts` deletion → remove the directory (Discretion bullet in CONTEXT.md).
- `src/features/monitoring/components/` becomes empty after `sources-panel.tsx` deletion → remove the directory.
- `src/features/monitoring/lib/` and `src/features/monitoring/__fixtures__/` survive intact.

---

## 9. Dev Branch Migration Apply Recipe (Windows)

Reference: project memory `reference_supabase_management_api`. PowerShell-friendly form:

```powershell
$SUPABASE_PAT = $env:SUPABASE_ACCESS_TOKEN  # already in user env per CLAUDE.md
$DEV_REF = "effppfiphrykllkpkdbv"
$MIGRATION_FILE = "supabase/migrations/00024_mechanism_costs.sql"  # or 00023_… per §1 rule

# Read SQL, escape for JSON
$sql = Get-Content -Raw $MIGRATION_FILE
$body = @{ query = $sql } | ConvertTo-Json -Depth 5 -Compress

# Apply
curl --ssl-no-revoke -X POST `
  "https://api.supabase.com/v1/projects/$DEV_REF/database/query" `
  -H "Authorization: Bearer $SUPABASE_PAT" `
  -H "Content-Type: application/json" `
  -d "$body"
```

**Bash equivalent (Git Bash on Windows):**

```bash
SUPABASE_PAT="$SUPABASE_ACCESS_TOKEN"
DEV_REF="effppfiphrykllkpkdbv"
MIGRATION_FILE="supabase/migrations/00024_mechanism_costs.sql"

# Use jq to escape SQL
BODY=$(jq -n --arg q "$(cat "$MIGRATION_FILE")" '{query: $q}')

curl --ssl-no-revoke -X POST \
  "https://api.supabase.com/v1/projects/$DEV_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

**Hard rules (project memory):**
- NEVER target prod ref `cmkifdwjunojgigrqwnr` in this phase
- NEVER delete/recreate dev branch `effppfiphrykllkpkdbv` (`feedback_dev_branch_no_touch`)
- Branches stay `persistent:true` (`feedback_supabase_branch_persistence`)

**Verification after apply:**

```bash
# Count seed rows
curl --ssl-no-revoke -X POST \
  "https://api.supabase.com/v1/projects/$DEV_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT mechanism_kind, COUNT(*) FROM mechanism_costs GROUP BY mechanism_kind ORDER BY mechanism_kind;"}'
# Expected: signal=32, outbound=28
```

---

## 10. Roadmap Edit Required (D-09)

**File:** `.planning/ROADMAP.md` — Phase 16 success criterion #1.

**Current text (line ~70 of the file, exact line confirmed in CONTEXT.md):**
> 1. `mechanism_costs` table exists and is seeded with all 27 signal + 28 outbound rows matching `PRICING.md` §5/§6 …

**Replacement:**
> 1. `mechanism_costs` table exists and is seeded with all 32 signal + 28 outbound rows matching `PRICING.md` §5/§6 …

Same commit as the seed migration (D-09 / D-25 commit 1).

---

## Validation Architecture

> Required by Nyquist gate. Every invariant below must be testable; the planner converts these into explicit `acceptance_criteria` lines on plan tasks and a `must_haves` block on each PLAN.md.

### DB invariants (verified via Supabase Management API after `db push` to dev branch)

- `SELECT COUNT(*) FROM mechanism_costs WHERE mechanism_kind='signal'` returns **32**
- `SELECT COUNT(*) FROM mechanism_costs WHERE mechanism_kind='outbound'` returns **28**
- `SELECT COUNT(*) FROM mechanism_costs` returns **60**
- Per-prefix counts match: R*=9, M*=3, L*=11, T*=5, E*=2, O*=2 (signals); OR*=9, OL*=11, OX*=8 (outbound)
- `pg_type` contains `mechanism_kind_enum` with values `('signal','outbound')`
- `pg_type` does NOT contain `signal_source_type`
- `information_schema.columns` for `monitoring_signals` shows `frequency interval NOT NULL`, `mechanism_id text NOT NULL`, `config jsonb NOT NULL`; does NOT show `signal_type` or `credits_per_day`
- Foreign key `monitoring_signals.mechanism_id` → `mechanism_costs.mechanism_id` exists with `ON DELETE RESTRICT`
- `pg_indexes` shows `monitoring_signals_user_mech_value_unique` (PARTIAL `WHERE active = true`); does NOT show `monitoring_signals_user_type_value_unique`
- `pg_policies` shows exactly one policy on `mechanism_costs` (`SELECT TO authenticated USING (true)`)
- `SELECT * FROM monitoring_signals` returns 0 rows (post-wipe per D-10)

### Code invariants (verified via grep + build)

- `grep -r "MONITORING_COSTS" src/` → 0 hits
- `grep -r "MonitoringSignalType" src/` → 0 hits
- `grep -r "signal_type" src/` → 0 hits (NB: `mechanism_kind` is fine; `signal_type` literal must be gone)
- `grep -r "signal_source_type" src/ supabase/migrations/00024*` → 0 hits in src/; 1 expected hit in the new migration (the `DROP TYPE` statement). `supabase/migrations/00001_enums.sql` and `supabase/migrations/00019_linkedin_source_types.sql` keep their historical references — those are immutable ledger entries.
- `pnpm typecheck` → exit code 0
- `pnpm lint` → exit code 0
- `pnpm build` → exit code 0
- `src/features/billing/lib/mechanism-costs.ts` exists and exports `getMechanismCost`, `getAllMechanismCosts`, `invalidateMechanismCostCache`, `MechanismCost` type
- `src/app/api/cron/monitor-reddit/`, `src/app/api/cron/monitor-linkedin/`, `src/app/(app)/signals/`, `src/features/monitoring/actions/`, `src/features/monitoring/components/` directories do NOT exist (post-deletion)
- `vercel.json` does NOT contain `/api/cron/monitor-reddit` or `/api/cron/monitor-linkedin`
- `.planning/ROADMAP.md` Phase 16 criterion #1 contains the literal string `"32 signal + 28 outbound"`

### Cost engine invariants (verified via vitest)

- `calculateMonitoringBurn([{ mechanism_id: 'R1', frequency: '6 hours', active: true }])` returns `1 × 4 × 1 = 4` (R1 unit_cost=1, 6h cadence = 4 scans/day, 1 source) — matches PRICING.md §1 example
- `calculateMonitoringBurn([{ mechanism_id: 'R1', frequency: '1 hour', active: true }, ...×2])` returns `1 × 24 × 2 = 48` (R1 × 1h × 2 sources)
- E1 special case: `calculateMonitoringBurn([{ mechanism_id: 'E1', frequency: '6 hours', active: true }])` returns `5` flat (regardless of cadence)
- E1 + others: `calculateMonitoringBurn([{R1,6h}, {E1,6h}])` returns `4 + 5 = 9`
- Inactive signals contribute 0
- Unknown `mechanism_id` contributes 0 (fail-safe per D-17)
- Empty input returns 0
- 7 cadence buckets parse correctly: `'15 minutes'→96`, `'30 minutes'→48`, `'1 hour'→24`, `'2 hours'→12`, `'4 hours'→6`, `'6 hours'→4`, `'24 hours'→1` (Postgres interval literal forms)
- `getMechanismCost('R1')` returns full row; second invocation hits cache (assert via mock counter — exactly 1 `from('mechanism_costs')` call across N invocations)
- `invalidateMechanismCostCache()` then `getMechanismCost('R1')` triggers exactly 1 additional DB call

### Cron route invariants

- `src/app/api/cron/credit-burn/route.ts` selects `user_id, mechanism_id, frequency, active` (NOT `signal_type`)
- Route still passes `await logger.flush()` before response (CLAUDE.md cron pattern)

### Refactor invariants

- `src/features/onboarding/actions/save-onboarding.ts` writes `mechanism_id` (mapped per §3 above) and `frequency` (default `'6 hours'`) instead of `signal_type`
- `src/features/monitoring/lib/classification-pipeline.ts` uses `mechanism_id` filters (mapped per §3) instead of `signal_type` filters
- `src/app/api/webhooks/apify/route.ts` builds and runs end-to-end (smoke test: hit a test webhook endpoint or rely on TS compile)

---

## Open Questions for Planner

1. **Onboarding `reddit_keyword` mapping** — does it map to `R3` (Competitor mention) or `R4` (Question pattern (custom))? §3 picks `R3` based on semantics; planner should confirm by reading what the cron route actually does with these signals (or accept `R3` as the working default — Phase 22 redesigns this anyway).
2. **`classification-pipeline.ts` filter mapping** — same question for `'reddit_keyword'` and `'competitor'` filters at lines 211/214. Confirm mapping with the actual data flow.
3. **Whether `mechanism-costs.ts` uses SSR client or service-role client** — recommend SSR (regular `createClient()` from `@/lib/supabase/server`) since the table is RLS-readable to all authenticated users. Service-role would still work but adds unnecessary privilege.
4. **Commit split (D-25)** — two commits suggested: (a) migration + seed + types removal + roadmap edit, (b) refactor of credit-burn + cron route + classification-pipeline + onboarding + deletions. Planner picks final boundary; the line is "what's needed to get the schema deployed" vs "what's needed to make build green again."

---

## RESEARCH COMPLETE

Phase 16 RESEARCH.md ready. Key findings: 60-row seed table extracted verbatim from PRICING.md §5/§6; full grep enumeration of `signal_type` consumers (12 active src/ files classified DELETE/REWRITE/REFACTOR); cross-feature import audit confirms `monitoring/lib/*` must stay (consumed by webhooks/apify); migration recipe + RLS SQL + cache pattern + validation invariants ready for planner. Two consumers NOT in CONTEXT.md D-19 list flagged for REFACTOR: `classification-pipeline.ts` and `save-onboarding.ts`.
