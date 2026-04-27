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
 * Create a new GoLogin browser profile WITHOUT a proxy attached.
 *
 * IMPORTANT (17-API-PROBE.md UPDATE): Sending `proxy: { mode: "geolocation", autoProxyRegion }`
 * in the POST /browser body is silently ignored — GoLogin stores the profile with
 * `proxy.mode = "none"` and `proxyEnabled = false`. The geolocation proxy must be created
 * and linked separately via `assignResidentialProxy` (POST /users-proxies/mobile-proxy).
 *
 * Callers should follow this with `assignResidentialProxy({ profileId: result.id, countryCode })`
 * before starting the cloud browser. Skipping that step results in the profile running
 * on the host machine's IP — instant ban risk on Reddit/LinkedIn.
 *
 * Per D-04/D-05: country-mismatch breaks the anti-ban premise — surface errors instead
 * of falling back to a different region.
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
      // Proxy attached separately via assignResidentialProxy — see function docstring.
      proxy: { mode: "none" },
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

// ---------------------------------------------------------------------------
// assignResidentialProxy — attach a residential GeoProxy to a profile.
// ---------------------------------------------------------------------------

export interface AssignResidentialProxyArgs {
  profileId: string
  /** ISO country code (uppercase or lowercase — lowercased for the API). */
  countryCode: string
  /** Optional human-readable label visible in GoLogin proxy list. */
  customName?: string
}

export interface AssignResidentialProxyResult {
  id: string
  host: string
  port: number
  username: string
  password: string
  /** "resident" for residential, "mobile", "datacenter". */
  connectionType: string
  customName?: string
}

/**
 * Create a GoLogin residential proxy and link it to an existing browser profile.
 *
 * Uses POST /users-proxies/mobile-proxy with `isMobile: false, isDC: false` — this is
 * GoLogin's "high quality" proxy endpoint that returns a residential proxy entity
 * (host:geo.floppydata.com, port:10080, generated credentials) and atomically links
 * it to the profile passed via `profileIdToLink`.
 *
 * After this returns, GoLogin shows the profile with `proxyType: "geolocation"`,
 * `proxyEnabled: true`, and the proxy.id stable for storage in `browser_profiles.gologin_proxy_id`.
 *
 * NOTE: Each call consumes from the workspace's residential traffic pool.
 *
 * NOTE: countryCode must be one of GoLogin's supported regions: us, uk, de, ca, in
 * (verified via probe — uppercase rejected with HTTP 400).
 */
export async function assignResidentialProxy(
  args: AssignResidentialProxyArgs,
): Promise<AssignResidentialProxyResult> {
  const response = await fetch(`${GOLOGIN_API}/users-proxies/mobile-proxy`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      countryCode: args.countryCode.toLowerCase(),
      isMobile: false,
      isDC: false,
      profileIdToLink: args.profileId,
      ...(args.customName ? { customName: args.customName } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin assignResidentialProxy failed (${response.status}): ${body}`,
    )
  }

  return (await response.json()) as AssignResidentialProxyResult
}

/**
 * Patch (refresh) the fingerprint of one or more GoLogin browser profiles.
 *
 * Endpoint: PATCH /browser/fingerprints with body `{ browsersIds: [profileId] }`.
 * Verified against swagger spec (api.gologin.com/docs-json) — the original plan-01
 * probe tested wrong paths (POST /browser/{id}/fingerprints, PATCH /browser/{id})
 * and concluded MCP-only. This was incorrect.
 *
 * Per D-07: empty body — GoLogin re-randomizes canvas/webGL/audio/fonts using its
 * own defaults. The profile id list is the only required field.
 */
export async function patchProfileFingerprints(profileId: string): Promise<void> {
  const response = await fetch(`${GOLOGIN_API}/browser/fingerprints`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ browsersIds: [profileId] }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin patchProfileFingerprints failed (${response.status}): ${body}`,
    )
  }
}
