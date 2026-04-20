import { describe, it, expect } from "vitest"

import {
  calculateDailyBurn,
  calculateMonitoringBurn,
  calculateAccountBurn,
} from "./credit-burn"

describe("calculateMonitoringBurn", () => {
  it("sums 2 reddit_keywords (3/day) and 1 subreddit (3/day) to 9", () => {
    const burn = calculateMonitoringBurn([
      { signal_type: "reddit_keyword", active: true },
      { signal_type: "reddit_keyword", active: true },
      { signal_type: "subreddit", active: true },
    ])
    expect(burn).toBe(9)
  })

  it("returns 6 for 1 linkedin_keyword (6/day)", () => {
    const burn = calculateMonitoringBurn([
      { signal_type: "linkedin_keyword", active: true },
    ])
    expect(burn).toBe(6)
  })

  it("returns 0 for empty array", () => {
    expect(calculateMonitoringBurn([])).toBe(0)
  })

  it("ignores inactive signals", () => {
    const burn = calculateMonitoringBurn([
      { signal_type: "reddit_keyword", active: true },
      { signal_type: "reddit_keyword", active: false },
    ])
    expect(burn).toBe(3)
  })
})

describe("calculateAccountBurn", () => {
  it("returns 0 for 2 reddit accounts (2 included free)", () => {
    const burn = calculateAccountBurn([
      { platform: "reddit", active: true },
      { platform: "reddit", active: true },
    ])
    expect(burn).toBe(0)
  })

  it("returns 3 for 3 reddit accounts (1 extra at 3/day)", () => {
    const burn = calculateAccountBurn([
      { platform: "reddit", active: true },
      { platform: "reddit", active: true },
      { platform: "reddit", active: true },
    ])
    expect(burn).toBe(3)
  })

  it("returns 5 for 2 reddit + 1 linkedin (1 extra linkedin at 5/day)", () => {
    const burn = calculateAccountBurn([
      { platform: "reddit", active: true },
      { platform: "reddit", active: true },
      { platform: "linkedin", active: true },
    ])
    expect(burn).toBe(5)
  })

  it("ignores inactive accounts", () => {
    const burn = calculateAccountBurn([
      { platform: "reddit", active: true },
      { platform: "reddit", active: true },
      { platform: "reddit", active: false },
    ])
    expect(burn).toBe(0)
  })
})

describe("calculateDailyBurn", () => {
  it("combines monitoring + account burn", () => {
    const total = calculateDailyBurn(
      [{ signal_type: "reddit_keyword", active: true }],
      [
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
      ],
    )
    // monitoring = 3, account burn = 3 (1 extra reddit)
    expect(total).toBe(6)
  })

  it("returns 0 when both inputs are empty", () => {
    expect(calculateDailyBurn([], [])).toBe(0)
  })
})
