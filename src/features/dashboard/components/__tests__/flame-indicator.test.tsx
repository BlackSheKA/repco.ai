import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { FlameIndicator } from "../flame-indicator"

describe("FlameIndicator — intent strength tiers (FEED-02)", () => {
  it("shows 'Classifying...' with animate-pulse when strength is null", () => {
    render(<FlameIndicator strength={null} />)
    expect(screen.getByText("Classifying...")).toBeInTheDocument()
  })

  it("renders aria-label with strength and tier label on the wrapper div", () => {
    render(<FlameIndicator strength={8} />)
    const wrapper = document.querySelector("[aria-label]")
    expect(wrapper?.getAttribute("aria-label")).toContain("8 out of 10")
    expect(wrapper?.getAttribute("aria-label")).toContain("hot")
  })

  it("labels strength >= 7 as 'hot'", () => {
    const { container } = render(<FlameIndicator strength={7} />)
    const label = container.querySelector("[aria-label]")
    expect(label?.getAttribute("aria-label")).toContain("hot")
  })

  it("labels strength >= 4 and < 7 as 'warm'", () => {
    const { container } = render(<FlameIndicator strength={5} />)
    const label = container.querySelector("[aria-label]")
    expect(label?.getAttribute("aria-label")).toContain("warm")
  })

  it("labels strength < 4 as 'cold'", () => {
    const { container } = render(<FlameIndicator strength={2} />)
    const label = container.querySelector("[aria-label]")
    expect(label?.getAttribute("aria-label")).toContain("cold")
  })

  it("shows strength as N/10 text", () => {
    render(<FlameIndicator strength={6} />)
    expect(screen.getByText("6/10")).toBeInTheDocument()
  })
})
