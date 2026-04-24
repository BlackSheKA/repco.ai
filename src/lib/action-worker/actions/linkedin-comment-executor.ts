/**
 * Deterministic LinkedIn Comment executor.
 *
 * Per 13-RESEARCH.md §2 Comment: Quill editor (div.ql-editor[contenteditable])
 * may require keyboard events rather than .fill() — use page.keyboard.type
 * after focusing the composer. Scope selectors to main post article
 * (Landmine #8) so we don't comment on a reshare or reply instead.
 *
 * LNKD-03 / LNKD-04 (comment) — credit cost = 15 (public_reply) per
 * billing/lib/types.ts. Approval-gated with inline edit of action.content
 * (CONTEXT §Approval queue).
 *
 * Failure modes per 13-CONTEXT.md §Failure-mode taxonomy:
 *   comment_disabled, post_unreachable, char_limit_exceeded,
 *   session_expired, comment_post_failed
 * Transversal: security_checkpoint, unknown.
 */

import type { Page } from "playwright-core"
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
  postUrl: string,
  text: string,
): Promise<LinkedInCommentResult> {
  // Defense-in-depth: generator QC should prevent but guard anyway.
  if (text.length > CHAR_LIMIT) {
    return {
      success: false,
      failureMode: "char_limit_exceeded",
      reasoning: `${text.length} > ${CHAR_LIMIT}`,
    }
  }

  // H-02 defense-in-depth: refuse to navigate to arbitrary origins with
  // an authenticated LinkedIn session attached.
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

  // Inline signup/sign-in wall — must run BEFORE 404/comment-CTA
  // detection so `comment_disabled` is not misattributed from an
  // auth wall. Surfaced by Phase 13 UAT 2026-04-24.
  if (await detectLinkedInAuthwall(page)) {
    return { success: false, failureMode: "session_expired" }
  }
  // W-02: narrow 404 detection to URL redirects or dedicated 404 DOM so
  // comments containing the literal "404" aren't mis-classified.
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

  // Comment CTA on the main post.
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

  // Quill composer.
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

  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(text, { delay: 12 })
  await page.waitForTimeout(1200)

  // Submit.
  const submitBtn = scope
    .locator(
      "button.comments-comment-box__submit-button, button[type='submit']:has-text('Post')",
    )
    .first()
  const submitVisible = await submitBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (!submitVisible) {
    return {
      success: false,
      failureMode: "comment_post_failed",
      reasoning: "Post button missing",
    }
  }

  await submitBtn.click({ timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(5000)

  // Post-verify: text appears in the comment list. W-08: use .filter({ hasText })
  // to avoid re-escaping the needle into a CSS :has-text() literal (which breaks
  // when the text contains quotes, backslashes, or control chars).
  const needle = text.slice(0, 40)
  const appeared = await scope
    .locator(".comments-comment-list, ul.comments-comments-list")
    .filter({ hasText: needle })
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (appeared) return { success: true }

  return {
    success: false,
    failureMode: "comment_post_failed",
    reasoning: "posted but comment not found in list",
  }
}
