import { ApifyClient } from "apify-client"
import type { RedditPost } from "./types"

const DEFAULT_ACTOR_ID = "fatihtahta~reddit-scraper-search-fast"
const ACTOR_TIMEOUT_SECS = 240
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
  return process.env.APIFY_REDDIT_ACTOR_ID ?? DEFAULT_ACTOR_ID
}

/**
 * Run the Apify Reddit scraper for one subreddit and a batch of search queries.
 * The actor uses Reddit's native search API (no Puppeteer) and accepts the full
 * keyword set in a single run via `subredditKeywords`, so callers do one run
 * per subreddit rather than per (subreddit × keyword) pair.
 *
 * Reads the dataset even on TIMED-OUT — Reddit scrapers persist items as they
 * arrive, so partial output is still useful.
 */
async function searchSubredditViaApify(
  subreddit: string,
  keywords: string[],
  options?: { maxPostsPerKeyword?: number },
): Promise<RedditPost[]> {
  const subName = subreddit.startsWith("r/") ? subreddit.slice(2) : subreddit
  const c = getClient()
  const run = await c.actor(actorId()).call(
    {
      subredditName: subName,
      subredditKeywords: keywords,
      subredditSort: "new",
      subredditTimeframe: "day",
      maxPosts: options?.maxPostsPerKeyword ?? 25,
      scrapeComments: false,
    },
    { timeout: ACTOR_TIMEOUT_SECS, memory: ACTOR_MEMORY_MB },
  )

  if (run.status === "FAILED" || run.status === "ABORTED") {
    throw new Error(
      `Apify Reddit actor did not succeed: status=${run.status} runId=${run.id}`,
    )
  }

  const { items } = await c.dataset(run.defaultDatasetId).listItems()
  return items
    .map((raw) => normalizeFatihtahtaPost(raw as Record<string, unknown>))
    .filter((p): p is RedditPost => p !== null)
}

// Normalize fatihtahta/reddit-scraper-search-fast output to the existing
// RedditPost shape. Returns null when required fields are missing.
function normalizeFatihtahtaPost(
  raw: Record<string, unknown>,
): RedditPost | null {
  if (raw.kind && raw.kind !== "post") return null
  const url = raw.url as string | undefined
  const title = raw.title as string | undefined
  if (!url || !title) return null

  // The actor returns `created_utc` as either a Unix integer or an ISO string
  // depending on the post; normalize both into seconds-since-epoch.
  const rawCreated = raw.created_utc
  let createdUtc: number
  if (typeof rawCreated === "number") {
    createdUtc = rawCreated
  } else if (typeof rawCreated === "string") {
    const parsed = Date.parse(rawCreated)
    if (Number.isNaN(parsed)) return null
    createdUtc = Math.floor(parsed / 1000)
  } else {
    return null
  }

  let permalink: string
  if (typeof raw.permalink === "string") {
    permalink = raw.permalink.startsWith("/")
      ? raw.permalink
      : `/${raw.permalink}`
  } else {
    try {
      permalink = new URL(url).pathname
    } catch {
      permalink = url
    }
  }

  return {
    id: (raw.id as string | undefined) ?? "",
    title,
    selftext: (raw.body as string | undefined) ?? "",
    author: { name: (raw.author as string | undefined) ?? "deleted" },
    subreddit: {
      display_name:
        (raw.subreddit as string | undefined) ??
        (raw.subreddit_name_prefixed as string | undefined)?.replace(
          /^r\//,
          "",
        ) ??
        "",
    },
    url,
    created_utc: createdUtc,
    permalink,
  }
}

/**
 * Run the Apify Reddit scraper across multiple subreddits with one call per
 * subreddit (all keywords passed as `subredditKeywords`). Calls run in
 * parallel via Promise.all. Returns raw posts; the ingestion pipeline performs
 * dedup + freshness filter.
 */
export async function searchAll(
  subreddits: string[],
  keywords: string[],
): Promise<RedditPost[]> {
  if (subreddits.length === 0 || keywords.length === 0) return []
  const calls = subreddits.map((sub) => searchSubredditViaApify(sub, keywords))
  const results = await Promise.all(calls)
  return results.flat()
}

// Reset internal client cache -- intended for tests only.
export function __resetRedditAdapterClient(): void {
  client = null
}
