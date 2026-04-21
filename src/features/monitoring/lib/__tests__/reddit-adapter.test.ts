import { describe, it, expect, vi, beforeEach } from "vitest"

// We mock snoowrap before importing the adapter so getClient() uses the mock
const mockSearch = vi.fn()
const mockGetSubreddit = vi.fn(() => ({ search: mockSearch }))
const mockConfig = vi.fn()

vi.mock("snoowrap", () => {
  class MockSnoowrap {
    getSubreddit = mockGetSubreddit
    config = mockConfig
  }
  return { default: MockSnoowrap }
})

// Import after mock is registered. The module-level singleton will be the mock.
import { searchSubreddit, searchAll } from "../reddit-adapter"

describe("reddit-adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure credentials are set so the mock client is constructed
    process.env.REDDIT_CLIENT_ID = "test-id"
    process.env.REDDIT_CLIENT_SECRET = "test-secret"
    process.env.REDDIT_REFRESH_TOKEN = "test-token"
    mockSearch.mockResolvedValue([])
  })

  describe("searchAll — r/ prefix stripping", () => {
    it("strips 'r/' prefix before passing subreddit name to snoowrap", async () => {
      await searchAll(["r/SaaS", "r/startups"], "crm")

      expect(mockGetSubreddit).toHaveBeenCalledWith("SaaS")
      expect(mockGetSubreddit).toHaveBeenCalledWith("startups")
    })

    it("accepts bare subreddit names without prefix and does not modify them", async () => {
      await searchAll(["SaaS"], "crm")

      expect(mockGetSubreddit).toHaveBeenCalledWith("SaaS")
    })

    it("returns aggregated posts from all subreddits", async () => {
      const post1 = { id: "1", title: "Post from SaaS" }
      const post2 = { id: "2", title: "Post from startups" }
      mockSearch
        .mockResolvedValueOnce([post1])
        .mockResolvedValueOnce([post2])

      const results = await searchAll(["SaaS", "startups"], "crm")

      expect(results).toHaveLength(2)
      expect(results).toContain(post1)
      expect(results).toContain(post2)
    })
  })

  describe("searchSubreddit — API options", () => {
    it("calls snoowrap search with sort=new and time=day defaults", async () => {
      await searchSubreddit("SaaS", "crm")

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ sort: "new", time: "day" }),
      )
    })
  })
})
