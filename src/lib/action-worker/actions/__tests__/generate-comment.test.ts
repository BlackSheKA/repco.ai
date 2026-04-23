/**
 * Unit tests for generateComment (LNKD-03 / LNKD-04).
 *
 * Mirrors src/features/actions/lib/__tests__/dm-generation.test.ts mock
 * pattern. Validates:
 *   - Sonnet model string + system prompt phrasing
 *   - QC: length ≤1250, no URLs, no pitch, em-dashes stripped
 *   - Single retry on oversize output
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

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

import { generateComment, SYSTEM_PROMPT } from "../generate-comment"

function mockResponse(text: string) {
  return { content: [{ type: "text", text }] }
}

const INPUT = {
  signalContent:
    "Shipping sprint planning has been painful — Jira overhead kills velocity every quarter.",
  productProfile:
    "TaskFlow is a project management app built for agile teams who hate Jira",
  prospectHandle: "jane",
}

describe("SYSTEM_PROMPT", () => {
  it("contains the key rule phrases", () => {
    expect(SYSTEM_PROMPT).toContain("2-3 sentences")
    expect(SYSTEM_PROMPT).toContain("≤1250")
    expect(SYSTEM_PROMPT).toContain("Do NOT pitch")
    expect(SYSTEM_PROMPT).toContain("No links")
  })
})

describe("generateComment", () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it("returns a string ≤1250 chars for a QC-compliant first attempt", async () => {
    const good =
      "Sprint planning overhead is a real cost that rarely shows up on velocity reports. Worth asking whether the process is actually serving the team or just serving the tool."
    mockCreate.mockResolvedValueOnce(mockResponse(good))

    const out = await generateComment(INPUT)
    expect(typeof out).toBe("string")
    expect(out.length).toBeLessThanOrEqual(1250)
    expect(out.length).toBeGreaterThan(0)
  })

  it("calls Anthropic with claude-sonnet-4-6 model", async () => {
    mockCreate.mockResolvedValueOnce(mockResponse("Sprint planning is hard."))
    await generateComment(INPUT)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-sonnet-4-6" }),
    )
  })

  it("strips em-dashes from output", async () => {
    mockCreate.mockResolvedValueOnce(
      mockResponse("Sprint planning is tough — Jira is overhead."),
    )
    const out = await generateComment(INPUT)
    expect(out).not.toMatch(/[—–]/)
  })

  it("retries once when first output exceeds 1250 chars, returning compliant second output", async () => {
    const oversize = "a".repeat(1300)
    const compliant = "Sprint planning sounds rough. Curious what process changes helped most."
    mockCreate
      .mockResolvedValueOnce(mockResponse(oversize))
      .mockResolvedValueOnce(mockResponse(compliant))

    const out = await generateComment(INPUT)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(out.length).toBeLessThanOrEqual(1250)
    expect(out).toBe(compliant)
  })

  it("retries once when first output contains a URL", async () => {
    const withUrl = "Check out https://example.com for more context on this."
    const clean = "That resonates — sprint overhead is a real velocity tax."
    mockCreate
      .mockResolvedValueOnce(mockResponse(withUrl))
      .mockResolvedValueOnce(mockResponse(clean))

    const out = await generateComment(INPUT)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(out).not.toMatch(/https?:\/\/|www\./i)
  })

  it("retries once when first output contains pitch phrasing", async () => {
    const pitchy =
      "We built TaskFlow exactly for this — check out our product. Sign up now."
    const clean =
      "Sprint overhead compounds fast. Curious whether retros or tooling changes moved the needle for your team."
    mockCreate
      .mockResolvedValueOnce(mockResponse(pitchy))
      .mockResolvedValueOnce(mockResponse(clean))

    const out = await generateComment(INPUT)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(out).not.toMatch(/check out|our product|we built|try our|sign up/i)
  })

  it("returns second attempt even if still non-compliant (max 2 calls)", async () => {
    const bad1 = "a".repeat(1300)
    const bad2 = "a".repeat(1400)
    mockCreate
      .mockResolvedValueOnce(mockResponse(bad1))
      .mockResolvedValueOnce(mockResponse(bad2))

    const out = await generateComment(INPUT)
    // Retry cap: only 2 Sonnet calls total regardless of outcome.
    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(typeof out).toBe("string")
  })
})
