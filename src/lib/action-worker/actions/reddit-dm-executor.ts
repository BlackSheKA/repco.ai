/**
 * Deterministic Reddit DM executor.
 *
 * Phase 17.7-01 — direct analog of `linkedin-dm-executor.ts`. Replaces the
 * obsolete Haiku Computer-Use Reddit DM prompt with a hot deterministic
 * Playwright flow; Stagehand (`stagehand.act` / `stagehand.extract`) absorbs
 * NEW-Reddit DOM volatility on highest-churn surfaces (chat panel open, Send
 * button click, post-send verification).
 *
 * T-17.5-02 (re-applied as T-17.7-01): user-supplied prospect message text
 * NEVER crosses into Stagehand `act` / `extract` arguments. Message is typed
 * via deterministic `page.keyboard.type` after focusing the contenteditable
 * composer. Recipient handle is passed through Stagehand `variables` (D-05);
 * Stagehand substitutes variable values *after* the LLM call so they bypass
 * the model entirely.
 *
 * Stagehand `variables` syntax: `%name%` placeholder in the action string,
 * resolved via `{ variables: { name: value } }` per @browserbasehq/stagehand
 * v2 (verified during Phase 17.5). If the installed Stagehand version
 * changes the placeholder shape, the deterministic recipient-input fallback
 * still types the validated handle via `page.keyboard.type`.
 *
 * Failure modes (CONTEXT D-04 §DM taxonomy):
 *   dialog_never_opened, recipient_not_found, chat_not_enabled,
 *   weekly_limit_reached, account_suspended, captcha_required,
 *   session_expired, send_button_missing, unknown.
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"
import { extractRedditHandle, redditUserUrl } from "./reddit-utils"
import { detectRedditLoginWall } from "./reddit-authwall"

export interface RedditDMResult {
  success: boolean
  failureMode?:
    | "dialog_never_opened"
    | "recipient_not_found"
    | "chat_not_enabled"
    | "weekly_limit_reached"
    | "account_suspended"
    | "captcha_required"
    | "session_expired"
    | "send_button_missing"
    | "unknown"
  reasoning?: string
}

export async function sendRedditDM(
  page: Page,
  stagehand: Stagehand,
  recipientHandle: string,
  message: string,
): Promise<RedditDMResult> {
  const handle = extractRedditHandle(recipientHandle)
  if (!handle) {
    return {
      success: false,
      failureMode: "recipient_not_found",
      reasoning: "invalid handle shape",
    }
  }

  // Touch redditUserUrl so the import is anchored even though the chat flow
  // navigates from the landing page rather than the user profile (D-03a).
  void redditUserUrl

  try {
    await page.setViewportSize({ width: 1280, height: 900 })
  } catch {
    /* non-fatal */
  }

  try {
    await page.goto("https://www.reddit.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return {
      success: false,
      failureMode: "session_expired",
      reasoning: "reddit landing nav threw",
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
  if (/verify you'?re human|captcha/i.test(bodyEarly)) {
    return { success: false, failureMode: "captcha_required" }
  }

  // Stage: open the chat panel from top navigation.
  const chatBtn = page
    .locator("[aria-label*='Chat' i], button:has-text('Chat')")
    .first()
  const chatVisible = await chatBtn
    .isVisible({ timeout: 4000 })
    .catch(() => false)
  let chatOpened = false
  if (chatVisible) {
    await chatBtn.click({ timeout: 8000 }).catch(() => null)
    chatOpened = true
  } else {
    try {
      await stagehand.act("Open the chat panel from the top navigation", {
        page,
      })
      chatOpened = true
    } catch {
      return { success: false, failureMode: "dialog_never_opened" }
    }
  }
  if (!chatOpened) {
    return { success: false, failureMode: "dialog_never_opened" }
  }
  await page.waitForTimeout(2000)

  // Stage: start a new chat.
  const newChatBtn = page
    .locator(
      "button:has-text('New chat'), button:has-text('Start chat'), [aria-label='New chat']",
    )
    .first()
  const newChatVisible = await newChatBtn
    .isVisible({ timeout: 4000 })
    .catch(() => false)
  if (newChatVisible) {
    await newChatBtn.click({ timeout: 8000 }).catch(() => null)
  } else {
    try {
      await stagehand.act("Start a new chat", { page })
    } catch {
      return { success: false, failureMode: "dialog_never_opened" }
    }
  }
  await page.waitForTimeout(1500)

  // Stage: recipient handle entry — Stagehand `variables` first (D-05),
  // deterministic keyboard fallback on miss. Neither path lets the user
  // *message* reach Stagehand.
  let recipientPicked = false
  try {
    await stagehand.act(
      {
        action:
          "Type the recipient username %recipient% into the chat recipient field and select the matching suggestion",
        variables: { recipient: handle },
      } as unknown as Parameters<typeof stagehand.act>[0],
      { page },
    )
    recipientPicked = true
  } catch {
    const recipientInput = page
      .locator("input[placeholder*='Username' i], input[name='username']")
      .first()
    const inputVisible = await recipientInput
      .isVisible({ timeout: 4000 })
      .catch(() => false)
    if (!inputVisible) {
      return { success: false, failureMode: "recipient_not_found" }
    }
    await recipientInput.click({ timeout: 5000 }).catch(() => null)
    await page.keyboard.type(handle, { delay: 30 })
    await page.waitForTimeout(1500)
    const suggestion = page
      .locator("[role='option']")
      .filter({ hasText: handle })
      .first()
    const suggestionVisible = await suggestion
      .isVisible({ timeout: 5000 })
      .catch(() => false)
    if (!suggestionVisible) {
      return { success: false, failureMode: "recipient_not_found" }
    }
    await suggestion.click({ timeout: 5000 }).catch(() => null)
    recipientPicked = true
  }
  if (!recipientPicked) {
    return { success: false, failureMode: "recipient_not_found" }
  }
  await page.waitForTimeout(1500)

  // chat_not_enabled gate — must run *after* recipient selection so Reddit
  // has had a chance to surface the "doesn't accept chat" banner.
  const bodyAfterRecipient =
    (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /chat (is )?disabled|doesn'?t accept chat|can'?t message this user/i.test(
      bodyAfterRecipient,
    )
  ) {
    return { success: false, failureMode: "chat_not_enabled" }
  }

  // Stage: composer wait.
  const composer = page
    .locator(
      "div[contenteditable='true'][role='textbox'], textarea[name='message']",
    )
    .first()
  const composerVisible = await composer
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!composerVisible) {
    return { success: false, failureMode: "dialog_never_opened" }
  }

  // T-17.5-02: deterministic typing of user-supplied message text only.
  await composer.click({ timeout: 5000 }).catch(() => null)
  await page.keyboard.type(message, { delay: 30 })
  await page.waitForTimeout(1500)

  // Stage: Send button — deterministic first, Stagehand fallback.
  const sendBtn = page
    .locator(
      "button[aria-label='Send'], button[aria-label='Send message'], button:has-text('Send')",
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
    try {
      await stagehand.act(
        "Click the Send button in the active Reddit chat composer",
        { page },
      )
      sendDispatched = true
    } catch {
      return { success: false, failureMode: "send_button_missing" }
    }
  }
  if (!sendDispatched) {
    return { success: false, failureMode: "send_button_missing" }
  }
  await page.waitForTimeout(4500)

  // Post-send checkpoint / limit gates.
  const urlAfterSend = page.url()
  if (/\/(checkpoint|captcha)\b/i.test(urlAfterSend)) {
    return { success: false, failureMode: "captcha_required" }
  }
  const bodyAfterSend = (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /reached.{0,30}(daily|weekly).{0,20}limit|rate limit(ed)?|too many requests/i.test(
      bodyAfterSend,
    )
  ) {
    return { success: false, failureMode: "weekly_limit_reached" }
  }
  if (/account (has been )?suspended/i.test(bodyAfterSend)) {
    return { success: false, failureMode: "account_suspended" }
  }

  // DOM-first verify: scan thread for the message text we just typed.
  const threadHasText = await page
    .locator(
      "[role='log'], [data-testid*='message'], [class*='message-list']",
    )
    .filter({ hasText: message.slice(0, 40) })
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false)
  if (threadHasText) return { success: true }

  // Stagehand verification fallback — NO user-data substring in the
  // instruction; verifier inspects the most-recent outgoing message.
  try {
    const verdict = await stagehand.extract(
      "Detect whether the most recent outgoing message appears in the active Reddit chat thread",
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
