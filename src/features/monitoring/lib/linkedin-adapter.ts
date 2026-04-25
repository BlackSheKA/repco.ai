import { ApifyClient } from "apify-client"
import type { LinkedInPost, LinkedInSearchResult } from "./types"

const DEFAULT_ACTOR_ID = "harvestapi~linkedin-post-search"
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
    { searchQueries: queries, maxPosts: maxItems },
    { timeout: ACTOR_TIMEOUT_SECS, memory: ACTOR_MEMORY_MB },
  )
  if (run.status !== "SUCCEEDED") {
    throw new Error(
      `Apify actor run did not succeed: status=${run.status} runId=${run.id}`,
    )
  }
  const { items } = await c.dataset(run.defaultDatasetId).listItems()
  const posts = items
    .map((raw) => normalizeHarvestApiPost(raw as Record<string, unknown>))
    .filter((p): p is LinkedInPost => p !== null)
  return { posts, apifyRunId: run.id }
}

// Normalize harvestapi/linkedin-post-search output to the internal LinkedInPost
// shape. Returns null when the raw item is missing required fields.
function normalizeHarvestApiPost(
  raw: Record<string, unknown>,
): LinkedInPost | null {
  const url =
    (raw.linkedinUrl as string | undefined) ??
    (raw.url as string | undefined) ??
    null
  if (!url) return null

  const author = (raw.author ?? {}) as Record<string, unknown>
  const postedAt = raw.postedAt as Record<string, unknown> | undefined
  const postedAtIso =
    (postedAt?.date as string | undefined) ??
    (typeof raw.postedAt === "string" ? (raw.postedAt as string) : null)
  if (!postedAtIso) return null

  const engagement = (raw.engagement ?? {}) as Record<string, unknown>

  return {
    url,
    text: (raw.content as string | undefined) ?? "",
    postedAt: postedAtIso,
    reactions: typeof engagement.reactions === "number"
      ? (engagement.reactions as number)
      : Array.isArray(raw.reactions)
        ? (raw.reactions as unknown[]).length
        : 0,
    comments: typeof engagement.comments === "number"
      ? (engagement.comments as number)
      : Array.isArray(raw.comments)
        ? (raw.comments as unknown[]).length
        : 0,
    author: {
      name: (author.name as string | undefined) ?? "",
      headline: (author.info as string | undefined) ?? null,
      company: null,
      profileUrl: (author.linkedinUrl as string | undefined) ?? "",
      urn: (author.urn as string | undefined) ?? "",
    },
    postType: raw.type === "post" ? "post" : null,
    contentLanguage: null,
  }
}

// Reset internal client cache -- intended for tests only.
export function __resetLinkedInAdapterClient(): void {
  client = null
}
