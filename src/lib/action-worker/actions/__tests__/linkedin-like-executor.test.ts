/**
 * Unit tests for likeLinkedInPost (LNKD-03).
 *
 * Exercises each failure-mode branch defined in 13-CONTEXT.md
 * §Failure-mode taxonomy (linkedin-like) plus transversal modes and
 * happy/already-liked signals.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import { likeLinkedInPost } from "../linkedin-like-executor"

type VisibleSpec = { visible?: boolean; afterClick?: boolean }
interface Scenario {
  url?: string
  bodyText?: string
  bodyTextAfterClick?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
}

function createMockPage(scenario: Scenario): Page {
  let likeClicked = false

  const selectorMatch = (sel: string): VisibleSpec | undefined => {
    if (!scenario.selectors) return { visible: false }
    const keys = Object.keys(scenario.selectors)
    // Prefer the most specific (longest) matching key.
    const sorted = [...keys].sort((a, b) => b.length - a.length)
    for (const key of sorted) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  const makeLoc = (sel: string) => {
    const spec = selectorMatch(sel) ?? { visible: false }
    const loc = {
      first: () => loc,
      isVisible: vi.fn(async () => {
        if (spec.afterClick && !likeClicked) return false
        return spec.visible === true
      }),
      click: vi.fn(async () => {
        if (sel.toLowerCase().includes("react like") || sel.includes("react-button")) {
          likeClicked = true
        }
      }),
      // Child locator delegates back through the factory so scope-nested
      // selectors (e.g. mainPost.locator("button[aria-pressed='true']"))
      // resolve against scenario.selectors by the child's selector key.
      locator: vi.fn((childSel: string) => makeLoc(childSel)),
    }
    return loc
  }
  const locator = vi.fn((sel: string) => makeLoc(sel))

  const page: Partial<Page> = {
    setViewportSize: vi.fn(async () => {}) as unknown as Page["setViewportSize"],
    goto: vi.fn(async () => {
      if (scenario.gotoThrows) throw new Error("nav failed")
      return null
    }) as unknown as Page["goto"],
    url: vi.fn(
      () => scenario.url ?? "https://www.linkedin.com/feed/update/urn:li:activity:1",
    ) as unknown as Page["url"],
    waitForTimeout: vi.fn(async () => {}) as unknown as Page["waitForTimeout"],
    textContent: vi.fn(async () => {
      return likeClicked
        ? (scenario.bodyTextAfterClick ?? scenario.bodyText ?? "")
        : (scenario.bodyText ?? "")
    }) as unknown as Page["textContent"],
    locator: locator as unknown as Page["locator"],
  }
  return page as Page
}

const POST = "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/"

describe("likeLinkedInPost", () => {
  it("returns post_unreachable when page.goto throws", async () => {
    const page = createMockPage({ gotoThrows: true })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns post_unreachable when body matches 'no longer available' copy", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "This post is no longer available",
      selectors: {
        "urn:li:activity": { visible: true },
      },
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns post_deleted when body matches removed-by-author copy", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "This post was removed by the author.",
      selectors: {
        "urn:li:activity": { visible: true },
      },
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_deleted")
  })

  it("returns session_expired when URL lands on /login", async () => {
    const page = createMockPage({ url: "https://www.linkedin.com/login" })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })

  it("returns security_checkpoint when URL matches /checkpoint/", async () => {
    const page = createMockPage({
      url: "https://www.linkedin.com/checkpoint/challenge",
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns already_liked when landing aria-pressed='true' visible", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "React Like'][aria-pressed='true'": { visible: true },
      },
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBe("already_liked")
  })

  it("returns react_button_missing when post loads but no React CTA visible", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "React Like": { visible: false },
        "react-button__trigger": { visible: false },
      },
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("react_button_missing")
  })

  it("returns success when Like click flips aria-pressed to true", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "React Like": { visible: true },
        "aria-pressed='true'": { visible: true, afterClick: true },
      },
    })
    const r = await likeLinkedInPost(page, POST)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })
})
