/**
 * Deterministic Reddit follow executor.
 *
 * Phase 17.7-03 — direct analog of `linkedin-follow-executor.ts`. Click
 * Follow CTA + state-flip verify via the button label transition
 * Follow → Following (or `aria-pressed='true'`). Stagehand fallback only
 * on the CTA-click path; success is the DOM state flip OR a Stagehand
 * `extract()` verifier — never the act() return value alone.
 *
 * Failure modes (CONTEXT D-04 §Follow taxonomy):
 *   profile_unreachable, session_expired, security_checkpoint,
 *   captcha_required, account_suspended, follow_button_missing,
 *   already_following, recipient_not_found, unknown.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { extractRedditHandle, redditUserUrl } from "./reddit-utils"
import { detectRedditLoginWall } from "./reddit-authwall"

export interface RedditFollowResult {
  success: boolean
  failureMode?:
    | "profile_unreachable"
    | "session_expired"
    | "security_checkpoint"
    | "captcha_required"
    | "account_suspended"
    | "follow_button_missing"
    | "already_following"
    | "recipient_not_found"
    | "unknown"
  reasoning?: string
}

export async function followRedditProfile(
  page: Page,
  stagehand: Stagehand,
  profileHandle: string,
): Promise<RedditFollowResult> {
  const handle = extractRedditHandle(profileHandle)
  if (!handle) {
    return {
      success: false,
      failureMode: "recipient_not_found",
      reasoning: "invalid handle shape",
    }
  }
  const target = redditUserUrl(handle)

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
      failureMode: "profile_unreachable",
      reasoning: "profile nav threw",
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

  const body = (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /page not found|nobody on reddit goes by that name|sorry,? this user (was|has been) banned|sorry,? this account has been suspended/i.test(
      body,
    )
  ) {
    return { success: false, failureMode: "recipient_not_found" }
  }
  if (/account (has been )?suspended/i.test(body)) {
    return { success: false, failureMode: "account_suspended" }
  }
  if (/verify you'?re human|captcha/i.test(body)) {
    return { success: false, failureMode: "captcha_required" }
  }

  // already_following preflight.
  const alreadyFollowing = await page
    .locator(
      "button:has-text('Following'), button[aria-pressed='true'][aria-label*='Follow' i]",
    )
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false)
  if (alreadyFollowing) {
    return { success: true, failureMode: "already_following" }
  }

  // Follow button — deterministic-first.
  const followBtn = page
    .locator(
      "button:has-text('Follow'):not(:has-text('Following')), [aria-label*='Follow' i]:not([aria-pressed='true'])",
    )
    .first()
  const followVisible = await followBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  let clicked = false
  if (followVisible) {
    await followBtn.click({ timeout: 8000 }).catch(() => null)
    clicked = true
  } else {
    try {
      await stagehand.act("Click the Follow button on the profile header", {
        page,
      })
      clicked = true
    } catch {
      return { success: false, failureMode: "follow_button_missing" }
    }
  }
  if (!clicked) {
    return { success: false, failureMode: "follow_button_missing" }
  }
  await page.waitForTimeout(2500)

  // DOM verify (label flip).
  const flipped = await page
    .locator(
      "button:has-text('Following'), button[aria-pressed='true'][aria-label*='Follow' i]",
    )
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (flipped) return { success: true }

  // Stagehand verifier fallback.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the Follow button on the profile has switched to the Following state",
      z.object({
        following: z.boolean(),
        errorMessage: z.string().nullable(),
      }),
      { page },
    )
    if (verdict.following) return { success: true }
  } catch {
    /* fall through */
  }

  return { success: false, failureMode: "unknown" }
}
