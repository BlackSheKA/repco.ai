import { describe, it, expect } from "vitest"

import { getFollowUpStatus, getFollowUpExpiresAt } from "../scheduler"

describe("getFollowUpStatus", () => {
  it("returns 'approved' when autoSendEnabled is true", () => {
    expect(getFollowUpStatus(true)).toBe("approved")
  })

  it("returns 'pending_approval' when autoSendEnabled is false", () => {
    expect(getFollowUpStatus(false)).toBe("pending_approval")
  })
})

describe("getFollowUpExpiresAt", () => {
  it("sets expires_at to 24h from creation", () => {
    const before = Date.now()
    const expiresIso = getFollowUpExpiresAt()
    const after = Date.now()

    const expiresMs = new Date(expiresIso).getTime()
    const target = 24 * 60 * 60 * 1000

    // Expect expiresMs to be within 24h window (allow small wall-clock drift)
    expect(expiresMs - before).toBeGreaterThanOrEqual(target - 5)
    expect(expiresMs - after).toBeLessThanOrEqual(target + 5)
  })

  it("returns a valid ISO 8601 string", () => {
    const iso = getFollowUpExpiresAt()
    expect(() => new Date(iso).toISOString()).not.toThrow()
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
