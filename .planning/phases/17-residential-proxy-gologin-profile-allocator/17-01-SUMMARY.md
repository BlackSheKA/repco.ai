---
phase: 17
plan: "01"
superseded_by: 17.5
subsystem: browser-profiles
tags: [phase-17, gologin, country-map, allocator-foundation, bprx-04, bprx-05]
dependency_graph:
  requires:
    - "Phase 15: browser_profiles schema (00023_browser_profiles.sql)"
  provides:
    - "src/features/browser-profiles/lib/country-map.ts (COUNTRY_MAP, mapForCountry, SupportedCountry)"
    - "src/lib/gologin/client.ts (createProfileV2, patchProfileFingerprints exports)"
    - ".planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md"
  affects:
    - "Plan 17-02 allocator.ts — depends on all three primitives above"
tech_stack:
  added: []
  patterns:
    - "Typed Record<SupportedCountry, CountryProfile> + throwing helper (country-map)"
    - "TDD RED/GREEN cycle for pure-function unit tests (Vitest)"
    - "GoLogin REST wrapper: fetch + headers() + error-shape (createProfileV2 follows existing pattern)"
key_files:
  created:
    - src/features/browser-profiles/lib/country-map.ts
    - src/features/browser-profiles/lib/__tests__/country-map.test.ts
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md
  modified:
    - src/lib/gologin/client.ts
decisions:
  - "D-04 upheld: proxy.mode='geolocation' hardcoded in createProfileV2; mode:'gologin' appears exactly once (legacy createProfile, plan 02 removes it)"
  - "OQ#1 resolved: patchProfileFingerprints has no REST endpoint (both POST /fingerprints and PATCH /browser/{id} → 404); stub throws with MCP-redirect message; plan 02 must call mcp__gologin-mcp__patch_profile_fingerprints"
  - "OQ#2 resolved: no proxy.id returned under mode:geolocation; store profile.id as gologin_proxy_id (satisfies UNIQUE NOT NULL constraint in 00023)"
  - "autoProxyRegion must be lowercase: countryCode.toLowerCase() added in createProfileV2 body"
  - "A3 confirmed: constraint one_account_per_platform exists at 00023_browser_profiles.sql line 58"
  - "Legacy createProfile retained per D-15; plan 02 removes it after migrating connectAccount"
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-27"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

> **Superseded by Phase 17.5** (Browserbase pivot). See `.planning/phases/17.5-browser-profile-allocator-browserbase/` for the working implementation. This summary preserved as historical evidence of the GoLogin pivot per D17.5-08.

# Phase 17 Plan 01: Foundation Summary

**One-liner:** Country-map module (7 IANA timezones, D-12 verbatim) + GoLogin REST wrappers (createProfileV2 with mode:geolocation, patchProfileFingerprints MCP-stub) + empirical probe settling two open questions.

## What Was Built

### Task 1: GoLogin API Probe (OQ#1 + OQ#2)

Ran a live one-shot probe against GoLogin's dev workspace. Profile `repco-probe-throwaway` was created and deleted. Key empirical findings:

**OQ#1 — Fingerprint endpoint:**
- `POST /browser/{id}/fingerprints` → HTTP 404
- `PATCH /browser/{id}` (fallback) → HTTP 404
- **Conclusion:** No REST endpoint exists. MCP-only operation.

**OQ#2 — Proxy id field path:**
- `POST /browser` response proxy sub-object: `{ mode: "none", autoProxyRegion: "us", ...no id field }`
- `GET /browser/{id}` proxy sub-object: same shape, no `proxy.id`
- **Conclusion:** Store `profile.id` (the GoLogin profile ID) as `gologin_proxy_id`. This satisfies `UNIQUE NOT NULL` in migration 00023.

**Additional finding:** `autoProxyRegion` must be lowercase (`us` not `US`). GoLogin returns HTTP 400 with validation error `isIn: "autoProxyRegion must be one of the following values: us, uk, de, ca, in"`.

### Task 2: Country Map Module (BPRX-05)

`src/features/browser-profiles/lib/country-map.ts`:
- `SupportedCountry` union type (7 ISO codes)
- `COUNTRY_MAP: Record<SupportedCountry, CountryProfile>` — 7 entries verbatim from D-12
- `mapForCountry(code)` — throws `Unsupported country_code: XX` on unknown code

`src/features/browser-profiles/lib/__tests__/country-map.test.ts`:
- 5 tests, all green: key count, D-12 verbatim tuples, Chrome/130 Win64 UA, XX throws, us throws

### Task 3: GoLogin Client Extensions (BPRX-04 partial)

Added to `src/lib/gologin/client.ts`:
- `createProfileV2(args: CreateProfileV2Args)`: `proxy.mode="geolocation"`, `autoProxyRegion=countryCode.toLowerCase()`, navigator/timezone forwarding
- `patchProfileFingerprints(profileId)`: DEVIATION stub — throws with explicit message directing callers to MCP tool

## Deviations from Plan

### Auto-fixed Issues

None — all code followed the plan exactly.

### Deviation: patchProfileFingerprints REST endpoint does not exist

- **Rule:** Rule 1 (Bug — empirical discovery during Task 1 probe)
- **Found during:** Task 1 (GoLogin API Probe)
- **Issue:** Both `POST /browser/{id}/fingerprints` and `PATCH /browser/{id}` return HTTP 404. The GoLogin REST API v1 does not expose a fingerprint randomization endpoint.
- **Fix:** `patchProfileFingerprints` is implemented as a stub that throws a descriptive error. Plan 02 must call `mcp__gologin-mcp__patch_profile_fingerprints` from the server action layer.
- **Files modified:** `src/lib/gologin/client.ts`
- **Commit:** f3d2823

### Deviation: autoProxyRegion lowercase requirement

- **Rule:** Rule 1 (Bug — HTTP 400 discovery during probe)
- **Found during:** Task 1 (first probe attempt with `autoProxyRegion: "US"`)
- **Issue:** GoLogin validates `autoProxyRegion` against an allowlist of lowercase codes (`us`, `uk`, `de`, `ca`, `in`). Uppercase `US` returns HTTP 400.
- **Fix:** `countryCode.toLowerCase()` applied in `createProfileV2` body before setting `autoProxyRegion`.
- **Files modified:** `src/lib/gologin/client.ts`
- **Commits:** f3d2823

### Plan 02 Implications

1. **patchProfileFingerprints:** Plan 02's allocator must call `mcp__gologin-mcp__patch_profile_fingerprints` (not the REST stub).
2. **gologin_proxy_id:** Store `createProfileV2Result.id` as `gologin_proxy_id` (no proxy.id in response).
3. **autoProxyRegion region support:** GoLogin's geolocation API only supports `us, uk, de, ca, in`. Countries `PL`, `FR`, `AU` from our 7-country map may get HTTP 400. Plan 02 must handle this gracefully per D-11.

## TDD Gate Compliance

- RED commit: `dfbda06` — failing tests for country-map (import error, country-map.ts absent)
- GREEN commit: `8d6e3c5` — country-map implementation, all 5 tests pass
- REFACTOR: not needed (implementation was clean on first pass)

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `patchProfileFingerprints` throws at runtime | `src/lib/gologin/client.ts` | REST endpoint does not exist; MCP-only operation per 17-API-PROBE.md OQ#1. Plan 02 must use MCP tool. |

This stub does NOT block the plan's goal (task 3 goal = export exists and is type-safe). Plan 02 is the integration layer that wires the MCP call.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced beyond what the plan's threat model covers.

- T-17-01-01 (probe script leakage): probe script was never written to disk as a file; it ran inline via bash heredoc and was never committed. No secrets in source.
- T-17-01-02 (createProfileV2 body tampering): `proxy.mode` is hardcoded `"geolocation"`. `countryCode` is lowercased before use.
- T-17-01-04 (mapForCountry spoofing): unit suite asserts every entry verbatim.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/features/browser-profiles/lib/country-map.ts | FOUND |
| src/features/browser-profiles/lib/__tests__/country-map.test.ts | FOUND |
| .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md | FOUND |
| commit 0351223 (probe results) | FOUND |
| commit dfbda06 (failing tests RED) | FOUND |
| commit 8d6e3c5 (country-map GREEN) | FOUND |
| commit f3d2823 (client.ts extensions) | FOUND |
