import Snoowrap from "snoowrap"
import type { RedditPost } from "./types"

let client: Snoowrap | null = null

function getClient(): Snoowrap {
  if (!process.env.REDDIT_CLIENT_ID) {
    throw new Error("Reddit API credentials not configured")
  }

  if (!client) {
    client = new Snoowrap({
      userAgent: "repco.ai/1.0 (monitoring)",
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN!,
    })
    client.config({ requestDelay: 1000 })
  }
  return client
}

export async function searchSubreddit(
  subreddit: string,
  query: string,
  options?: { time?: string; limit?: number },
): Promise<RedditPost[]> {
  const r = getClient()
  // snoowrap's Subreddit.search types are incomplete — limit exists on
  // the Reddit API but is only typed on the top-level SearchOptions.
  // Cast to pass limit through safely.
  const results = await r.getSubreddit(subreddit).search({
    query,
    time: (options?.time ?? "day") as "day",
    sort: "new",
    ...({ limit: options?.limit ?? 25 } as Record<string, unknown>),
  })
  return results as unknown as RedditPost[]
}

export async function searchAll(
  subreddits: string[],
  query: string,
): Promise<RedditPost[]> {
  const allPosts: RedditPost[] = []
  for (const sub of subreddits) {
    // Strip "r/" prefix if present for snoowrap API
    const subName = sub.startsWith("r/") ? sub.slice(2) : sub
    const posts = await searchSubreddit(subName, query)
    allPosts.push(...posts)
  }
  return allPosts
}
