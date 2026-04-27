/**
 * Deterministic LinkedIn Like executor.
 *
 * Phase 17.5 plan-03: Stagehand fallback when deterministic React Like
 * scoping misses; structured extraction confirms post-click flip state.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { detectLinkedInAuthwall } from "./linkedin-authwall"

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
  stagehand: Stagehand,
  postUrl: string,
): Promise<LinkedInLikeResult> {
  if (!/^https:\/\/www\.linkedin\.com\//i.test(postUrl)) {
    return {
      success: false,
      failureMode: "post_unreachable",
      reasoning: "url not under linkedin.com",
    }
  }

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

  if (await detectLinkedInAuthwall(page)) {
    return { success: false, failureMode: "session_expired" }
  }

  if (/\/404(\b|\/)/.test(url)) {
    return { success: false, failureMode: "post_unreachable" }
  }
  const body = (await page.textContent("body").catch(() => "")) ?? ""
  if (/this post is no longer available/i.test(body)) {
    return { success: false, failureMode: "post_unreachable" }
  }
  const dedicatedNotFound = await page
    .locator("h1:has-text('Page not found')")
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false)
  if (dedicatedNotFound) {
    return { success: false, failureMode: "post_unreachable" }
  }
  if (/removed|deleted by (the )?author/i.test(body)) {
    return { success: false, failureMode: "post_deleted" }
  }

  const mainPost = page.locator("main [data-id*='urn:li:activity']").first()
  const mainPostVisible = await mainPost
    .isVisible({ timeout: 5000 })
    .catch(() => false)

  let scope
  if (mainPostVisible) {
    scope = mainPost
  } else {
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
    // Stagehand fallback for DOM A/B churn.
    try {
      await stagehand.act(
        "Click the Like (thumbs-up) reaction button on the main LinkedIn post",
        { page },
      )
      await page.waitForTimeout(2500)
      const flipped = await scope
        .locator("button[aria-pressed='true']")
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      if (flipped) return { success: true }
    } catch {
      /* fall through */
    }
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

  // Stagehand verification fallback.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the Like (reaction) button on the main LinkedIn post is now in the pressed/active state",
      z.object({ liked: z.boolean() }),
      { page },
    )
    if (verdict.liked) return { success: true }
  } catch {
    /* fall through */
  }
  return {
    success: false,
    failureMode: "unknown",
    reasoning: "click landed but no pressed flip",
  }
}
