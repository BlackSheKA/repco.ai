# Phase 15: Browser Profile Schema Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 15-browser-profile-schema-foundation
**Areas discussed:** Legacy column handling, Existing test rows, browser_profile_id nullability, Schema column scope, FK target, Code refactor pattern

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Legacy column handling | Drop vs deprecate `social_accounts.gologin_profile_id` + `proxy_id` | ✓ |
| Existing test rows | Wipe / leave NULL / defer to Phase 20 | ✓ |
| browser_profile_id nullability | NOT NULL vs nullable | ✓ |
| Schema column scope | Strict-minimal vs forward-looking | ✓ |
| FK target for user_id | auth.users vs public.users | ✓ |
| Code refactor pattern | Helper / inline JOIN / SQL VIEW | ✓ |

---

## Legacy column handling

| Option | Description | Selected |
|--------|-------------|----------|
| Drop in this phase | Cleanest; matches success criterion #3 strict reading; no rollback risk on test data | ✓ |
| Keep as deprecated (unread) | Add browser_profile_id, leave legacy columns unread | |
| Keep + DB-level deprecation | Strip writes, leave reads via legacy_ alias | |

**User's choice:** Drop in this phase
**Notes:** ~9 reading files refactored alongside the drop. Atomic schema cutover.

---

## Existing test rows

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill: stub browser_profiles from legacy data | Synthesize browser_profiles rows from existing gologin_profile_id values | |
| DELETE all social_accounts rows in migration | Truncate before adding FK; user reconnects after Phase 17 | ✓ |
| Defer wipe to Phase 20 | Leave NULL browser_profile_id; Phase 20 cascades from auth.users wipe | |

**User's choice:** DELETE all social_accounts rows in migration
**Notes:** 8 dev test rows discarded intentionally. `auth.users` not touched (Phase 20's job).

---

## browser_profile_id nullability

| Option | Description | Selected |
|--------|-------------|----------|
| NOT NULL | Enforces invariant; pairs with backfill | |
| Nullable | Defensive — keeps Phase 16 inserts safe before Phase 17 allocator exists | ✓ |

**User's choice:** Nullable
**Notes:** Slight tension with "DELETE all rows" (no rows = could be NOT NULL safely), but nullable is defensive against any code path that inserts before Phase 17 ships. Postgres treats NULL as distinct in unique constraints, so `(browser_profile_id, platform)` unique still works.

---

## Schema column scope

| Option | Description | Selected |
|--------|-------------|----------|
| Strict-minimal (BPRX-01 only) | id, user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name, created_at | ✓ |
| Include cookies_jar JSONB now | Front-load Phase 18 column | |
| Include cookies_jar + last_used_at + fingerprint_patched_at | Front-load three columns | |

**User's choice:** Strict-minimal
**Notes:** Each phase owns its schema additions. Phase 18 adds cookies_jar in its own migration.

---

## FK target for user_id

| Option | Description | Selected |
|--------|-------------|----------|
| public.users(id) | Matches every other table; uniform RLS | ✓ |
| auth.users(id) | Matches anti-ban doc literal text | |

**User's choice:** public.users(id)
**Notes:** Anti-ban architecture doc Faza 0 example showed `auth.users(id)` — overridden in CONTEXT.md D-02 because all other repco.ai tables use `public.users` (which is mirrored from `auth.users` via trigger).

---

## Code refactor pattern

| Option | Description | Selected |
|--------|-------------|----------|
| getBrowserProfileForAccount(accountId) helper | Single shared lookup; mockable; extends to cookies/proxy in Phase 17/18 | ✓ |
| Inline JOIN per query | Each call site writes its own select | |
| SQL VIEW joining the two tables | Code reads view as if legacy columns existed | |

**User's choice:** getBrowserProfileForAccount helper
**Notes:** Lives at `src/features/browser-profiles/lib/get-browser-profile.ts`. First file in new `src/features/browser-profiles/` directory.

---

## Claude's Discretion

- Helper return shape (throw vs return null when account has no browser_profile_id)
- Index design beyond the obvious `idx_browser_profiles_user_id`
- Test fixture updates for refactored unit tests
- Whether to add CHECK constraints on `country_code` / `locale` / `timezone`

## Deferred Ideas

- `cookies_jar JSONB` — Phase 18
- `last_used_at`, `fingerprint_patched_at` — Phase 17 territory
- Allocator + country derivation + GoLogin REST — Phase 17 (BPRX-03 through BPRX-06)
- `auth.users` wipe — Phase 20 (BPRX-10)
- Country/locale CHECK constraints — Phase 17
