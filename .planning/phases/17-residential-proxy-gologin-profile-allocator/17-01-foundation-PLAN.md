---
phase: 17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/features/browser-profiles/lib/country-map.ts
  - src/lib/gologin/client.ts
  - src/features/browser-profiles/lib/__tests__/country-map.test.ts
  - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md
autonomous: true
requirements: [BPRX-04, BPRX-05]
tags: [phase-17, gologin, allocator, country-map]

must_haves:
  truths:
    - "Country code 'US' maps to a deterministic { timezone, locale, userAgent, language } record at runtime"
    - "Calling mapForCountry on an unsupported code throws a typed error"
    - "createProfileV2 sends proxy.mode='geolocation' (never 'gologin') and accepts countryCode + navigator + timezone arguments"
    - "patchProfileFingerprints issues a single REST call against the verified endpoint and surfaces non-2xx as a thrown Error"
    - "GoLogin response shape under mode:'geolocation' is documented with the canonical field path used to populate browser_profiles.gologin_proxy_id"
  artifacts:
    - path: src/features/browser-profiles/lib/country-map.ts
      provides: "COUNTRY_MAP const + mapForCountry helper + SupportedCountry union"
      contains: "export const COUNTRY_MAP"
    - path: src/lib/gologin/client.ts
      provides: "createProfileV2 + patchProfileFingerprints exports"
      contains: "export async function createProfileV2"
    - path: .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md
      provides: "Recorded answers to RESEARCH.md Open Questions #1 (patch endpoint) and #2 (proxy id field)"
    - path: src/features/browser-profiles/lib/__tests__/country-map.test.ts
      provides: "Unit tests for COUNTRY_MAP completeness + mapForCountry throw behavior"
  key_links:
    - from: src/features/browser-profiles/lib/country-map.ts
      to: src/lib/gologin/client.ts
      via: "navigator.userAgent + navigator.language reuse the same Chrome 130 Win64 stem"
      pattern: "Chrome/130\\.0\\.0\\.0"
    - from: src/lib/gologin/client.ts
      to: GoLogin REST `POST /browser`
      via: "createProfileV2 fetch body"
      pattern: "mode:\\s*\"geolocation\""
---

<objective>
Establish the foundation for the Phase 17 allocator: a single source of truth for country→{tz, locale, UA} mapping (BPRX-05) and the new GoLogin REST wrappers `createProfileV2` + `patchProfileFingerprints` (BPRX-04 + half of BPRX-03). Resolve the two `[ASSUMED]` API-shape questions from RESEARCH.md (patch endpoint path, proxy id echo field) via a one-time dev-workspace probe before the wrappers lock.

Purpose: Phase 17's orchestrator (plan 02) depends on these primitives. Splitting them out lets us ship them under unit-test coverage and lock the API contract before integration code goes onto disk.
Output:
  - `country-map.ts` with the 7-country table from CONTEXT D-12
  - `createProfileV2` and `patchProfileFingerprints` exports in `client.ts` (legacy `createProfile` retained until plan 02 migrates the only caller)
  - `17-API-PROBE.md` recording the empirical answers to Open Questions #1 + #2
  - Vitest unit suite for `mapForCountry`
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-RESEARCH.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Existing GoLogin REST wrapper shape — copy-adapt, don't reinvent -->

From src/lib/gologin/client.ts:
```ts
const GOLOGIN_API = "https://api.gologin.com"
function getToken(): string { /* throws on missing GOLOGIN_API_TOKEN */ }
function headers(): HeadersInit  // Authorization Bearer + Content-Type JSON

export async function createProfile(accountHandle: string, startUrl?: string): Promise<string>
// LEGACY — line 41-73, hardcodes proxy.mode='gologin' on line 60. Keep until plan 02 migrates connectAccount.

export async function deleteProfile(profileId: string): Promise<void>
// Line 80-92 — template for patchProfileFingerprints error shape.

export async function startCloudBrowser(profileId: string): Promise<CloudBrowserSession>
export async function stopCloudBrowser(profileId: string): Promise<void>
export async function getProfile(profileId: string): Promise<GoLoginProfile | null>
// Line 155-173 — used by the probe step to inspect proxy id field after create.
```

Existing UA string (verbatim from client.ts:55, copy into country-map.ts UA constant):
```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36
```
</interfaces>

<decisions_pinned>
- D-04: Variant B canonical — `proxy: { mode: "geolocation", autoProxyRegion: countryCode, autoProxyCity: "" }`. Never `mode: "gologin"`.
- D-07: `patchProfileFingerprints` sends an empty body `{}` — no field overrides.
- D-08: Single Chrome major (130) Win64 across all 7 countries; only `Accept-Language` / `language` differs.
- D-12: Exactly 7 countries (US/GB/DE/PL/FR/CA/AU) with the canonical (timezone, locale, language) tuples in the table.
- D-15: New exports live in `src/lib/gologin/client.ts`; legacy `createProfile` removed in plan 02 (NOT this plan).
- D-16: Mocked tests for the orchestrator are deferred, but pure-function unit tests on `country-map.ts` are cheap and non-fragile — opt in here only.
</decisions_pinned>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Probe GoLogin REST shape and document answers</name>
  <files>.planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md</files>
  <read_first>
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-RESEARCH.md (§Open Questions, §GoLogin REST Surface)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-04, D-06, D-07)
    - src/lib/gologin/client.ts (lines 41-92, 155-173 — fetch shape + getProfile + deleteProfile patterns)
    - .env.example (confirm GOLOGIN_API_TOKEN env var name)
  </read_first>
  <action>
Goal: settle Open Questions #1 (patch_profile_fingerprints exact REST path + body) and #2 (which response field carries the proxy id under mode:"geolocation") before locking the wrappers in Task 3.

Produce a one-shot probe script at `scripts/phase17-gologin-probe.ts` (or run inline via `node --input-type=module -e '...'`) that:
1. Creates a throwaway profile with `mode: "geolocation"` + `autoProxyRegion: "US"` against the dev workspace via `POST /browser` using the same headers helper as `client.ts`. Log the FULL JSON response.
2. Issues `GET /browser/{id}` and logs the `proxy` sub-object verbatim.
3. Tries `POST /browser/{id}/fingerprints` with `{}`. If 4xx, fall back to `PATCH /browser/{id}` with `{ randomize: true }` (per RESEARCH Assumption A1). Log status + body on each attempt.
4. Cleans up via `DELETE /browser/{id}` regardless of outcome.

Run the script ONCE manually. Capture results into a new file `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md` with the following sections:
  - **Probe date** (today)
  - **OQ#1 — fingerprint endpoint:** the exact path and body shape that returned 2xx (record the curl-equivalent command), or document "MCP-only" if no REST path works (then plan 02 must call `mcp__gologin-mcp__patch_profile_fingerprints` from the server action — flag as deviation).
  - **OQ#2 — proxy id field path:** the JSON path to the stable proxy id (e.g., `response.proxy.id`, `response.proxyEnabled`, or `getProfile(id).proxy.id`). If no stable id is echoed under geolocation mode, document "store NULL" — and confirm `browser_profiles.gologin_proxy_id` allows NULL (it does NOT per migration 00023; in that case document the fallback: store the GoLogin profile id as proxy id, OR coordinate a follow-up Phase 15 migration to relax the NOT NULL — record which path plan 02 must take).
  - **Assumption A3 confirmation:** verify `UNIQUE (browser_profile_id, platform)` constraint exists by inspecting `supabase/migrations/00023_browser_profiles.sql` line 57-58 and noting the constraint name.

Delete the probe script from disk after completion (per "no orphaned debug scripts" rule); the markdown is the durable artifact.
  </action>
  <verify>
    <automated>test -f .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md &amp;&amp; grep -E "OQ#1|OQ#2" .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md</automated>
  </verify>
  <acceptance_criteria>
    - File `17-API-PROBE.md` exists and contains explicit answers (not "TODO") for OQ#1 path+body, OQ#2 field path, and an A3 confirmation line referencing migration 00023 constraint name `one_account_per_platform`.
    - The probe script is no longer on disk (`test ! -f scripts/phase17-gologin-probe.ts`).
    - No throwaway profiles remain in dev GoLogin workspace (cleanup attempted in step 4).
  </acceptance_criteria>
  <done>OQ#1 and OQ#2 are settled with empirical evidence; plan 02 has a deterministic field path to read for `gologin_proxy_id`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Country map module + unit tests</name>
  <files>src/features/browser-profiles/lib/country-map.ts, src/features/browser-profiles/lib/__tests__/country-map.test.ts</files>
  <read_first>
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-08, D-12, D-13)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-PATTERNS.md (§country-map.ts section, lines 19-48)
    - src/lib/gologin/client.ts (line 53-59 — UA string + language shape to mirror)
    - src/features/accounts/lib/types.ts (existing union+helper pattern reference)
  </read_first>
  <behavior>
    - Test 1: `COUNTRY_MAP` has exactly 7 keys: US, GB, DE, PL, FR, CA, AU
    - Test 2: For each country, `mapForCountry(code)` returns timezone/locale/language matching the D-12 table verbatim (e.g., `mapForCountry('PL').timezone === 'Europe/Warsaw'` and `mapForCountry('PL').language === 'pl-PL,pl'`)
    - Test 3: Every `userAgent` value contains `Chrome/130.0.0.0` and `Win64; x64` (D-08 single-major rule)
    - Test 4: `mapForCountry('XX')` throws an Error whose message includes `'Unsupported country_code: XX'`
    - Test 5: `mapForCountry('us')` throws (case-sensitive — uppercase ISO required)
  </behavior>
  <action>
Create `src/features/browser-profiles/lib/country-map.ts` exporting:

```ts
export type SupportedCountry = "US" | "GB" | "DE" | "PL" | "FR" | "CA" | "AU"

const UA_CHROME_130_WIN64 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

export interface CountryProfile {
  timezone: string
  locale: string
  userAgent: string
  language: string
}

export const COUNTRY_MAP: Record<SupportedCountry, CountryProfile> = {
  US: { timezone: "America/New_York", locale: "en-US", language: "en-US,en", userAgent: UA_CHROME_130_WIN64 },
  GB: { timezone: "Europe/London",     locale: "en-GB", language: "en-GB,en", userAgent: UA_CHROME_130_WIN64 },
  DE: { timezone: "Europe/Berlin",     locale: "de-DE", language: "de-DE,de", userAgent: UA_CHROME_130_WIN64 },
  PL: { timezone: "Europe/Warsaw",     locale: "pl-PL", language: "pl-PL,pl", userAgent: UA_CHROME_130_WIN64 },
  FR: { timezone: "Europe/Paris",      locale: "fr-FR", language: "fr-FR,fr", userAgent: UA_CHROME_130_WIN64 },
  CA: { timezone: "America/Toronto",   locale: "en-CA", language: "en-CA,en", userAgent: UA_CHROME_130_WIN64 },
  AU: { timezone: "Australia/Sydney",  locale: "en-AU", language: "en-AU,en", userAgent: UA_CHROME_130_WIN64 },
}

export function mapForCountry(code: string): CountryProfile {
  if (!(code in COUNTRY_MAP)) {
    throw new Error(`Unsupported country_code: ${code}`)
  }
  return COUNTRY_MAP[code as SupportedCountry]
}
```

Values are VERBATIM from CONTEXT D-12. Per D-13, no Postgres CHECK is added — type union + helper throw are the only enforcement layers.

Create the Vitest spec at `src/features/browser-profiles/lib/__tests__/country-map.test.ts` covering the 5 behaviors above. Use `describe` / `it` / `expect`. No mocks required — pure functions.
  </action>
  <verify>
    <automated>pnpm test -- country-map</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test -- country-map` passes with all 5 tests green.
    - `grep -c "userAgent: UA_CHROME_130_WIN64" src/features/browser-profiles/lib/country-map.ts` returns `7` (one per country).
    - `grep -E "Europe/Warsaw|America/New_York|Australia/Sydney" src/features/browser-profiles/lib/country-map.ts` returns 3+ matches.
    - `npx tsc --noEmit` passes (or `pnpm typecheck` is green).
  </acceptance_criteria>
  <done>`mapForCountry('US')` returns the canonical US tuple at runtime, throws on unknown codes, and the 7-country table is locked behind a unit suite.</done>
</task>

<task type="auto">
  <name>Task 3: Add createProfileV2 + patchProfileFingerprints to GoLogin client</name>
  <files>src/lib/gologin/client.ts</files>
  <read_first>
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md (Task 1 output — endpoint paths)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-04, D-07, D-15)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-PATTERNS.md (§client.ts section, lines 130-188)
    - src/lib/gologin/client.ts (entire file — error shape lines 64-69, 86-91 to mirror; create body lines 41-73; D-15 says LEGACY createProfile must remain in this plan and is removed in plan 02)
    - src/features/browser-profiles/lib/country-map.ts (Task 2 — to import the navigator types if helpful, but client.ts must NOT depend on country-map; allocator passes the resolved navigator block in)
  </read_first>
  <action>
Edit `src/lib/gologin/client.ts`. Add two new exports AFTER the existing `getProfile` function (do not delete or modify `createProfile`, `deleteProfile`, `startCloudBrowser`, `stopCloudBrowser`, `getProfile` — plan 02 removes `createProfile`).

1. `createProfileV2`:

```ts
export interface CreateProfileV2Args {
  accountHandle: string
  countryCode: string
  navigator: {
    userAgent: string
    resolution: string
    language: string
    platform: string
  }
  timezone: string
  startUrl?: string
}

export interface CreateProfileV2Result {
  id: string
  proxy?: { id?: string | null } | null
  // Capture extra fields loosely — probe in Task 1 documents the exact shape.
  [key: string]: unknown
}

export async function createProfileV2(
  args: CreateProfileV2Args,
): Promise<CreateProfileV2Result> {
  const response = await fetch(`${GOLOGIN_API}/browser`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: `repco-${args.accountHandle}`,
      os: "win",
      browserType: "chrome",
      startUrl: args.startUrl ?? "",
      navigator: args.navigator,
      timezone: { enabled: true, fillBasedOnIp: false, timezone: args.timezone },
      proxy: {
        mode: "geolocation",
        autoProxyRegion: args.countryCode,
        autoProxyCity: "",
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin createProfileV2 failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as CreateProfileV2Result
}
```

Critical: `proxy.mode` MUST be the string literal `"geolocation"`. NEVER `"gologin"`. NEVER fall back. Per D-04/D-05, country-mismatch breaks the whole anti-ban premise — surface errors instead.

2. `patchProfileFingerprints` — use the path + body settled in Task 1's `17-API-PROBE.md`:

```ts
export async function patchProfileFingerprints(profileId: string): Promise<void> {
  // Path + body from 17-API-PROBE.md (OQ#1). Per D-07, body is empty so GoLogin
  // re-randomizes canvas/webGL/audio/fonts using its own defaults.
  const response = await fetch(
    `${GOLOGIN_API}/browser/${profileId}/fingerprints`, // <-- USE PATH FROM PROBE; if probe found a different path, use it
    {
      method: "POST", // <-- USE METHOD FROM PROBE
      headers: headers(),
      body: JSON.stringify({}),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin patchProfileFingerprints failed (${response.status}): ${body}`,
    )
  }
}
```

If the probe found that only the MCP exposes the patch op, document this loudly with a `// DEVIATION:` comment and stub the function body to throw a clear runtime error so plan 02 catches it during integration. Do NOT silently no-op.

Per D-15: legacy `createProfile` STAYS in this plan (its caller `connectAccount` still uses it). Plan 02 deletes it after migrating the caller.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; grep -E "mode:\s*\"geolocation\"" src/lib/gologin/client.ts &amp;&amp; ! grep -E "createProfileV2.*\"gologin\"" src/lib/gologin/client.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "export async function createProfileV2" src/lib/gologin/client.ts` returns `1`.
    - `grep -c "export async function patchProfileFingerprints" src/lib/gologin/client.ts` returns `1`.
    - `grep -E "mode:\s*\"geolocation\"" src/lib/gologin/client.ts` matches at least once (createProfileV2 body).
    - `grep -E "mode:\s*\"gologin\"" src/lib/gologin/client.ts` returns ONLY the legacy `createProfile` line (count must equal `1`, not `2`).
    - `grep -c "export async function createProfile\b" src/lib/gologin/client.ts` returns `1` (legacy retained per D-15).
    - `pnpm typecheck` passes.
  </acceptance_criteria>
  <done>`client.ts` exports two new functions matching the probed REST shape; legacy `createProfile` retained for plan 02 migration; mode:"gologin" appears exactly once (in legacy code path).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Server action → GoLogin REST | `createProfileV2` and `patchProfileFingerprints` cross from authenticated server runtime to a third-party API with bearer token. Untrusted JSON crosses back. |
| Probe script → GoLogin dev workspace | One-shot human-run probe creates+deletes a throwaway profile. Token leakage risk if script committed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-17-01-01 | Information Disclosure | Probe script | mitigate | Script deleted from disk after Task 1; only the markdown summary persists. Script never committed (verify with `git status` before commit). |
| T-17-01-02 | Tampering | `createProfileV2` body | mitigate | `proxy.mode` is a hardcoded string literal `"geolocation"` — no user input flows into it. `countryCode` is constrained at the caller (allocator validates against `SupportedCountry` union before invoking). |
| T-17-01-03 | Information Disclosure | GoLogin error body in thrown Error | accept | Existing `client.ts` already includes raw API body in error message. No PII or secret crosses GoLogin's error responses (token never echoed). Caller logs to Axiom server-side only. |
| T-17-01-04 | Spoofing | `mapForCountry` returns wrong country tuple | mitigate | Unit suite (Task 2) asserts every entry verbatim against D-12. `tsc --noEmit` enforces literal-typed `Record<SupportedCountry, _>`. |
| T-17-01-05 | Denial of Service | Empty-body fingerprint patch | accept | Single REST call per allocation; GoLogin rate-limit applies at their edge. Allocator failure path (plan 02) returns user-facing error and does not retry. |
</threat_model>

<verification>
- `pnpm typecheck` clean
- `pnpm test -- country-map` green (5 tests)
- `grep -E "mode:\s*\"gologin\"" src/lib/gologin/client.ts | wc -l` returns `1` (exactly the legacy line, plan 02 removes it)
- `17-API-PROBE.md` has explicit answers — no "TODO" tokens remain
</verification>

<success_criteria>
- BPRX-04 wrapper exists and points at the verified REST endpoint (`patchProfileFingerprints`)
- BPRX-05 country map is locked, type-safe, and unit-tested
- Plan 02 has every primitive it needs: `createProfileV2`, `patchProfileFingerprints`, `mapForCountry`, and a documented field path for `gologin_proxy_id`
</success_criteria>

<output>
After completion, create `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-01-SUMMARY.md` recording:
  - The probed endpoint path/method for `patchProfileFingerprints`
  - The proxy-id field path from `createProfileV2` response (or fallback decision)
  - Any deviations from D-04/D-07 the probe forced
</output>
