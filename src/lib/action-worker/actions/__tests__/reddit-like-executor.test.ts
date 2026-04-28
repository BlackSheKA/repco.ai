/**
 * Unit tests for likeRedditPost (Phase 17.7-03).
 * One test per failure-mode literal + already_upvoted preflight.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import type { Stagehand } from "@browserbasehq/stagehand"
import { likeRedditPost } from "../reddit-like-executor"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  bodyText?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
  pressedAfterClick?: boolean
}

function createMockPage(scenario: Scenario): Page {
  let clicked = false

  const selectorMatch = (sel: string): VisibleSpec => {
    if (!scenario.selectors) return { visible: false }
    // Pressed-state locator (preflight + post-click verify) is identified by
    // `aria-pressed='true'` substring. Pre-click: returns scenario.selectors
    // "pressed" key (preflight already-upvoted case). Post-click: returns
    // scenario.pressedAfterClick.
    if (sel.includes("aria-pressed='true'") || sel.includes("upvoted")) {
      if (clicked) {
        return { visible: scenario.pressedAfterClick === true }
      }
      const k = Object.keys(scenario.selectors).find((x) =>
        ["pressed", "alreadyUpvoted"].includes(x),
      )
      return k ? scenario.selectors[k] : { visible: false }
    }
    // The unpressed upvote CTA.
    if (sel.includes("upvote") || sel.includes("Upvote")) {
      const k = Object.keys(scenario.selectors).find((x) => x === "upvoteCta")
      return k ? scenario.selectors[k] : { visible: false }
    }
    return { visible: false }
  }

  const buildLoc = (sel: string) => {
    const spec = selectorMatch(sel)
    const loc: {
      first: () => typeof loc
      isVisible: ReturnType<typeof vi.fn>
      click: ReturnType<typeof vi.fn>
      filter: () => typeof loc
      locator: (s: string) => ReturnType<typeof buildLoc>
    } = {
      first: () => loc,
      isVisible: vi.fn(async () => spec.visible === true),
      click: vi.fn(async () => {
        clicked = true
      }),
      filter: () => loc,
      locator: (s: string) => buildLoc(s),
    }
    return loc
  }

  const page: Partial<Page> = {
    setViewportSize: vi.fn(async () => {}) as unknown as Page["setViewportSize"],
    goto: vi.fn(async () => {
      if (scenario.gotoThrows) throw new Error("nav failed")
      return null
    }) as unknown as Page["goto"],
    url: vi.fn(() => scenario.url ?? "https://www.reddit.com/r/sub/comments/abc/title/") as unknown as Page["url"],
    waitForTimeout: vi.fn(async () => {}) as unknown as Page["waitForTimeout"],
    textContent: vi.fn(async () => scenario.bodyText ?? "") as unknown as Page["textContent"],
    locator: vi.fn((sel: string) => buildLoc(sel)) as unknown as Page["locator"],
  }
  return page as Page
}

function makeStagehand(opts?: {
  actImpl?: () => Promise<unknown>
  extractImpl?: () => Promise<unknown>
}) {
  const sh = {
    act: vi.fn(
      opts?.actImpl ??
        (async () => {
          throw new Error("stub")
        }),
    ),
    extract: vi.fn(
      opts?.extractImpl ??
        (async () => {
          throw new Error("stub")
        }),
    ),
  } as unknown as Stagehand
  return sh
}

const POST = "https://www.reddit.com/r/sub/comments/abc/title/"

describe("likeRedditPost — URL guard", () => {
  it("returns post_unreachable for non-reddit URL", async () => {
    const r = await likeRedditPost(
      createMockPage({}),
      makeStagehand(),
      "https://example.com/foo",
    )
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns post_unreachable when goto throws", async () => {
    const r = await likeRedditPost(
      createMockPage({ gotoThrows: true }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("post_unreachable")
  })
})

describe("likeRedditPost — URL gates", () => {
  it("returns security_checkpoint on /checkpoint", async () => {
    const r = await likeRedditPost(
      createMockPage({ url: "https://www.reddit.com/checkpoint/x" }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns captcha_required on /captcha", async () => {
    const r = await likeRedditPost(
      createMockPage({ url: "https://www.reddit.com/captcha/x" }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("captcha_required")
  })

  it("returns session_expired on /login", async () => {
    const r = await likeRedditPost(
      createMockPage({ url: "https://www.reddit.com/login/" }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("session_expired")
  })
})

describe("likeRedditPost — body gates", () => {
  it("returns account_suspended", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        bodyText: "This account has been suspended for breaking Reddit rules.",
      }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("account_suspended")
  })

  it("returns post_unreachable for removed post", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        bodyText: "This post has been removed",
      }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns nsfw_gated", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        bodyText: "This community is nsfw. Are you over 18?",
      }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("nsfw_gated")
  })

  it("returns subreddit_locked", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        bodyText: "Comments are locked on this thread.",
      }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("subreddit_locked")
  })
})

describe("likeRedditPost — already_upvoted preflight", () => {
  it("returns success+already_upvoted when preflight detects pressed state", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        selectors: { pressed: { visible: true } },
      }),
      makeStagehand(),
      POST,
    )
    expect(r.success).toBe(true)
    expect(r.failureMode).toBe("already_upvoted")
  })
})

describe("likeRedditPost — CTA + verify", () => {
  it("returns upvote_button_missing when CTA absent AND stagehand throws", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        selectors: { upvoteCta: { visible: false } },
      }),
      makeStagehand(),
      POST,
    )
    expect(r.failureMode).toBe("upvote_button_missing")
  })

  it("returns success when click flips aria-pressed='true'", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        selectors: { upvoteCta: { visible: true } },
        pressedAfterClick: true,
      }),
      makeStagehand(),
      POST,
    )
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })

  it("returns success when DOM verify misses but extract verdict.upvoted=true", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        selectors: { upvoteCta: { visible: true } },
        pressedAfterClick: false,
      }),
      makeStagehand({
        extractImpl: async () => ({ upvoted: true, errorMessage: null }),
      }),
      POST,
    )
    expect(r.success).toBe(true)
  })

  it("returns unknown when no signal anywhere", async () => {
    const r = await likeRedditPost(
      createMockPage({
        url: POST,
        selectors: { upvoteCta: { visible: true } },
        pressedAfterClick: false,
      }),
      makeStagehand({
        extractImpl: async () => ({ upvoted: false, errorMessage: null }),
      }),
      POST,
    )
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("unknown")
  })
})
