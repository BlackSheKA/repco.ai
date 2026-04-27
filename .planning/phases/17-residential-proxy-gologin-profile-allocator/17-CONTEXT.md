# Phase 17: Residential Proxy + GoLogin Profile Allocator - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

When `connectAccount(userId, platform, handle)` runs, the system either reuses a compatible existing `browser_profile` (same user + same `country_code` + no existing account on the requested platform) or allocates a new one: residential GeoProxy via GoLogin REST matched to the country, fresh GoLogin profile with country-aligned timezone/locale/UA, fingerprint patched. The legacy `proxy: { mode: "gologin" }` shared pool is never used again.

In scope:
- Country→{timezone, locale, UA} mapping table (US/GB/DE/PL/FR/CA/AU) stored as a TypeScript constant and mirrored on the `browser_profiles` row at insert time
- Allocator algorithm in `src/features/browser-profiles/lib/allocator.ts` (NEW): reuse lookup → GoLogin proxy alloc → GoLogin profile create → fingerprint patch → DB inserts
- Refactor of `connectAccount` in `src/features/accounts/actions/account-actions.ts` to call the allocator instead of the current bare `createProfile`
- Refactor of `src/lib/gologin/client.ts:createProfile` to accept `{ countryCode, proxyMode, navigator }` and stop hardcoding `mode: "gologin"` + en-US UA
- New GoLogin REST wrappers: `patch_profile_fingerprints` call, `mode: "geolocation"` proxy attachment
- UI: existing "Dodaj konto" dialog gains an inline `Setting up...` spinner state covering the ~3-8s allocation window; no new screens, no exposure of "proxy" / "profile" terminology to the user
- Failure path: try/catch with `deleteProfile()` compensation if any post-create step fails
- Migration `00024_browser_profile_country_check.sql` (or similar) ONLY if the planning step decides we need an enum/UA column — see Claude's Discretion below

Out of scope (other phases):
- `cookies_jar` column + cookie persistence (Phase 18, BPRX-07)
- Reddit `about.json` preflight + Haiku CU ban detector (Phase 18, BPRX-08/09)
- `auth.users` wipe (Phase 20, BPRX-10)
- Real warmup activity, periodic UA rotation, account creation hygiene (anti-ban kosmetyka backlog)
- Free-tier signup gating / paywall (Phase 19+)
- Country picker UI, multi-country support beyond hardcoded `'US'` default (deferred — see Deferred Ideas)
- Race-protection lock against duplicate profile creation (intentionally absent — see D-09)

</domain>

<decisions>
## Implementation Decisions

### Country derivation & UX

- **D-01:** `country_code` for any new allocation is hardcoded `'US'` in this phase. No UI, no product-profile derivation, no per-account override. The allocator function still takes `country` as a parameter (so future phases can wire in a real source without reshaping the API), but every call site passes `'US'`.
- **D-02:** Reuse rule (BPRX-06): pick the first existing `browser_profile` row WHERE `user_id = currentUser AND country_code = requestedCountry AND id NOT IN (SELECT browser_profile_id FROM social_accounts WHERE platform = requestedPlatform AND browser_profile_id IS NOT NULL)`. No LRU bias, no tight-packing heuristic — first match wins. Predictable; matches Phase 15 D-04's unique constraint.
- **D-03:** UI surface during allocation: existing "Dodaj konto" dialog reuses its current submit button. Add a `pending` state with inline `Setting up your account...` copy + spinner, covering server action duration. No new screens, no terms like "browser profile", "proxy", "fingerprint" appear in the UI. After success, redirect to the existing GoLogin Cloud Browser URL exactly as today.

### Allocator strategy

- **D-04:** **Variant B is canonical.** New profiles are created with `proxy: { mode: "geolocation", autoProxyRegion: country_code }`. The system does NOT enumerate `/proxy/v2`, does NOT prefer the 8 floppydata residential proxies, and does NOT track which specific proxy id GoLogin selected for the profile other than what GoLogin echoes back in the response.
- **D-05:** **BPRX-03 success criterion #1 is amended:** the "existing 8 floppydata residential proxies are consumed before any new purchase" wording is dropped. Operative success criterion becomes "every new browser_profile is created with `mode: 'geolocation'` matching its `country_code`; `mode: 'gologin'` is never sent". The 8 prepaid proxies may go unused; accepted cost.
- **D-06:** `gologin_proxy_id` stored on `browser_profiles` is whatever GoLogin returns in the createProfile response body for the proxy GoLogin auto-selected. If GoLogin does not echo a stable id with `mode: "geolocation"`, the column stores the GoLogin profile-internal proxy reference (`profile.proxy.id` from `GET /browser/{id}` — to be confirmed during research). Plan-phase verifies the API response shape before locking the storage contract.
- **D-07:** Fingerprint patch (BPRX-04): immediately after `createProfile` succeeds, call `patch_profile_fingerprints` with NO field overrides — let GoLogin re-randomize canvas/webGL/audio/fonts using its own defaults. One extra REST call per allocation. Recorded as success criterion #2.
- **D-08:** UA source: hardcoded country→UA mapping in `src/features/browser-profiles/lib/country-map.ts`. Same Chrome major version across all 7 countries (whatever is current Chrome at implementation time, e.g. `Chrome/130`); only the `Accept-Language` / `language` field differs by locale. UA is sent inside the createProfile `navigator` block. Periodic UA rotation via `patch_profile_update_ua_to_new_browser_v` is deferred to the anti-ban kosmetyka backlog.

### Failure handling & concurrency

- **D-09:** **No race lock.** Two concurrent `connectAccount` calls from the same user that both miss the reuse cache are allowed to create two profiles + two proxies. Rationale (user-stated): each account creation is a billable credit event — more accounts = more revenue, and the duplicate cost is bounded ($1.99/GB residential). UI-side double-submit guard (button disabled on click) is the only protection layer; documented as accepted edge case.
- **D-10:** Allocation failure rollback: try/catch wrapping the post-`createProfile` steps. On any error from `patch_profile_fingerprints`, the `INSERT INTO browser_profiles`, or `INSERT INTO social_accounts`, call `deleteProfile(profileId)` from `src/lib/gologin/client.ts` in a `finally`/`catch` block before returning the error. Cleanup is best-effort: if `deleteProfile` itself fails, log to Sentry with the orphan profile id and continue returning the original error to the user. Matches the existing pattern in `account-actions.ts`.
- **D-11:** GoLogin allocation failure (insufficient traffic balance, country unavailable, REST 5xx) returns a user-facing error to the connect dialog: `"Could not set up the account right now — please try again in a moment."` Full GoLogin error body is logged to Axiom + Sentry with the user id and country for admin investigation. No `browser_profiles` or `social_accounts` row is created. User can retry. **No country auto-fallback** — country mismatch breaks the whole anti-ban premise.

### Geo map (BPRX-05)

- **D-12:** Country→{timezone, locale, UA} mapping covers exactly 7 countries:

  | country_code | timezone | locale | UA language |
  |---|---|---|---|
  | US | America/New_York | en-US | `en-US,en` |
  | GB | Europe/London | en-GB | `en-GB,en` |
  | DE | Europe/Berlin | de-DE | `de-DE,de` |
  | PL | Europe/Warsaw | pl-PL | `pl-PL,pl` |
  | FR | Europe/Paris | fr-FR | `fr-FR,fr` |
  | CA | America/Toronto | en-CA | `en-CA,en` |
  | AU | Australia/Sydney | en-AU | `en-AU,en` |

  All 7 use the same Chrome major version + Win64 platform string (consistent with current `client.ts` UA shape). Stored as a `const COUNTRY_MAP` in `src/features/browser-profiles/lib/country-map.ts` and mirrored onto `browser_profiles.timezone` / `.locale` at insert time. Helper `mapForCountry(code)` throws on unknown country (defensive: nothing in this phase passes anything except `'US'`).
- **D-13:** **No** Postgres CHECK constraint on `browser_profiles.country_code` in this phase. TypeScript types + helper throw enforce it; CHECK is deferred until a multi-country UI exists (otherwise CHECK becomes migration churn each time a country is added). Phase 15 explicitly deferred this same call.

### Code layout

- **D-14:** New module `src/features/browser-profiles/lib/allocator.ts` exports `allocateBrowserProfile({ userId, platform, country, supabase })` returning `{ browserProfileId, gologinProfileId, cloudBrowserUrl }`. The function owns: reuse lookup, GoLogin proxy alloc, profile create, fingerprint patch, both DB inserts (`browser_profiles` if new + `social_accounts`), `revalidatePath`. `connectAccount` becomes a thin wrapper that resolves auth + calls the allocator + returns the cloud-browser URL.
- **D-15:** `src/lib/gologin/client.ts` gets two new exports: `createProfileV2({ accountHandle, countryCode, navigator, proxyMode })` (the real createProfile that supersedes the hardcoded one) and `patchProfileFingerprints(profileId)`. The legacy `createProfile(accountHandle, startUrl)` is removed once `connectAccount` migrates — there are no other callers (confirmed via grep target during plan-phase).
- **D-16:** Tests: hand-verify via `pnpm dev --port 3001` against dev Supabase branch + dev GoLogin workspace. Mocked unit tests for the allocator are deferred — per existing memory rule (`feedback_supabase_mocked_tests_mask_column_drift`), mocked tests around Supabase column shape have masked drift before. If plan-phase decides a non-mocked harness is cheap, add one; otherwise document UAT steps.

### Claude's Discretion

- Whether to add a new migration in this phase. The 7-country map adds no new columns to `browser_profiles` (Phase 15 already locked `country_code text NOT NULL`, `timezone text NOT NULL`, `locale text NOT NULL`). The only candidate for a new column is `fingerprint_patched_at timestamptz` (Phase 15 explicitly deferred). Plan-phase decides whether the column adds enough auditability to justify a migration, or whether logging the patch call to Axiom is sufficient.
- Exact shape of the `pending` state in the existing connect dialog (text-only spinner, shadcn `<Button disabled isPending>`, or new `<Skeleton>` block) — pick whatever matches the existing dialog's component vocabulary.
- Helper return type when no compatible `browser_profile` exists during reuse lookup (return `null` and let allocator continue, vs. throw and let caller handle) — pick whichever minimizes call-site noise.
- Which GoLogin REST response field is the source of truth for `gologin_proxy_id` after `mode: "geolocation"` (per D-06 — verify the API shape during research and document the choice in PLAN.md).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (binding)

- `.planning/ANTI-BAN-ARCHITECTURE.md` §"Faza 0" lines 87–188 — `browser_profiles` invariant ("1 proxy ≡ 1 GoLogin profile ≡ N accounts max 1/platform"), allocator algorithm sketch, list of refactor targets. **Faza 1** lines 191–229 — Variant A vs B description and the country→timezone/locale mapping table this phase implements.
- `.planning/ANTI-BAN-ARCHITECTURE.md` §"Kolejność wykonania" — confirms Faza 1 (this phase) must land before Faza 2 (Phase 18 cookies).

### Requirements (locked)

- `.planning/REQUIREMENTS.md` BPRX-03 — residential GeoProxy allocation. **Note:** the "existing 8 floppydata residential proxies reused before purchasing more" clause is overridden by D-05 of this CONTEXT.
- `.planning/REQUIREMENTS.md` BPRX-04 — `patch_profile_fingerprints` after every profile creation
- `.planning/REQUIREMENTS.md` BPRX-05 — country → timezone + locale + UA mapping (US/GB/DE/PL/FR/CA/AU minimum)
- `.planning/REQUIREMENTS.md` BPRX-06 — auto-reuse algorithm
- `.planning/ROADMAP.md` "Phase 17: Residential Proxy + GoLogin Profile Allocator" — 5 success criteria. **Note:** criterion #1 wording amended per D-05.

### Prior phase decisions (binding)

- `.planning/phases/15-browser-profile-schema-foundation/15-CONTEXT.md` D-01..D-14 — `browser_profiles` schema is locked; `country_code`/`timezone`/`locale` columns exist; `cookies_jar` and `last_used_at` columns explicitly deferred and NOT to be added in this phase
- `.planning/phases/15-browser-profile-schema-foundation/15-CONTEXT.md` D-08 — `getBrowserProfileForAccount` helper exists at `src/features/browser-profiles/lib/get-browser-profile.ts`; allocator should not duplicate its read path

### Project context

- `.planning/PROJECT.md` "Current Milestone: v1.2" — Track 1 (Anti-Ban) framing
- `CLAUDE.md` §Database — migration naming convention if a migration becomes necessary (next sequential after `00023_`)
- `CLAUDE.md` §Environments — apply any migration to dev branch `effppfiphrykllkpkdbv` first; never run destructive SQL on prod
- `CLAUDE.md` §Critical Rules — service role client server-side only, `await logger.flush()` before returning from API routes (allocator runs in a server action, not an API route — flush rule does not apply but Axiom logging does)
- `.env.example` — `GOLOGIN_API_TOKEN` (already in env, no new vars)

### Existing code (refactor + read targets — confirmed via grep)

- `src/lib/gologin/client.ts:41-73` — `createProfile` to be split into `createProfileV2` + add `patchProfileFingerprints`; `mode: "gologin"` is the line that goes away
- `src/lib/gologin/adapter.ts` — read-only context for understanding how the profile is later consumed; no edits expected in this phase
- `src/features/accounts/actions/account-actions.ts:22-70` — `connectAccount` rewrite to call the allocator
- `src/features/browser-profiles/lib/get-browser-profile.ts` (created in Phase 15) — read by allocator's reuse lookup
- `src/features/accounts/components/account-card.tsx` — read-only; no UI changes here beyond the connect-dialog spinner state
- `supabase/migrations/00023_browser_profiles.sql` (Phase 15) — schema reference for column types when constructing the INSERT

### Excluded refs (deliberately not loaded)

- `.planning/PRICING.md` — Track 2 territory; credit-cost-of-account-creation referenced in D-09 but the actual credit accounting lives in Phase 19+
- `.planning/SIGNAL-DETECTION-MECHANISMS.md`, `.planning/OUTBOUND-COMMUNICATION-MECHANISMS.md` — irrelevant to allocator
- ANTI-BAN doc Faza 2 (cookies), Faza 3 (warmup), Faza 4 (preflight/CU detector), Faza 5 (kosmetyka) — handled by Phases 18 and the kosmetyka backlog

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`getBrowserProfileForAccount` / `getBrowserProfileById` helper** (Phase 15 D-08) at `src/features/browser-profiles/lib/get-browser-profile.ts` — allocator's reuse-lookup query can sit alongside this helper as a sibling export `findReusableProfile(userId, country, platform, supabase)`.
- **`stopCloudBrowser` cleanup pattern** in `src/lib/gologin/adapter.ts:30-45` (the GoLoginConnection.profileId tracking surfaced in Phase 13 UAT) — same defensive try/finally shape applies to `deleteProfile` rollback in D-10.
- **Existing `createProfile` + `startCloudBrowser` + `deleteProfile` REST wrappers** in `client.ts` — the new `createProfileV2` and `patchProfileFingerprints` follow the same `headers()` + fetch + non-OK error shape; copy-adapt rather than introducing a new HTTP utility.

### Established Patterns

- **Server actions return `{ error }` or `{ success, ... }` shape** (see `account-actions.ts`). Allocator surface follows the same shape; the connect dialog already knows how to render `error`.
- **`revalidatePath('/accounts')` after mutation** — allocator must call this after the social_accounts insert.
- **Supabase client passed in, not imported as a singleton** (Phase 15 D-08 + the worker.ts pattern) — allocator accepts the supabase client as a parameter so server actions and crons share the same code.
- **Sentry breadcrumb + Axiom structured log on every external API call** — pattern used in `worker.ts`; mirror for the GoLogin allocator (correlationId per `connectAccount` invocation).

### Integration Points

- `connectAccount` is the only writer of `social_accounts` rows AND the only writer of GoLogin profiles (confirmed via grep — no other paths). Allocator is the single chokepoint for both.
- The `pending` UI state lives in whichever component renders the connect dialog (need to confirm exact path during plan — likely `src/features/accounts/components/connect-account-dialog.tsx` or similar; the connect button currently lives near `account-card.tsx`).
- No cron / no API route consumes the allocator in this phase — it's only invoked from the user-initiated server action. Phase 18 onward starts wiring it into background paths via the cookies jar.

</code_context>

<specifics>
## Specific Ideas

- New file: `src/features/browser-profiles/lib/allocator.ts` — exports `allocateBrowserProfile`
- New file: `src/features/browser-profiles/lib/country-map.ts` — exports `COUNTRY_MAP`, `mapForCountry(code)` helper, `SupportedCountry` type union of the 7 codes
- `client.ts` refactor: `createProfile(accountHandle, startUrl)` → `createProfileV2({ accountHandle, countryCode, startUrl, navigator })`; add `patchProfileFingerprints(profileId)` and `deleteProfile` already exists
- UA shape stays Chrome 130 Win64 (matches current `client.ts` line 56) — bump only if research finds a newer version still considered safe
- Default country call site value: `'US'` literal in `connectAccount` (NOT pulled from any DB column or env var — D-01 keeps it explicit so future phases can grep for it)
- Commit message scope: `feat(17): residential geoproxy + browser_profile allocator`

</specifics>

<deferred>
## Deferred Ideas

- **Country picker UI / multi-country support** — defer until a real non-US user appears or until campaign-target derivation lands. When ready: add country select to connect dialog + derive default from `product_profiles.target_country` (column does not exist yet).
- **Periodic UA rotation** via `patch_profile_update_ua_to_new_browser_v` — anti-ban kosmetyka backlog (ANTI-BAN doc §Faza 5).
- **`fingerprint_patched_at` audit column** on `browser_profiles` — only add if Claude's Discretion in D decides it's worth a migration.
- **`last_used_at` column** for LRU profile-reuse bias — Phase 15 deferred; only resurrect if BPRX-06 reuse rule proves too sticky in practice.
- **Postgres CHECK constraint on `country_code`** — defer until country picker exists (D-13).
- **Race-protection lock against concurrent allocation** — explicitly rejected in this phase (D-09); duplicates accepted as billable. Revisit only if duplicate creation becomes a support burden.
- **8 prepaid floppydata proxies utilization** — Variant B drops the explicit reuse path (D-04, D-05). If GoLogin's `autoProxyRegion` doesn't naturally consume them, accept the sunk cost. Revisit only if traffic billing surprises arrive.
- **Mocked unit tests for the allocator** — D-16. Only add if plan-phase finds a cheap, non-fragile harness shape.
- **Cleanup cron / orphan reaper** for GoLogin profiles whose DB row is gone — best-effort `deleteProfile` covers the happy path (D-10); reaper only if Sentry shows real orphan accumulation.

</deferred>

---

*Phase: 17-residential-proxy-gologin-profile-allocator*
*Context gathered: 2026-04-27*
