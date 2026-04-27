# Phase 17: GoLogin API Probe Results

**Probe date:** 2026-04-27
**Profile used:** repco-probe-throwaway (GoLogin ID: 69ef5ea95baf5435c881e165)
**Outcome:** Profile created and deleted successfully. No orphan profiles remain.

> **UPDATE 2026-04-27 (post-UAT):**
>   - **OQ#1 was wrong.** The fingerprint endpoint exists — it's `PATCH /browser/fingerprints` (not `POST /browser/{id}/fingerprints` or `PATCH /browser/{id}`) with body `{ browsersIds: [id] }`. The probe tested wrong paths and concluded MCP-only. Verified against `https://api.gologin.com/docs-json` swagger spec.
>   - **OQ#2 was wrong.** Sending `proxy: { mode: "geolocation", autoProxyRegion }` in `POST /browser` body is silently ignored — the profile lands with `proxyEnabled: false` and starts on the host's IP (instant Reddit ban). Real proxy attach goes through `POST /users-proxies/mobile-proxy` — see §"OQ#3 — Residential proxy attach (post-UAT correction)" below.
>   - **OQ#4 (new):** `POST /browser/{id}/web` (start cloud browser) accepts no body params (empty schema). Use the profile's `startUrl` field at create time to land the cloud browser on a specific page. `PUT /browser/{id}/custom` does NOT accept startUrl, so reused profiles can't be redirected.

---

## OQ#1 — Fingerprint Endpoint

**Question:** What is the exact REST path and body shape for `patchProfileFingerprints`?

**Empirical result:** Both REST endpoints return 404:
- `POST /browser/{id}/fingerprints` → 404 Not Found
- `PATCH /browser/{id}` → 404 Not Found

**Conclusion: No REST endpoint exists for fingerprint patching. MCP-only operation.**

The GoLogin REST API v1 (api.gologin.com) does not expose a fingerprint randomization endpoint.
The operation is only available via `mcp__gologin-mcp__patch_profile_fingerprints`.

**DEVIATION from plan:** `patchProfileFingerprints` in `client.ts` must be stubbed to throw a
clear runtime error indicating MCP-only. Plan 02 (allocator.ts) must call the MCP tool from
the server action layer instead of calling `patchProfileFingerprints`. The function is kept as
a stub export so the interface is stable for plan 02 to wrap.

**Curl equivalent (both attempts):**
```bash
# Attempt 1 — 404
curl -X POST https://api.gologin.com/browser/69ef5ea95baf5435c881e165/fingerprints \
  -H "Authorization: Bearer $GOLOGIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
# Response: {"statusCode":404,"message":"Cannot POST /browser/.../fingerprints","error":"Not Found"}

# Attempt 2 fallback — 404
curl -X PATCH https://api.gologin.com/browser/69ef5ea95baf5435c881e165 \
  -H "Authorization: Bearer $GOLOGIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"randomize":true}'
# Response: {"statusCode":404,"message":"Cannot PATCH /browser/...","error":"Not Found"}
```

---

## OQ#2 — Proxy ID Field Path

**Question:** What JSON field carries the proxy id under `mode: "geolocation"` after `POST /browser`?

**Empirical result:**

The proxy sub-object from both `POST /browser` (create response) and `GET /browser/{id}` (follow-up):
```json
{
  "mode": "none",
  "host": "",
  "port": 80,
  "username": "",
  "password": "",
  "autoProxyRegion": "us",
  "torProxyRegion": "us"
}
```

**Key observations:**
1. The `proxy.mode` in the response is `"none"`, not `"geolocation"`. Sending `mode: "geolocation"` in the request body is accepted but the stored proxy mode is reset to `"none"`. GoLogin's geolocation proxy is activated when the browser session starts (not stored in the profile data).
2. There is **no `proxy.id` field** in either the create response or the GET response.
3. `proxyEnabled: false` in the response confirms the proxy is not statically attached.
4. `autoProxyRegion: "us"` is stored and confirms GoLogin will select a US-region proxy when the browser session starts.

**CRITICAL: `autoProxyRegion` must be lowercase** — GoLogin validation enforces lowercase country codes (`us`, `uk`, `de`, `ca`, `in`). Uppercase `US` returns HTTP 400:
```json
{"constraints": {"isIn": "autoProxyRegion must be one of the following values: us, uk, de, ca, in"}}
```
Note: Only 5 regions are currently supported by GoLogin's geolocation proxy API.

**Conclusion: No stable proxy id is echoed. Store the GoLogin profile ID as `gologin_proxy_id`.**

Since `browser_profiles.gologin_proxy_id text UNIQUE NOT NULL` cannot store NULL (verified in
migration 00023 — the NOT NULL constraint exists), and no proxy id is returned by the API, the
fallback is:

**Store the GoLogin profile ID (`profile.id` from the create response) as `gologin_proxy_id`.**

This is semantically valid: each profile has exactly one geolocation proxy assignment (via
`autoProxyRegion`), and the profile ID uniquely identifies it. The UNIQUE constraint on
`gologin_proxy_id` is naturally satisfied since profile IDs are unique.

Plan 02 must write: `gologin_proxy_id = createProfileV2Result.id` (same value as `gologin_profile_id`).

---

## Assumption A3 Confirmation

**Question:** Does `UNIQUE (browser_profile_id, platform)` constraint exist on `social_accounts`?

**Verified in `supabase/migrations/00023_browser_profiles.sql` lines 57-58:**
```sql
ALTER TABLE social_accounts
  ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform);
```

**Constraint name:** `one_account_per_platform` — confirmed present.

---

## Additional Findings for Plan 02

### autoProxyRegion must be lowercase
`createProfileV2` must `.toLowerCase()` the `countryCode` before setting `autoProxyRegion`.
Or alternatively, `COUNTRY_MAP` stores lowercase region codes separately from the ISO country
codes used for timezone/locale lookups. Recommended: add a `proxyRegion` field to `CountryProfile`
with the lowercase GoLogin-accepted value.

### Supported GoLogin geolocation regions
GoLogin validation error reveals the current allowed values: `us`, `uk`, `de`, `ca`, `in`.
Note: `in` = India, not in our 7-country BPRX-05 map. Missing from their geolocation proxy:
`pl`, `fr`, `au`. For those 3 countries, geolocation proxy may fall back to another region or
fail. Plan 02 should handle 400 responses gracefully per D-11.

### Probe timing
- Create: 201 (instant)
- GET: 200 (instant)
- POST /fingerprints: 404 (instant)
- PATCH /browser: 404 (instant)
- DELETE: 204 (instant)

---

## OQ#3 — Residential proxy attach (post-UAT correction, 2026-04-27)

**Question:** How do you actually attach a residential GeoProxy to a GoLogin profile?

**Empirical result (UAT failure → reprobe):**

`POST /browser` with `proxy: { mode: "geolocation", autoProxyRegion: "us" }` is silently no-op'd. Confirmed via `GET /browser/{id}` showing `proxy.mode: "none"`, `proxyEnabled: false`, no `proxy.id`, no `proxy.host/port/username/password` — i.e. profile runs on whatever IP the cloud Orbita instance has, which on a test from PL workspace = host IP, instant Reddit network-security block.

**The correct contract:**

```bash
curl -X POST https://api.gologin.com/users-proxies/mobile-proxy \
  -H "Authorization: Bearer $GOLOGIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "countryCode": "us",
    "isMobile": false,
    "isDC": false,
    "profileIdToLink": "<profile-id>",
    "customName": "repco-<handle>"
  }'
# 201 Created
# Response: { id, mode:"http", host:"geo.floppydata.com", port:10080,
#             username, password, connectionType:"resident", customName }
```

After this call, the profile shows `proxy.id` (real, stable), `proxy.mode:"geolocation"`, `proxyType:"geolocation"`, `proxyEnabled:true`. **This is what `assignResidentialProxy` in `src/lib/gologin/client.ts` calls.**

### Updated proxy-id storage rule

**Old (wrong):** Store profile id as `gologin_proxy_id` because the API returns no proxy id.
**New (correct):** Store the `id` from `assignResidentialProxy` response — it's the real proxy entity id.

### Traffic accounting

Each call to `assignResidentialProxy` allocates a NEW residential proxy entity drawing from the workspace's residential traffic pool (`residentTrafficData.trafficLimit`, currently 2 GB on dev). Reused profiles (D-02 path) do NOT call this function — they reuse the existing proxy. So billable traffic scales with the number of distinct browser_profiles, not social_accounts.

### Region constraint (unchanged)

Still 5 regions only: `us`, `uk`, `de`, `ca`, `in`. Country map's `pl`, `fr`, `au` will fail with HTTP 400 here just like they did under the wrong V1 contract.
