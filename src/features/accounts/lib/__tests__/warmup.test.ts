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
