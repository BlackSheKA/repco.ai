/**
 * Unit tests for detectLinkedInAuthwall.
 *
 * Authored 2026-04-24 after Phase 13 UAT revealed logged-out GoLogin
 * sessions were silently misattributed as target-side failure modes
 * (not_connected, follow_button_missing, react_button_missing,
 * prescreen verdict=null).
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import { detectLinkedInAuthwall } from "../linkedin-authwall"

function makePage(opts: {
  url: string
  headingVisible?: boolean
  formVisible?: boolean
}): Page {
  const locator = vi.fn((sel: string) => ({
    first: () => ({
      isVisible: vi.fn(async () => {
        const isHeadingSel = /Join LinkedIn|Sign in/i.test(sel)
        const isFormSel =
          /section\.authwall|auth-join-form|auth-signin-form/i.test(sel)
        if (isHeadingSel) return opts.headingVisible === true
        if (isFormSel) return opts.formVisible === true
        return false
      }),
    }),
  }))
  return {
    url: () => opts.url,
    locator,
  } as unknown as Page
}

describe("detectLinkedInAuthwall", () => {
  it("returns true when URL is /login", async () => {
    const page = makePage({ url: "https://www.linkedin.com/login" })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns true when URL is /authwall", async () => {
    const page = makePage({
      url: "https://www.linkedin.com/authwall?redirect=/in/x",
    })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns true when URL is /signup", async () => {
    const page = makePage({ url: "https://www.linkedin.com/signup" })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns true when URL is /join", async () => {
    const page = makePage({ url: "https://www.linkedin.com/join" })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns true when URL looks like a profile but Join heading is shown (INLINE signup wall)", async () => {
    const page = makePage({
      url: "https://www.linkedin.com/in/williamhgates/",
      headingVisible: true,
    })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns true when URL looks like a profile but authwall form is shown", async () => {
    const page = makePage({
      url: "https://www.linkedin.com/in/someone/",
      formVisible: true,
    })
    expect(await detectLinkedInAuthwall(page)).toBe(true)
  })

  it("returns false for a legitimate profile view (authenticated)", async () => {
    const page = makePage({
      url: "https://www.linkedin.com/in/legit-user/",
      headingVisible: false,
      formVisible: false,
    })
    expect(await detectLinkedInAuthwall(page)).toBe(false)
  })

  it("returns false for an activity/post URL when authenticated", async () => {
    const page = makePage({
      url: "https://www.linkedin.com/feed/update/urn:li:activity:123/",
    })
    expect(await detectLinkedInAuthwall(page)).toBe(false)
  })
})
