/**
 * Unit tests for followLinkedInProfile (LNKD-02).
 *
 * Exercises each failure-mode branch defined in 13-CONTEXT.md
 * §Failure-mode taxonomy (follow_premium_gated, profile_unreachable,
 * session_expired, already_following) plus transversal modes
 * (security_checkpoint, follow_button_missing, unknown) and both
 * happy-path signals (primary CTA + overflow menu fallback).
 */

import { describe, it, expect, vi } from "vitest"
import type { Page } from "playwright-core"
import { followLinkedInProfile } from "../linkedin-follow-executor"

type VisibleSpec = { visible?: boolean }
interface Scenario {
  url?: string
  urlSequence?: string[]
  bodyText?: string
  bodyTextAfterClick?: string
  // keys tried against selector substring; later keys only matched after an
  // overflow click if `afterOverflowClick` is true on that spec.
  selectors?: Record<string, VisibleSpec & { afterOverflowClick?: boolean; afterClick?: boolean }>
  gotoThrows?: boolean
  // If set, the primary Follow button's child locator (premium ancestor xpath)
  // returns visible=true on first isVisible().
  primaryHasPremiumBadge?: boolean
}

function createMockPage(scenario: Scenario): Page {
  const urls = scenario.urlSequence ?? [
    scenario.url ?? "https://www.linkedin.com/in/test",
  ]
  let callIdx = 0
  let overflowOpened = false
  let primaryClicked = false

  const selectorMatch = (sel: string): VisibleSpec & { afterOverflowClick?: boolean; afterClick?: boolean } | undefined => {
    if (!scenario.selectors) return { visible: false }
    const keys = Object.keys(scenario.selectors)
    // Prefer the most specific (longest) matching key, so
    // "aria-pressed='true'" wins over "aria-label^='Follow'".
    const sorted = [...keys].sort((a, b) => b.length - a.length)
    for (const key of sorted) {
      if (sel.includes(key)) return scenario.selectors[key]
    }
    return { visible: false }
  }

  const locator = vi.fn((sel: string) => {
    const spec = selectorMatch(sel) ?? { visible: false }
    const loc = {
      first: () => loc,
      isVisible: vi.fn(async () => {
        if (spec.afterOverflowClick && !overflowOpened) return false
        if (spec.afterClick && !primaryClicked) return false
        return spec.visible === true
      }),
      click: vi.fn(async () => {
        if (sel.includes("More actions")) overflowOpened = true
        if (sel.includes("aria-label^='Follow'")) primaryClicked = true
      }),
      locator: vi.fn((_childSel: string) => ({
        first: () => ({
          isVisible: vi.fn(async () =>
            sel.includes("aria-label^='Follow']:not([aria-pressed='true']") &&
            scenario.primaryHasPremiumBadge === true
              ? true
              : false,
          ),
        }),
      })),
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
      return primaryClicked || overflowOpened
        ? (scenario.bodyTextAfterClick ?? scenario.bodyText ?? "")
        : (scenario.bodyText ?? "")
    }) as unknown as Page["textContent"],
    locator: locator as unknown as Page["locator"],
  }
  return page as Page
}

const PROFILE = "https://www.linkedin.com/in/test-user"

describe("followLinkedInProfile", () => {
  it("returns profile_unreachable when page.goto throws", async () => {
    const page = createMockPage({ gotoThrows: true })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("profile_unreachable")
  })

  it("returns profile_unreachable when body shows 'this profile is unavailable'", async () => {
    const page = createMockPage({
      url: PROFILE,
      bodyText: "This profile is unavailable",
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("profile_unreachable")
  })

  it("returns session_expired when URL lands on /login", async () => {
    const page = createMockPage({ url: "https://www.linkedin.com/login" })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("session_expired")
  })

  it("returns security_checkpoint when URL matches /checkpoint/", async () => {
    const page = createMockPage({
      url: "https://www.linkedin.com/checkpoint/challenge",
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("security_checkpoint")
  })

  it("returns already_following when landing aria-pressed='true' is visible", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        "aria-label^='Follow'][aria-pressed='true'": { visible: true },
      },
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBe("already_following")
  })

  it("returns success via primary CTA when click flips aria-pressed to true", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        // Primary CTA visible at start
        "aria-label^='Follow']:not([aria-pressed='true']": { visible: true },
        // Post-click: pressed button appears
        "aria-label^='Follow'][aria-pressed='true'": {
          visible: true,
          afterClick: true,
        },
      },
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })

  it("returns success via overflow menu fallback when primary CTA absent", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        "aria-label^='Follow']:not([aria-pressed='true']": { visible: false },
        "aria-label='More actions'": { visible: true },
        "role='menu'] button:has-text('Follow')": {
          visible: true,
          afterOverflowClick: true,
        },
        // After overflow click + follow click, pressed shows
        "aria-label^='Follow'][aria-pressed='true'": {
          visible: true,
          afterOverflowClick: true,
        },
      },
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(true)
    expect(r.failureMode).toBeUndefined()
  })

  it("returns follow_premium_gated when primary CTA's ancestor carries a premium badge", async () => {
    const page = createMockPage({
      url: PROFILE,
      primaryHasPremiumBadge: true,
      selectors: {
        "aria-label^='Follow']:not([aria-pressed='true']": { visible: true },
      },
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("follow_premium_gated")
  })

  it("returns follow_button_missing when neither primary CTA nor overflow Follow is found", async () => {
    const page = createMockPage({
      url: PROFILE,
      selectors: {
        "aria-label^='Follow']:not([aria-pressed='true']": { visible: false },
        "aria-label='More actions'": { visible: false },
      },
    })
    const r = await followLinkedInProfile(page, PROFILE)
    expect(r.success).toBe(false)
    expect(r.failureMode).toBe("follow_button_missing")
  })
})
