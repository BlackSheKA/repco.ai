import type { SupabaseClient } from "@supabase/supabase-js"
import { searchLinkedInPosts } from "./linkedin-adapter"
import type { LinkedInPost, MonitoringConfig } from "./types"

export const FRESHNESS_CUTOFF_SECONDS = 48 * 3600

function isFresh(post: LinkedInPost): boolean {
  const postedAtSec = new Date(post.postedAt).getTime() / 1000
  return Date.now() / 1000 - postedAtSec <= FRESHNESS_CUTOFF_SECONDS
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    // Strip utm_* query params; keep path + non-utm params
    for (const key of Array.from(u.searchParams.keys())) {
      if (key.startsWith("utm_")) u.searchParams.delete(key)
    }
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Dedupe + freshness filter + upsert of pre-fetched LinkedIn posts. Both the
 * sync ingestion path and the async webhook handler call this.
 */
export async function ingestLinkedInPosts(
  posts: LinkedInPost[],
  userId: string,
  apifyRunId: string | null,
  supabaseAdmin: SupabaseClient,
): Promise<{ signalCount: number; skippedCount: number }> {
  const uniquePosts = new Map<string, LinkedInPost>()
  for (const post of posts) {
    if (!post?.url) continue
    const key = normalizeUrl(post.url)
    if (!uniquePosts.has(key)) uniquePosts.set(key, post)
  }

  const freshPosts = Array.from(uniquePosts.values()).filter(isFresh)
  const skippedCount = uniquePosts.size - freshPosts.length
  if (freshPosts.length === 0) {
    return { signalCount: 0, skippedCount }
  }

  const signals = freshPosts.map((post) => ({
    user_id: userId,
    platform: "linkedin" as const,
    post_url: normalizeUrl(post.url),
    post_content: truncate(post.text ?? "", 500),
    author_handle: post.author?.name ?? null,
    author_profile_url: post.author?.profileUrl ?? null,
    author_headline: post.author?.headline ?? null,
    author_company: post.author?.company ?? null,
    post_type: post.postType ?? null,
    apify_run_id: apifyRunId,
    intent_type: null,
    intent_strength: null,
    classification_status: "pending",
    status: "pending" as const,
    is_public: true,
    detected_at: new Date(post.postedAt).toISOString(),
  }))

  const { data, error } = await supabaseAdmin
    .from("intent_signals")
    .upsert(signals, { onConflict: "post_url", ignoreDuplicates: true })
    .select("id")

  if (error) {
    throw new Error(`Failed to upsert LinkedIn signals: ${error.message}`)
  }
  return { signalCount: data?.length ?? 0, skippedCount }
}

/**
 * Runs the per-user LinkedIn ingestion: invokes the Apify adapter, dedups
 * posts (ignoring utm_* params in URLs), filters out posts older than 48h,
 * and upserts fresh posts into intent_signals with ignoreDuplicates.
 *
 * Returns the count of inserted signals, the count of stale posts skipped,
 * and the Apify run id that sourced the batch (for audit correlation).
 */
export async function runLinkedInIngestionForUser(
  config: MonitoringConfig,
  supabaseAdmin: SupabaseClient,
): Promise<{
  signalCount: number
  skippedCount: number
  apifyRunId: string | null
}> {
  if (config.keywords.length === 0) {
    return { signalCount: 0, skippedCount: 0, apifyRunId: null }
  }

  const { posts, apifyRunId } = await searchLinkedInPosts(config.keywords)
  const result = await ingestLinkedInPosts(
    posts,
    config.userId,
    apifyRunId,
    supabaseAdmin,
  )
  return { ...result, apifyRunId }
}
