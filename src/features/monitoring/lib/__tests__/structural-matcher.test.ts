import { describe, it, expect } from "vitest"
import { matchPost } from "../structural-matcher"

describe("matchPost", () => {
  const keywords = ["crm", "sales tool"]
  const competitors = ["hubspot", "salesforce"]

  it("returns matched=true, intent_type=direct, ambiguous=false when keyword in title", () => {
    const result = matchPost("Best CRM for startups", "", keywords, competitors)
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("direct")
    expect(result.ambiguous).toBe(false)
    expect(result.intent_strength).toBeGreaterThanOrEqual(6)
  })

  it("returns matched=true when keyword in body only, strength >= 5", () => {
    const result = matchPost(
      "Need help with my startup",
      "Looking for a good crm solution",
      keywords,
      competitors,
    )
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("direct")
    expect(result.ambiguous).toBe(false)
    expect(result.intent_strength).toBeGreaterThanOrEqual(5)
  })

  it("returns strength >= 7 when keyword in both title and body", () => {
    const result = matchPost(
      "Best CRM software?",
      "I need a crm that does X",
      keywords,
      competitors,
    )
    expect(result.matched).toBe(true)
    expect(result.intent_strength).toBeGreaterThanOrEqual(7)
  })

  it("boosts score by 2 for buying phrase in title", () => {
    const baseResult = matchPost("CRM options", "", keywords, competitors)
    const boostedResult = matchPost(
      "Looking for a CRM",
      "",
      keywords,
      competitors,
    )
    expect(boostedResult.intent_strength).toBe(baseResult.intent_strength + 2)
  })

  it("returns intent_type=competitive when competitor name found", () => {
    const result = matchPost(
      "HubSpot vs something else",
      "",
      keywords,
      competitors,
    )
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("competitive")
    expect(result.intent_strength).toBe(7)
  })

  it("returns matched=false, ambiguous=true when no match", () => {
    const result = matchPost(
      "Random post about cooking",
      "Nothing relevant here",
      keywords,
      competitors,
    )
    expect(result.matched).toBe(false)
    expect(result.ambiguous).toBe(true)
  })

  it("is case-insensitive", () => {
    const result = matchPost("BEST CRM EVER", "", keywords, competitors)
    expect(result.matched).toBe(true)
  })

  it("handles multi-word keyword phrases", () => {
    const result = matchPost(
      "Best sales tool for SMBs",
      "",
      keywords,
      competitors,
    )
    expect(result.matched).toBe(true)
    expect(result.intent_type).toBe("direct")
  })

  it("caps score at 10", () => {
    const result = matchPost(
      "Looking for the best CRM alternative to something",
      "I need a crm badly",
      keywords,
      competitors,
    )
    expect(result.intent_strength).toBeLessThanOrEqual(10)
  })
})
