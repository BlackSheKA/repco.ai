import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import { AccountDegradedBanner } from "./account-degraded-banner"

describe("AccountDegradedBanner", () => {
  it("V-21: returns null when array empty", () => {
    const { container } = render(<AccountDegradedBanner accounts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("V-20: renders one row per degraded account", () => {
    const { getByText, getAllByRole } = render(
      <AccountDegradedBanner
        accounts={[
          {
            id: "a1",
            handle: "alice",
            platform: "reddit",
            health_status: "needs_reconnect",
          },
          {
            id: "a2",
            handle: "bob",
            platform: "reddit",
            health_status: "captcha_required",
          },
        ]}
      />,
    )
    expect(getByText("u/alice")).toBeTruthy()
    expect(getByText("u/bob")).toBeTruthy()
    expect(getAllByRole("link")).toHaveLength(2)
  })

  it("V-22: variant destructive when any row is banned", () => {
    const { container } = render(
      <AccountDegradedBanner
        accounts={[
          {
            id: "a1",
            handle: "alice",
            platform: "reddit",
            health_status: "banned",
          },
        ]}
      />,
    )
    const alert = container.querySelector("[role='alert']")
    expect(alert?.className).toMatch(/destructive/)
  })

  it("singular vs plural heading", () => {
    const { getByText, rerender } = render(
      <AccountDegradedBanner
        accounts={[
          {
            id: "a1",
            handle: "x",
            platform: "reddit",
            health_status: "warning",
          },
        ]}
      />,
    )
    expect(getByText("1 account needs attention")).toBeTruthy()
    rerender(
      <AccountDegradedBanner
        accounts={[
          {
            id: "a1",
            handle: "x",
            platform: "reddit",
            health_status: "warning",
          },
          {
            id: "a2",
            handle: "y",
            platform: "reddit",
            health_status: "warning",
          },
        ]}
      />,
    )
    expect(getByText("Some accounts need attention")).toBeTruthy()
  })
})
