# Phase 15: Browser Profile Schema Foundation - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

A new schema layer exists where one residential proxy maps to one GoLogin profile, which in turn owns multiple social accounts (max one per platform). All existing code reads accounts' GoLogin identity through this new layer.

In scope:
- `browser_profiles` table (RLS-enabled, BPRX-01 column set only)
- `social_accounts` rewrite: add `browser_profile_id`, drop legacy `gologin_profile_id` + `proxy_id`, add unique `(browser_profile_id, platform)` constraint
- Refactor reads in `worker.ts`, `account-actions.ts`, `account-card.tsx`, `accounts/lib/types.ts`, `cron/check-replies/route.ts`, `cron/linkedin-prescreen/route.ts`, `worker-*.test.ts`, `route.test.ts` to go through the new layer
- One-time wipe of existing `social_accounts` rows in the same migration (test data only)

Out of scope (other phases):
- Allocator logic / GoLogin REST calls (Phase 17)
- Cookies jar column + persistence (Phase 18)
- Pre-action preflight + ban detection (Phase 18)
- `auth.users` wipe (Phase 20)
- Any UX changes (no new "Dodaj konto" flow yet — allocator lands in Phase 17)

</domain>

<decisions>
## Implementation Decisions

### Schema

- **D-01:** `browser_profiles` columns are strictly the BPRX-01 set: `id uuid PK`, `user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE`, `gologin_profile_id text UNIQUE NOT NULL`, `gologin_proxy_id text UNIQUE NOT NULL`, `country_code text NOT NULL`, `timezone text NOT NULL`, `locale text NOT NULL`, `display_name text`, `created_at timestamptz DEFAULT now()`. No forward-looking columns. `cookies_jar` lands in Phase 18's own migration; `last_used_at` / `fingerprint_patched_at` only when their phases need them.
- **D-02:** FK `browser_profiles.user_id → public.users(id)` (project convention — matches every other table and keeps RLS uniform). Anti-ban doc's `auth.users(id)` reference overridden here; rest of repo references `public.users`.
- **D-03:** `social_accounts.browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE` is **nullable**. Even though we wipe existing rows in the same migration, nullable keeps inserts during Phase 16 safe before the Phase 17 allocator exists.
- **D-04:** Unique constraint `one_account_per_platform UNIQUE (browser_profile_id, platform)` enforces "max 1 account per platform per profile". A NULL `browser_profile_id` is allowed (Postgres treats NULL as distinct in unique constraints).
- **D-05:** Drop `social_accounts.gologin_profile_id` and `social_accounts.proxy_id` in this migration. Strict reading of success criterion #3, no rollback risk (test data only). Pairs with refactor of all 9 reading files in the same phase.
- **D-06:** Migration also wipes existing `social_accounts` rows: `DELETE FROM social_accounts;` before adding `browser_profile_id` + dropping legacy columns. 8 dev-branch test rows are intentionally discarded; user reconnects after Phase 17 ships the allocator. `auth.users` is NOT touched here (Phase 20's job).
- **D-07:** RLS on `browser_profiles`: owner-only (`auth.uid() = user_id`) for SELECT/INSERT/UPDATE/DELETE. Same pattern as `social_accounts`.

### Code refactor

- **D-08:** Introduce `src/features/browser-profiles/lib/get-browser-profile.ts` exporting `getBrowserProfileForAccount(accountId, supabase)` and `getBrowserProfileById(browserProfileId, supabase)`. Returns `{ id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name }`. Throws or returns `null` consistently when missing — TBD in plan-phase based on call site needs.
- **D-09:** All 9 files reading legacy columns refactor to call the helper or pass `browser_profile_id` through. Inline JOINs allowed only inside the helper.
- **D-10:** `SocialAccount` type in `src/features/accounts/lib/types.ts` loses `gologin_profile_id` and `proxy_id`, gains `browser_profile_id: string | null`. Hydrated `SocialAccountWithProfile` (or similar) is what consumers receive after the helper resolves.

### Migration mechanics

- **D-11:** Single sequential migration file `supabase/migrations/00023_browser_profiles.sql` (matches naming convention `00001_`, `00002_`…). Contains: enum/extension prereqs (none), `CREATE TABLE browser_profiles`, RLS policies, `DELETE FROM social_accounts`, `ALTER TABLE social_accounts ADD COLUMN browser_profile_id`, `ADD CONSTRAINT one_account_per_platform`, `DROP COLUMN gologin_profile_id`, `DROP COLUMN proxy_id`.
- **D-12:** Apply on dev Supabase branch `effppfiphrykllkpkdbv` first via Supabase Management API (curl + `--ssl-no-revoke` per Windows convention). Never touch production until Phase 22 ships and we're ready to cut over.
- **D-13:** Commit message scope is `15` per repo convention: `feat(15): browser_profiles schema + social_accounts rewrite`.

### Claude's Discretion

- Helper return shape (throw vs return null when account has no browser_profile_id) — pick the one that minimizes call-site noise; document in plan.
- Index design on `browser_profiles` — at minimum `idx_browser_profiles_user_id`, plus whatever JOIN paths the refactored callers create. Decide while reading the call sites.
- Test fixtures for refactored unit tests — adjust mock factories to produce a `browser_profile_id` and a fake browser_profiles row.
- Whether to add a `CHECK (length(country_code) = 2)` or similar guard rails on `country_code` / `locale` / `timezone` — defer to plan-phase, lean toward minimal (constraints come later when allocator ships).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (binding)

- `.planning/ANTI-BAN-ARCHITECTURE.md` §Faza 0 (lines 87–188) — schema definition, allocator algorithm sketch, "1 proxy = 1 GoLogin profile = N accounts max 1/platform" invariant, list of 5 critical files to refactor. Note: Faza 0's `auth.users(id)` FK is overridden by D-02 in this CONTEXT.

### Requirements (locked)

- `.planning/REQUIREMENTS.md` BPRX-01 — `browser_profiles` table column list + unique constraint requirement
- `.planning/REQUIREMENTS.md` BPRX-02 — `social_accounts` rewrite: drop legacy columns, add `browser_profile_id` FK, JOIN-based reads
- `.planning/ROADMAP.md` "Phase 15: Browser Profile Schema Foundation" — 4 success criteria

### Project context

- `.planning/PROJECT.md` "Current Milestone: v1.2 — Survival + Foundation" — Track 1 (Anti-Ban) framing, why Phase 15 unblocks Phases 17 + 18
- `CLAUDE.md` §Database — migration naming convention (`00023_…`), RLS-on-every-new-table rule, `TIMESTAMPTZ DEFAULT now()`
- `CLAUDE.md` §Environments — apply migrations to dev branch `effppfiphrykllkpkdbv` first; never run destructive SQL on prod
- `.env.example` — Supabase env var shape (no new vars introduced this phase)

### Existing code (refactor targets — confirmed via grep)

- `supabase/migrations/00002_initial_schema.sql:76-94` — current `social_accounts` definition
- `src/features/accounts/actions/account-actions.ts` — connect/disconnect logic, primary refactor target
- `src/features/accounts/components/account-card.tsx` — UI consumer of `gologin_profile_id`
- `src/features/accounts/lib/types.ts` — `SocialAccount` type definition
- `src/lib/action-worker/worker.ts` — reads GoLogin profile id when launching browser session
- `src/app/api/cron/check-replies/route.ts` — cron consumer
- `src/app/api/cron/linkedin-prescreen/route.ts` — cron consumer
- `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts` — unit test
- `src/lib/action-worker/__tests__/worker-quarantine.test.ts` — unit test
- `src/app/api/cron/check-replies/__tests__/route.test.ts` — unit test

### Excluded refs (deliberately not loaded)

- `.planning/PRICING.md` — Track 2 (Pricing) doc; Phase 16/19/21/22 territory, not this phase
- `.planning/SIGNAL-DETECTION-MECHANISMS.md`, `.planning/OUTBOUND-COMMUNICATION-MECHANISMS.md` — not relevant to schema foundation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Supabase service-role client pattern** (`lib/supabase/server.ts`, inline service-role for admin): exactly the pattern the helper will use for cron/worker reads.
- **RLS policy template** from existing migrations (e.g., `00002_initial_schema.sql` `social_accounts` policies): copy-adapt for `browser_profiles`.
- **Existing test mock factories** for `social_accounts` rows: add `browser_profile_id` field, plus a paired `mockBrowserProfile()` factory.

### Established Patterns

- **Sequential migration numbering** — next available is `00023_` (latest is `00022_monitoring_signals_unique.sql`).
- **`auth.users → public.users` mirror trigger** already exists; all FK to user follow `public.users(id)` (D-02 honors this).
- **`ON DELETE CASCADE` on user FKs** — `social_accounts.user_id` cascades; mirror that on `browser_profiles.user_id`.
- **Service role used in `worker.ts` and crons; SSR client used in server actions** — helper must accept the supabase client as a parameter, not import a singleton.
- **No test framework configured yet** (CLAUDE.md). Unit tests under `__tests__/` exist but framework setup is informal — plan-phase decides whether to add minimal test scaffolding or hand-verify via dev server.

### Integration Points

- `connectAccount` server action — currently the only place that writes `gologin_profile_id` / `proxy_id`. After this phase: writes `browser_profile_id = null` (Phase 17 allocator fills it in). Confirm no other code path inserts into `social_accounts`.
- Worker session launch — needs the helper before instantiating the GoLogin client.
- Account UI card — currently shows GoLogin profile id (or hides it); after refactor, reads through the helper.

</code_context>

<specifics>
## Specific Ideas

- Migration file name: `supabase/migrations/00023_browser_profiles.sql` (next sequential).
- Helper module path: `src/features/browser-profiles/lib/get-browser-profile.ts` — first file in the new `src/features/browser-profiles/` directory. Only `lib/` for now; `actions/` and `components/` come in Phase 17 when there's UI/server work to host.
- Wipe SQL is in-migration (`DELETE FROM social_accounts;`), not a separate script. Atomic with the schema change.
- Commit message: `feat(15): browser_profiles schema + social_accounts rewrite`.

</specifics>

<deferred>
## Deferred Ideas

- **Cookies jar column** (`cookies_jar JSONB`) — Phase 18 (BPRX-07) adds it in its own migration.
- **`last_used_at` on browser_profiles** — wait until Phase 17 allocator needs it for reuse decisions.
- **`fingerprint_patched_at` on browser_profiles** — Phase 17 (BPRX-04) territory.
- **Allocator (`connectAccount` rewrite, country derivation, GoLogin REST calls)** — Phase 17 (BPRX-03 through BPRX-06). Phase 15 only sets up the schema for it.
- **`auth.users` wipe** — Phase 20 (BPRX-10) handles the destructive user reset behind a confirmation gate.
- **`country_code` / `locale` CHECK constraints** — defer to allocator phase where mappings are documented.

</deferred>

---

*Phase: 15-browser-profile-schema-foundation*
*Context gathered: 2026-04-27*
