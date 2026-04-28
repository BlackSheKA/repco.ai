/**
 * Unit tests for followRedditProfile (Phase 17.7-03).
 * One test per failure-mode literal + already_following preflight.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import type { Stagehand } from "@browserbasehq/stagehand"
import { followRedditProfile } from "../reddit-follow-executor"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  bodyText?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
  followingAfterClick?: boolean
}

function createMockPage(scenario: Scenario): Page {
  let clicked = false

  const selectorMatch = (sel: string): VisibleSpec => {
    if (!scenario.selectors) return { visible: false }
    // The Follow CTA selector excludes the "Following" state via `:not(...)`.
    // Detect it first; otherwise the bare-`'Following'` preflight branch
    // would swallow the CTA query.
    const isCta = sel.includes(":not(")
    if (isCta) {
      const k = Object.keys(scenario.selectors).find((x) => x === "followCta")
      return k ? scenario.selectors[k] : { visible: false }
    }
    // already_following preflight + post-click verify: contains 'Following'
    // (no `:not(`) or `aria-pressed='true'`.
    if (sel.includes("Following") || sel.includes("aria-pressed='true'")) {
      if (clicked) {
        return { visible: scenario.followingAfterClick === true }
      }
      const k = Object.keys(scenario.selectors).find(
        (x) => x === "alreadyFollowing",
      )
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
    url: vi.fn(() =>
      scenario.url ?? "https://www.reddit.com/user/test_user/",
    ) as unknown as Page["url"],
    waitForTimeout: vi.fn(async () => {}) as unknown as Page["waitForTimeout"],
    textContent: vi.fn(async () =>
      scenario.bodyText ?? "",
    ) as unknown as Page["textContent"],
    locator: vi.fn((sel: string) => buildLoc(sel)) as unknown as Page["locator"],
  }
  return page as Page
}

function makeStagehand(opts?: {
  actImpl?: () => Promise<unknown>
  extractImpl?: () => Promise<unknown>
}) {
  return {
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
}

const HANDLE = "test_user"

describe("followRedditProfile — handle validation", () => {
  it("returns recipient_not_found when handle shape invalid", async () => {
    const r = await followRedditProfile(
      createMockPage({}),
      makeStagehand(),
      "https://example.com/foo",
    )
    expect(r.failureMode).toBe("recipient_not_found")
  })
})

describe("followRedditProfile — nav + URL gates", () => {
  it("returns profile_unreachable when goto throws", async () => {
    const r = await followRedditProfile(
      createMockPage({ gotoThrows: true }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("profile_unreachable")
  })

  it("returns security_checkpoint on /checkpoint", async () => {
    const r = await followRedditProfile(
      createMockPage({ url: "https://www.reddit.com/checkpoint/x" }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns captcha_required on /captcha", async () => {
    const r = await followRedditProfile(
      createMockPage({ url: "https://www.reddit.com/captcha/x" }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("captcha_required")
  })

  it("returns session_expired on /login", async () => {
    const r = await followRedditProfile(
      createMockPage({ url: "https://www.reddit.com/login/" }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("session_expired")
  })
})

describe("followRedditProfile — body gates", () => {
  it("returns recipient_not_found when target user banned/not found", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        bodyText: "Sorry, nobody on reddit goes by that name.",
      }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("recipient_not_found")
  })

  it("returns account_suspended when executor's own account suspended", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        // No 'sorry' / target-side phrasing — generic suspension banner only.
        bodyText: "Your account has been suspended for breaking Reddit rules.",
      }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("account_suspended")
  })
})

describe("followRedditProfile — already_following preflight", () => {
  it("returns success+already_following when Following label visible at preflight", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        selectors: { alreadyFollowing: { visible: true } },
      }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.success).toBe(true)
    expect(r.failureMode).toBe("already_following")
  })
})

describe("followRedditProfile — CTA + verify", () => {
  it("returns follow_button_missing when CTA absent AND stagehand throws", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        selectors: { followCta: { visible: false } },
      }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.failureMode).toBe("follow_button_missing")
  })

  it("returns success when click flips Follow → Following", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        selectors: { followCta: { visible: true } },
        followingAfterClick: true,
      }),
      makeStagehand(),
      HANDLE,
    )
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })

  it("returns success when DOM verify misses but extract verdict.following=true", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        selectors: { followCta: { visible: true } },
        followingAfterClick: false,
      }),
      makeStagehand({
        extractImpl: async () => ({ following: true, errorMessage: null }),
      }),
      HANDLE,
    )
    expect(r.success).toBe(true)
  })

  it("returns unknown when no signal anywhere", async () => {
    const r = await followRedditProfile(
      createMockPage({
        url: "https://www.reddit.com/user/test_user/",
        selectors: { followCta: { visible: true } },
        followingAfterClick: false,
      }),
      makeStagehand({
        extractImpl: async () => ({ following: false, errorMessage: null }),
      }),
      HANDLE,
    )
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("unknown")
  })
})
