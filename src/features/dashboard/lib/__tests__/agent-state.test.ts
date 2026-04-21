import { describe, it, expect } from "vitest"
import {
  deriveAgentState,
  getAgentMessage,
  type AgentContext,
} from "../agent-state"

const BASE_CTX: AgentContext = {
  isMonitoringActive: false,
  recentHighIntentCount: 0,
  pendingApprovals: 0,
  recentDmsSent: 0,
  recentReplies: 0,
  hasWarningAccount: false,
  signalsLast24h: 0,
}

describe("deriveAgentState — 7 emotional states (AGNT-02)", () => {
  it("returns 'cooldown' when hasWarningAccount=true regardless of other flags", () => {
    const ctx = { ...BASE_CTX, hasWarningAccount: true, recentReplies: 1 }
    expect(deriveAgentState(ctx)).toBe("cooldown")
  })

  it("returns 'reply' when recentReplies > 0 and no warning account", () => {
    const ctx = { ...BASE_CTX, recentReplies: 2 }
    expect(deriveAgentState(ctx)).toBe("reply")
  })

  it("returns 'sent' when recentDmsSent > 0 and no replies or warning", () => {
    const ctx = { ...BASE_CTX, recentDmsSent: 1 }
    expect(deriveAgentState(ctx)).toBe("sent")
  })

  it("returns 'waiting' when pendingApprovals > 0 and no higher-priority state", () => {
    const ctx = { ...BASE_CTX, pendingApprovals: 3 }
    expect(deriveAgentState(ctx)).toBe("waiting")
  })

  it("returns 'found' when recentHighIntentCount > 0 and no pending approvals", () => {
    const ctx = { ...BASE_CTX, recentHighIntentCount: 1 }
    expect(deriveAgentState(ctx)).toBe("found")
  })

  it("returns 'scanning' when isMonitoringActive=true and no higher-priority state", () => {
    const ctx = { ...BASE_CTX, isMonitoringActive: true }
    expect(deriveAgentState(ctx)).toBe("scanning")
  })

  it("returns 'quiet' when all context flags are at zero/false", () => {
    expect(deriveAgentState(BASE_CTX)).toBe("quiet")
  })

  it("priority: cooldown > reply (highest wins)", () => {
    const ctx = {
      ...BASE_CTX,
      hasWarningAccount: true,
      recentReplies: 1,
      recentDmsSent: 1,
      pendingApprovals: 1,
    }
    expect(deriveAgentState(ctx)).toBe("cooldown")
  })

  it("priority: reply > sent", () => {
    const ctx = { ...BASE_CTX, recentReplies: 1, recentDmsSent: 1 }
    expect(deriveAgentState(ctx)).toBe("reply")
  })
})

describe("getAgentMessage (AGNT-02)", () => {
  it("returns a string for every agent state", () => {
    const states = [
      "scanning",
      "found",
      "waiting",
      "sent",
      "reply",
      "cooldown",
      "quiet",
    ] as const

    for (const state of states) {
      const ctx: AgentContext =
        state === "waiting"
          ? { ...BASE_CTX, pendingApprovals: 2 }
          : BASE_CTX
      const msg = getAgentMessage(state, ctx)
      expect(typeof msg).toBe("string")
      expect(msg.length).toBeGreaterThan(0)
    }
  })

  it("waiting message includes the pending approval count", () => {
    const ctx = { ...BASE_CTX, pendingApprovals: 4 }
    const msg = getAgentMessage("waiting", ctx)
    expect(msg).toContain("4")
  })

  it("waiting with 1 pending uses singular 'person'", () => {
    const ctx = { ...BASE_CTX, pendingApprovals: 1 }
    const msg = getAgentMessage("waiting", ctx)
    expect(msg).toMatch(/1 person/)
  })

  it("waiting with multiple pending uses plural 'people'", () => {
    const ctx = { ...BASE_CTX, pendingApprovals: 3 }
    const msg = getAgentMessage("waiting", ctx)
    expect(msg).toMatch(/3 people/)
  })
})
