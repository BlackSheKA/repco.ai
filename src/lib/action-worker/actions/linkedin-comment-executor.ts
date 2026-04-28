/**
 * Deterministic LinkedIn Comment executor.
 *
 * Phase 17.5 plan-03: Stagehand fallback for the Post-comment submit click
 * + structured extraction for post-submit verification. T-17.5-02 enforced:
 * comment text is typed via deterministic page.keyboard.type, never embedded
 * in stagehand.act arguments.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { detectLinkedInAuthwall } from "./linkedin-authwall"

export interface LinkedInCommentResult {
  success: boolean
  failureMode?:
    | "comment_disabled"
    | "post_unreachable"
    | "char_limit_exceeded"
    | "session_expired"
    | "security_checkpoint"
    | "comment_post_failed"
    | "unknown"
  reasoning?: string
}

const CHAR_LIMIT = 1250

export async function commentLinkedInPost(
  page: Page,
  stagehand: Stagehand,
  postUrl: string,
  text: string,
): Promise<LinkedInCommentResult> {
  if (text.length > CHAR_LIMIT) {
    return {
      success: false,
      failureMode: "char_limit_exceeded",
      reasoning: `${text.length} > ${CHAR_LIMIT}`,
    }
  }

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
  if (/no longer available/i.test(body)) {
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

  const scope = page
    .locator(
      "main [data-id*='urn:li:activity'], main article, main .feed-shared-update-v2",
    )
    .first()
  const scopeVisible = await scope
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (!scopeVisible) {
    return { success: false, failureMode: "post_unreachable" }
  }

  const commentBtn = scope
    .locator("button[aria-label='Comment'], button:has-text('Comment')")
    .first()
  const hasComment = await commentBtn
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (!hasComment) {
    if (/comments (are|have been) (off|turned off|disabled)/i.test(body)) {
      return { success: false, failureMode: "comment_disabled" }
    }
    return {
      success: false,
      failureMode: "comment_disabled",
      reasoning: "no Comment CTA on main post",
    }
  }
  await commentBtn.click({ timeout: 5000 }).catch(() => null)
  await page.waitForTimeout(1500)

  const composer = scope
    .locator(
      "div.ql-editor[contenteditable='true'], div[contenteditable='true'][aria-label*='comment' i]",
    )
    .first()
  const composerVisible = await composer
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!composerVisible) {
    return {
      success: false,
      failureMode: "comment_post_failed",
      reasoning: "composer never mounted",
    }
  }

  // T-17.5-02: deterministic typing of user-supplied comment text.
  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(text, { delay: 12 })
  await page.waitForTimeout(1200)

  // Submit — try deterministic locator first; Stagehand fallback for churn.
  const submitBtn = scope
    .locator(
      "button.comments-comment-box__submit-button, button[type='submit']:has-text('Post')",
    )
    .first()
  const submitVisible = await submitBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (submitVisible) {
    await submitBtn.click({ timeout: 10000 }).catch(() => null)
  } else {
    try {
      await stagehand.act(
        "Click the Post button to submit the comment on the main LinkedIn post",
        { page },
      )
    } catch {
      return {
        success: false,
        failureMode: "comment_post_failed",
        reasoning: "Post button missing",
      }
    }
  }
  await page.waitForTimeout(5000)

  const needle = text.slice(0, 40)
  const appeared = await scope
    .locator(".comments-comment-list, ul.comments-comments-list")
    .filter({ hasText: needle })
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (appeared) return { success: true }

  // Stagehand verification fallback (no user text in instruction).
  try {
    const verdict = await stagehand.extract(
      "Detect whether the most recently submitted comment by the current user appears in the LinkedIn comment list for this post",
      z.object({ posted: z.boolean() }),
      { page },
    )
    if (verdict.posted) return { success: true }
  } catch {
    /* fall through */
  }

  return {
    success: false,
    failureMode: "comment_post_failed",
    reasoning: "posted but comment not found in list",
  }
}
