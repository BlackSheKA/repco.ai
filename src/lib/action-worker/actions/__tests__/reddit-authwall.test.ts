/**
 * Unit tests for reddit-utils + reddit-authwall (Phase 17.7-01).
 *
 * Mirrors the mock-page pattern from linkedin-dm-executor.test.ts.
 * Covers:
 *   - extractRedditHandle: 5 input shapes (full URL, no-www, u/ prefix,
 *     bare handle, foreign URL)
 *   - redditUserUrl / redditPostUrl: happy paths + idempotency
 *   - detectRedditLoginWall: URL match, heading match, dialog match,
 *     body-text match, all-negative logged-in feed
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import {
  extractRedditHandle,
  redditUserUrl,
  redditPostUrl,
} from "../reddit-utils"
import { detectRedditLoginWall } from "../reddit-authwall"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  bodyText?: string
  selectors?: Record<string, VisibleSpec>
}

function createMockPage(scenario: Scenario): Page {
  const selectorMatch = (sel: string): VisibleSpec => {
    if (!scenario.selectors) return { visible: false }
    for (const key of Object.keys(scenario.selectors)) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  const locator = vi.fn((sel: string) => {
    const spec = selectorMatch(sel)
    const loc: {
      first: () => typeof loc
      isVisible: ReturnType<typeof vi.fn>
    } = {
      first: () => loc,
      isVisible: vi.fn(async () => spec.visible === true),
    }
    return loc
  })

  const page: Partial<Page> = {
    url: vi.fn(() => scenario.url ?? "https://www.reddit.com/") as unknown as Page["url"],
    locator: locator as unknown as Page["locator"],
    textContent: vi.fn(async () => scenario.bodyText ?? "") as unknown as Page["textContent"],
  }
  return page as Page
}

describe("extractRedditHandle", () => {
  it("extracts handle from canonical full URL", () => {
    expect(
      extractRedditHandle("https://www.reddit.com/user/foo_bar/"),
    ).toBe("foo_bar")
  })

  it("extracts handle from bare-domain URL without trailing slash", () => {
    expect(extractRedditHandle("https://reddit.com/user/foo_bar")).toBe(
      "foo_bar",
    )
  })

  it("extracts handle from u/ prefix shorthand", () => {
    expect(extractRedditHandle("u/foo_bar")).toBe("foo_bar")
  })

  it("returns bare handle when input matches Reddit-shape regex", () => {
    expect(extractRedditHandle("foo_bar")).toBe("foo_bar")
  })

  it("returns null for foreign URLs", () => {
    expect(extractRedditHandle("https://example.com/foo")).toBeNull()
  })

  it("returns null for empty / undefined input", () => {
    expect(extractRedditHandle("")).toBeNull()
  })
})

describe("redditUserUrl", () => {
  it("builds canonical user URL", () => {
    expect(redditUserUrl("foo_bar")).toBe(
      "https://www.reddit.com/user/foo_bar/",
    )
  })
})

describe("redditPostUrl", () => {
  it("prefixes path-only signal with reddit base", () => {
    expect(redditPostUrl("/r/sub/comments/abc/title/")).toBe(
      "https://www.reddit.com/r/sub/comments/abc/title/",
    )
  })

  it("returns full URL unchanged (idempotent)", () => {
    expect(
      redditPostUrl("https://www.reddit.com/r/sub/comments/abc/"),
    ).toBe("https://www.reddit.com/r/sub/comments/abc/")
  })

  it("adds leading slash when missing", () => {
    expect(redditPostUrl("r/sub/comments/abc/")).toBe(
      "https://www.reddit.com/r/sub/comments/abc/",
    )
  })
})

describe("detectRedditLoginWall", () => {
  it("returns true when URL matches /login", async () => {
    const page = createMockPage({ url: "https://www.reddit.com/login/" })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns true when URL matches /account/login", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/account/login/",
    })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns true when URL matches /register", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/register/",
    })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns true when heading 'Log in to Reddit' is visible", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: { "Log in to Reddit": { visible: true } },
    })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns true when login dialog is visible", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/r/sub/",
      selectors: { "Log in to continue": { visible: true } },
    })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns true when body contains login phrase + Continue with Google", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      bodyText:
        "Log in to Reddit  Continue with Google  Continue with Apple Forgot password",
    })
    expect(await detectRedditLoginWall(page)).toBe(true)
  })

  it("returns false on a logged-in /r/sub feed page", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/r/programming/",
      bodyText: "Top posts today | hot | new",
    })
    expect(await detectRedditLoginWall(page)).toBe(false)
  })
})
