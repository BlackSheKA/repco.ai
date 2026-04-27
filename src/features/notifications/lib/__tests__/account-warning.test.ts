import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSend = vi.fn()

vi.mock("../resend-client", () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => mockSend(...args),
    },
  },
}))

import { sendAccountWarning } from "../send-account-warning"

describe("sendAccountWarning", () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it("sends warning email for warning status", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendAccountWarning("user@example.com", "myaccount", "warning")

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Account @myaccount needs attention",
        from: "repco <notifications@repco.ai>",
        to: "user@example.com",
      }),
    )
    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.react.props).toMatchObject({
      accountHandle: "myaccount",
      status: "warning",
    })
  })

  it("sends email for banned status with same subject format", async () => {
    mockSend.mockResolvedValueOnce({ data: { id: "test-id" }, error: null })

    await sendAccountWarning("user@example.com", "myaccount", "banned")

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Your Reddit account u/myaccount was suspended",
      }),
    )
    const callArgs = mockSend.mock.calls[0][0]
    expect(callArgs.react.props).toMatchObject({
      accountHandle: "myaccount",
      status: "banned",
    })
  })

  it("throws on Resend error", async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: "smtp failure" },
    })

    await expect(
      sendAccountWarning("user@example.com", "myaccount", "warning"),
    ).rejects.toMatchObject({ message: "smtp failure" })
  })
})
