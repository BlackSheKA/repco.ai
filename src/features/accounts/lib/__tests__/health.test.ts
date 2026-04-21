import { describe, it, expect } from "vitest"
import { transitionHealth, getHealthDisplay } from "../health"

describe("transitionHealth — ABAN-07 health state machine", () => {
  // healthy → warning on rate_limited / captcha
  it("healthy + rate_limited → warning", () => {
    const t = transitionHealth("healthy", "rate_limited")
    expect(t.newStatus).toBe("warning")
  })

  it("healthy + captcha → warning", () => {
    const t = transitionHealth("healthy", "captcha")
    expect(t.newStatus).toBe("warning")
  })

  // healthy ignores single action_failed
  it("healthy + action_failed → stays healthy (single failure ignored)", () => {
    const t = transitionHealth("healthy", "action_failed")
    expect(t.newStatus).toBe("healthy")
    expect(t.reason).toContain("Single failure ignored")
  })

  // warning + repeated failure → cooldown with 48h cooldown timestamp
  it("warning + action_failed → cooldown with cooldownUntil ~48h from now", () => {
    const before = Date.now()
    const t = transitionHealth("warning", "action_failed")
    const after = Date.now()
    expect(t.newStatus).toBe("cooldown")
    expect(t.cooldownUntil).toBeDefined()
    const cooldownTs = new Date(t.cooldownUntil!).getTime()
    const expected48h = 48 * 60 * 60 * 1000
    expect(cooldownTs).toBeGreaterThanOrEqual(before + expected48h - 100)
    expect(cooldownTs).toBeLessThanOrEqual(after + expected48h + 100)
  })

  it("warning + rate_limited → cooldown", () => {
    const t = transitionHealth("warning", "rate_limited")
    expect(t.newStatus).toBe("cooldown")
    expect(t.cooldownUntil).toBeDefined()
  })

  // any → banned on banned_detected
  it("healthy + banned_detected → banned", () => {
    const t = transitionHealth("healthy", "banned_detected")
    expect(t.newStatus).toBe("banned")
  })

  it("warning + banned_detected → banned", () => {
    const t = transitionHealth("warning", "banned_detected")
    expect(t.newStatus).toBe("banned")
  })

  // cooldown → healthy on cooldown_expired
  it("cooldown + cooldown_expired → healthy", () => {
    const t = transitionHealth("cooldown", "cooldown_expired")
    expect(t.newStatus).toBe("healthy")
  })

  it("non-cooldown + cooldown_expired → no transition", () => {
    const t = transitionHealth("healthy", "cooldown_expired")
    expect(t.newStatus).toBe("healthy")
  })

  // manual_reset works for all non-banned states
  it("warning + manual_reset → healthy", () => {
    const t = transitionHealth("warning", "manual_reset")
    expect(t.newStatus).toBe("healthy")
  })

  it("cooldown + manual_reset → healthy", () => {
    const t = transitionHealth("cooldown", "manual_reset")
    expect(t.newStatus).toBe("healthy")
  })

  it("banned + manual_reset → stays banned (cannot reset banned account)", () => {
    const t = transitionHealth("banned", "manual_reset")
    expect(t.newStatus).toBe("banned")
  })
})

describe("getHealthDisplay — ACCT-01 health status rendering", () => {
  it("warmup → amber with 'Warming up' label", () => {
    const d = getHealthDisplay("warmup")
    expect(d.label).toBe("Warming up")
    expect(d.color).toBe("amber")
  })

  it("healthy → green", () => {
    const d = getHealthDisplay("healthy")
    expect(d.color).toBe("green")
  })

  it("warning → amber", () => {
    const d = getHealthDisplay("warning")
    expect(d.color).toBe("amber")
  })

  it("cooldown → yellow", () => {
    const d = getHealthDisplay("cooldown")
    expect(d.color).toBe("yellow")
  })

  it("banned → red", () => {
    const d = getHealthDisplay("banned")
    expect(d.color).toBe("red")
  })
})
