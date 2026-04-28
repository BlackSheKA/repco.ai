/**
 * Reddit auth-wall / login-wall detection.
 *
 * Phase 17.7-01: direct analog of `linkedin-authwall.ts`. When a Reddit
 * session expires (any vendor / fingerprint), Reddit either redirects
 * the user to `/login`, `/account/login`, or `/register` — or serves
 * an inline "Log in to continue" modal at the current URL.
 *
 * Pure DOM-landmark probing in each executor would misattribute the
 * inline-modal case as `dialog_never_opened` / `recipient_not_found`,
 * surfacing as a target-side signal instead of a session-side one.
 *
 * This helper checks (in order, positive-only signals to avoid false
 * positives on logged-in pages that contain "Reddit" everywhere):
 *   1. URL pattern (/login, /account/login, /register, /signup)
 *   2. Visible h1/h2 with "Log in to Reddit" or "Sign up"
 *   3. Visible [role="dialog"] containing "Log in to continue"
 *   4. Body text containing "Log in to Reddit" near "Continue with Google"
 *
 * Callers MUST invoke this right after navigation and before reading any
 * profile/post DOM landmark; on positive signal emit `session_expired`.
 */

import type { Page } from "playwright-core"

const URL_PATTERN = /\/(login|account\/login|register|signup)\b/i
const LOCATOR_TIMEOUT_MS = 1500

export async function detectRedditLoginWall(page: Page): Promise<boolean> {
  const url = page.url()
  if (URL_PATTERN.test(url)) return true

  // Heading sentinel — most reliable positive signal when Reddit serves
  // the dedicated login page.
  const heading = await page
    .locator(
      "h1:has-text('Log in to Reddit'), h1:has-text('Log in'), h2:has-text('Log in to Reddit'), h2:has-text('Sign up')",
    )
    .first()
    .isVisible({ timeout: LOCATOR_TIMEOUT_MS })
    .catch(() => false)
  if (heading) return true

  // Modal sentinel — Reddit shows an inline "Log in to continue" dialog
  // when an unauthenticated user attempts a protected action.
  const dialog = await page
    .locator(
      "[role='dialog']:has-text('Log in to continue'), [role='dialog']:has-text('Log in to Reddit')",
    )
    .first()
    .isVisible({ timeout: LOCATOR_TIMEOUT_MS })
    .catch(() => false)
  if (dialog) return true

  // Body-text fallback — narrow, multi-phrase regex to avoid false
  // positives on logged-in feeds that may transiently mention "Log in".
  const body = (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /Log in to Reddit[\s\S]{0,160}(Continue with Google|Continue with Apple|Forgot password)/i.test(
      body,
    )
  ) {
    return true
  }

  return false
}
