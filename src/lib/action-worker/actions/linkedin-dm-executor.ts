// LNKD-01 per 13-CONTEXT.md §Non-1st-degree DM handling — no auto-swap; user re-approves.
/**
 * Deterministic LinkedIn DM executor (1st-degree only).
 *
 * Mirrors linkedin-connect-executor.ts shape — no Claude Computer Use.
 * Strategy per 13-RESEARCH.md §2:
 *  1) Navigate to /in/{slug} (referrer prime + 1st-degree detection).
 *  2) If no Message button → failure_mode='not_connected' (per CONTEXT:
 *     NO auto-swap to connection_request — user re-approves).
 *  3) Click Message, wait for compose pane contenteditable.
 *  4) Fill message, click Send, post-verify via body text or thread DOM.
 *
 * Does NOT use the /messaging/thread/new/?recipient={slug} URL hack as
 * primary — per §2 it is an unverified hypothesis. Profile-page Message
 * click is the baseline because the anti-bot gate in Phase 10 was
 * Connect-button-specific (see §8 Landmine #1).
 *
 * Failure modes reported to worker telemetry (CONTEXT §Failure-mode taxonomy):
 *   - not_connected        -> Message button absent (non-1st-degree)
 *   - message_disabled     -> "limited who can message them" banner
 *   - session_expired      -> /login or /authwall
 *   - security_checkpoint  -> /checkpoint/
 *   - weekly_limit_reached -> DM-level banner
 *   - dialog_never_opened  -> compose pane never mounts
 *   - send_button_missing  -> Send CTA absent after fill
 *   - unknown              -> no verifiable success signal
 */

import type { Page } from "playwright-core"
import { extractLinkedInSlug } from "./linkedin-connect-executor"

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
  profileUrl: string,
  message: string,
): Promise<LinkedInDMResult> {
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = profileUrl.startsWith("http")
    ? profileUrl
    : `https://www.linkedin.com/in/${slug}`

  // T-13-01-01 defense-in-depth: reject inputs that don't resolve to a
  // LinkedIn profile URL. Caller validates prospect.profile_url, but we
  // refuse to navigate to arbitrary origins from the executor.
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

  // Step 1: navigate to profile.
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

  // Step 2: detect Message button (1st-degree check).
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

  // Step 3: disabled-messaging banner (check BEFORE click — banner appears on profile).
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

  // Step 4: compose pane contenteditable.
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

  // Step 5: fill the composer. Quill-like editor — focus + type.
  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(message, { delay: 15 })
  await page.waitForTimeout(1200)

  // Step 6: Send.
  const sendBtn = page
    .locator(
      "button.msg-form__send-button, button[type='submit'][class*='msg-form__send']",
    )
    .first()
  const sendVisible = await sendBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (!sendVisible) {
    // Fallback: button:has-text('Send') scoped to composer overlay.
    const sendAlt = page
      .locator(
        "section:has(div.msg-form__contenteditable) button:has-text('Send')",
      )
      .first()
    const altVisible = await sendAlt
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    if (!altVisible) {
      return { success: false, failureMode: "send_button_missing" }
    }
    await sendAlt.click({ timeout: 10000 })
  } else {
    await sendBtn.click({ timeout: 10000 })
  }
  await page.waitForTimeout(4500)

  // Step 7: post-send checks.
  const urlAfterSend = page.url()
  if (/\/checkpoint\//i.test(urlAfterSend)) {
    return { success: false, failureMode: "security_checkpoint" }
  }
  const bodyAfterSend = (await page.textContent("body").catch(() => "")) ?? ""
  if (/weekly.*(message|limit)|reached.*limit/i.test(bodyAfterSend)) {
    return { success: false, failureMode: "weekly_limit_reached" }
  }

  // Step 8: verify message reached the thread.
  // Primary signal: thread DOM shows the typed message text. W-08: use
  // .filter({ hasText }) so the needle is matched as a raw string — no
  // JSON escaping concerns for quotes/backslashes in the first 40 chars.
  const threadHasText = await page
    .locator("li.msg-s-message-list__event")
    .filter({ hasText: message.slice(0, 40) })
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (threadHasText) return { success: true }

  // Secondary signal: body text contains "message sent" toast copy.
  if (/message sent|you sent/i.test(bodyAfterSend)) return { success: true }

  return {
    success: false,
    failureMode: "unknown",
    reasoning: "no confirm signal after Send",
  }
}
