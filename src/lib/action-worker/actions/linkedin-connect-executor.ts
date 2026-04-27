/**
 * Deterministic LinkedIn connection_request executor.
 *
 * Phase 17.5 plan-03: Connect URL hack preserved (per memory
 * `project_linkedin_connect_url_hack` — CDP click on Connect button is
 * ignored by anti-bot, only /preload/custom-invite/?vanityName= works).
 * Stagehand absorbs Send button DOM churn + structured post-send extraction.
 *
 * T-17.5-02: personal note text uses deterministic page.fill, never
 * page.act with the user's text in the instruction string.
 *
 * Failure modes reported to worker telemetry:
 *   - already_connected, session_expired, profile_unreachable,
 *     weekly_limit_reached, no_connect_available, send_button_missing,
 *     dialog_never_opened, unknown
 */

import type { Page } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { z } from "zod"

export interface LinkedInConnectResult {
  success: boolean
  failureMode?:
    | "already_connected"
    | "session_expired"
    | "profile_unreachable"
    | "weekly_limit_reached"
    | "no_connect_available"
    | "send_button_missing"
    | "dialog_never_opened"
    | "unknown"
  reasoning?: string
}

/**
 * Extract the LinkedIn profile slug from a profile URL.
 */
export function extractLinkedInSlug(profileUrlOrSlug: string): string {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(profileUrlOrSlug)
  if (m) return decodeURIComponent(m[1])
  return profileUrlOrSlug.replace(/\/+$/, "").split("/").pop() ?? profileUrlOrSlug
}

export async function sendLinkedInConnection(
  page: Page,
  stagehand: Stagehand,
  profileUrl: string,
  note: string,
): Promise<LinkedInConnectResult> {
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = profileUrl.startsWith("http")
    ? profileUrl
    : `https://www.linkedin.com/in/${slug}`
  // memory: project_linkedin_connect_url_hack — DO NOT page.act the Connect
  // button on the profile; navigate to /preload/custom-invite directly.
  const inviteUrl = `https://www.linkedin.com/preload/custom-invite/?vanityName=${encodeURIComponent(slug)}`

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
    return { success: false, failureMode: "profile_unreachable" }
  }

  const landedUrl = page.url()
  if (/\/login\b|\/authwall/i.test(landedUrl)) {
    return { success: false, failureMode: "session_expired" }
  }

  await page.waitForTimeout(2000)

  const hasPending = await page
    .locator("main button:has-text('Pending')")
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false)
  if (hasPending) {
    return {
      success: true,
      failureMode: "already_connected",
      reasoning: "Pending button visible on profile — invitation already sent",
    }
  }

  try {
    await page.goto(inviteUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return { success: false, failureMode: "dialog_never_opened" }
  }

  await page.waitForTimeout(3500)

  if (/\/login\b|\/authwall/i.test(page.url())) {
    return { success: false, failureMode: "session_expired" }
  }

  const addNoteBtn = page.getByRole("button", { name: /add a note/i }).first()
  const hasAddNote = await addNoteBtn
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!hasAddNote) {
    const body = (await page.textContent("body").catch(() => "")) ?? ""
    if (/weekly.*invitation.*limit|reached.*limit/i.test(body)) {
      return { success: false, failureMode: "weekly_limit_reached" }
    }
    if (/no longer available|couldn.t find/i.test(body)) {
      return { success: false, failureMode: "profile_unreachable" }
    }
    return { success: false, failureMode: "dialog_never_opened" }
  }

  await addNoteBtn.click({ timeout: 10000 })
  await page.waitForTimeout(1500)

  const textarea = page
    .locator("textarea[name='message'], textarea#custom-message, textarea")
    .first()
  const taVisible = await textarea
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!taVisible) {
    return { success: false, failureMode: "no_connect_available" }
  }

  // T-17.5-02: deterministic note fill. Never embed `note` in stagehand.act.
  const clampedNote = note.slice(0, 200)
  await textarea.fill(clampedNote, { timeout: 10000 })
  await page.waitForTimeout(1200)

  // Send invite — try Playwright role-locator; fall back to Stagehand.
  const sendBtn = page
    .getByRole("button", { name: /^send(\s+invitation)?$/i })
    .first()
  const sendVisible = await sendBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (sendVisible) {
    await sendBtn.click({ timeout: 10000 })
  } else {
    try {
      await stagehand.act(
        "Click the Send invitation button in the LinkedIn invite dialog",
        { page },
      )
    } catch {
      return { success: false, failureMode: "send_button_missing" }
    }
  }
  await page.waitForTimeout(4500)

  const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
  if (/invitation sent|pending/i.test(bodyText)) {
    return { success: true }
  }

  // Authoritative re-check: navigate back to profile, look for Pending.
  try {
    await page.goto(profilePage, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    })
    await page.waitForTimeout(2500)
    const pending2 = await page
      .locator("main button:has-text('Pending')")
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false)
    if (pending2) return { success: true }
  } catch {
    /* fall through */
  }

  // Stagehand verification fallback: structured extraction of invitation state.
  try {
    const verdict = await stagehand.extract(
      "Detect whether a connection invitation was successfully sent for this LinkedIn profile",
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

  return { success: false, failureMode: "unknown" }
}
