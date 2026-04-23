/**
 * Deterministic LinkedIn Like executor.
 *
 * Per 13-RESEARCH.md §2 React(Like) + §8 Landmine #8 (selector scoping):
 * all locators scoped to `main [data-id*='urn:li:activity']` to avoid
 * liking the wrong post on feed-variant layouts. No URL hack; CDP click
 * on React button is expected to work (Phase 10 gate was Connect-specific).
 *
 * LNKD-03 (like) — credit cost = 0, auto-executes post-warmup day 2+.
 *
 * Failure modes per 13-CONTEXT.md §Failure-mode taxonomy:
 *   post_unreachable, post_deleted, session_expired, react_button_missing
 * Transversal: security_checkpoint, already_liked, unknown.
 */

import type { Page } from "playwright-core"

export interface LinkedInLikeResult {
  success: boolean
  failureMode?:
    | "post_unreachable"
    | "post_deleted"
    | "session_expired"
    | "security_checkpoint"
    | "react_button_missing"
    | "already_liked"
    | "unknown"
  reasoning?: string
}

export async function likeLinkedInPost(
  page: Page,
  postUrl: string,
): Promise<LinkedInLikeResult> {
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
  } catch {
    /* non-fatal */
  }

  try {
    await page.goto(postUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return { success: false, failureMode: "post_unreachable" }
  }

  const url = page.url()
  if (/\/checkpoint\//i.test(url)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  if (/\/login\b|\/authwall/i.test(url)) {
    return { success: false, failureMode: "session_expired" }
  }

  await page.waitForTimeout(2500)

  const body = (await page.textContent("body").catch(() => "")) ?? ""
  if (/this post is no longer available|404|page not found/i.test(body)) {
    return { success: false, failureMode: "post_unreachable" }
  }
  if (/removed|deleted by (the )?author/i.test(body)) {
    return { success: false, failureMode: "post_deleted" }
  }

  // Scope to main post article — avoid comment/reshare React buttons (Landmine #8).
  const mainPost = page.locator("main [data-id*='urn:li:activity']").first()
  const mainPostVisible = await mainPost
    .isVisible({ timeout: 5000 })
    .catch(() => false)

  let scope
  if (mainPostVisible) {
    scope = mainPost
  } else {
    // Fallback: feed update layout.
    const fallbackScope = page
      .locator("main article, main .feed-shared-update-v2")
      .first()
    const fbVisible = await fallbackScope
      .isVisible({ timeout: 2000 })
      .catch(() => false)
    if (!fbVisible) {
      return { success: false, failureMode: "post_unreachable" }
    }
    scope = fallbackScope
  }

  // Already-liked detection.
  const alreadyPressed = scope
    .locator(
      "button[aria-label^='React Like'][aria-pressed='true'], button.react-button__trigger[aria-pressed='true']",
    )
    .first()
  if (
    await alreadyPressed.isVisible({ timeout: 1000 }).catch(() => false)
  ) {
    return {
      success: true,
      failureMode: "already_liked",
      reasoning: "aria-pressed=true on landing",
    }
  }

  const likeBtn = scope
    .locator(
      "button[aria-label^='React Like'], button.react-button__trigger, button:has-text('Like')",
    )
    .first()
  const hasLike = await likeBtn
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (!hasLike) {
    return { success: false, failureMode: "react_button_missing" }
  }

  await likeBtn.click({ timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(2500)

  const flipped = await scope
    .locator("button[aria-pressed='true']")
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
