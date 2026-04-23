// LNKD-02 per 13-CONTEXT.md §Daily limits (daily_follow_limit=15) + §Warmup gates (day 2+)
/**
 * Deterministic LinkedIn Follow executor.
 *
 * Per 13-RESEARCH.md §2 Follow: no URL hack needed. The Phase 10 anti-bot
 * gate was narrowly scoped to the Connect CTA; Follow responds to CDP
 * clicks. Strategy:
 *  1) Navigate to /in/{slug}.
 *  2) Check for aria-pressed='true' → already_following noop success.
 *  3) Primary CTA: main button[aria-label^='Follow']:not([aria-pressed='true']).
 *     If Premium-gated (lock badge) → follow_premium_gated.
 *  4) Fallback: overflow 'More actions' menu → Follow item.
 *  5) Verify aria-pressed='true' after click.
 *
 * Failure modes per 13-CONTEXT.md §Failure-mode taxonomy:
 *   follow_premium_gated, profile_unreachable, session_expired, already_following
 * Transversal: security_checkpoint (all executors), follow_button_missing, unknown.
 */

import type { Page } from "playwright-core"
import { extractLinkedInSlug } from "./linkedin-connect-executor"

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
  profileUrl: string,
): Promise<LinkedInFollowResult> {
  // H-04: always reconstruct the URL from the normalized slug so
  // attacker-controlled hosts (e.g. "https://evil.com/x") can never reach
  // page.goto. extractLinkedInSlug handles both full URL and bare slug.
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = `https://www.linkedin.com/in/${slug}`

  // H-02 defense-in-depth: reject any reconstructed URL that isn't under
  // linkedin.com/in/ (matches linkedin-dm-executor guard).
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

  const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
  if (/profile-unavailable|this profile is unavailable/i.test(bodyText)) {
    return { success: false, failureMode: "profile_unreachable" }
  }

  // Already-following noop.
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

  // Primary CTA.
  const primary = page
    .locator("main button[aria-label^='Follow']:not([aria-pressed='true'])")
    .first()
  const hasPrimary = await primary
    .isVisible({ timeout: 3000 })
    .catch(() => false)

  if (hasPrimary) {
    // Premium-gated detection: lock icon inside or near the button.
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
    return {
      success: false,
      failureMode: "unknown",
      reasoning: "click landed but no pressed flip",
    }
  }

  // Overflow menu fallback.
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

  return { success: false, failureMode: "follow_button_missing" }
}
