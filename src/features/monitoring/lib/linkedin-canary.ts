import { searchLinkedInPosts } from "./linkedin-adapter"

export const LINKEDIN_CANARY_KEYWORD = "hiring"
export const CANARY_MIN_RESULTS = 3

export type CanaryFailureReason =
  | "empty"
  | "below_threshold"
  | "adapter_error"

export interface CanaryResult {
  ok: boolean
  resultCount: number
  apifyRunId: string | null
  reason?: CanaryFailureReason
  errorMessage?: string
}

/**
 * Runs a smoke test against the Apify LinkedIn actor using a known-high-volume
 * keyword. Detects silent failures (SUCCEEDED run returning zero items) that
 * don't surface as adapter errors.
 *
 * Returns { ok: true } when >= CANARY_MIN_RESULTS posts come back; otherwise
 * ok=false with a specific reason for logging / Sentry fingerprint dedup.
 */
export async function runCanaryCheck(): Promise<CanaryResult> {
  try {
    const { posts, apifyRunId } = await searchLinkedInPosts(
      [LINKEDIN_CANARY_KEYWORD],
      { maxItemsPerQuery: 10 },
    )
    const resultCount = posts.length
    if (resultCount === 0) {
      return { ok: false, resultCount, apifyRunId, reason: "empty" }
    }
    if (resultCount < CANARY_MIN_RESULTS) {
      return { ok: false, resultCount, apifyRunId, reason: "below_threshold" }
    }
    return { ok: true, resultCount, apifyRunId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      resultCount: 0,
      apifyRunId: null,
      reason: "adapter_error",
      errorMessage: message,
    }
  }
}
