import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import { logger } from "@/lib/logger"
import { matchPost } from "@/features/monitoring/lib/structural-matcher"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const scanSchema = z.object({
  productDescription: z.string().min(5).max(500),
  competitor: z.string().max(100).optional(),
})

// ---------------------------------------------------------------------------
// Rate limiting (in-memory per process, 3 per IP per hour)
// ---------------------------------------------------------------------------
interface RateEntry {
  count: number
  resetAt: number
}

const HOUR_MS = 60 * 60 * 1000
const MAX_REQUESTS_PER_HOUR = 3
const rateLimitStore = new Map<string, RateEntry>()

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  const real = req.headers.get("x-real-ip")
  if (real) return real.trim()
  return "unknown"
}

function checkRateLimit(ip: string): { allowed: boolean; resetAt: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)
  if (!entry || entry.resetAt < now) {
    const fresh: RateEntry = { count: 1, resetAt: now + HOUR_MS }
    rateLimitStore.set(ip, fresh)
    return { allowed: true, resetAt: fresh.resetAt }
  }
  if (entry.count >= MAX_REQUESTS_PER_HOUR) {
    return { allowed: false, resetAt: entry.resetAt }
  }
  entry.count += 1
  return { allowed: true, resetAt: entry.resetAt }
}

// ---------------------------------------------------------------------------
// Reddit public search
// ---------------------------------------------------------------------------
interface RedditChild {
  kind: string
  data: {
    id: string
    title: string
    selftext: string
    author: string
    subreddit: string
    permalink: string
    created_utc: number
    url: string
  }
}

interface RedditSearchResponse {
  data?: { children?: RedditChild[] }
}

export interface SimplifiedSignal {
  id: string
  platform: "reddit"
  subreddit: string
  title: string
  excerpt: string
  post_url: string
  intent_strength: number
  intent_type: "direct" | "competitive" | "problem" | "engagement"
  detected_at: string
}

function buildKeywords(description: string, competitor?: string): string[] {
  const cleaned = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
  const stop = new Set([
    "with",
    "that",
    "this",
    "your",
    "from",
    "about",
    "their",
    "have",
    "will",
    "help",
    "into",
    "them",
    "when",
    "which",
    "make",
    "more",
    "like",
    "some",
    "using",
    "just",
    "because",
  ])
  const keywords = cleaned.filter((w) => !stop.has(w)).slice(0, 6)
  if (competitor) keywords.push(competitor.toLowerCase())
  return Array.from(new Set(keywords))
}

function buildQueries(description: string, competitor?: string): string[] {
  const keywords = buildKeywords(description, competitor).slice(0, 3)
  const base = keywords.slice(0, 2).join(" ")
  const queries: string[] = []
  if (base) queries.push(base)
  if (competitor) queries.push(`alternative to ${competitor}`)
  // Fallback single-keyword query if we only have one meaningful word
  if (queries.length === 0) {
    queries.push(description.slice(0, 60))
  }
  return queries
}

async function searchReddit(
  query: string,
  signal: AbortSignal,
): Promise<RedditChild[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
    query,
  )}&sort=new&limit=10&t=week`
  const res = await fetch(url, {
    headers: { "User-Agent": "repco.ai/1.0 scan-hook" },
    signal,
  })
  if (!res.ok) return []
  const data = (await res.json()) as RedditSearchResponse
  return data.data?.children ?? []
}

export async function POST(req: NextRequest) {
  const correlationId = logger.createCorrelationId()
  const ip = getClientIp(req)

  // 1. Rate limit
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    logger.info("scan rate limited", { correlationId, ip })
    return NextResponse.json(
      { error: "Try again in a few minutes" },
      { status: 429 },
    )
  }

  // 2. Validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = scanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const { productDescription, competitor } = parsed.data

  // 3. Search Reddit (8s timeout, return partial results on abort)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  const queries = buildQueries(productDescription, competitor)
  const keywords = buildKeywords(productDescription, competitor)
  const competitors = competitor ? [competitor] : []

  logger.info("scan started", {
    correlationId,
    queryCount: queries.length,
    keywordCount: keywords.length,
    ip,
  })

  const allPosts: RedditChild[] = []
  try {
    for (const q of queries) {
      if (controller.signal.aborted) break
      const children = await searchReddit(q, controller.signal)
      allPosts.push(...children)
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("aborted"))
    ) {
      logger.warn("scan aborted at timeout", { correlationId })
    } else {
      logger.error("scan reddit search failed", {
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  } finally {
    clearTimeout(timeout)
  }

  // 4. Dedup + classify via structural matcher
  const seen = new Set<string>()
  const signals: SimplifiedSignal[] = []

  for (const child of allPosts) {
    const d = child.data
    if (!d?.id || seen.has(d.id)) continue
    seen.add(d.id)

    const match = matchPost(
      d.title ?? "",
      d.selftext ?? "",
      keywords,
      competitors,
    )
    if (!match.matched) continue

    const excerptSource = d.selftext?.trim() || d.title || ""
    const excerpt =
      excerptSource.length > 240
        ? `${excerptSource.slice(0, 237)}...`
        : excerptSource

    signals.push({
      id: d.id,
      platform: "reddit",
      subreddit: d.subreddit ? `r/${d.subreddit}` : "",
      title: d.title ?? "",
      excerpt,
      post_url: d.permalink
        ? `https://www.reddit.com${d.permalink}`
        : d.url ?? "#",
      intent_strength: match.intent_strength,
      intent_type: match.intent_type,
      detected_at: new Date(
        (d.created_utc ? d.created_utc * 1000 : Date.now()),
      ).toISOString(),
    })

    if (signals.length >= 10) break
  }

  signals.sort((a, b) => b.intent_strength - a.intent_strength)

  logger.info("scan complete", {
    correlationId,
    matched: signals.length,
    scanned: allPosts.length,
  })

  await logger.flush()

  return NextResponse.json({ signals, count: signals.length })
}
