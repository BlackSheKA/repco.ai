/**
 * Deterministic Reddit upvote executor.
 *
 * Phase 17.7-03 — direct analog of `linkedin-like-executor.ts`. CTA click
 * + state-flip verify via DOM `aria-pressed='true'` (or `class*='upvoted'`).
 * Stagehand fallback only on the CTA-click path; the success signal is
 * always the DOM state flip OR a Stagehand `extract()` verifier — NEVER
 * the `act()` return value alone (RESEARCH §Common Pitfalls #1).
 *
 * Failure modes (CONTEXT D-04 §Like taxonomy):
 *   post_unreachable, subreddit_locked, nsfw_gated, session_expired,
 *   security_checkpoint, captcha_required, account_suspended,
 *   upvote_button_missing, already_upvoted, unknown.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { redditPostUrl } from "./reddit-utils"
import { detectRedditLoginWall } from "./reddit-authwall"

export interface RedditLikeResult {
  success: boolean
  failureMode?:
    | "post_unreachable"
    | "subreddit_locked"
    | "nsfw_gated"
    | "session_expired"
    | "security_checkpoint"
    | "captcha_required"
    | "account_suspended"
    | "upvote_button_missing"
    | "already_upvoted"
    | "unknown"
  reasoning?: string
}

export async function likeRedditPost(
  page: Page,
  stagehand: Stagehand,
  postUrl: string,
): Promise<RedditLikeResult> {
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
  if (/\/checkpoint\b/i.test(landedUrl)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  if (/\/captcha\b/i.test(landedUrl)) {
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
  if (/this community is nsfw|are you over 18|view nsfw community/i.test(bodyEarly)) {
    return { success: false, failureMode: "nsfw_gated" }
  }
  if (/comments are locked|archived post|locked by moderators/i.test(bodyEarly)) {
    return { success: false, failureMode: "subreddit_locked" }
  }
  if (/verify you'?re human|captcha/i.test(bodyEarly)) {
    return { success: false, failureMode: "captcha_required" }
  }

  // already_upvoted preflight (mirror linkedin-like-executor.ts:108-121).
  const alreadyPressed = await page
    .locator(
      "button[aria-label*='upvote' i][aria-pressed='true'], button[class*='upvoted']",
    )
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false)
  if (alreadyPressed) {
    return { success: true, failureMode: "already_upvoted" }
  }

  // Upvote target — deterministic first.
  const upvoteBtn = page
    .locator(
      "button[aria-label*='upvote' i], button[aria-pressed][aria-label*='Upvote' i], shreddit-post button[upvote]",
    )
    .first()
  const upvoteVisible = await upvoteBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  let clicked = false
  if (upvoteVisible) {
    await upvoteBtn.click({ timeout: 8000 }).catch(() => null)
    clicked = true
  } else {
    try {
      await stagehand.act("Click the upvote arrow on the main post", { page })
      clicked = true
    } catch {
      return { success: false, failureMode: "upvote_button_missing" }
    }
  }
  if (!clicked) {
    return { success: false, failureMode: "upvote_button_missing" }
  }
  await page.waitForTimeout(2500)

  // DOM-first verify (state flip).
  const flipped = await page
    .locator(
      "button[aria-label*='upvote' i][aria-pressed='true'], button[class*='upvoted']",
    )
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (flipped) return { success: true }

  // Stagehand verifier fallback.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the upvote arrow on the main post is in the active/pressed state",
      z.object({
        upvoted: z.boolean(),
        errorMessage: z.string().nullable(),
      }),
      { page },
    )
    if (verdict.upvoted) return { success: true }
  } catch {
    /* fall through */
  }

  return { success: false, failureMode: "unknown" }
}
