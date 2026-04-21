/**
 * Normalize a social handle for equality comparison.
 *
 * Reddit handles can appear with or without the "u/" prefix and any case
 * (Reddit usernames are case-insensitive per spec). LinkedIn handles are
 * stored raw from Apify without prefixes.
 *
 * Returns "" for null/undefined/empty input — callers should treat the
 * empty string as "no match possible".
 */
export function normalizeHandle(
  raw: string | null | undefined,
  platform: string,
): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""
  switch (platform) {
    case "reddit":
      return trimmed.replace(/^u\//i, "").toLowerCase()
    case "linkedin":
      return trimmed.toLowerCase()
    default:
      return trimmed.toLowerCase()
  }
}
