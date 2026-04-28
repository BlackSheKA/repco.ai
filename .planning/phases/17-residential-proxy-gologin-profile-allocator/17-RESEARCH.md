# Phase 17: Residential Proxy + GoLogin Profile Allocator — Research

**Researched:** 2026-04-27
**Domain:** GoLogin REST allocator, residential GeoProxy, country→fingerprint signal stack
**Confidence:** HIGH (CONTEXT.md + ANTI-BAN-ARCHITECTURE.md are exhaustive; remaining unknowns explicitly tagged)

## Summary

Phase 17 wires `connectAccount` through a new `allocateBrowserProfile` chokepoint that owns
reuse-or-create logic, GoLogin REST calls (`createProfile` with `mode: "geolocation"`,
`patch_profile_fingerprints`), country→{tz, locale, UA} signal alignment, and DB inserts to
both `browser_profiles` (from Phase 15) and `social_accounts.browser_profile_id`. The legacy
`createProfile(handle, startUrl)` and its hardcoded `mode: "gologin"` shared pool are removed.

**Primary recommendation:** Variant B (GoLogin auto-selects proxy from `autoProxyRegion`) —
locked by D-04. Don't enumerate `/proxy/v2`. Don't track floppydata pool reuse (D-05).

## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01..D-16 from `17-CONTEXT.md` are binding. Highlights the planner must not relitigate:

- **D-01:** `country_code = 'US'` hardcoded at every call site. No UI picker, no derivation.
- **D-02:** Reuse rule = first-match WHERE `user_id` + `country_code` match AND profile has no
  existing account on the requested platform. No LRU.
- **D-04 / D-05:** Variant B canonical. Always `mode: "geolocation"` with `autoProxyRegion`.
  Floppydata-pool reuse path is dropped from BPRX-03 success criteria.
- **D-07:** `patch_profile_fingerprints` called with NO field overrides — re-randomize all.
- **D-08:** Same Chrome major (130) Win64 across all 7 countries; only `Accept-Language` varies.
- **D-09:** No race lock. UI button-disabled is the only guard. Duplicates accepted.
- **D-10:** `try/catch` with best-effort `deleteProfile` rollback on post-create failure.
- **D-11:** User-facing error: `"Could not set up the account right now — please try again in a moment."`
- **D-13:** No Postgres CHECK on `country_code` in this phase.
- **D-14:** New `allocateBrowserProfile` in `src/features/browser-profiles/lib/allocator.ts`.
- **D-15:** `createProfileV2` + `patchProfileFingerprints` exports in `src/lib/gologin/client.ts`.
  Legacy `createProfile` removed.
- **D-16:** Tests = manual UAT + optional unit tests if non-fragile harness shape exists.

### Claude's Discretion
- Whether to add a migration this phase (only candidate: `fingerprint_patched_at timestamptz`).
- Exact pending-state component shape (existing `Loader2` pattern is fine — UI-SPEC §State A).
- Reuse-helper return type (`null` vs throw). Recommendation: `null`, less call-site noise.
- Source field for `gologin_proxy_id` from response — verify in plan-phase per D-06.

### Deferred Ideas (OUT OF SCOPE)
Country picker, `last_used_at`, `cookies_jar`, periodic UA rotation, race lock, floppydata
pool reuse, mocked unit-test harness, orphan-reaper cron, CHECK constraint.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BPRX-03 | Allocate residential GeoProxy via `mode: "geolocation"` + `autoProxyRegion` | §GoLogin REST Surface, §Allocator Algorithm |
| BPRX-04 | Call `patch_profile_fingerprints` after every profile creation | §GoLogin REST Surface (PATCH endpoint) |
| BPRX-05 | Country → {tz, locale, UA} canonical map (US/GB/DE/PL/FR/CA/AU) | §Country Map |
| BPRX-06 | Auto-reuse compatible profile before creating new one | §Allocator Algorithm |

## Project Constraints (from CLAUDE.md)

- **Default branch `development`**, dev Supabase `effppfiphrykllkpkdbv`. No prod migrations.
- **Service role client server-side only.** Allocator runs in a server action, not a route handler.
- **Validate at API boundaries with Zod** — but allocator's internal contract is TypeScript only;
  no untrusted input crosses it (`country` is a TS literal `'US'`, `platform` is union).
- **Migration naming**: next sequential is `00024_*` (latest landed is `00022`; Phase 15 will land
  `00023_browser_profiles.sql` first).
- **`pnpm dev --port 3001`** — Supabase OAuth redirects pinned to it.
- **Sentry breadcrumb + Axiom structured log on every external API call** (§Established Patterns).

## Existing Code Map

| Concern | File:line | Notes |
|---------|-----------|-------|
| Legacy `createProfile` (to refactor) | `src/lib/gologin/client.ts:41-73` | Hardcodes `mode: "gologin"` on line 60; en-US UA on lines 53-59. Replace with `createProfileV2`. |
| `deleteProfile` (reuse for rollback) | `src/lib/gologin/client.ts:80-92` | Already exists; call from D-10 catch block. |
| `startCloudBrowser` (no change) | `src/lib/gologin/client.ts:108-125` | Allocator calls this last to get `remoteOrbitaUrl`. |
| `connectAccount` (to refactor) | `src/features/accounts/actions/account-actions.ts:21-69` | Currently calls bare `createProfile`, inserts directly to `social_accounts` with `gologin_profile_id`. Becomes a thin wrapper. |
| `getBrowserProfileById` helper (Phase 15) | `src/features/browser-profiles/lib/get-browser-profile.ts` | **Not yet on disk** — Phase 15 PLAN scheduled it; allocator's `findReusableProfile` lives as sibling export per D-08 of Phase 15. |
| Adapter cleanup pattern | `src/lib/gologin/adapter.ts` (line refs in ANTI-BAN doc) | Reference only — same `try/finally` shape applies to D-10 rollback. |
| `social_accounts.browser_profile_id` FK | `supabase/migrations/00023_browser_profiles.sql` (Phase 15, NOT YET LANDED) | Phase 15 prereq — confirm `00023_*` is on dev branch before Phase 17 implementation begins. |

**Verification of existing code (greps performed):**
- `grep "browser_profiles"` in `src/` → only `src/features/browser-profiles/lib/get-browser-profile.ts` matches (and that file does not yet exist on disk — Phase 15 hasn't shipped).
- `grep -i "gologin"` in `src/` → confirmed only `src/lib/gologin/client.ts` + `src/lib/gologin/adapter.ts` + `src/features/accounts/actions/account-actions.ts` are the GoLogin call sites.
- `grep -i "floppydata"` in repo → 0 matches in code; only mentioned in `.planning/ANTI-BAN-ARCHITECTURE.md`. Confirms floppydata pool is opaque to our codebase (matches D-05 dropping that path).
- `supabase/migrations/*browser_profile*.sql` → 0 matches. Latest landed migration is `00022_monitoring_signals_unique.sql`. **Phase 15's `00023_browser_profiles.sql` is a hard prereq for Phase 17.**

## GoLogin REST Surface

Auth header on every call: `Authorization: Bearer ${process.env.GOLOGIN_API_TOKEN}`,
`Content-Type: application/json`. Base URL: `https://api.gologin.com`.

Endpoints used by the allocator (sources of truth: ANTI-BAN-ARCHITECTURE.md §Faza 1, lines
196–216; CONTEXT.md D-04, D-07, D-15):

| Operation | Method + Path | Body (key fields) | Source of truth |
|-----------|---------------|-------------------|-----------------|
| Create profile (Variant B) | `POST /browser` | `{ name, os: "win", browserType: "chrome", navigator: { userAgent, resolution, language, platform }, proxy: { mode: "geolocation", autoProxyRegion: countryCode, autoProxyCity: "" } }` | ANTI-BAN doc lines 207–214; CONTEXT D-04. |
| Patch fingerprint | `POST /browser/{profileId}/fingerprints` (or per GoLogin docs `patch_profile_fingerprints`) | Empty body `{}` — let GoLogin re-randomize all surfaces | CONTEXT D-07. **Exact path TBC during plan-phase** — see Open Questions. |
| Start cloud browser | `POST /browser/{profileId}/web` | `{}` | Existing `startCloudBrowser` in `client.ts:108`. |
| Delete profile (rollback) | `DELETE /browser/{profileId}` | none | Existing `deleteProfile` in `client.ts:80`. |
| Get profile (proxy id resolution per D-06) | `GET /browser/{profileId}` | none | Existing `getProfile` in `client.ts:155` returns the profile blob; plan-phase confirms whether `profile.proxy.id` is the field to store as `gologin_proxy_id`. |

**Reference, not source of truth:** ANTI-BAN-ARCHITECTURE.md §"Faza 1" (lines 191–229) for the
full Variant A vs B context and the country→tz/locale mapping that this phase implements.
CONTEXT.md §Decisions overrides and refines it.

## Allocator Algorithm

Reuse-vs-new decision tree, copied from CONTEXT.md D-02 + D-04 + D-10. **Do not introduce new
policy.**

```
allocateBrowserProfile({ userId, platform, country = 'US', supabase }):

  1. REUSE LOOKUP (BPRX-06, D-02):
     SELECT bp.* FROM browser_profiles bp
     WHERE bp.user_id = $userId
       AND bp.country_code = $country
       AND bp.id NOT IN (
         SELECT browser_profile_id FROM social_accounts
         WHERE platform = $platform AND browser_profile_id IS NOT NULL
       )
     ORDER BY bp.created_at ASC
     LIMIT 1;

  2. IF found → SKIP to step 6 with bp.id + bp.gologin_profile_id.

  3. ALLOCATE NEW (no race lock, D-09):
     const { tz, locale, ua } = mapForCountry(country)  // throws on unknown
     gologinProfileId = await createProfileV2({
       accountHandle: handle,
       countryCode: country,
       navigator: { userAgent: ua, language: `${locale},${locale.split('-')[0]}`, platform: 'Win32', resolution: '1920x1080' },
       proxyMode: 'geolocation',
       timezone: tz,
     })

  4. PATCH FINGERPRINT (BPRX-04, D-07):
     try {
       await patchProfileFingerprints(gologinProfileId)  // no overrides
     } catch (err) {
       await deleteProfile(gologinProfileId)  // best-effort, swallow + Sentry on its own failure
       throw err
     }

  5. INSERT browser_profiles row (and capture id):
     try {
       INSERT INTO browser_profiles (user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name)
       VALUES ($userId, gologinProfileId, <see D-06>, $country, tz, locale, `${country}-${shortId}`)
       RETURNING id
     } catch (err) {
       await deleteProfile(gologinProfileId)
       throw err
     }

  6. INSERT social_accounts row linking browser_profile_id (and rollback if it fails):
     try {
       INSERT INTO social_accounts (user_id, platform, handle, browser_profile_id, health_status, warmup_day)
       VALUES ($userId, $platform, $handle, bp.id, 'warmup', 1)
       RETURNING id
     } catch (err) {
       // Only rollback GoLogin profile if WE just created it in step 3 — not on a reuse path.
       if (newlyCreated) await deleteProfile(gologinProfileId)
       throw err
     }

  7. await revalidatePath('/accounts')
  8. session = await startCloudBrowser(gologinProfileId)
  9. return { browserProfileId, gologinProfileId, cloudBrowserUrl: session.remoteOrbitaUrl }
```

**Country matching rule (D-02):** Strict equality on `country_code`. No fuzzy matching, no
fallback country. If the user has only US profiles and a future call requests DE, the allocator
creates a new profile — never reuses across country.

**Platform conflict check (D-02):** Encoded as `NOT IN (SELECT … WHERE platform = $platform)`.
Database-level uniqueness is enforced by Phase 15's `UNIQUE (browser_profile_id, platform)`
constraint on `social_accounts` — even if two concurrent allocators race past the application
check, the second `INSERT` fails on the unique constraint, and step 6's catch path triggers
GoLogin profile rollback.

**Concurrency note (D-09):** Two concurrent calls with the same `(user_id, country, platform)`
that both miss the cache will both run step 3 and create two profiles + two proxies. Accepted.
The unique constraint in step 6 prevents *the same browser_profile* from getting two accounts on
the same platform; it does NOT prevent two distinct browser_profiles from being created.

## Country → {tz, locale, UA} Canonical Map

From CONTEXT.md D-12 (binding). Stored as `const COUNTRY_MAP` in
`src/features/browser-profiles/lib/country-map.ts` per D-15.

| country_code | timezone (IANA) | locale | UA `language` (Accept-Language form) | UA string (D-08) |
|---|---|---|---|---|
| US | `America/New_York` | `en-US` | `en-US,en` | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36` |
| GB | `Europe/London` | `en-GB` | `en-GB,en` | (same Chrome 130 Win64 stem) |
| DE | `Europe/Berlin` | `de-DE` | `de-DE,de` | (same) |
| PL | `Europe/Warsaw` | `pl-PL` | `pl-PL,pl` | (same) |
| FR | `Europe/Paris` | `fr-FR` | `fr-FR,fr` | (same) |
| CA | `America/Toronto` | `en-CA` | `en-CA,en` | (same) |
| AU | `Australia/Sydney` | `en-AU` | `en-AU,en` | (same) |

**UA source (D-08):** Chrome 130 Win64 matches existing `client.ts:55` line. Same major across
all 7 countries — only `Accept-Language` differs. Periodic UA rotation deferred (anti-ban
kosmetyka backlog). [VERIFIED: matches existing codebase line 55.]

**IANA timezone validity:** All 7 zones are IANA `tzdata` canonical IDs. [CITED:
https://www.iana.org/time-zones — these specific zone names are stable across the last decade.]

**Helper API (D-12):**
```ts
export type SupportedCountry = 'US' | 'GB' | 'DE' | 'PL' | 'FR' | 'CA' | 'AU'
export const COUNTRY_MAP: Record<SupportedCountry, { timezone: string; locale: string; userAgent: string; language: string }> = { ... }
export function mapForCountry(code: string): typeof COUNTRY_MAP[SupportedCountry] {
  if (!(code in COUNTRY_MAP)) throw new Error(`Unsupported country_code: ${code}`)
  return COUNTRY_MAP[code as SupportedCountry]
}
```

## 8 Floppydata Proxies (informational only — D-05 drops reuse path)

Per ANTI-BAN-ARCHITECTURE.md lines 73–81, GoLogin already has 8 residential proxies provisioned
(`provider: geo.floppydata.com`): US×2 (Oak Lawn IL, Santa Clara CA), GB×2, DE (Lichtenfels),
FR, CA, AU. 2 GB residential traffic prepaid, 0.09 GB used.

**Storage today:** They live in GoLogin's account-level proxy pool, queryable via
`GET /proxy/v2` (or MCP `mcp__gologin-mcp__get_proxy_v2`). They are **not** stored in repco
Postgres; the codebase has zero references to them (grep `floppydata` → only ANTI-BAN doc).

**Why the allocator does NOT enumerate them (D-04, D-05):** Variant B was chosen for simplicity.
GoLogin's `mode: "geolocation"` + `autoProxyRegion` may or may not select from this pool — that
behavior is opaque to us and accepted. `gologin_proxy_id` will hold whatever GoLogin echoes
back; if `mode: "geolocation"` doesn't echo a stable id, the plan-phase verification step
inspects `GET /browser/{id}` for the `proxy.id` field (D-06).

**The 2 GB prepaid traffic may go unused; this is the accepted cost of D-05.** Revisit only if
GoLogin traffic billing surprises arrive (Deferred Ideas, line 180 of CONTEXT).

## Failure Modes & Concurrency

| Failure | Behavior | Source |
|---------|----------|--------|
| GoLogin `POST /browser` returns 4xx (insufficient traffic, country unavailable) | Throw → server action returns `{ error: "Could not set up the account right now — please try again in a moment." }`. No DB rows created. Full body logged to Axiom + Sentry with `userId`, `country`, `correlationId`. | D-11 |
| GoLogin `POST /browser` returns 5xx | Same as 4xx — same user-facing copy, same logging. **No retry in allocator** (user retries from UI). | D-11 |
| `patch_profile_fingerprints` fails | Step 4 catch → call `deleteProfile(gologinProfileId)` → throw original error. If `deleteProfile` itself throws, log orphan id to Sentry + continue raising the original. | D-07, D-10 |
| `INSERT INTO browser_profiles` fails (e.g., UNIQUE violation on `gologin_profile_id`) | Step 5 catch → `deleteProfile` rollback → throw. | D-10 |
| `INSERT INTO social_accounts` fails (e.g., `UNIQUE (browser_profile_id, platform)` violation) | Step 6 catch. **Only rollback GoLogin profile if the allocator just created it.** On reuse path, the GoLogin profile must survive. | D-02, D-10 |
| Concurrent `connectAccount` from same user, same `(country, platform)`, both miss cache | Both create profiles + proxies. Both insert distinct `browser_profiles` rows. Both insert distinct `social_accounts` rows on distinct `browser_profile_id`s. **Accepted (D-09)** — no advisory lock. | D-09 |
| Concurrent `connectAccount` racing on the same reused `browser_profile_id` (cache hit on both) | First insert wins; second hits `UNIQUE (browser_profile_id, platform)` → step 6 catch → throw with the standard error copy → user retries. **No GoLogin rollback on reuse-path failure** (the profile is still in valid use by other accounts). | D-02, D-10 |
| GoLogin auth (401) — token expired/missing | `getToken()` already throws on missing token. 401 from API surfaces as 4xx → standard user-facing error + Sentry alert. | client.ts:18 |
| `revalidatePath` failure | Non-fatal — server action still returns success; cache may be stale until next navigation. | Standard Next.js |

**Best-effort rollback principle (D-10):** Mirror existing `deleteAccount` pattern at
`account-actions.ts:206-217` — wrap `deleteProfile` in `try/catch` and swallow on failure
(only logging). The user's primary error must propagate; orphan tracking is Sentry's job.

## Validation Architecture (MANDATORY — Nyquist)

Phase 17 success criteria (per ROADMAP, amended by D-05). Each row maps a criterion to a
deterministic test approach.

| # | Success Criterion | Test Type | Approach | Artifact |
|---|-------------------|-----------|----------|----------|
| 1 | Every new `browser_profile` is created with `mode: "geolocation"` matching its `country_code`; `mode: "gologin"` is never sent (BPRX-03, amended D-05) | **Unit (non-mocked HTTP)** + **integration UAT** | (a) Static check: `grep -r "mode:\\s*['\"]gologin['\"]" src/` returns 0 matches (CI-friendly assertion). (b) UAT: trigger `connectAccount('reddit', 'test1')` against dev Supabase; assert via `mcp__gologin-mcp__get_browser` that the resulting profile's `proxy.mode === "geolocation"` and `proxy.autoProxyRegion === "US"`. | (a) script in `scripts/check-no-gologin-shared.ts` or pre-commit grep. (b) UAT screenshot of GoLogin profile JSON + DB row. |
| 2 | `patch_profile_fingerprints` is called on every newly-created profile (BPRX-04) | **Integration UAT** | UAT: `connectAccount` end-to-end → inspect Axiom log for `gologin.patch_fingerprints` event with the profile id. | Axiom log entry + correlation id. |
| 3 | Country→{tz, locale, UA} map covers US/GB/DE/PL/FR/CA/AU and is mirrored on the `browser_profiles` row at insert (BPRX-05) | **Unit** | Unit test on `mapForCountry`: assert the 7 entries match the D-12 table; assert `mapForCountry('XX')` throws. Allocator unit (mocked Supabase): assert the inserted row's `timezone` and `locale` equal `mapForCountry(country)` output. | `src/features/browser-profiles/lib/__tests__/country-map.test.ts` if a non-fragile harness exists (D-16); otherwise UAT: read row from `browser_profiles` after `connectAccount` and visually compare. |
| 4 | Reuse rule: a 2nd account on a different platform reuses the existing `browser_profile`; a 2nd account on the same platform creates a new one (BPRX-06, D-02) | **Integration UAT** | UAT script against dev Supabase: <br>(a) `connectAccount('reddit')` → record `browser_profile_id = X`. <br>(b) `connectAccount('linkedin')` → assert `browser_profile_id === X` (reused). <br>(c) `connectAccount('reddit')` again → assert `browser_profile_id !== X` (new). | DB query screenshots; row counts in `browser_profiles` and `social_accounts`. |
| 5 | Allocation failure rolls back GoLogin profile (D-10) | **Integration UAT (fault injection)** | UAT: temporarily make `INSERT INTO social_accounts` fail (e.g., insert a duplicate `(browser_profile_id, platform)` row first to trigger the unique constraint). Trigger `connectAccount`. Assert: (a) error message matches D-11 copy; (b) no orphan `browser_profiles` row; (c) GoLogin profile no longer exists (`getProfile(id) === null`). | Sentry + Axiom log of the rollback path; `getProfile` 404 confirmation. |

**Test framework status:** Project has no test framework configured (CLAUDE.md §Testing).
Per D-16, mocked unit tests are deferred unless plan-phase finds a cheap non-fragile harness.
**Default to UAT-driven verification** with documented steps in `17-PLAN.md`.

**Wave 0 gaps:**
- [ ] If unit tests are added: install `vitest` + `@vitest/ui` (~minimal config; no jsdom needed for pure-fn tests on `country-map.ts`).
- [ ] `scripts/uat-phase17.ts` or markdown checklist documenting the 5 UAT scenarios above against dev Supabase + dev GoLogin workspace.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `GOLOGIN_API_TOKEN` env var | All GoLogin REST | ✓ (per CONTEXT canonical_refs §Project Context) | — | None — phase blocked without it |
| Dev Supabase branch `effppfiphrykllkpkdbv` | Migration apply, UAT | ✓ (canonical, do-not-touch per memory) | postgres 15 | None |
| Phase 15 migration `00023_browser_profiles.sql` | `browser_profiles` table + `social_accounts.browser_profile_id` FK | **✗ NOT YET LANDED** (latest migration on disk is `00022`) | — | **HARD PREREQ** — Phase 15 must ship before Phase 17 implementation |
| `getBrowserProfileForAccount` helper | Reuse lookup sibling export | **✗ NOT YET ON DISK** (Phase 15 deliverable) | — | Same — Phase 15 prereq |
| `mcp__gologin-mcp__*` MCP tools | UAT inspection of profile JSON | ✓ (per ANTI-BAN doc) | — | Direct REST `GET /browser/{id}` |
| GoLogin Pro plan ($9/mc, 10 profile slots) | Profile creation | ✓ (per ANTI-BAN doc line 80) | — | Business plan if >10 profiles needed |
| 2 GB residential traffic prepaid | Allocation testing | ✓ (per ANTI-BAN doc line 80) | — | None for testing; D-05 drops reuse-path enforcement |

**Missing dependencies (blocking):**
- Phase 15 migration `00023_browser_profiles.sql` and `getBrowserProfileForAccount` helper.
  Plan-phase must enforce ordering: Phase 15 lands → Phase 17 implementation begins.

## Open Questions

1. **`patch_profile_fingerprints` exact REST path and body shape**
   - What we know: GoLogin's MCP exposes the operation; CONTEXT D-07 mandates calling it with no overrides.
   - What's unclear: Whether the REST path is `POST /browser/{id}/fingerprints`, `PATCH /browser/{id}`, or via `mcp__gologin-mcp__patch_profile_fingerprints` only. The `gologin` npm package wraps it — but we deliberately avoid that package (`client.ts:6` comment).
   - Recommendation: Plan-phase verifies via GoLogin docs and a single dev-workspace probe before locking the body shape into `patchProfileFingerprints`. If only the MCP tool can invoke it, plan-phase may exceptionally call the MCP from a server action — but document that as a deviation from "REST-only" pattern.

2. **`gologin_proxy_id` source field after `mode: "geolocation"` (D-06)**
   - What we know: `mode: "gologin"` echoed a stable proxy id on profile create. `mode: "geolocation"` may or may not.
   - What's unclear: Whether `POST /browser` response includes `proxy.id` for geolocation mode, or whether we must do a follow-up `GET /browser/{id}` to read `profile.proxy.id`.
   - Recommendation: Plan-phase makes one dev-workspace probe (create a profile with `mode: "geolocation"`, log full response + follow-up `GET`), document the field path in `17-PLAN.md`, then lock the column-write contract.

3. **Display name format for `browser_profiles.display_name`**
   - What we know: Phase 15 D-08 defines column as `text` nullable with example `"US-1"`.
   - What's unclear: Whether the allocator picks `${country}-${shortId}` (auto-numbered per user) or just `null` and lets a future UI surface name them.
   - Recommendation: Generate `${country}-${seq}` where `seq = COUNT(*) + 1` of user's existing profiles in that country. Cheap, deterministic, no UI surface needed. Plan-phase confirms.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md` — D-01..D-16 (binding decisions)
- `.planning/ANTI-BAN-ARCHITECTURE.md` §Faza 0 (lines 87–188), §Faza 1 (lines 191–229), pricing/proxy-pool (lines 41–81)
- `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-UI-SPEC.md` — UI contract (already locked)
- `src/lib/gologin/client.ts` (read 174 lines) — existing REST surface, headers, error shape
- `src/features/accounts/actions/account-actions.ts` (read 252 lines) — existing `connectAccount`, rollback pattern (`deleteAccount` lines 206–217)
- `supabase/migrations/*.sql` glob — confirmed Phase 15 migration `00023_*` not yet on disk
- `CLAUDE.md` — environments rules, migration naming, branch policy

### Secondary (MEDIUM confidence)
- IANA timezone canonical IDs for the 7-country map [CITED: https://www.iana.org/time-zones]

### Tertiary (LOW — flagged in Open Questions)
- Exact `patch_profile_fingerprints` REST path/body — needs plan-phase probe
- `gologin_proxy_id` echo field path under `mode: "geolocation"` — needs plan-phase probe

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — entirely existing repco code + GoLogin REST already wrapped
- Architecture: HIGH — fully spec'd in CONTEXT D-01..D-16
- Pitfalls: HIGH for documented (D-09, D-10, D-11); MEDIUM for the 2 open API-shape questions
- Country map: HIGH — table in CONTEXT D-12, IANA-validated zones

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days — GoLogin REST shape and CONTEXT decisions are stable)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `patch_profile_fingerprints` accepts an empty body to re-randomize all surfaces | GoLogin REST Surface | Body may need `{ randomize: true }` or similar — plan-phase probe resolves before locking |
| A2 | `mode: "geolocation"` response includes a usable proxy id reference (either inline or via follow-up `GET`) | 8 Floppydata Proxies, D-06 | If absent entirely, store `null` in `gologin_proxy_id` (column must allow null in Phase 15 — confirm) |
| A3 | Phase 15's `UNIQUE (browser_profile_id, platform)` constraint exists on `social_accounts` per Phase 15 D-04 | Allocator Algorithm step 6 catch | Without it, two concurrent same-platform allocations on a reused profile both succeed → state corruption |
| A4 | `revalidatePath('/accounts')` is sufficient — no other paths need invalidation | Allocator Algorithm step 7 | If a future dashboard view also reads `browser_profiles`, may need `revalidatePath('/dashboard')` too |

**These 4 assumptions are the only `[ASSUMED]` items — everything else in this research is
verified against CONTEXT.md decisions, ANTI-BAN-ARCHITECTURE.md spec, or read source files.**

## RESEARCH COMPLETE
