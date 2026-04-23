import { describe, it, expect } from "vitest"
import { getWarmupState } from "../types"

describe("getWarmupState — ABAN-02 progressive warmup gate", () => {
  it("days 1-3: only browse is allowed", () => {
    for (const day of [1, 2, 3]) {
      const state = getWarmupState(day, null)
      expect(state.allowedActions).toEqual(["browse"])
      expect(state.allowedActions).not.toContain("dm")
      expect(state.allowedActions).not.toContain("like")
    }
  })

  it("days 4-5: browse + like + follow + connection_request allowed, no dm or public_reply", () => {
    for (const day of [4, 5]) {
      const state = getWarmupState(day, null)
      expect(state.allowedActions).toContain("browse")
      expect(state.allowedActions).toContain("like")
      expect(state.allowedActions).toContain("follow")
      expect(state.allowedActions).toContain("connection_request")
      expect(state.allowedActions).not.toContain("dm")
      expect(state.allowedActions).not.toContain("public_reply")
    }
  })

  it("days 6-7: browse + like + follow + public_reply allowed, no dm", () => {
    for (const day of [6, 7]) {
      const state = getWarmupState(day, null)
      expect(state.allowedActions).toContain("browse")
      expect(state.allowedActions).toContain("like")
      expect(state.allowedActions).toContain("follow")
      expect(state.allowedActions).toContain("public_reply")
      expect(state.allowedActions).not.toContain("dm")
    }
  })

  it("day 8+: all actions including dm are allowed", () => {
    for (const day of [8, 10, 30]) {
      const state = getWarmupState(day, null)
      expect(state.allowedActions).toContain("dm")
      expect(state.allowedActions).toContain("public_reply")
      expect(state.allowedActions).toContain("follow")
      expect(state.allowedActions).toContain("like")
      expect(state.allowedActions).toContain("browse")
    }
  })

  it("completed warmup: all actions including dm are allowed regardless of day", () => {
    const state = getWarmupState(3, "2026-04-18T00:00:00Z")
    expect(state.completed).toBe(true)
    expect(state.allowedActions).toContain("dm")
  })

  it("skipped warmup (day=0, completedAt set): dm allowed", () => {
    const state = getWarmupState(0, "2026-04-18T00:00:00Z")
    expect(state.skipped).toBe(true)
    expect(state.completed).toBe(true)
    expect(state.allowedActions).toContain("dm")
  })

  it("returns correct day and maxDay=7 in state shape", () => {
    const state = getWarmupState(5, null)
    expect(state.day).toBe(5)
    expect(state.maxDay).toBe(7)
    expect(state.completed).toBe(false)
    expect(state.skipped).toBe(false)
  })
})

describe("getWarmupState — Phase 13 LinkedIn progression", () => {
  // Per .planning/phases/13-linkedin-action-expansion/13-CONTEXT.md §Warmup gates
  it("day 1 LinkedIn: only browse allowed", () => {
    const state = getWarmupState(1, null, "linkedin")
    expect(state.allowedActions).toEqual(["browse"])
  })

  it("day 3 LinkedIn: like + follow allowed, no public_reply, no dm", () => {
    const state = getWarmupState(3, null, "linkedin")
    expect(state.allowedActions).toContain("like")
    expect(state.allowedActions).toContain("follow")
    expect(state.allowedActions).not.toContain("public_reply")
    expect(state.allowedActions).not.toContain("dm")
  })

  it("day 5 LinkedIn: public_reply + connection_request allowed, no dm", () => {
    const state = getWarmupState(5, null, "linkedin")
    expect(state.allowedActions).toContain("public_reply")
    expect(state.allowedActions).toContain("connection_request")
    expect(state.allowedActions).not.toContain("dm")
  })

  it("day 7 LinkedIn: dm allowed", () => {
    const state = getWarmupState(7, null, "linkedin")
    expect(state.allowedActions).toContain("dm")
  })

  it("day 6 LinkedIn regression (LNKD-01): dm NOT allowed until day 7", () => {
    const state = getWarmupState(6, null, "linkedin")
    expect(state.allowedActions).not.toContain("dm")
    // Still allows public_reply + connection_request at day 6
    expect(state.allowedActions).toContain("public_reply")
    expect(state.allowedActions).toContain("connection_request")
  })

  it("day 4 Reddit regression: matches prior Reddit day-4 output", () => {
    const state = getWarmupState(4, null, "reddit")
    // Prior Reddit day-4 behavior: browse, like, follow, connection_request
    expect(state.allowedActions).toContain("browse")
    expect(state.allowedActions).toContain("like")
    expect(state.allowedActions).toContain("follow")
    expect(state.allowedActions).toContain("connection_request")
    expect(state.allowedActions).not.toContain("dm")
    expect(state.allowedActions).not.toContain("public_reply")
  })

  it("2-arg caller (no platform arg) defaults to Reddit schedule", () => {
    const withArg = getWarmupState(4, null, "reddit")
    const withoutArg = getWarmupState(4, null)
    expect(withoutArg.allowedActions).toEqual(withArg.allowedActions)
  })
})
