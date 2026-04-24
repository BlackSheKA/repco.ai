/**
 * LinkedIn auth-wall detection.
 *
 * When a GoLogin LinkedIn profile session expires, LinkedIn serves a
 * "Join LinkedIn" / "Sign in" wall INLINE at `/in/{slug}` — the URL
 * does not redirect to `/login` or `/authwall`. Every DOM-based
 * failure-mode detector in the Phase 13 executors (no Message button,
 * no Follow button, no React button, all three prescreen signals
 * absent) misattributes this state as a target-side signal
 * (`not_connected`, `follow_button_missing`, `react_button_missing`,
 * prescreen verdict=null).
 *
 * This helper checks BOTH the URL AND for the signup-wall heading
 * served inline. Callers should invoke this right after navigation
 * and before reading any profile/post DOM landmark, emitting
 * `session_expired` (executors) or aborting with account health
 * flipped to `warning` (prescreen cron).
 *
 * Surfaced by Phase 13 live UAT 2026-04-24.
 */

import type { Page } from "playwright-core"

const URL_PATTERN = /\/(login|authwall|signup|join|uas\/login|checkpoint\/rm)\b/i
const LOCATOR_TIMEOUT_MS = 1500

/**
 * Returns `true` if the page is currently showing LinkedIn's auth wall
 * (signup / sign-in wall), regardless of the URL path.
 *
 * Tolerant to transient renders: only returns true on POSITIVE signals.
 * Uses three independent checks (URL → DOM → body text) so LinkedIn
 * A/B-variant markup or slow renders don't produce false negatives.
 */
export async function detectLinkedInAuthwall(page: Page): Promise<boolean> {
  const url = page.url()
  if (URL_PATTERN.test(url)) return true

  // Signup/sign-in wall served inline at /in/{slug} exposes a stable
  // heading. Match both "Join LinkedIn" (signup-first) and "Sign in"
  // (auth-wall variant). Keep this a positive-only signal so slow
  // profile renders never false-positive.
  const heading = await page
    .locator(
      "h1:has-text('Join LinkedIn'), h1:has-text('Sign in'), h2:has-text('Join LinkedIn'), h2:has-text('Sign in to LinkedIn')",
    )
    .first()
    .isVisible({ timeout: LOCATOR_TIMEOUT_MS })
    .catch(() => false)
  if (heading) return true

  // The auth wall also ships a `<section class="authwall">` or a form
  // with `data-tracking-control-name="auth-join-form"` — these are
  // positive signals even when the heading text changes across A/B
  // variants or locales.
  const authForm = await page
    .locator(
      "section.authwall, form[data-tracking-control-name='auth-join-form'], form[data-tracking-control-name='auth-signin-form']",
    )
    .first()
    .isVisible({ timeout: LOCATOR_TIMEOUT_MS })
    .catch(() => false)
  if (authForm) return true

  // Body-text fallback — last-resort signal for A/B variants whose
  // markup escapes the selectors above. Use a narrow, specific
  // phrase-set so authenticated profile views (which also contain
  // "LinkedIn" everywhere) don't false-positive.
  const body = (await page.textContent("body").catch(() => "")) ?? ""
  if (
    /Join LinkedIn[\s\S]{0,120}(Agree & Join|Continue with Google|Already on LinkedIn)/i.test(
      body,
    )
  ) {
    return true
  }
  if (/Sign in to LinkedIn[\s\S]{0,200}(New to LinkedIn|Forgot password)/i.test(body)) {
    return true
  }
  return false
}
