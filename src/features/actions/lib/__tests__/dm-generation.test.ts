import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the Anthropic SDK
const mockCreate = vi.fn()

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: (...args: unknown[]) => mockCreate(...args),
      }
    },
  }
})

import { generateDM } from "../dm-generation"
import type { DmGenerationInput } from "../dm-generation"

const INPUT: DmGenerationInput = {
  postContent:
    "Looking for a project management tool that handles sprint planning well",
  productDescription:
    "TaskFlow is a project management app built for agile teams",
  suggestedAngle: "Sprint planning expertise",
}

function mockResponse(text: string) {
  return {
    content: [{ type: "text", text }],
  }
}

describe("generateDM", () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('calls Anthropic with model "claude-sonnet-4-6" and max_tokens 300', async () => {
    const goodDm =
      "Sprint planning can be a pain. We built something that makes it way easier. Want to take a look?"
    mockCreate.mockResolvedValueOnce(mockResponse(goodDm))

    await generateDM(INPUT)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
      }),
    )
  })

  it('system prompt contains "Max 3 sentences", "No links or URLs", and "no hard sell"', async () => {
    const goodDm =
      "Sprint planning can be a pain. We built something that makes it way easier. Want to take a look?"
    mockCreate.mockResolvedValueOnce(mockResponse(goodDm))

    await generateDM(INPUT)

    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain("Max 3 sentences")
    expect(callArgs.system).toContain("No links or URLs")
    expect(callArgs.system).toContain("no hard sell")
  })

  it("user message contains postContent, productDescription, suggestedAngle", async () => {
    const goodDm =
      "Sprint planning can be a pain. We built something that makes it way easier. Want to take a look?"
    mockCreate.mockResolvedValueOnce(mockResponse(goodDm))

    await generateDM(INPUT)

    const callArgs = mockCreate.mock.calls[0][0]
    const userMsg = callArgs.messages[0].content
    expect(userMsg).toContain(INPUT.postContent)
    expect(userMsg).toContain(INPUT.productDescription)
    expect(userMsg).toContain(INPUT.suggestedAngle)
  })

  it("returns { content, passed: true } when QC passes", async () => {
    const goodDm =
      "Sprint planning can be a pain. We built something that makes it way easier. Want to take a look?"
    mockCreate.mockResolvedValueOnce(mockResponse(goodDm))

    const result = await generateDM(INPUT)

    expect(result).toEqual({ content: goodDm, passed: true })
  })

  it("retries once on QC failure with stricter prompt containing failure reason", async () => {
    // First attempt: too many sentences
    const badDm =
      "Hey there. Sprint planning is hard. We built a tool for that. It also does roadmaps. Want to check it out?"
    // Second attempt: passes QC
    const goodDm =
      "Sprint planning can be tough. We built something specifically for that workflow. Want me to show you?"
    mockCreate
      .mockResolvedValueOnce(mockResponse(badDm))
      .mockResolvedValueOnce(mockResponse(goodDm))

    const result = await generateDM(INPUT)

    expect(mockCreate).toHaveBeenCalledTimes(2)
    // Second call should have stricter prompt
    const secondCallArgs = mockCreate.mock.calls[1][0]
    expect(secondCallArgs.system).toContain("too_many_sentences")
    expect(secondCallArgs.system).toContain("IMPORTANT")
    expect(result).toEqual({ content: goodDm, passed: true })
  })

  it('returns { content: "", passed: false } when both attempts fail QC', async () => {
    // Both attempts have too many sentences
    const badDm1 =
      "Hey there. Sprint planning is hard. We built a tool. It does roadmaps. Check it out?"
    const badDm2 =
      "Hello. Sprint planning is tough. We have something. It helps teams. Interested?"
    mockCreate
      .mockResolvedValueOnce(mockResponse(badDm1))
      .mockResolvedValueOnce(mockResponse(badDm2))

    const result = await generateDM(INPUT)

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      content: "",
      passed: false,
      failureReason: "too_many_sentences",
    })
  })
})
