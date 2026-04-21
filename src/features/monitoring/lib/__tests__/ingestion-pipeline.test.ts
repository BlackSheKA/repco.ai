import { describe, it, expect, vi, beforeEach } from "vitest"
import type { RedditPost } from "../types"

// vi.mock is hoisted, so we use vi.hoisted to define the mock fn before the factory runs
const mockSearchAll = vi.hoisted(() => vi.fn())
vi.mock("../reddit-adapter", () => ({ searchAll: mockSearchAll }))

import { runIngestionForUser } from "../ingestion-pipeline"

// Helper: build a minimal RedditPost at a given UTC epoch seconds offset
function makePost(
  permalink: string,
  createdUtcSecondsAgo: number,
): RedditPost {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: permalink,
    title: `Title for ${permalink}`,
    selftext: "body text",
    permalink: `/r/SaaS/comments/${permalink}`,
    subreddit: { display_name: "SaaS" },
    author: { name: "u_testuser" },
    created_utc: now - createdUtcSecondsAgo,
    url: `https://reddit.com/r/SaaS/comments/${permalink}`,
  } as unknown as RedditPost
}

// Minimal Supabase admin stub
type SupabaseStub = {
  from: ReturnType<typeof vi.fn>
  _upsertChain: {
    upsert: ReturnType<typeof vi.fn>
    select: ReturnType<typeof vi.fn>
  }
}

function makeSupabaseStub(upsertData: { id: string }[] = [{ id: "sig-1" }]): SupabaseStub {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const upsertChain = {
    upsert: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: upsertData, error: null }),
  }
  return {
    from: vi.fn((table: string) => {
      if (table === "intent_signals") return upsertChain
      return selectChain
    }),
    _upsertChain: upsertChain,
  } as unknown as SupabaseStub
}

describe("runIngestionForUser — 48h freshness filter (MNTR-05)", () => {
  const config = {
    userId: "user-1",
    keywords: ["crm"],
    subreddits: ["r/SaaS"],
    competitors: [],
    productName: "MyCRM",
    productDescription: "A CRM for startups",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("filters out posts older than 48 hours before upsert", async () => {
    const freshPost = makePost("fresh", 3600) // 1 hour ago
    const stalePost = makePost("stale", 48 * 3600 + 60) // 48h + 1 minute ago

    mockSearchAll.mockResolvedValue([freshPost, stalePost])

    const supabase = makeSupabaseStub()
    await runIngestionForUser(config, supabase as never)

    // upsert should have been called with only the fresh post
    const upsertCall = (supabase as { _upsertChain: { upsert: ReturnType<typeof vi.fn> } })._upsertChain.upsert
    expect(upsertCall).toHaveBeenCalledTimes(1)
    const [signals] = upsertCall.mock.calls[0] as [Array<{ post_url: string }>]
    expect(signals).toHaveLength(1)
    expect(signals[0].post_url).toContain("fresh")
  })

  it("returns skippedCount equal to number of stale posts", async () => {
    const freshPost = makePost("fp1", 100)
    const stalePost1 = makePost("sp1", 49 * 3600)
    const stalePost2 = makePost("sp2", 72 * 3600)

    mockSearchAll.mockResolvedValue([freshPost, stalePost1, stalePost2])

    const supabase = makeSupabaseStub()
    const result = await runIngestionForUser(config, supabase as never)

    expect(result.skippedCount).toBe(2)
  })

  it("deduplicates posts with the same permalink before upsert", async () => {
    // Same permalink matched by two different keywords
    const post1 = makePost("post-abc", 3600)
    const post2 = { ...post1 } // identical permalink

    // searchAll is called once per keyword; simulate two keywords returning same post
    mockSearchAll
      .mockResolvedValueOnce([post1]) // keyword 1 result
      .mockResolvedValueOnce([post2]) // keyword 2 result

    const multiKeywordConfig = { ...config, keywords: ["crm", "sales tool"] }
    const supabase = makeSupabaseStub()
    await runIngestionForUser(multiKeywordConfig, supabase as never)

    const upsertCall = (supabase as { _upsertChain: { upsert: ReturnType<typeof vi.fn> } })._upsertChain.upsert
    const [signals] = upsertCall.mock.calls[0] as [Array<{ post_url: string }>]
    // Only one row despite two keyword matches for the same post
    expect(signals).toHaveLength(1)
  })

  it("returns signalCount=0 and does not call upsert when all posts are stale", async () => {
    const stalePost = makePost("stale", 72 * 3600)
    mockSearchAll.mockResolvedValue([stalePost])

    const supabase = makeSupabaseStub()
    const result = await runIngestionForUser(config, supabase as never)

    expect(result.signalCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    // upsert should not have been called
    const upsertCall = (supabase as { _upsertChain: { upsert: ReturnType<typeof vi.fn> } })._upsertChain.upsert
    expect(upsertCall).not.toHaveBeenCalled()
  })

  it("prefixes subreddit with 'r/' when storing signals", async () => {
    const post = makePost("post-1", 100)
    mockSearchAll.mockResolvedValue([post])

    const supabase = makeSupabaseStub()
    await runIngestionForUser(config, supabase as never)

    const upsertCall = (supabase as { _upsertChain: { upsert: ReturnType<typeof vi.fn> } })._upsertChain.upsert
    const [signals] = upsertCall.mock.calls[0] as [Array<{ subreddit: string }>]
    expect(signals[0].subreddit).toBe("r/SaaS")
  })
})
