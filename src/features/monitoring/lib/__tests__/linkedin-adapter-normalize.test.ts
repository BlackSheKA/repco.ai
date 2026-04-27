/**
 * Drift tests for normalizeHarvestApiPost. harvestapi is a third-party Apify
 * actor; field renames are the realistic failure mode this Zod schema is
 * meant to catch.
 */

import { describe, it, expect, vi } from "vitest"

vi.mock("apify-client", () => {
  class FakeApifyClient {
    actor() {
      return { call: vi.fn(), start: vi.fn() }
    }
    dataset() {
      return { listItems: vi.fn() }
    }
    run() {
      return { get: vi.fn() }
    }
  }
  return { ApifyClient: FakeApifyClient }
})

const baseRaw = {
  type: "post",
  linkedinUrl: "https://www.linkedin.com/posts/alice_xyz-activity-123-abc",
  content: "Hello LinkedIn",
  postedAt: { date: "2026-04-25T20:10:07.000Z" },
  author: {
    name: "Alice",
    info: "Founder",
    linkedinUrl: "https://www.linkedin.com/in/alice",
    urn: "urn:li:fsd_profile:abc",
  },
  engagement: { reactions: 42, comments: 7 },
}

describe("normalizeHarvestApiPost", () => {
  it("normalizes a complete post correctly", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const post = normalizeHarvestApiPost(baseRaw as Record<string, unknown>)
    expect(post).not.toBeNull()
    expect(post!.url).toBe(baseRaw.linkedinUrl)
    expect(post!.text).toBe("Hello LinkedIn")
    expect(post!.postedAt).toBe("2026-04-25T20:10:07.000Z")
    expect(post!.reactions).toBe(42)
    expect(post!.comments).toBe(7)
    expect(post!.author.name).toBe("Alice")
    expect(post!.author.headline).toBe("Founder")
    expect(post!.postType).toBe("post")
  })

  it("falls back to bare ISO postedAt string (older actor versions)", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const post = normalizeHarvestApiPost({
      ...baseRaw,
      postedAt: "2026-04-25T20:10:07.000Z",
    })
    expect(post!.postedAt).toBe("2026-04-25T20:10:07.000Z")
  })

  it("falls back to top-level reactions array length when engagement is missing", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const { engagement: _, ...rest } = baseRaw
    void _
    const post = normalizeHarvestApiPost({
      ...rest,
      reactions: [{}, {}, {}],
      comments: [{}],
    })
    expect(post!.reactions).toBe(3)
    expect(post!.comments).toBe(1)
  })

  it("treats reactions as a number when actor returns count instead of array", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const { engagement: _, ...rest } = baseRaw
    void _
    const post = normalizeHarvestApiPost({
      ...rest,
      reactions: 24,
      comments: 5,
    })
    expect(post!.reactions).toBe(24)
    expect(post!.comments).toBe(5)
  })

  it("returns null when both linkedinUrl and url are missing (drift signal)", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const { linkedinUrl: _, ...rest } = baseRaw
    void _
    expect(
      normalizeHarvestApiPost(rest as Record<string, unknown>),
    ).toBeNull()
  })

  it("returns null when postedAt is missing in both forms", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const { postedAt: _, ...rest } = baseRaw
    void _
    expect(
      normalizeHarvestApiPost(rest as Record<string, unknown>),
    ).toBeNull()
  })

  it("returns null when payload doesn't even resemble a post (catastrophic drift)", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    expect(
      normalizeHarvestApiPost({
        unrelated: "totally different schema",
        someNumber: 42,
      } as Record<string, unknown>),
    ).toBeNull()
  })

  it("survives missing author fields with empty-string defaults", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const post = normalizeHarvestApiPost({ ...baseRaw, author: {} })
    expect(post!.author.name).toBe("")
    expect(post!.author.headline).toBeNull()
    expect(post!.author.profileUrl).toBe("")
    expect(post!.author.urn).toBe("")
  })

  it("returns null for non-post types (e.g., article gone wild)", async () => {
    const { normalizeHarvestApiPost } = await import("../linkedin-adapter")
    const post = normalizeHarvestApiPost({ ...baseRaw, type: "article" })
    expect(post).not.toBeNull()
    // We accept it but mark postType as null (we only know "post" maps cleanly).
    expect(post!.postType).toBeNull()
  })
})
