import { describe, it, expect } from "vitest"

import { anonymizeSignal, anonymizeSignals, type RawSignal } from "./anonymize"

const BASE_SIGNAL: RawSignal = {
  id: "sig-001",
  platform: "reddit",
  intent_type: "direct",
  intent_strength: 8,
  detected_at: "2026-04-20T10:00:00Z",
  author_handle: "some_user",
  post_url: "https://reddit.com/r/saas/comments/abc123",
  post_content: "Looking for a CRM tool for my team",
  subreddit: "r/saas",
}

// GROW-01: /live page signals are anonymized (no handles, no URLs)
describe("anonymizeSignal (GROW-01)", () => {
  it("strips author_handle (returns null)", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    expect(result.author_handle).toBeNull()
  })

  it("strips post_url (returns '#' placeholder)", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    expect(result.post_url).toBe("#")
  })

  it("does not expose subreddit name in the output", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    // AnonymizedSignal has no subreddit field — ensure it's absent
    expect("subreddit" in result).toBe(false)
  })

  it("does not expose raw post content", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    expect("post_content" in result).toBe(false)
  })

  it("replaces content with a generic description for 'direct' intent", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    expect(result.description).toBe("Someone looking for a solution like yours")
  })

  it("uses correct description for 'competitive' intent", () => {
    const result = anonymizeSignal({ ...BASE_SIGNAL, intent_type: "competitive" })
    expect(result.description).toBe("Someone looking for an alternative")
  })

  it("uses correct description for 'problem' intent", () => {
    const result = anonymizeSignal({ ...BASE_SIGNAL, intent_type: "problem" })
    expect(result.description).toBe(
      "Someone describing a problem your product solves",
    )
  })

  it("uses correct description for 'engagement' intent", () => {
    const result = anonymizeSignal({ ...BASE_SIGNAL, intent_type: "engagement" })
    expect(result.description).toBe("Someone discussing a relevant topic")
  })

  it("falls back to generic description when intent_type is null", () => {
    const result = anonymizeSignal({ ...BASE_SIGNAL, intent_type: null })
    expect(result.description).toBe("Someone discussing a relevant topic")
  })

  it("preserves non-sensitive fields: id, platform, intent_strength, detected_at", () => {
    const result = anonymizeSignal(BASE_SIGNAL)
    expect(result.id).toBe("sig-001")
    expect(result.platform).toBe("reddit")
    expect(result.intent_strength).toBe(8)
    expect(result.detected_at).toBe("2026-04-20T10:00:00Z")
  })
})

describe("anonymizeSignals (GROW-01 batch)", () => {
  it("anonymizes all signals in a batch", () => {
    const signals: RawSignal[] = [
      { ...BASE_SIGNAL, id: "s1", author_handle: "alice" },
      { ...BASE_SIGNAL, id: "s2", author_handle: "bob", intent_type: "competitive" },
    ]
    const results = anonymizeSignals(signals)
    expect(results).toHaveLength(2)
    expect(results[0].author_handle).toBeNull()
    expect(results[1].author_handle).toBeNull()
    expect(results[0].post_url).toBe("#")
  })

  it("returns empty array for empty input", () => {
    expect(anonymizeSignals([])).toEqual([])
  })
})
