import { describe, it, expect } from "vitest"
import { matchLinkedInPost } from "../linkedin-matcher"
import type { LinkedInPost, MonitoringConfig } from "../types"

function makePost(overrides: Partial<LinkedInPost> = {}): LinkedInPost {
  return {
    url: "https://www.linkedin.com/posts/sample-activity-00000000000000-abc",
    text: "",
    postedAt: "2026-04-20T10:00:00.000Z",
    reactions: 10,
    comments: 2,
    author: {
      name: "Sample Author",
      headline: "Sample headline",
      company: null,
      profileUrl: "https://www.linkedin.com/in/sample/",
      urn: "urn:li:person:sample",
    },
    postType: "post",
    contentLanguage: "en",
    ...overrides,
  }
}

function makeConfig(
  overrides: Partial<MonitoringConfig> = {},
): MonitoringConfig {
  return {
    userId: "user-1",
    keywords: [],
    subreddits: [],
    competitors: [],
    productName: "Repco",
    productDescription: "AI sales rep",
    ...overrides,
  }
}

describe("matchLinkedInPost", () => {
  it("#AI matches keyword ai (hashtag normalization)", () => {
    const post = makePost({
      text: "Hot take on #AI tooling today and why it matters for smaller teams.",
    })
    const result = matchLinkedInPost(post, makeConfig({ keywords: ["ai"] }))
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("direct")
  })

  it("keyword list with mixed #hashtag and bare keyword both normalize", () => {
    const post = makePost({
      text: "Shipping a new SaaS dashboard for pipeline visibility soon.",
    })
    const result = matchLinkedInPost(
      post,
      makeConfig({ keywords: ["#SaaS", "pipeline"] }),
    )
    expect(result.matched).toBe(true)
  })

  it("@acme mention matches competitor acme", () => {
    const post = makePost({
      text: "Great product launch from @acme this week — very impressive engineering execution from the team.",
    })
    const result = matchLinkedInPost(
      post,
      makeConfig({ competitors: ["acme"] }),
    )
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("competitive")
    expect(result.intent_strength).toBeGreaterThanOrEqual(7)
  })

  it("article post type with competitor mention yields intent_strength >= 8", () => {
    const post = makePost({
      text: "Long-form analysis of the pipeline-visibility market. @acme has real traction, while others trail significantly.",
      postType: "article",
    })
    const result = matchLinkedInPost(
      post,
      makeConfig({ competitors: ["acme"] }),
    )
    expect(result.matched).toBe(true)
    expect(result.intent_strength).toBeGreaterThanOrEqual(8)
  })

  it("posts shorter than 50 chars are flagged ambiguous=true", () => {
    const post = makePost({ text: "#AI is cool" })
    const result = matchLinkedInPost(post, makeConfig({ keywords: ["ai"] }))
    expect(result.matched).toBe(true)
    expect(result.ambiguous).toBe(true)
  })

  it("no match returns matched: false", () => {
    const post = makePost({
      text: "Just shipped a new Rust CLI for parsing log files from production systems. Fun rabbit hole.",
    })
    const result = matchLinkedInPost(
      post,
      makeConfig({ keywords: ["sales"], competitors: ["competitorco"] }),
    )
    expect(result.matched).toBe(false)
  })
})
