# Phase 16: Mechanism Cost Engine Schema - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 16-mechanism-cost-engine-schema
**Areas discussed:** Cost column shape, Signals rewrite strategy, Outbound metadata scope, Cache strategy, Cadence map, Config jsonb validation, Source count semantics, Legacy column treatment, mechanism_id type, Seed set size, Roadmap criterion fix, Refactor / deletion scope

---

## Cost column

| Option | Description | Selected |
|--------|-------------|----------|
| Unified unit_cost + mechanism_kind | Single `unit_cost integer NOT NULL` column with `mechanism_kind ENUM('signal','outbound')` discriminator | ✓ |
| Two nullable cols cr_per_scan + cr_per_action | Literal column names from ROADMAP; CHECK constraint enforces XOR | |
| Single cost + virtual generated columns | `unit_cost` + GENERATED `cr_per_scan` / `cr_per_action` mirror columns | |

**User's choice:** Unified unit_cost + mechanism_kind
**Notes:** Cleanest for queries; PRICING.md always has exactly one cost number per row.

---

## Signals rewrite

| Option | Description | Selected |
|--------|-------------|----------|
| Wipe + drop ENUM (Phase 15 precedent) | DELETE rows in-migration, ADD new cols, DROP signal_type, DROP TYPE signal_source_type, DROP credits_per_day | ✓ |
| Backfill mapping then drop | Add nullable, map subreddit→R1 / reddit_keyword→R4 / etc., backfill, then NOT NULL + DROP | |
| Wipe rows, keep ENUM column for now | DELETE rows + add new cols but defer DROP signal_type | |

**User's choice:** Wipe + drop ENUM (Phase 15 precedent)
**Notes:** Test data only; Phase 15 D-06 + project_users_are_test_data both apply.

---

## Outbound scope

| Option | Description | Selected |
|--------|-------------|----------|
| Cost + flags only (minimum for PRIC-01) | mechanism_id, unit_cost, mechanism_kind, premium, requires_gologin, free_tier_allowed | ✓ |
| Cost + flags + daily_cap_per_account | Add cap column now since PRICING.md §6 has all 28 values | |
| Full outbound metadata now | Add cap + risk_level + execution_method ENUMs | |

**User's choice:** Cost + flags only (minimum for PRIC-01)
**Notes:** Phase 22+ adds metadata when outbound burn engine consumes it.

---

## Cache shape

| Option | Description | Selected |
|--------|-------------|----------|
| Module-level Map, lazy-load all rows once per process | First call SELECTs ~60 rows; subsequent calls hit memory; survives across requests on warm Vercel functions | ✓ |
| React cache() per request | Dedupes within render/request, reloads per cron tick | |
| No cache — query per call | Plain SELECT per getMechanismCost(id) | |

**User's choice:** Module-level Map, lazy-load all rows once per process
**Notes:** Matches Phase 02 singleton pattern + Phase 05 bulk-load decisions in STATE.md; data only changes via migration so no TTL needed.

---

## Cadence map

| Option | Description | Selected |
|--------|-------------|----------|
| TS const in credit-burn.ts | SCANS_PER_DAY const + intervalToCadenceBucket(pgInterval) parser | ✓ |
| Postgres function scans_per_day(interval) | SQL function for server-side burn aggregation | |
| Add cadence_buckets lookup table | 7-row table + FK from monitoring_signals | |

**User's choice:** TS const in credit-burn.ts
**Notes:** Config-as-code default; 7 fixed buckets need no DB round-trip.

---

## Config jsonb

| Option | Description | Selected |
|--------|-------------|----------|
| Pure jsonb, validate in TS via Zod per mechanism | DB column is jsonb NOT NULL DEFAULT '{}', Zod schemas live next to handlers | ✓ |
| jsonb + CHECK requiring non-empty for known keys | Per-mechanism CHECK constraints in DB | |
| Per-mechanism columns, no jsonb | Typed columns for last_n_posts, window_days, soft_cap, etc. | |

**User's choice:** Pure jsonb, validate in TS via Zod per mechanism
**Notes:** Schema can evolve per mechanism without migrations.

---

## Source count

| Option | Description | Selected |
|--------|-------------|----------|
| One row per source, num_sources = COUNT(*) | User adds 3 subreddits = 3 rows; burn = unit_cost × scans/day × COUNT | ✓ |
| One row per mechanism, num_sources in config | Single R1 row with config={subreddits:[…]}; jsonb_array_length() | |

**User's choice:** One row per source, num_sources = COUNT(*)
**Notes:** Mirrors current shape; preserves the 00022 unique constraint semantics.

---

## Old col

| Option | Description | Selected |
|--------|-------------|----------|
| DROP it in this migration | credits_per_day removed; burn derives from mechanism_costs | ✓ |
| Keep as denormalized cache, populate from trigger | Trigger writes computed value on insert/update | |

**User's choice:** DROP it in this migration
**Notes:** Same posture as Phase 15 D-05 (drop legacy columns aggressively).

---

## ID type

| Option | Description | Selected |
|--------|-------------|----------|
| text PK with format 'R1','OL2','M1' literal | Matches PRICING.md notation 1:1 | ✓ |
| Add CHECK constraint matching ^[A-Z]+[0-9]+$ | text PK + format guard | |
| Separate enum mechanism_id_enum + text label | Postgres ENUM with all 55 values | |

**User's choice:** text PK with format 'R1','OL2','M1' literal
**Notes:** No CHECK regex; typos surface when seed/FK fails.

---

## Seed set

| Option | Description | Selected |
|--------|-------------|----------|
| All 28 from R/M/L/T tables | R1-R9, M1-M3, L1-L11, T1-T5 | |
| Roadmap-literal 27 — confirm which to drop | Stick to 27 | |
| All 28 + E1/E2/O1/O2 enhancements (32 total) | Maximally complete | ✓ |

**User's choice:** All 28 + E1/E2/O1/O2 enhancements (32 total)
**Notes:** Total signal rows = 32; with 28 outbound = 60 rows. Roadmap success criterion #1 ("27 + 28") is now stale → fix in same commit.

---

## Roadmap fix

| Option | Description | Selected |
|--------|-------------|----------|
| Update roadmap success criterion in same commit | Edit ROADMAP.md Phase 16 criterion #1 to "32 signal + 28 outbound rows" | ✓ |
| Leave roadmap unchanged, note discrepancy in CONTEXT.md | Capture as superseded note | |

**User's choice:** Update roadmap success criterion in same commit

---

## Refactor scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full refactor — burn engine + cron readers + UI + tests | All callers migrate to mechanism_id reads | |
| Burn engine + tests only; cron/UI in follow-up phase | Burn refactor; cron/UI deferred | |
| Full refactor + delete monitor-reddit/linkedin entirely | Phase 22 rebuilds the crons | ✓ |

**User's choice:** Full refactor + delete monitor-reddit/linkedin entirely

---

## Delete scope

| Option | Description | Selected |
|--------|-------------|----------|
| Delete cron routes only; refactor settings + UI | Cron + tests + vercel.json gone; settings + signals page refactored | |
| Delete crons + UI + settings (full clean slate) | Wipe everything signal-related; Phase 22 rebuilds end-to-end | ✓ |
| Delete crons + signals UI page; keep settings actions | Routes + UI gone; settings stays for tests | |

**User's choice:** Delete crons + UI + settings (full clean slate)
**Notes:** New signal ingestion paused between Phase 16 and Phase 22 — acceptable per project_users_are_test_data.

---

## Claude's Discretion

- Cache invalidation hook for tests
- `description` column wording per row
- Index design beyond PK
- Final unique-index column set after settings-actions deletion
- E1 special-casing location (inside calculateMonitoringBurn vs separate helper)
- Whether to keep `src/features/monitoring/` directory after deletions

## Deferred Ideas

- `free_tier_allowed` enforcement (Phase 19/21)
- Outbound burn engine wiring (Faza F)
- `daily_cap_per_account`, `risk_level`, `execution_method` columns (Phase 22+)
- OL8 repost cost split calibration (Phase 22)
- OC1/OC3/OC4 mechanism rows (Faza G)
- Engage pool cap semantics (Phase 22)
- Postgres scans_per_day(interval) SQL function
- CHECK constraint on cadence values
- Per-mechanism config Zod schemas (Phase 22)
- /signals UI redesign (Phase 22)
- Replacement monitor-reddit / monitor-linkedin crons (Phase 22)
