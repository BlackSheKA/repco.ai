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
      navigator: { language: "en-US,en" },
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
