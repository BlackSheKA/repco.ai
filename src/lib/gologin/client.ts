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
 * Create a new GoLogin Cloud browser profile for a social account.
 *
 * @param accountHandle - The social account handle (used in profile name)
 * @returns The GoLogin profile ID
 */
export async function createProfile(accountHandle: string): Promise<string> {
  const response = await fetch(`${GOLOGIN_API}/browser`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: `repco-${accountHandle}`,
      os: "win",
      browserType: "chrome",
      navigator: {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        resolution: "1920x1080",
        language: "en-US,en",
        platform: "Win32",
      },
      proxy: { mode: "gologin" },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `GoLogin createProfile failed (${response.status}): ${body}`
    )
  }

  const profile = (await response.json()) as { id: string }
  return profile.id
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
  profileId: string,
  startingUrl?: string
): Promise<CloudBrowserSession> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/web`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(startingUrl ? { startingUrl } : {}),
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
