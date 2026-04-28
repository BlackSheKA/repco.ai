// LNKD-02 per 13-CONTEXT.md §Daily limits + §Warmup gates
/**
 * Deterministic LinkedIn Follow executor.
 *
 * Phase 17.5 plan-03: Stagehand fallback for the Follow CTA click and
 * extract-based post-click verification. Hot detection (URL/auth wall/
 * pressed-state) stays deterministic.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { extractLinkedInSlug } from "./linkedin-connect-executor"
import { detectLinkedInAuthwall } from "./linkedin-authwall"

export interface LinkedInFollowResult {
  success: boolean
  failureMode?:
    | "follow_premium_gated"
    | "profile_unreachable"
    | "session_expired"
    | "security_checkpoint"
    | "already_following"
    | "follow_button_missing"
    | "unknown"
  reasoning?: string
}

export async function followLinkedInProfile(
  page: Page,
  stagehand: Stagehand,
  profileUrl: string,
): Promise<LinkedInFollowResult> {
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = `https://www.linkedin.com/in/${slug}`

  if (!/^https:\/\/www\.linkedin\.com\/in\//i.test(profilePage)) {
    return {
      success: false,
      failureMode: "profile_unreachable",
      reasoning: "url not under linkedin.com/in/",
    }
  }

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
  } catch {
    /* non-fatal */
  }

  try {
    await page.goto(profilePage, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return { success: false, failureMode: "profile_unreachable" }
  }

  const url = page.url()
  if (/\/checkpoint\//i.test(url)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  if (/\/login\b|\/authwall/i.test(url)) {
    return { success: false, failureMode: "session_expired" }
  }

  await page.waitForTimeout(2000)

  if (await detectLinkedInAuthwall(page)) {
    return { success: false, failureMode: "session_expired" }
  }

  const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
  if (/profile-unavailable|this profile is unavailable/i.test(bodyText)) {
    return { success: false, failureMode: "profile_unreachable" }
  }

  const pressedFollow = page
    .locator("main button[aria-label^='Follow'][aria-pressed='true']")
    .first()
  if (
    await pressedFollow
      .isVisible({ timeout: 1500 })
      .catch(() => false)
  ) {
    return {
      success: true,
      failureMode: "already_following",
      reasoning: "aria-pressed=true on landing",
    }
  }

  const primary = page
    .locator("main button[aria-label^='Follow']:not([aria-pressed='true'])")
    .first()
  const hasPrimary = await primary
    .isVisible({ timeout: 3000 })
    .catch(() => false)

  if (hasPrimary) {
    const premiumGated = await primary
      .locator(
        "xpath=ancestor-or-self::*[contains(@class,'premium') or .//svg[contains(@data-test-icon,'premium')]]",
      )
      .first()
      .isVisible({ timeout: 1000 })
      .catch(() => false)
    if (premiumGated) {
      return { success: false, failureMode: "follow_premium_gated" }
    }

    await primary.click({ timeout: 10000 }).catch(() => null)
    await page.waitForTimeout(2500)

    const flipped = await page
      .locator(
        "main button[aria-label^='Follow'][aria-pressed='true'], main button:has-text('Following')",
      )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    if (flipped) return { success: true }

    // Stagehand fallback verification: confirm the Follow state flipped.
    try {
      const verdict = await stagehand.extract(
        "Detect whether the Follow button on this LinkedIn profile is now in the followed/following state",
        z.object({
          following: z.boolean(),
        }),
        { page },
      )
      if (verdict.following) return { success: true }
    } catch {
      /* fall through */
    }
    return {
      success: false,
      failureMode: "unknown",
      reasoning: "click landed but no pressed flip",
    }
  }

  // Overflow menu fallback (deterministic).
  const moreBtn = page.locator("main button[aria-label='More actions']").first()
  if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await moreBtn.click({ timeout: 5000 }).catch(() => null)
    await page.waitForTimeout(1000)
    const overflowFollow = page
      .locator(
        "div[role='menu'] button:has-text('Follow'), [role='menuitem']:has-text('Follow')",
      )
      .first()
    if (
      await overflowFollow
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await overflowFollow.click({ timeout: 5000 }).catch(() => null)
      await page.waitForTimeout(2500)
      const flipped = await page
        .locator(
          "main button[aria-label^='Follow'][aria-pressed='true'], main button:has-text('Following')",
        )
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      if (flipped) return { success: true }
      return {
        success: false,
        failureMode: "unknown",
        reasoning: "overflow Follow click no-op",
      }
    }
  }

  // Final Stagehand fallback: ask the model to click Follow on the profile header.
  try {
    await stagehand.act(
      "Click the Follow button in the profile header (NOT Connect, NOT Message)",
      { page },
    )
    await page.waitForTimeout(2500)
    const flipped = await page
      .locator(
        "main button[aria-label^='Follow'][aria-pressed='true'], main button:has-text('Following')",
      )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    if (flipped) return { success: true }
  } catch {
    /* fall through */
  }

  return { success: false, failureMode: "follow_button_missing" }
}
