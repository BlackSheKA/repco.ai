/**
 * Unit tests for sendLinkedInDM (LNKD-01).
 *
 * Exercises each of the 6 failure-mode branches defined in
 * 13-CONTEXT.md §Failure-mode taxonomy plus the happy-path success
 * signal. Mocks Playwright `Page` at the locator level — each test
 * configures only the scenario-relevant behavior.
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import { sendLinkedInDM } from "../linkedin-dm-executor"

type VisibleSpec = { visible?: boolean; text?: string }
interface Scenario {
  url?: string
  urlSequence?: string[]
  bodyText?: string
  bodyTextAfterSend?: string
  // locator → visible result for each selector substring
  selectors?: Record<string, VisibleSpec>
  gotoThrows?: boolean
}

function createMockPage(scenario: Scenario): Page {
  const urls = scenario.urlSequence ?? [
    scenario.url ?? "https://www.linkedin.com/in/test",
  ]
  let callIdx = 0

  const selectorMatch = (sel: string): VisibleSpec | undefined => {
    if (!scenario.selectors) return { visible: false }
    for (const key of Object.keys(scenario.selectors)) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  let sendClicked = false

  const locator = vi.fn((sel: string) => {
    const spec = selectorMatch(sel) ?? { visible: false }
    const loc = {
      first: () => loc,
      isVisible: vi.fn(async () => spec.visible === true),
      click: vi.fn(async () => {
        if (sel.toLowerCase().includes("send")) sendClicked = true
      }),
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
      const u = urls[Math.min(callIdx, urls.length - 1)]
      callIdx += 1
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

const PROFILE = "https://www.linkedin.com/in/test-user"

describe("sendLinkedInDM", () => {
  it("returns not_connected when Message button is absent", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: { "aria-label^='Message'": { visible: false } },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("not_connected")
  })

  it("returns session_expired when URL lands on /login", async () => {
    const page = createMockPage({
      url: "https://www.linkedin.com/login",
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })

  it("returns security_checkpoint when URL matches /checkpoint/", async () => {
    const page = createMockPage({
      url: "https://www.linkedin.com/checkpoint/challenge",
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns message_disabled when body shows restricted-messaging banner", async () => {
    const page = createMockPage({
      url: PROFILE,
      bodyText: "They have limited who can message them directly.",
      selectors: { "aria-label^='Message'": { visible: true } },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("message_disabled")
  })

  it("returns dialog_never_opened when composer never becomes visible", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        "aria-label^='Message'": { visible: true },
        "msg-form__contenteditable": { visible: false },
      },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("dialog_never_opened")
  })

  it("returns weekly_limit_reached when banner appears after Send", async () => {
    const page = createMockPage({
      url: PROFILE,
      bodyTextAfterSend: "You've reached the weekly message limit.",
      selectors: {
        "aria-label^='Message'": { visible: true },
        "msg-form__contenteditable": { visible: true },
        "msg-form__send-button": { visible: true },
      },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("weekly_limit_reached")
  })

  it("returns send_button_missing when neither primary nor fallback Send button is visible", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        "aria-label^='Message'": { visible: true },
        "msg-form__contenteditable": { visible: true },
        "msg-form__send-button": { visible: false },
        "button:has-text('Send')": { visible: false },
      },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hi")
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("send_button_missing")
  })

  it("returns success when post-send body contains confirmation toast", async () => {
    const page = createMockPage({
      url: PROFILE,
      bodyTextAfterSend: "Message sent",
      selectors: {
        "aria-label^='Message'": { visible: true },
        "msg-form__contenteditable": { visible: true },
        "msg-form__send-button": { visible: true },
      },
    })
    const r = await sendLinkedInDM(page, PROFILE, "hello there")
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })
})
