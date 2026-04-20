import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSend = vi.fn()

vi.mock("../resend-client", () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => mockSend(...args),
    },
  },
}))

import { sendDailyDigest } from "../send-daily-digest"

describe("sendDailyDigest", () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it("sends daily digest with signal count in subject", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendDailyDigest("user@example.com", {
      signalCount: 5,
      pendingCount: 2,
      replyCount: 1,
      topSignals: [
        { excerpt: "Need a tool", subreddit: "saas", intentStrength: 8 },
      ],
      productName: "MyProduct",
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "5 people looking for MyProduct yesterday",
        from: "repco <notifications@repco.ai>",
        to: "user@example.com",
      }),
    )
  })

  it("includes stats as props on the React Email component", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    const digest = {
      signalCount: 12,
      pendingCount: 4,
      replyCount: 3,
      topSignals: [
        { excerpt: "Signal 1", subreddit: "startups", intentStrength: 9 },
        { excerpt: "Signal 2", subreddit: "saas", intentStrength: 7 },
      ],
      productName: "TaskFlow",
    }

    await sendDailyDigest("user@example.com", digest)

    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.react).toBeDefined()
    expect(callArgs.react.props).toEqual(digest)
  })

  it("handles zero signals gracefully", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendDailyDigest("user@example.com", {
      signalCount: 0,
      pendingCount: 0,
      replyCount: 0,
      topSignals: [],
      productName: "MyProduct",
    })

    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.subject).toBe("0 people looking for MyProduct yesterday")
    expect(callArgs.react.props.topSignals).toEqual([])
  })

  it("throws on Resend error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "invalid api key" },
    })

    await expect(
      sendDailyDigest("user@example.com", {
        signalCount: 1,
        pendingCount: 0,
        replyCount: 0,
        topSignals: [],
        productName: "MyProduct",
      }),
    ).rejects.toMatchObject({ message: "invalid api key" })
  })
})
