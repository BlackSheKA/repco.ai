/**
 * GoLogin REST API client for profile CRUD operations.
 *
 * Uses direct REST calls instead of the `gologin` npm package
 * to avoid pulling in Puppeteer as a transitive dependency.
 *
 * Requires server-only env var: GOLOGIN_API_TOKEN
 */

const GOLOGIN_API = "https://api.gologin.com"

export interface GoLoginProfile {
  id: string
  name: string
  os: string
}

function getToken(): string {
  const token = process.env.GOLOGIN_API_TOKEN
  if (!token) {
    throw new Error(
      "GOLOGIN_API_TOKEN is not set. Add it to your environment variables."
    )
  }
  return token
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  }
}

/**
 * Delete a GoLogin browser profile.
 *
 * @param profileId - The GoLogin profile ID to delete
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}`, {
    method: "DELETE",
    headers: headers(),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin deleteProfile failed (${response.status}): ${body}`
    )
  }
}

export interface CloudBrowserSession {
  status: string
  remoteOrbitaUrl: string
}

/**
 * Start the GoLogin Cloud Browser for a profile and return the remote
 * viewer URL. The URL can be opened in any browser to see and interact
 * with the running Orbita instance.
 *
 * @param profileId - The GoLogin profile ID to start
 * @param startingUrl - Optional URL for the browser's initial page
 * @returns Session info with the remote Orbita viewer URL
 */
export async function startCloudBrowser(
  profileId: string
): Promise<CloudBrowserSession> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin startCloudBrowser failed (${response.status}): ${body}`
    )
  }

  return (await response.json()) as CloudBrowserSession
}

/**
 * Stop a running GoLogin Cloud Browser session. Idempotent — returns true
 * whether or not a session was running.
 *
 * @param profileId - The GoLogin profile ID
 */
export async function stopCloudBrowser(profileId: string): Promise<void> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
    method: "DELETE",
    headers: headers(),
  })

  if (response.status === 204 || response.status === 404) {
    return
  }

  const body = await response.text()
  throw new Error(
    `GoLogin stopCloudBrowser failed (${response.status}): ${body}`
  )
}

/**
 * Get a GoLogin browser profile by ID.
 *
 * @param profileId - The GoLogin profile ID
 * @returns The profile object, or null if not found (404)
 */
export async function getProfile(
  profileId: string
): Promise<GoLoginProfile | null> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}`, {
    method: "GET",
    headers: headers(),
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin getProfile failed (${response.status}): ${body}`)
  }

  return (await response.json()) as GoLoginProfile
}

// ---------------------------------------------------------------------------
// Phase 17: createProfileV2 + patchProfileFingerprints (BPRX-03, BPRX-04)
// ---------------------------------------------------------------------------

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
  // Capture extra fields loosely — probe in 17-API-PROBE.md documents the exact shape.
  [key: string]: unknown
}

/**
 * Create a new GoLogin browser profile with a residential geolocation proxy.
 *
 * Uses proxy.mode="geolocation" + autoProxyRegion (NEVER the shared "gologin" mode).
 * Per D-04/D-05: country-mismatch breaks the anti-ban premise — surface errors instead
 * of falling back to a different region.
 *
 * NOTE (17-API-PROBE.md OQ#2): The create response proxy.mode will be "none" — this is
 * expected. GoLogin activates the geolocation proxy when the browser session starts.
 * autoProxyRegion is preserved in the stored profile and used at session start time.
 * Store profile.id as gologin_proxy_id (no stable proxy.id is returned under geolocation mode).
 *
 * NOTE: autoProxyRegion must be lowercase (GoLogin validation enforces: us, uk, de, ca, in).
 */
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
        autoProxyRegion: args.countryCode.toLowerCase(),
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

/**
 * Patch the fingerprint of a GoLogin browser profile.
 *
 * DEVIATION (17-API-PROBE.md OQ#1): No REST endpoint for fingerprint patching exists.
 * Both POST /browser/{id}/fingerprints and PATCH /browser/{id} return 404.
 * The operation is MCP-only (mcp__gologin-mcp__patch_profile_fingerprints).
 *
 * Plan 02 (allocator.ts) must call the MCP tool directly from the server action layer.
 * This stub is retained so the interface is stable and callers get a clear runtime error
 * if they attempt the REST path.
 */
export async function patchProfileFingerprints(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profileId: string,
): Promise<void> {
  // DEVIATION: POST /browser/{id}/fingerprints → 404 (confirmed by 17-API-PROBE.md).
  // The GoLogin REST API v1 does not expose a fingerprint randomization endpoint.
  // Use mcp__gologin-mcp__patch_profile_fingerprints from the server action layer instead.
  throw new Error(
    "patchProfileFingerprints: no REST endpoint available (MCP-only). " +
      "Call mcp__gologin-mcp__patch_profile_fingerprints from the server action layer. " +
      "See .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md OQ#1.",
  )
}
