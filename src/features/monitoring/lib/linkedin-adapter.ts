import { ApifyClient } from "apify-client"
import type { LinkedInPost, LinkedInSearchResult } from "./types"

const DEFAULT_ACTOR_ID = "apimaestro~linkedin-post-search-scraper"
const ACTOR_TIMEOUT_SECS = 120
const ACTOR_MEMORY_MB = 1024

let client: ApifyClient | null = null

function getClient(): ApifyClient {
  if (!process.env.APIFY_API_TOKEN) {
    throw new Error("Apify API token not configured (APIFY_API_TOKEN)")
  }
  if (!client) {
    client = new ApifyClient({ token: process.env.APIFY_API_TOKEN })
  }
  return client
}

function actorId(): string {
  return process.env.APIFY_ACTOR_ID ?? DEFAULT_ACTOR_ID
}

/**
 * Run the Apify LinkedIn post-search actor for the given queries and return
 * normalized posts plus the Apify run id for audit correlation.
 *
 * Throws if APIFY_API_TOKEN is unset or the actor run does not succeed.
 * Normalization is best-effort: schema drift in upstream Apify actors is
 * expected; callers (ingestion pipeline) must tolerate nullable fields.
 */
export async function searchLinkedInPosts(
  queries: string[],
  options?: { maxItemsPerQuery?: number },
): Promise<LinkedInSearchResult> {
  const maxItems = options?.maxItemsPerQuery ?? 25
  const c = getClient()
  const run = await c.actor(actorId()).call(
    { searchQueries: queries, maxItems },
    { timeout: ACTOR_TIMEOUT_SECS, memory: ACTOR_MEMORY_MB },
  )
  if (run.status !== "SUCCEEDED") {
    throw new Error(
      `Apify actor run did not succeed: status=${run.status} runId=${run.id}`,
    )
  }
  const { items } = await c.dataset(run.defaultDatasetId).listItems()
  const posts = (items as unknown as LinkedInPost[]).filter(Boolean)
  return { posts, apifyRunId: run.id }
}

// Reset internal client cache -- intended for tests only.
export function __resetLinkedInAdapterClient(): void {
  client = null
}
