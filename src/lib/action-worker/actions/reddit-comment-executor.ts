/**
 * Deterministic Reddit comment executor.
 *
 * Phase 17.7-02 — handles BOTH `comment` (top-level reply on a post) and
 * `public_reply` (nested reply under an existing comment). Direct analog
 * of `linkedin-comment-executor.ts`; reuses shared utilities from 17.7-01
 * (`detectRedditLoginWall`, `redditPostUrl`).
 *
 * T-17.5-02 (re-applied as T-17.7-06): user-supplied comment body text
 * NEVER crosses into Stagehand `act` / `extract` arguments. Body is typed
 * via `page.keyboard.type` after focusing the contenteditable composer.
 * `parentCommentId` is server-controlled and passed via Stagehand
 * `variables` substitution (D-05) when used in act() instructions.
 *
 * Failure modes (CONTEXT D-04 §Comment taxonomy):
 *   post_unreachable, subreddit_locked, nsfw_gated, weekly_limit_reached,
 *   account_suspended, captcha_required, session_expired,
 *   composer_never_opened, submit_button_missing, unknown.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { redditPostUrl } from "./reddit-utils"
import { detectRedditLoginWall } from "./reddit-authwall"

export interface RedditCommentResult {
  success: boolean
  failureMode?:
    | "post_unreachable"
    | "subreddit_locked"
    | "nsfw_gated"
    | "weekly_limit_reached"
    | "account_suspended"
    | "captcha_required"
    | "session_expired"
    | "composer_never_opened"
    | "submit_button_missing"
    | "unknown"
  reasoning?: string
}

export async function commentRedditPost(
  page: Page,
  stagehand: Stagehand,
  postUrl: string,
  body: string,
  parentCommentId?: string,
): Promise<RedditCommentResult> {
  const target = redditPostUrl(postUrl)
  if (!/^https?:\/\/(www\.)?reddit\.com\//i.test(target)) {
    return {
      success: false,
      failureMode: "post_unreachable",
      reasoning: "url not under reddit.com",
    }
  }

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
  } catch {
    /* non-fatal */
  }

  try {
    await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return {
      success: false,
      failureMode: "post_unreachable",
      reasoning: "post nav threw",
    }
  }

  const landedUrl = page.url()
  if (/\/(checkpoint|captcha)\b/i.test(landedUrl)) {
    return { success: false, failureMode: "captcha_required" }
  }
  if (/\/login\b/i.test(landedUrl)) {
    return { success: false, failureMode: "session_expired" }
  }

  await page.waitForTimeout(2500)

  if (await detectRedditLoginWall(page)) {
    return { success: false, failureMode: "session_expired" }
  }

  const bodyEarly = (await page.textContent("body").catch(() => "")) ?? ""
  if (/account (has been )?suspended/i.test(bodyEarly)) {
    return { success: false, failureMode: "account_suspended" }
  }
  if (
    /this post (has been )?(removed|deleted)|no longer available|page not found/i.test(
      bodyEarly,
    )
  ) {
    return { success: false, failureMode: "post_unreachable" }
  }
  if (/comments are locked|archived post|locked by moderators/i.test(bodyEarly)) {
    return { success: false, failureMode: "subreddit_locked" }
  }
  if (
    /view nsfw community|are you over 18|this community is nsfw/i.test(bodyEarly)
  ) {
    return { success: false, failureMode: "nsfw_gated" }
  }
  if (/verify you'?re human|captcha/i.test(bodyEarly)) {
    return { success: false, failureMode: "captcha_required" }
  }

  // Stage: Reply CTA — branch on parentCommentId.
  let replyOpened = false
  if (parentCommentId) {
    const scope = page
      .locator(
        `[id="${parentCommentId}"], [data-comment-id="${parentCommentId}"]`,
      )
      .first()
    const replyBtn = scope.locator("button:has-text('Reply')").first()
    const visible = await replyBtn
      .isVisible({ timeout: 4000 })
      .catch(() => false)
    if (visible) {
      await replyBtn.click({ timeout: 8000 }).catch(() => null)
      replyOpened = true
    } else {
      try {
        await stagehand.act(
          {
            action: "Click the Reply button under comment %parentId%",
            variables: { parentId: parentCommentId },
          } as unknown as Parameters<typeof stagehand.act>[0],
          { page },
        )
        replyOpened = true
      } catch {
        return { success: false, failureMode: "composer_never_opened" }
      }
    }
  } else {
    const replyBtn = page
      .locator("button:has-text('Reply'), [aria-label*='Comment' i]")
      .first()
    const visible = await replyBtn
      .isVisible({ timeout: 4000 })
      .catch(() => false)
    if (visible) {
      await replyBtn.click({ timeout: 8000 }).catch(() => null)
      replyOpened = true
    } else {
      try {
        await stagehand.act(
          "Click the top-level Reply button on this post",
          { page },
        )
        replyOpened = true
      } catch {
        return { success: false, failureMode: "composer_never_opened" }
      }
    }
  }
  if (!replyOpened) {
    return { success: false, failureMode: "composer_never_opened" }
  }
  await page.waitForTimeout(1500)

  // Stage: composer wait.
  const composer = page
    .locator(
      "div[contenteditable='true'][role='textbox'], div.public-DraftEditor-content[contenteditable='true'], textarea[name='text']",
    )
    .first()
  const composerVisible = await composer
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!composerVisible) {
    return { success: false, failureMode: "composer_never_opened" }
  }

  // T-17.5-02: deterministic typing of user-supplied body only.
  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(body, { delay: 12 })
  await page.waitForTimeout(1500)

  // Stage: Submit button.
  const submitBtn = page
    .locator(
      "button:has-text('Comment'), button:has-text('Reply'), button:has-text('Post'), button[type='submit']",
    )
    .first()
  const submitVisible = await submitBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  let submitDispatched = false
  if (submitVisible) {
    await submitBtn.click({ timeout: 10000 })
    submitDispatched = true
  } else {
    try {
      await stagehand.act(
        "Click the Comment/Reply submit button in the active composer",
        { page },
      )
      submitDispatched = true
    } catch {
      return { success: false, failureMode: "submit_button_missing" }
    }
  }
  if (!submitDispatched) {
    return { success: false, failureMode: "submit_button_missing" }
  }
  await page.waitForTimeout(4500)

  // Post-submit gates.
  const urlAfterSubmit = page.url()
  if (/\/(checkpoint|captcha)\b/i.test(urlAfterSubmit)) {
    return { success: false, failureMode: "captcha_required" }
  }
  const bodyAfterSubmit =
    (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /reached.{0,30}(daily|weekly).{0,20}limit|posting too fast|rate limit(ed)?|too many requests/i.test(
      bodyAfterSubmit,
    )
  ) {
    return { success: false, failureMode: "weekly_limit_reached" }
  }
  if (/account (has been )?suspended/i.test(bodyAfterSubmit)) {
    return { success: false, failureMode: "account_suspended" }
  }

  // DOM-first verify.
  const threadHas = await page
    .locator(
      "[data-testid*='comment'], div[id^='thing_t1_'], shreddit-comment",
    )
    .filter({ hasText: body.slice(0, 40) })
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (threadHas) return { success: true }

  // Stagehand verifier — NO user text in instruction.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the most recent outgoing comment appears in the comment thread",
      z.object({
        posted: z.boolean(),
        errorMessage: z.string().nullable(),
      }),
      { page },
    )
    if (verdict.posted) return { success: true }
  } catch {
    /* fall through */
  }

  return {
    success: false,
    failureMode: "unknown",
    reasoning: "no confirm signal after submit",
  }
}
