import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, screen, waitFor, cleanup } from "@testing-library/react"

import { StalenessBanner } from "../staleness-banner"

function mockFetchStatus(payload: {
  lastSuccessAt: string | null
  hoursAgo: number | null
}) {
  ;(globalThis as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  })
}

describe("StalenessBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("returns null when hoursAgo < 8 (healthy)", async () => {
    mockFetchStatus({
      lastSuccessAt: "2026-04-21T00:00:00Z",
      hoursAgo: 5,
    })

    const { container } = render(<StalenessBanner />)
    await waitFor(() => {
      expect(
        (globalThis as unknown as { fetch: { mock: { calls: unknown[] } } })
          .fetch.mock.calls.length,
      ).toBeGreaterThan(0)
    })
    // Flush any pending state updates
    await Promise.resolve()
    expect(container.textContent).toBe("")
    expect(
      screen.queryByText(/LinkedIn monitoring/),
    ).not.toBeInTheDocument()
  })

  it("renders 'LinkedIn monitoring delayed' at hoursAgo >= 8 (below 12)", async () => {
    mockFetchStatus({
      lastSuccessAt: "2026-04-20T15:00:00Z",
      hoursAgo: 9,
    })

    render(<StalenessBanner />)
    await waitFor(() => {
      expect(
        screen.getByText(/LinkedIn monitoring delayed/),
      ).toBeInTheDocument()
    })
  })

  it("renders 'LinkedIn monitoring failed' with role=status at hoursAgo >= 12", async () => {
    mockFetchStatus({
      lastSuccessAt: "2026-04-20T10:00:00Z",
      hoursAgo: 13,
    })

    render(<StalenessBanner />)
    await waitFor(() => {
      expect(
        screen.getByText(/LinkedIn monitoring failed/),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})
