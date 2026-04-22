/**
 * Deterministic LinkedIn connection_request executor.
 *
 * Replaces Claude Computer Use for this action type because LinkedIn's
 * Connect button ignores CDP mouse clicks and focus+Enter — the only
 * reliable path is navigating to /preload/custom-invite/?vanityName=...
 * which opens the Add-a-note dialog directly. From there Playwright
 * locators interact with real DOM (<button>, <textarea>) that DO respond.
 *
 * Failure modes reported to worker telemetry:
 *   - already_connected   -> Pending or "Message" sidebar only
 *   - session_expired     -> redirected to /login
 *   - profile_unreachable -> target profile 404 / hidden
 *   - weekly_limit_reached -> "no invitations remaining" banner
 *   - no_connect_available -> custom-invite route didn't render a note dialog
 */

import type { Page } from "playwright-core"

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
 * Accepts both https://www.linkedin.com/in/slug and the bare slug.
 */
export function extractLinkedInSlug(profileUrlOrSlug: string): string {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(profileUrlOrSlug)
  if (m) return decodeURIComponent(m[1])
  return profileUrlOrSlug.replace(/\/+$/, "").split("/").pop() ?? profileUrlOrSlug
}

/**
 * Run the deterministic Connect-with-note flow.
 *
 * Side effects: navigates `page`, types `note` into the invitation
 * dialog, clicks Send. Caller is responsible for capturing the final
 * screenshot and logging.
 */
export async function sendLinkedInConnection(
  page: Page,
  profileUrl: string,
  note: string,
): Promise<LinkedInConnectResult> {
  const slug = extractLinkedInSlug(profileUrl)
  const profilePage = profileUrl.startsWith("http")
    ? profileUrl
    : `https://www.linkedin.com/in/${slug}`
  const inviteUrl = `https://www.linkedin.com/preload/custom-invite/?vanityName=${encodeURIComponent(slug)}`

  // Consistent viewport so the dialog renders predictably.
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
  } catch {
    // Non-fatal — page may already be sized by caller.
  }

  // Step 1: land on profile first — this sets the referrer and primes
  // LinkedIn's SPA router so the custom-invite dialog doesn't 404.
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

  // Pre-check: already-sent invitation shows "Pending" button
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

  // Step 2: navigate to the preload custom-invite URL. LinkedIn's SPA
  // intercepts this path and opens the Add-a-note dialog.
  try {
    await page.goto(inviteUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
  } catch {
    return { success: false, failureMode: "dialog_never_opened" }
  }

  // After navigation LinkedIn often redirects back to the profile and
  // opens the dialog as an overlay. Give it time.
  await page.waitForTimeout(3500)

  if (/\/login\b|\/authwall/i.test(page.url())) {
    return { success: false, failureMode: "session_expired" }
  }

  // Step 3: click "Add a note" in the initial dialog.
  const addNoteBtn = page.getByRole("button", { name: /add a note/i }).first()
  const hasAddNote = await addNoteBtn
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!hasAddNote) {
    // Check for weekly limit or similar blocker.
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

  // Step 4: fill the note textarea.
  const textarea = page
    .locator("textarea[name='message'], textarea#custom-message, textarea")
    .first()
  const taVisible = await textarea
    .isVisible({ timeout: 7000 })
    .catch(() => false)
  if (!taVisible) {
    return { success: false, failureMode: "no_connect_available" }
  }

  // Clamp note to LinkedIn's 200-char free invite limit.
  const clampedNote = note.slice(0, 200)
  await textarea.fill(clampedNote, { timeout: 10000 })
  await page.waitForTimeout(1200)

  // Step 5: click Send.
  const sendBtn = page
    .getByRole("button", { name: /^send(\s+invitation)?$/i })
    .first()
  const sendVisible = await sendBtn
    .isVisible({ timeout: 5000 })
    .catch(() => false)
  if (!sendVisible) {
    return { success: false, failureMode: "send_button_missing" }
  }
  await sendBtn.click({ timeout: 10000 })
  await page.waitForTimeout(4500)

  // Step 6: verify the invitation was sent — either by toast text or
  // by the Send button being replaced with Pending on the profile.
  const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
  if (/invitation sent|pending/i.test(bodyText)) {
    return { success: true }
  }

  // LinkedIn sometimes silently closes the dialog without a confirmation
  // toast in the DOM. Re-check the profile for a Pending button as the
  // authoritative source of truth.
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
    // fall through
  }

  return { success: false, failureMode: "unknown" }
}
