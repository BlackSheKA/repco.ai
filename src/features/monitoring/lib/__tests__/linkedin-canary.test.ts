import { describe, it, expect, beforeEach, vi } from "vitest"
import canarySuccess from "../../__fixtures__/apify-linkedin/canary-success.json"
import canaryEmpty from "../../__fixtures__/apify-linkedin/canary-empty.json"

const searchLinkedInPostsMock = vi.fn()

vi.mock("../linkedin-adapter", () => ({
  searchLinkedInPosts: (...args: unknown[]) =>
    searchLinkedInPostsMock(...args),
}))

describe("runCanaryCheck", () => {
  beforeEach(() => {
    searchLinkedInPostsMock.mockReset()
    vi.resetModules()
  })

  it("returns ok: true when 10 results come back", async () => {
    searchLinkedInPostsMock.mockResolvedValue({
      posts: canarySuccess,
      apifyRunId: "run-ok-1",
    })
    const { runCanaryCheck } = await import("../linkedin-canary")
    const result = await runCanaryCheck()
    expect(result.ok).toBe(true)
    expect(result.resultCount).toBe(10)
    expect(result.apifyRunId).toBe("run-ok-1")
  })

  it("returns ok: false with reason 'empty' when 0 results", async () => {
    searchLinkedInPostsMock.mockResolvedValue({
      posts: canaryEmpty,
      apifyRunId: "run-empty-1",
    })
    const { runCanaryCheck } = await import("../linkedin-canary")
    const result = await runCanaryCheck()
    expect(result.ok).toBe(false)
    expect(result.resultCount).toBe(0)
    expect(result.reason).toBe("empty")
  })

  it("returns ok: false with reason 'below_threshold' when 2 results", async () => {
    searchLinkedInPostsMock.mockResolvedValue({
      posts: canarySuccess.slice(0, 2),
      apifyRunId: "run-two-1",
    })
    const { runCanaryCheck } = await import("../linkedin-canary")
    const result = await runCanaryCheck()
    expect(result.ok).toBe(false)
    expect(result.resultCount).toBe(2)
    expect(result.reason).toBe("below_threshold")
  })

  it("returns ok: false with reason 'adapter_error' when adapter throws", async () => {
    searchLinkedInPostsMock.mockRejectedValue(new Error("Apify unreachable"))
    const { runCanaryCheck } = await import("../linkedin-canary")
    const result = await runCanaryCheck()
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("adapter_error")
    expect(result.errorMessage).toContain("Apify unreachable")
    expect(result.apifyRunId).toBeNull()
  })
})
