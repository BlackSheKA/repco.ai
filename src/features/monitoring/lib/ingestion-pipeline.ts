import type { SupabaseClient } from "@supabase/supabase-js"
import { searchAll } from "./reddit-adapter"
import type { MonitoringConfig, RedditPost } from "./types"

const FRESHNESS_CUTOFF_SECONDS = 48 * 3600

function isFresh(post: RedditPost): boolean {
  return Date.now() / 1000 - post.created_utc <= FRESHNESS_CUTOFF_SECONDS
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}

export async function runIngestionForUser(
  config: MonitoringConfig,
  supabaseAdmin: SupabaseClient,
): Promise<{ signalCount: number; skippedCount: number }> {
  const allPosts: RedditPost[] = []

  // Search for each keyword across all subreddits
  for (const keyword of config.keywords) {
    const posts = await searchAll(config.subreddits, keyword)
    allPosts.push(...posts)
  }

  // Deduplicate by post permalink (same post may match multiple keywords)
  const uniquePosts = new Map<string, RedditPost>()
  for (const post of allPosts) {
    const key = post.permalink
    if (!uniquePosts.has(key)) {
      uniquePosts.set(key, post)
    }
  }

  // Filter out posts older than 48 hours
  const freshPosts = Array.from(uniquePosts.values()).filter(isFresh)
  const skippedCount = uniquePosts.size - freshPosts.length

  if (freshPosts.length === 0) {
    return { signalCount: 0, skippedCount }
  }

  // Build signal rows for upsert
  const signals = freshPosts.map((post) => ({
    user_id: config.userId,
    platform: "reddit" as const,
    post_url: `https://reddit.com${post.permalink}`,
    post_content: truncate(
      `${post.title}\n\n${post.selftext}`,
      500,
    ),
    subreddit: `r/${post.subreddit.display_name}`,
    author_handle: `u/${post.author.name}`,
    author_profile_url: `https://reddit.com/u/${post.author.name}`,
    intent_type: null,
    intent_strength: null,
    classification_status: "pending",
    status: "pending" as const,
    is_public: true,
    detected_at: new Date(post.created_utc * 1000).toISOString(),
  }))

  // Upsert with deduplication by post_url (UNIQUE constraint)
  const { data, error } = await supabaseAdmin
    .from("intent_signals")
    .upsert(signals, { onConflict: "post_url", ignoreDuplicates: true })
    .select("id")

  if (error) {
    throw new Error(`Failed to upsert signals: ${error.message}`)
  }

  const signalCount = data?.length ?? 0

  return { signalCount, skippedCount }
}
