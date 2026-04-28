/**
 * Unit tests for commentRedditPost (Phase 17.7-02).
 *
 * Covers every failure-mode literal in CONTEXT D-04 §Comment taxonomy plus
 * the T-17.5-02 invariant: comment body MUST NEVER appear inside any
 * argument passed to `stagehand.act` or `stagehand.extract`.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import type { Stagehand } from "@browserbasehq/stagehand"
import { commentRedditPost } from "../reddit-comment-executor"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  urlSequence?: string[]
  bodyText?: string
  bodyTextAfterSubmit?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
}

function createMockPage(scenario: Scenario): Page {
  const urls = scenario.urlSequence ?? [
    scenario.url ?? "https://www.reddit.com/r/sub/comments/abc/title/",
  ]
  let urlIdx = 0
  let submitted = false

  const selectorMatch = (sel: string): VisibleSpec => {
    if (!scenario.selectors) return { visible: false }
    const keys = Object.keys(scenario.selectors)
    // Hard route: the production submit selector ALWAYS contains
    // `type='submit'`. Only match against submit-flavour scenario keys
    // (those that themselves include "submit" or "Post") so the broader
    // "Reply" / "Comment" keys (used for the Reply CTA) never bleed in.
    if (sel.includes("type='submit'")) {
      for (const k of keys) {
        if ((k.includes("submit") || k === "Post") && sel.includes(k)) {
          return scenario.selectors[k]
        }
      }
      return { visible: false }
    }
    // Composer route — match only contenteditable/textarea keys.
    if (/contenteditable|textarea|public-DraftEditor/i.test(sel)) {
      for (const k of keys) {
        if (
          /contenteditable|textarea|public-DraftEditor/i.test(k) &&
          sel.includes(k)
        ) {
          return scenario.selectors[k]
        }
      }
      return { visible: false }
    }
    // Default: first matching key (CTA, body gates, comment-thread verify).
    for (const k of keys) {
      if (sel.includes(k)) return scenario.selectors[k]
    }
    return { visible: false }
  }

  const buildLoc = (sel: string) => {
    const spec = selectorMatch(sel)
    const loc: {
      first: () => typeof loc
      isVisible: ReturnType<typeof vi.fn>
      click: ReturnType<typeof vi.fn>
      filter: (_o: { hasText?: string }) => typeof loc
      locator: (s: string) => ReturnType<typeof buildLoc>
    } = {
      first: () => loc,
      isVisible: vi.fn(async () => spec.visible === true),
      click: vi.fn(async () => {
        // Submit-button click flips the submitted gate so post-submit body
        // text is observed. The production submit locator always contains
        // `type='submit'`.
        if (sel.includes("type='submit'")) submitted = true
      }),
      filter: () => loc,
      locator: (s: string) => buildLoc(s),
    }
    return loc
  }
  const locator = vi.fn((sel: string) => buildLoc(sel))

  const page: Partial<Page> = {
    setViewportSize: vi.fn(async () => {}) as unknown as Page["setViewportSize"],
    goto: vi.fn(async () => {
      if (scenario.gotoThrows) throw new Error("nav failed")
      return null
    }) as unknown as Page["goto"],
    url: vi.fn(() => {
      const u = urls[Math.min(urlIdx, urls.length - 1)]
      urlIdx += 1
      return u
    }) as unknown as Page["url"],
    waitForTimeout: vi.fn(async () => {}) as unknown as Page["waitForTimeout"],
    textContent: vi.fn(async () => {
      return submitted
        ? (scenario.bodyTextAfterSubmit ?? scenario.bodyText ?? "")
        : (scenario.bodyText ?? "")
    }) as unknown as Page["textContent"],
    locator: locator as unknown as Page["locator"],
    keyboard: {
      type: vi.fn(async () => {}),
    } as unknown as Page["keyboard"],
  }
  return page as Page
}

function makeStagehand(opts?: {
  actImpl?: (...args: unknown[]) => Promise<unknown>
  extractImpl?: (...args: unknown[]) => Promise<unknown>
}) {
  const act = vi.fn(
    opts?.actImpl ??
      (async () => {
        throw new Error("stub")
      }),
  )
  const extract = vi.fn(
    opts?.extractImpl ??
      (async () => {
        throw new Error("stub")
      }),
  )
  return { sh: { act, extract } as unknown as Stagehand, act, extract }
}

const POST = "https://www.reddit.com/r/sub/comments/abc/title/"

describe("commentRedditPost — URL guard", () => {
  it("returns post_unreachable for non-reddit URL", async () => {
    const page = createMockPage({})
    const { sh } = makeStagehand()
    const r = await commentRedditPost(
      page,
      sh,
      "https://example.com/foo",
      "hi",
    )
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns post_unreachable when goto throws", async () => {
    const page = createMockPage({ gotoThrows: true })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("post_unreachable")
  })
})

describe("commentRedditPost — URL gates", () => {
  it("returns captcha_required on /checkpoint", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/checkpoint/x",
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("captcha_required")
  })

  it("returns session_expired on /login", async () => {
    const page = createMockPage({ url: "https://www.reddit.com/login/" })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("session_expired")
  })
})

describe("commentRedditPost — early body gates", () => {
  it("returns account_suspended", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "This account has been suspended for breaking Reddit rules.",
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("account_suspended")
  })

  it("returns post_unreachable for removed post body", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "This post has been removed by moderators.",
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("post_unreachable")
  })

  it("returns subreddit_locked when comments are locked", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "Comments are locked on this thread.",
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("subreddit_locked")
  })

  it("returns nsfw_gated for NSFW community gate", async () => {
    const page = createMockPage({
      url: POST,
      bodyText: "Are you over 18? View NSFW community.",
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("nsfw_gated")
  })
})

describe("commentRedditPost — composer + submit", () => {
  it("returns composer_never_opened when Reply CTA missing AND stagehand throws", async () => {
    const page = createMockPage({
      url: POST,
      selectors: { Reply: { visible: false } },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("composer_never_opened")
  })

  it("returns composer_never_opened when composer never visible", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("composer_never_opened")
  })

  it("returns submit_button_missing when submit absent AND stagehand throws", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        Comment: { visible: false },
        Post: { visible: false },
        "type='submit'": { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("submit_button_missing")
  })
})

describe("commentRedditPost — post-submit gates", () => {
  it("returns weekly_limit_reached on rate-limit body", async () => {
    const page = createMockPage({
      url: POST,
      bodyTextAfterSubmit: "You're posting too fast. Please wait.",
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("weekly_limit_reached")
  })

  it("returns captcha_required when post-submit URL goes to /captcha", async () => {
    const page = createMockPage({
      urlSequence: [POST, "https://www.reddit.com/captcha/x"],
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.failureMode).toBe("captcha_required")
  })
})

describe("commentRedditPost — happy paths", () => {
  it("returns success on top-level path when DOM thread contains body", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
        "data-testid*='comment'": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(page, sh, POST, "hello world reply")
    expect(r.success).toBe(true)
  })

  it("returns success on nested-reply path with parentCommentId", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        // Note: the nested Reply locator is `scope.locator("button:has-text('Reply')")` —
        // both parent scope locator + reply button are matched by 'Reply' substring.
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
        "shreddit-comment": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await commentRedditPost(
      page,
      sh,
      POST,
      "nested reply text",
      "t1_abcdef",
    )
    expect(r.success).toBe(true)
  })

  it("returns success when stagehand.extract verdict.posted is true", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
        // DOM verify misses → fall through to extract.
        "data-testid*='comment'": { visible: false },
      },
    })
    const { sh } = makeStagehand({
      extractImpl: async () => ({ posted: true, errorMessage: null }),
    })
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.success).toBe(true)
  })

  it("returns unknown when no signal anywhere", async () => {
    const page = createMockPage({
      url: POST,
      selectors: {
        Reply: { visible: true },
        "contenteditable='true'": { visible: true },
        "type='submit'": { visible: true },
        "data-testid*='comment'": { visible: false },
      },
    })
    const { sh } = makeStagehand({
      extractImpl: async () => ({ posted: false, errorMessage: null }),
    })
    const r = await commentRedditPost(page, sh, POST, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("unknown")
  })
})

describe("commentRedditPost — T-17.5-02 invariant", () => {
  it("never passes the body text into stagehand.act / stagehand.extract", async () => {
    const CANARY = "CANARY_COMMENT_TEXT_777_NEVER_TO_LLM"
    const page = createMockPage({
      url: POST,
      // Force every Stagehand surface to fire.
      selectors: {
        // Reply CTA absent → stagehand.act fallback for top-level Reply.
        Reply: { visible: false },
        // Composer visible AFTER stagehand opens it (mock returns visible=true
        // for matching contenteditable selector regardless of when called).
        "contenteditable='true'": { visible: true },
        // Submit absent → stagehand.act fallback.
        "type='submit'": { visible: false },
        Comment: { visible: false },
        Post: { visible: false },
        // DOM-verify absent → stagehand.extract verifier fires.
        "data-testid*='comment'": { visible: false },
      },
    })
    const { sh, act, extract } = makeStagehand({
      actImpl: async () => undefined,
      extractImpl: async () => ({ posted: false, errorMessage: null }),
    })
    await commentRedditPost(page, sh, POST, CANARY)

    const stringifyArgs = (args: unknown[]) =>
      args
        .map((a) => {
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        })
        .join(" || ")

    for (const call of act.mock.calls) {
      expect(stringifyArgs(call)).not.toContain(CANARY)
    }
    for (const call of extract.mock.calls) {
      expect(stringifyArgs(call)).not.toContain(CANARY)
    }
  })
})
