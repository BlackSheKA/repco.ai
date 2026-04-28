/**
 * Shared Reddit URL / handle utilities.
 *
 * Phase 17.7-01: Consumed by reddit-dm-executor + (Wave 2) reddit-comment,
 * reddit-like, reddit-follow executors. Centralised so handle / URL parsing
 * lives in exactly one place.
 *
 * Handle validation regex enforces Reddit's username shape (3–20 chars,
 * `[A-Za-z0-9_]`) — used as a defence-in-depth gate before any string
 * crosses into a Stagehand `variables` substitution or a URL build.
 */

const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/
const URL_HANDLE_RE =
  /^https?:\/\/(www\.)?reddit\.com\/user\/([A-Za-z0-9_]{3,20})\/?/i
const PREFIXED_RE = /^u\/([A-Za-z0-9_]{3,20})$/i

/**
 * Returns the canonical Reddit handle from a URL, `u/handle` shorthand,
 * or bare handle. Returns null for any non-Reddit input.
 */
export function extractRedditHandle(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim()
  const urlMatch = trimmed.match(URL_HANDLE_RE)
  if (urlMatch) return urlMatch[2]
  const prefixedMatch = trimmed.match(PREFIXED_RE)
  if (prefixedMatch) return prefixedMatch[1]
  if (HANDLE_RE.test(trimmed)) return trimmed
  return null
}

/**
 * Build the canonical NEW-Reddit user profile URL for a validated handle.
 */
export function redditUserUrl(handle: string): string {
  return `https://www.reddit.com/user/${handle}/`
}

/**
 * Normalise a Reddit post path or URL onto the canonical
 * `https://www.reddit.com` origin. Idempotent for full URLs.
 */
export function redditPostUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return ""
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const withSlash = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`
  return `https://www.reddit.com${withSlash}`
}
