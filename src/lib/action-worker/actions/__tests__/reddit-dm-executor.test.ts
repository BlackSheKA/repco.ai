/**
 * Unit tests for sendRedditDM (Phase 17.7-01).
 *
 * Covers every failure-mode literal in CONTEXT D-04 §DM taxonomy plus the
 * T-17.5-02 invariant: the user message string MUST NEVER appear inside any
 * argument passed to `stagehand.act` or `stagehand.extract`.
 *
 * Mock-page factory mirrors `linkedin-dm-executor.test.ts`. Stagehand stub
 * defaults to throwing on `act` and `extract` so the deterministic
 * Playwright path is exercised by default; individual tests override.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import type { Stagehand } from "@browserbasehq/stagehand"
import { sendRedditDM } from "../reddit-dm-executor"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  urlSequence?: string[]
  bodyText?: string
  bodyTextAfterSend?: string
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
}

function createMockPage(scenario: Scenario): Page {
  const urls = scenario.urlSequence ?? [
    scenario.url ?? "https://www.reddit.com/",
  ]
  let urlIdx = 0
  let sendClicked = false

  const selectorMatch = (sel: string): VisibleSpec => {
    if (!scenario.selectors) return { visible: false }
    const keys = Object.keys(scenario.selectors)
    const selLower = sel.toLowerCase()
    // Disambiguation: when the selector targets the Send button we must not
    // match unrelated keys that happen to be substrings of the same string
    // (e.g. composer / chat / username). Resolve Send-flavour keys first
    // when querying a Send selector; otherwise prefer non-Send keys so the
    // composer/chat selectors don't accidentally match a Send key.
    const sendKeys = keys.filter((k) => k.toLowerCase().includes("send"))
    const otherKeys = keys.filter((k) => !k.toLowerCase().includes("send"))
    const isSend = selLower.includes("send")
    const ordered = isSend
      ? [...sendKeys, ...otherKeys]
      : [...otherKeys, ...sendKeys]
    for (const key of ordered) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  const locator = vi.fn((sel: string) => {
    const spec = selectorMatch(sel)
    const loc: {
      first: () => typeof loc
      isVisible: ReturnType<typeof vi.fn>
      click: ReturnType<typeof vi.fn>
      filter: (_o: { hasText?: string }) => typeof loc
    } = {
      first: () => loc,
      isVisible: vi.fn(async () => spec.visible === true),
      click: vi.fn(async () => {
        if (sel.toLowerCase().includes("send")) sendClicked = true
      }),
      filter: () => loc,
    }
    return loc
  })

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
      return sendClicked
        ? (scenario.bodyTextAfterSend ?? scenario.bodyText ?? "")
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
  return {
    sh: { act, extract } as unknown as Stagehand,
    act,
    extract,
  }
}

const HANDLE = "test_user"

describe("sendRedditDM — handle validation", () => {
  it("returns recipient_not_found when handle shape is invalid", async () => {
    const page = createMockPage({})
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, "https://example.com/foo", "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("recipient_not_found")
  })
})

describe("sendRedditDM — pre-flight URL gates", () => {
  it("returns session_expired when goto throws", async () => {
    const page = createMockPage({ gotoThrows: true })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })

  it("returns captcha_required when landed URL matches /checkpoint", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/checkpoint/foo",
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("captcha_required")
  })

  it("returns session_expired when landed URL matches /login", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/login/",
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })
})

describe("sendRedditDM — early body gates", () => {
  it("returns account_suspended when body shows suspension banner", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      bodyText: "This account has been suspended for breaking Reddit rules.",
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("account_suspended")
  })

  it("returns captcha_required when body shows verify-you're-human prompt", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      bodyText: "Please verify you're human before continuing",
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("captcha_required")
  })
})

describe("sendRedditDM — chat-panel open path", () => {
  it("returns dialog_never_opened when chat button missing AND stagehand.act throws", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: { Chat: { visible: false } },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("dialog_never_opened")
  })
})

describe("sendRedditDM — recipient select", () => {
  it("returns recipient_not_found when input never appears", async () => {
    // Chat opens (deterministic), New chat opens (stagehand fallback resolves),
    // but the username input never becomes visible AND stagehand.act for
    // recipient typing throws, so the deterministic fallback runs and exits.
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("recipient_not_found")
  })

  it("returns recipient_not_found when suggestion never appears", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("recipient_not_found")
  })
})

describe("sendRedditDM — chat_not_enabled gate", () => {
  it("returns chat_not_enabled when post-recipient body shows banner", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      // Body shows banner BEFORE send — surfaced after recipient pick.
      bodyText: "This user doesn't accept chat",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("chat_not_enabled")
  })
})

describe("sendRedditDM — composer + send", () => {
  it("returns dialog_never_opened when composer never visible", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("dialog_never_opened")
  })

  it("returns send_button_missing when send absent AND stagehand.act throws", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: false },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("send_button_missing")
  })
})

describe("sendRedditDM — post-send gates", () => {
  it("returns weekly_limit_reached when post-send body matches limit phrase", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      bodyTextAfterSend:
        "You've reached your daily limit, please try again later.",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("weekly_limit_reached")
  })

  it("returns captcha_required when post-send URL matches /captcha", async () => {
    const page = createMockPage({
      // First read = landing URL; second read (after send) = captcha URL.
      urlSequence: [
        "https://www.reddit.com/",
        "https://www.reddit.com/captcha/challenge",
      ],
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("captcha_required")
  })
})

describe("sendRedditDM — happy paths", () => {
  it("returns success when DOM thread contains the typed message", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: true },
        // Post-send DOM-verify locator hits one of the message-list shells.
        "role='log'": { visible: true },
      },
    })
    const { sh } = makeStagehand()
    const r = await sendRedditDM(page, sh, HANDLE, "hello there friend")
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })

  it("returns success when stagehand.extract verdict reports sent=true", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: true },
        // DOM verify misses → falls through to stagehand.extract.
        "role='log'": { visible: false },
      },
    })
    const { sh } = makeStagehand({
      extractImpl: async () => ({ sent: true, errorMessage: null }),
    })
    const r = await sendRedditDM(page, sh, HANDLE, "hello")
    expect(r.success).toBe(true)
  })

  it("returns unknown when no confirm signal anywhere", async () => {
    const page = createMockPage({
      url: "https://www.reddit.com/",
      selectors: {
        Chat: { visible: true },
        "New chat": { visible: true },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: true },
        "role='log'": { visible: false },
      },
    })
    const { sh } = makeStagehand({
      extractImpl: async () => ({ sent: false, errorMessage: null }),
    })
    const r = await sendRedditDM(page, sh, HANDLE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("unknown")
  })
})

describe("sendRedditDM — T-17.5-02 invariant (CRITICAL)", () => {
  it("never passes the user message text into stagehand.act or stagehand.extract", async () => {
    const CANARY = "SECRET_CANARY_ABC123_NEVER_TO_LLM"
    const page = createMockPage({
      url: "https://www.reddit.com/",
      // Force every Stagehand surface to be exercised: chat panel via fallback,
      // recipient via fallback, send via fallback, verify via fallback.
      selectors: {
        Chat: { visible: false },
        "New chat": { visible: false },
        Username: { visible: true },
        "role='option'": { visible: true },
        "contenteditable='true'": { visible: true },
        Send: { visible: false },
        "role='log'": { visible: false },
      },
    })
    const { sh, act, extract } = makeStagehand({
      // Resolve all act() calls so the executor walks every Stagehand path.
      actImpl: async () => undefined,
      extractImpl: async () => ({ sent: false, errorMessage: null }),
    })
    await sendRedditDM(page, sh, HANDLE, CANARY)

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
