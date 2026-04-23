/**
 * Unit tests for commentLinkedInPost (LNKD-03 / LNKD-04).
 *
 * Exercises each failure-mode branch plus transversals and happy path.
 * Quill composer semantics: Page.keyboard.type is expected to be called
 * after focusing the contenteditable.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import { commentLinkedInPost } from "../linkedin-comment-executor"

type VisibleSpec = {
  visible?: boolean
  afterCommentClick?: boolean
  afterType?: boolean
}
interface Scenario {
  url?: string
  bodyText?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
}

function createMockPage(scenario: Scenario): Page {
  let commentBtnClicked = false
  let typedText = ""

  const selectorMatch = (sel: string): VisibleSpec | undefined => {
    if (!scenario.selectors) return { visible: false }
    const keys = Object.keys(scenario.selectors)
    const sorted = [...keys].sort((a, b) => b.length - a.length)
    for (const key of sorted) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  const makeLoc = (sel: string) => {
    const spec = selectorMatch(sel) ?? { visible: false }
    const loc: {
      first: () => typeof loc
      isVisible: ReturnType<typeof vi.fn>
      click: ReturnType<typeof vi.fn>
      locator: ReturnType<typeof vi.fn>
      filter: (_opts: { hasText?: string }) => typeof loc
    } = {
      first: () => loc,
      isVisible: vi.fn(async () => {
        if (spec.afterCommentClick && !commentBtnClicked) return false
        if (spec.afterType && typedText.length === 0) return false
        return spec.visible === true
      }),
      click: vi.fn(async () => {
        if (sel.includes("aria-label='Comment'") || sel.includes("'Comment'")) {
          commentBtnClicked = true
        }
      }),
      locator: vi.fn((childSel: string) => makeLoc(childSel)),
      // W-08 test-harness: executor now uses .filter({ hasText }) instead of
      // brittle :has-text() with JSON.stringify. Treat filter as a no-op that
      // returns the same locator — scenarios already gate visibility via
      // "comments-comment-list" selectors.
      filter: (_opts: { hasText?: string }) => loc,
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
    textContent: vi.fn(async () => scenario.bodyText ?? "") as unknown as Page["textContent"],
    locator: locator as unknown as Page["locator"],
    keyboard: {
      type: vi.fn(async (t: string) => {
        typedText += t
      }),
    } as unknown as Page["keyboard"],
  }
  return page as Page
}

const POST = "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/"
const TEXT = "Sprint overhead is a real tax. Curious what helped most."

describe("commentLinkedInPost", () => {
  it("returns char_limit_exceeded BEFORE navigation when text > 1250 chars", async () => {
    const page = createMockPage({})
    const big = "a".repeat(1251)
    const r = await commentLinkedInPost(page, POST, big)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("char_limit_exceeded")
    expect(page.goto).not.toHaveBeenCalled()
  })

  it("returns post_unreachable when page.goto throws", async () => {
    const page = createMockPage({ gotoThrows: true })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns post_unreachable when body matches 'no longer available' copy", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "This post is no longer available",
      selectors: { "urn:li:activity": { visible: true } },
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns session_expired when URL lands on /login", async () => {
    const page = createMockPage({ url: "https://www.linkedin.com/login" })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })

  it("returns security_checkpoint when URL matches /checkpoint/", async () => {
    const page = createMockPage({
      url: "https://www.linkedin.com/checkpoint/challenge",
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns comment_disabled when Comment CTA absent and body matches disabled copy", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "Comments are turned off for this post.",
      selectors: {
        "urn:li:activity": { visible: true },
        "aria-label='Comment'": { visible: false },
      },
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("comment_disabled")
  })

  it("returns comment_post_failed when composer never mounts", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "aria-label='Comment'": { visible: true },
        "ql-editor": { visible: false },
      },
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("comment_post_failed")
  })

  it("returns comment_post_failed when posted but text never appears in list", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "aria-label='Comment'": { visible: true },
        "ql-editor": { visible: true },
        "comments-comment-box__submit-button": { visible: true },
        "comments-comment-list": { visible: false },
        "comments-comments-list": { visible: false },
      },
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("comment_post_failed")
  })

  it("returns success when composer fills, Post clicked, and comment appears in list", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        "urn:li:activity": { visible: true },
        "aria-label='Comment'": { visible: true },
        "ql-editor": { visible: true },
        "comments-comment-box__submit-button": { visible: true },
        "comments-comment-list": { visible: true, afterType: true },
      },
    })
    const r = await commentLinkedInPost(page, POST, TEXT)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
    expect(page.keyboard.type).toHaveBeenCalled()
  })
})
