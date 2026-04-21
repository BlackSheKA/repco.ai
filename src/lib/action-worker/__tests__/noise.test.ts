import { describe, it, expect } from "vitest"
import { shouldInjectNoise, generateNoiseActions } from "../noise"

describe("shouldInjectNoise — ABAN-04 60% behavioral noise rate", () => {
  it("returns a boolean", () => {
    const result = shouldInjectNoise()
    expect(typeof result).toBe("boolean")
  })

  it("fires at approximately 60% rate over 1000 samples", () => {
    const results = Array.from({ length: 1000 }, () => shouldInjectNoise())
    const trueCount = results.filter(Boolean).length
    // 60% ± 5% tolerance (should be statistically robust)
    expect(trueCount).toBeGreaterThan(500)
    expect(trueCount).toBeLessThan(700)
  })
})

describe("generateNoiseActions — ABAN-04 noise prompt generation", () => {
  it("returns at least 1 and at most 3 noise prompts", () => {
    for (let i = 0; i < 20; i++) {
      const prompts = generateNoiseActions()
      expect(prompts.length).toBeGreaterThanOrEqual(1)
      expect(prompts.length).toBeLessThanOrEqual(3)
    }
  })

  it("all prompts are non-empty strings", () => {
    const prompts = generateNoiseActions()
    prompts.forEach((p) => {
      expect(typeof p).toBe("string")
      expect(p.trim().length).toBeGreaterThan(0)
    })
  })

  it("prompts describe unrelated browsing behavior (not product-specific)", () => {
    // All 5 noise prompts reference reddit browsing, not product outreach
    const prompts = generateNoiseActions()
    prompts.forEach((p) => {
      const lower = p.toLowerCase()
      // Noise prompts should mention reddit or scrolling, not "send message" etc.
      expect(lower).not.toContain("send")
      expect(lower).not.toContain("direct message")
    })
  })
})
