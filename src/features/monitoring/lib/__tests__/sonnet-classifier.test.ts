import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreate = vi.fn()

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

import { classifySignals } from "../sonnet-classifier"

describe("classifySignals", () => {
  const posts = [
    { url: "https://reddit.com/r/saas/1", title: "Need CRM", body: "Help me" },
    { url: "https://reddit.com/r/saas/2", title: "Comparing tools", body: "Which is best?" },
  ]
  const productContext = {
    name: "MyCRM",
    description: "A CRM for startups",
    keywords: ["crm", "sales"],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns array matching input post count", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              post_url: "https://reddit.com/r/saas/1",
              intent_type: "buying",
              intent_strength: 8,
              reasoning: "Direct ask",
              suggested_angle: "Offer trial",
            },
            {
              post_url: "https://reddit.com/r/saas/2",
              intent_type: "comparing",
              intent_strength: 6,
              reasoning: "Comparing tools",
              suggested_angle: "Feature comparison",
            },
          ]),
        },
      ],
    })

    const results = await classifySignals(posts, productContext)
    expect(results).toHaveLength(2)
  })

  it("maps Sonnet labels to DB enum values", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              post_url: "https://reddit.com/r/saas/1",
              intent_type: "buying",
              intent_strength: 8,
              reasoning: "Direct ask",
              suggested_angle: "Offer trial",
            },
            {
              post_url: "https://reddit.com/r/saas/2",
              intent_type: "complaining",
              intent_strength: 5,
              reasoning: "Unhappy user",
              suggested_angle: "Sympathy approach",
            },
          ]),
        },
      ],
    })

    const results = await classifySignals(posts, productContext)
    expect(results[0].intent_type).toBe("direct")
    expect(results[1].intent_type).toBe("problem")
  })

  it("handles markdown-wrapped JSON responses", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: '```json\n[{"post_url":"https://reddit.com/r/saas/1","intent_type":"asking","intent_strength":4,"reasoning":"General question","suggested_angle":"Be helpful"}]\n```',
        },
      ],
    })

    const results = await classifySignals([posts[0]], productContext)
    expect(results).toHaveLength(1)
    expect(results[0].intent_type).toBe("engagement")
  })

  it("returns empty array on parse failure", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Sorry, I cannot parse that." }],
    })

    const results = await classifySignals(posts, productContext)
    expect(results).toEqual([])
  })
})
