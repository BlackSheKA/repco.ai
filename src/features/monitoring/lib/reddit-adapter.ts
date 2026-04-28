import { ApifyClient } from "apify-client"
import { z } from "zod"
import { logger } from "@/lib/logger"
import type { RedditPost } from "./types"

// Boundary schema for fatihtahta/reddit-scraper-search-fast output. We don't
// reject items at the parse step (the actor occasionally yields non-post
// records); instead the normalizer narrows + returns null on drift, and a
// warn is logged so future schema changes surface in Sentry/Axiom rather
// than silently producing zero posts.
const FatihtahtaPostSchema = z.object({
  kind: z.string().optional(),
  url: z.string(),
  title: z.string(),
  body: z.string().optional(),
  id: z.string().optional(),
  parsedId: z.string().optional(),
  username: z.string().optional(),
  subreddit: z.string().optional(),
  subreddit_name_prefixed: z.string().optional(),
  created_utc: z.union([z.number(), z.string()]),
  permalink: z.string().optional(),
})

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

  // Explicitly allow only SUCCEEDED + TIMED-OUT (partial data still useful).
  // Any other status (FAILED, ABORTED, RUNNING, or future Apify-introduced
  // values we haven't audited) is treated as an error so future schema drift
  // surfaces in Sentry rather than silently producing zero posts.
  if (run.status !== "SUCCEEDED" && run.status !== "TIMED-OUT") {
    throw new Error(
      `Apify Reddit actor unexpected status: ${run.status} runId=${run.id}`,
    )
  }

  const items = await listAllDatasetItems(c, run.defaultDatasetId)
  return items
    .map((raw) => normalizeFatihtahtaPost(raw as Record<string, unknown>))
    .filter((p): p is RedditPost => p !== null)
}

// listItems() defaults to a 1000-item page; large TIMED-OUT batches need
// pagination to avoid silent truncation. Hard caps (MAX_PAGES, MAX_ITEMS)
// guard against an Apify SDK shape change where `total` is missing/undefined,
// which without a cap would loop until the function's maxDuration kicks in.
const PAGE = 1000
const MAX_PAGES = 50
const MAX_ITEMS = MAX_PAGES * PAGE
async function listAllDatasetItems(
  c: ApifyClient,
  datasetId: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, total } = await c
      .dataset(datasetId)
      .listItems({ offset: page * PAGE, limit: PAGE })
    all.push(...(items as Record<string, unknown>[]))
    if (items.length < PAGE) break
    if (typeof total === "number" && all.length >= total) break
    if (all.length >= MAX_ITEMS) {
      logger.warn("listAllDatasetItems hit hard cap", {
        datasetId,
        items: all.length,
        cap: MAX_ITEMS,
      })
      break
    }
  }
  return all
}

// Normalize fatihtahta/reddit-scraper-search-fast output to the existing
// RedditPost shape. Returns null when the item isn't a post or required
// fields drift; logs a warn on schema drift so changes surface in Sentry
// instead of silently zeroing the feed.
export function normalizeFatihtahtaPost(
  raw: Record<string, unknown>,
): RedditPost | null {
  if (raw.kind && raw.kind !== "post") return null
  const parsed = FatihtahtaPostSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn("Fatihtahta post failed schema validation", {
      issues: parsed.error.issues.slice(0, 5),
      sampleKeys: Object.keys(raw).slice(0, 25),
    })
    return null
  }
  const data = parsed.data
  const url = data.url
  const title = data.title

  // The actor returns `created_utc` as either a Unix integer or an ISO string
  // depending on the post; normalize both into seconds-since-epoch.
  const rawCreated = data.created_utc
  let createdUtc: number
  if (typeof rawCreated === "number") {
    createdUtc = rawCreated
  } else {
    const parsedDate = Date.parse(rawCreated)
    if (Number.isNaN(parsedDate)) return null
    createdUtc = Math.floor(parsedDate / 1000)
  }

  let permalink: string
  if (typeof data.permalink === "string") {
    permalink = data.permalink.startsWith("/")
      ? data.permalink
      : `/${data.permalink}`
  } else {
    try {
      permalink = new URL(url).pathname
    } catch {
      permalink = url
    }
  }

  return {
    id: data.parsedId ?? data.id ?? "",
    title,
    selftext: data.body ?? "",
    author: { name: data.username ?? "deleted" },
    subreddit: {
      display_name:
        data.subreddit ??
        data.subreddit_name_prefixed?.replace(/^r\//, "") ??
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

export type StartedRun =
  | { status: "fulfilled"; subreddit: string; runId: string }
  | { status: "rejected"; subreddit: string; error: string }

/**
 * Fire-and-forget version: kicks off one actor run per subreddit and returns
 * a per-subreddit result. Uses Promise.allSettled so one failed start doesn't
 * orphan runs that already started for other subreddits — the cron caller
 * uses the fulfilled entries to record runIds in apify_runs and the rejected
 * entries for Sentry-actionable error logs.
 */
export async function startAsyncSearch(
  subreddits: string[],
  keywords: string[],
  webhookUrl: string,
  webhookSecret: string,
): Promise<StartedRun[]> {
  if (subreddits.length === 0 || keywords.length === 0) return []
  const c = getClient()
  const id = actorId()

  const settled = await Promise.allSettled(
    subreddits.map(async (sub) => {
      const subName = sub.startsWith("r/") ? sub.slice(2) : sub
      const run = await c.actor(id).start(
        {
          subredditName: subName,
          subredditKeywords: keywords,
          subredditSort: "new",
          subredditTimeframe: "day",
          maxPosts: 25,
          scrapeComments: false,
        },
        {
          timeout: ACTOR_TIMEOUT_SECS,
          memory: ACTOR_MEMORY_MB,
          webhooks: [
            {
              eventTypes: [
                "ACTOR.RUN.SUCCEEDED",
                "ACTOR.RUN.FAILED",
                "ACTOR.RUN.TIMED_OUT",
                "ACTOR.RUN.ABORTED",
              ],
              requestUrl: webhookUrl,
              headersTemplate: JSON.stringify({
                Authorization: `Bearer ${webhookSecret}`,
              }),
            },
          ],
        },
      )
      return { sub, runId: run.id }
    }),
  )

  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? { status: "fulfilled" as const, subreddit: r.value.sub, runId: r.value.runId }
      : {
          status: "rejected" as const,
          subreddit: subreddits[i],
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        },
  )
}

/**
 * Fetch the dataset for a finished run and normalize into RedditPost[].
 * Throws on FAILED/ABORTED runs and on missing datasets so the webhook
 * handler can fail-mark the row instead of silently recording 0 posts.
 */
export async function fetchRunPosts(
  runId: string,
): Promise<RedditPost[]> {
  const c = getClient()
  const run = await c.run(runId).get()
  if (!run) {
    throw new Error(`Apify run not found: runId=${runId}`)
  }
  if (run.status === "FAILED" || run.status === "ABORTED") {
    throw new Error(
      `Apify run not in usable state: status=${run.status} runId=${runId}`,
    )
  }
  if (!run.defaultDatasetId) {
    throw new Error(
      `Apify run has no dataset: runId=${runId} status=${run.status}`,
    )
  }
  const items = await listAllDatasetItems(c, run.defaultDatasetId)
  return items
    .map((raw) => normalizeFatihtahtaPost(raw as Record<string, unknown>))
    .filter((p): p is RedditPost => p !== null)
}

// Reset internal client cache -- intended for tests only.
export function __resetRedditAdapterClient(): void {
  client = null
}
