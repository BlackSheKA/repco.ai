import { ApifyClient } from "apify-client"
import { z } from "zod"
import { logger } from "@/lib/logger"
import type { LinkedInPost, LinkedInSearchResult } from "./types"

// Boundary schema for harvestapi/linkedin-post-search output. Same intent
// as the Reddit normalizer schema: detect drift early instead of silently
// producing posts with empty author/subreddit/text fields.
const HarvestApiAuthorSchema = z
  .object({
    name: z.string().optional(),
    info: z.string().nullable().optional(),
    linkedinUrl: z.string().optional(),
    urn: z.string().optional(),
  })
  .partial()
  .optional()

const HarvestApiPostSchema = z.object({
  type: z.string().optional(),
  linkedinUrl: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  postedAt: z
    .union([
      z.object({ date: z.string().optional() }).partial(),
      z.string(),
    ])
    .optional(),
  author: HarvestApiAuthorSchema,
  engagement: z
    .object({ reactions: z.number().optional(), comments: z.number().optional() })
    .partial()
    .optional(),
  // Across actor versions, `reactions`/`comments` arrive as either an array
  // of reactor/comment records or a numeric count. Accept either.
  reactions: z.union([z.array(z.unknown()), z.number()]).optional(),
  comments: z.union([z.array(z.unknown()), z.number()]).optional(),
})

export const DEFAULT_ACTOR_ID = "harvestapi~linkedin-post-search"
const ACTOR_TIMEOUT_SECS = 120
const ACTOR_MEMORY_MB = 1024

/**
 * The actor id we'll actually run (env override or default). Exposed so the
 * cron route can record it in job_logs without duplicating the default
 * constant — single source of truth.
 */
export function effectiveLinkedInActorId(): string {
  return process.env.APIFY_ACTOR_ID ?? DEFAULT_ACTOR_ID
}

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
// shape. Returns null when required fields drift; logs a warn so changes
// surface in Sentry instead of silently producing posts with empty fields.
export function normalizeHarvestApiPost(
  raw: Record<string, unknown>,
): LinkedInPost | null {
  const parsed = HarvestApiPostSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn("Harvestapi post failed schema validation", {
      issues: parsed.error.issues.slice(0, 5),
      sampleKeys: Object.keys(raw).slice(0, 25),
    })
    return null
  }
  const data = parsed.data

  const url = data.linkedinUrl ?? data.url ?? null
  if (!url) return null

  const postedAtIso =
    typeof data.postedAt === "string"
      ? data.postedAt
      : data.postedAt?.date ?? null
  if (!postedAtIso) return null

  return {
    url,
    text: data.content ?? "",
    postedAt: postedAtIso,
    reactions:
      data.engagement?.reactions ??
      (Array.isArray(data.reactions)
        ? data.reactions.length
        : typeof data.reactions === "number"
          ? data.reactions
          : 0),
    comments:
      data.engagement?.comments ??
      (Array.isArray(data.comments)
        ? data.comments.length
        : typeof data.comments === "number"
          ? data.comments
          : 0),
    author: {
      name: data.author?.name ?? "",
      headline: data.author?.info ?? null,
      company: null,
      profileUrl: data.author?.linkedinUrl ?? "",
      urn: data.author?.urn ?? "",
    },
    postType: data.type === "post" ? "post" : null,
    contentLanguage: null,
  }
}

// Reset internal client cache -- intended for tests only.
export function __resetLinkedInAdapterClient(): void {
  client = null
}

/**
 * Fire-and-forget version of searchLinkedInPosts: starts a single actor run
 * with the full keyword batch and registers a webhook callback so the result
 * is ingested asynchronously. Returns the Apify runId immediately.
 */
export async function startAsyncLinkedInSearch(
  queries: string[],
  webhookUrl: string,
  webhookSecret: string,
  options?: { maxItemsPerQuery?: number },
): Promise<{ runId: string }> {
  const maxItems = options?.maxItemsPerQuery ?? 25
  const c = getClient()
  const run = await c.actor(actorId()).start(
    { searchQueries: queries, maxPosts: maxItems },
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
  return { runId: run.id }
}

/**
 * Fetch dataset items for a finished LinkedIn run and normalize into the
 * internal LinkedInPost shape. Throws on FAILED/ABORTED runs and missing
 * datasets so the webhook handler can fail-mark the row instead of silently
 * recording 0 posts. Paginates the dataset to avoid 1000-item truncation.
 */
export async function fetchLinkedInRunPosts(
  runId: string,
): Promise<LinkedInPost[]> {
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
  const PAGE = 1000
  const items: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await c
      .dataset(run.defaultDatasetId)
      .listItems({ offset, limit: PAGE })
    items.push(...(page.items as Record<string, unknown>[]))
    if (page.items.length < PAGE || items.length >= page.total) break
  }
  return items
    .map((raw) => normalizeHarvestApiPost(raw as Record<string, unknown>))
    .filter((p): p is LinkedInPost => p !== null)
}
