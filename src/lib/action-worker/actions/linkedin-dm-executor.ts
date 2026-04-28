// LNKD-01 per 13-CONTEXT.md §Non-1st-degree DM handling — no auto-swap; user re-approves.
/**
 * Deterministic LinkedIn DM executor (1st-degree only).
 *
 * Phase 17.5 plan-03: hot deterministic Playwright flow preserved; Stagehand
 * (`stagehand.act` / `stagehand.extract`) absorbs LinkedIn DOM volatility on
 * the highest-churn selectors (Send button click + post-send verification).
 *
 * T-17.5-02: user-supplied prospect message text NEVER crosses into Stagehand
 * page.act arguments — message is typed via deterministic page.keyboard.type
 * after focusing the contenteditable composer.
 *
 * Failure modes (CONTEXT §Failure-mode taxonomy):
 *   - not_connected, message_disabled, session_expired, security_checkpoint,
 *     weekly_limit_reached, dialog_never_opened, send_button_missing, unknown
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { extractLinkedInSlug } from "./linkedin-connect-executor"
import { detectLinkedInAuthwall } from "./linkedin-authwall"

export interface LinkedInDMResult {
  success: boolean
  failureMode?:
    | "not_connected"
    | "message_disabled"
    | "session_expired"
    | "security_checkpoint"
    | "weekly_limit_reached"
    | "dialog_never_opened"
    | "send_button_missing"
    | "unknown"
  reasoning?: string
}

export async function sendLinkedInDM(
  page: Page,
  stagehand: Stagehand,
  profileUrl: string,
  message: string,
): Promise<LinkedInDMResult> {
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = profileUrl.startsWith("http")
    ? profileUrl
    : `https://www.linkedin.com/in/${slug}`

  if (!/^https:\/\/www\.linkedin\.com\/in\//i.test(profilePage)) {
    return {
      success: false,
      failureMode: "not_connected",
      reasoning: "profile_url not under linkedin.com/in/",
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
    return {
      success: false,
      failureMode: "not_connected",
      reasoning: "profile nav threw",
    }
  }

  const landedUrl = page.url()
  if (/\/checkpoint\//i.test(landedUrl)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  if (/\/login\b|\/authwall/i.test(landedUrl)) {
    return { success: false, failureMode: "session_expired" }
  }

  await page.waitForTimeout(2000)

  if (await detectLinkedInAuthwall(page)) {
    return { success: false, failureMode: "session_expired" }
  }

  const messageBtn = page
    .locator("main button[aria-label^='Message']")
    .first()
  const hasMessage = await messageBtn
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (!hasMessage) {
    return {
      success: false,
      failureMode: "not_connected",
      reasoning: "no Message button on profile",
    }
  }

  const bodyBeforeOpen = (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /limited who can message|has restricted who can message/i.test(
      bodyBeforeOpen,
    )
  ) {
    return { success: false, failureMode: "message_disabled" }
  }

  await messageBtn.click({ timeout: 10000 }).catch(() => null)
  await page.waitForTimeout(2500)

  const composer = page
    .locator(
      "div.msg-form__contenteditable[contenteditable='true'], div[contenteditable='true'][aria-label*='message' i]",
    )
    .first()
  const composerVisible = await composer
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!composerVisible) {
    return { success: false, failureMode: "dialog_never_opened" }
  }

  // T-17.5-02: deterministic typing of user-supplied message text.
  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(message, { delay: 15 })
  await page.waitForTimeout(1200)

  // Send: try deterministic locators first; fall back to Stagehand on miss.
  const sendBtn = page
    .locator(
      "button.msg-form__send-button, button[type='submit'][class*='msg-form__send']",
    )
    .first()
  const sendVisible = await sendBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  let sendDispatched = false
  if (sendVisible) {
    await sendBtn.click({ timeout: 10000 })
    sendDispatched = true
  } else {
    const sendAlt = page
      .locator(
        "section:has(div.msg-form__contenteditable) button:has-text('Send')",
      )
      .first()
    const altVisible = await sendAlt
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    if (altVisible) {
      await sendAlt.click({ timeout: 10000 })
      sendDispatched = true
    } else {
      // Stagehand fallback for DOM A/B churn — single verb instruction.
      try {
        await stagehand.act(
          "Click the Send button in the active LinkedIn message composer",
          { page },
        )
        sendDispatched = true
      } catch {
        return { success: false, failureMode: "send_button_missing" }
      }
    }
  }
  if (!sendDispatched) {
    return { success: false, failureMode: "send_button_missing" }
  }
  await page.waitForTimeout(4500)

  const urlAfterSend = page.url()
  if (/\/checkpoint\//i.test(urlAfterSend)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  const bodyAfterSend = (await page.textContent("body").catch(() => "")) ?? ""
  if (/weekly.*(message|limit)|reached.*limit/i.test(bodyAfterSend)) {
    return { success: false, failureMode: "weekly_limit_reached" }
  }

  const threadHasText = await page
    .locator("li.msg-s-message-list__event")
    .filter({ hasText: message.slice(0, 40) })
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (threadHasText) return { success: true }

  if (/message sent|you sent/i.test(bodyAfterSend)) return { success: true }

  // Stagehand verification fallback: ask the model to inspect the conversation
  // for an outgoing message confirmation. No user text in the instruction.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the most recent outgoing message appears in the LinkedIn conversation thread",
      z.object({
        sent: z.boolean(),
        errorMessage: z.string().nullable(),
      }),
      { page },
    )
    if (verdict.sent) return { success: true }
  } catch {
    /* fall through */
  }

  return {
    success: false,
    failureMode: "unknown",
    reasoning: "no confirm signal after Send",
  }
}
