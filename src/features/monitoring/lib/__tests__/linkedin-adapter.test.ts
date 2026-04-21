import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import successFixture from "../../__fixtures__/apify-linkedin/success.json"

const actorCall = vi.fn()
const datasetListItems = vi.fn()
const clientCtor = vi.fn()

vi.mock("apify-client", () => {
  class FakeApifyClient {
    constructor(opts: { token: string }) {
      clientCtor(opts)
    }
    actor(_id: string) {
      return { call: actorCall }
    }
    dataset(_id: string) {
      return { listItems: datasetListItems }
    }
  }
  return { ApifyClient: FakeApifyClient }
})

async function loadAdapter() {
  // Dynamic import so module-scoped client cache is fresh per test.
  const mod = await import("../linkedin-adapter")
  mod.__resetLinkedInAdapterClient()
  return mod
}

describe("linkedin-adapter", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    actorCall.mockReset()
    datasetListItems.mockReset()
    clientCtor.mockReset()
    vi.resetModules()
    delete process.env.APIFY_API_TOKEN
    delete process.env.APIFY_ACTOR_ID
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("throws a clear error when APIFY_API_TOKEN is unset", async () => {
    const { searchLinkedInPosts } = await loadAdapter()
    await expect(searchLinkedInPosts(["hiring"])).rejects.toThrow(
      /APIFY_API_TOKEN/,
    )
  })

  it("uses APIFY_ACTOR_ID env var when set", async () => {
    process.env.APIFY_API_TOKEN = "test-token"
    process.env.APIFY_ACTOR_ID = "custom~actor"
    actorCall.mockResolvedValue({
      status: "SUCCEEDED",
      id: "run-123",
      defaultDatasetId: "ds-1",
    })
    datasetListItems.mockResolvedValue({ items: successFixture })

    const { searchLinkedInPosts } = await loadAdapter()
    const result = await searchLinkedInPosts(["hiring"])
    expect(result.apifyRunId).toBe("run-123")
    expect(result.posts).toHaveLength(5)
  })

  it("falls back to the default actor id when APIFY_ACTOR_ID is unset", async () => {
    process.env.APIFY_API_TOKEN = "test-token"
    actorCall.mockResolvedValue({
      status: "SUCCEEDED",
      id: "run-456",
      defaultDatasetId: "ds-2",
    })
    datasetListItems.mockResolvedValue({ items: [] })

    const { searchLinkedInPosts } = await loadAdapter()
    const result = await searchLinkedInPosts(["anything"])
    expect(result.apifyRunId).toBe("run-456")
    expect(result.posts).toHaveLength(0)
    // Default actor id literal must live in the source file for grep safety.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(
        "src/features/monitoring/lib/linkedin-adapter.ts",
        "utf8",
      ),
    )
    expect(source).toContain("apimaestro~linkedin-post-search-scraper")
  })

  it("throws with status and run id when actor run does not succeed", async () => {
    process.env.APIFY_API_TOKEN = "test-token"
    actorCall.mockResolvedValue({
      status: "FAILED",
      id: "run-broken",
      defaultDatasetId: "ds-3",
    })

    const { searchLinkedInPosts } = await loadAdapter()
    await expect(searchLinkedInPosts(["hiring"])).rejects.toThrow(
      /status=FAILED.*runId=run-broken/,
    )
    expect(datasetListItems).not.toHaveBeenCalled()
  })

  it("returns { posts, apifyRunId } shape on success", async () => {
    process.env.APIFY_API_TOKEN = "test-token"
    actorCall.mockResolvedValue({
      status: "SUCCEEDED",
      id: "run-789",
      defaultDatasetId: "ds-4",
    })
    datasetListItems.mockResolvedValue({ items: successFixture })

    const { searchLinkedInPosts } = await loadAdapter()
    const result = await searchLinkedInPosts(["hiring"])
    expect(result).toHaveProperty("posts")
    expect(result).toHaveProperty("apifyRunId", "run-789")
    expect(result.posts[0]?.url).toContain("linkedin.com")
  })
})
