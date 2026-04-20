import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSend = vi.fn()

vi.mock("../resend-client", () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => mockSend(...args),
    },
  },
}))

import { sendReplyAlert } from "../send-reply-alert"

describe("sendReplyAlert", () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it("sends reply alert email with correct subject", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendReplyAlert("user@example.com", "testuser", "Reddit")

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "u/testuser replied on Reddit",
        to: "user@example.com",
      }),
    )
  })

  it("sends from notifications@repco.ai", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendReplyAlert("user@example.com", "testuser", "Reddit")

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "repco <notifications@repco.ai>",
      }),
    )
  })

  it("passes correct props to ReplyAlertEmail component", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendReplyAlert("user@example.com", "alice", "LinkedIn")

    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.react).toBeDefined()
    // React element props live at .props
    expect(callArgs.react.props).toEqual({
      prospectHandle: "alice",
      platform: "LinkedIn",
    })
  })

  it("throws on Resend error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "rate limited" },
    })

    await expect(
      sendReplyAlert("user@example.com", "testuser", "Reddit"),
    ).rejects.toMatchObject({ message: "rate limited" })
  })

  it("returns data on success", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "abc-123" }, error: null })

    const result = await sendReplyAlert(
      "user@example.com",
      "testuser",
      "Reddit",
    )

    expect(result).toEqual({ id: "abc-123" })
  })
})
