/**
 * GoLogin Cloud CDP adapter -- wraps Playwright's connectOverCDP
 * to isolate the rest of the codebase from GoLogin API drift.
 *
 * All browser automation should go through this adapter.
 *
 * Requires server-only env var: GOLOGIN_API_TOKEN
 */

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core"
import { stopCloudBrowser } from "./client"

// wss:// (not https://) so Playwright treats this as a direct WebSocket
// CDP endpoint instead of trying /json/version discovery, which GoLogin's
// cloud doesn't expose.
const GOLOGIN_CLOUD_URL = "wss://cloudbrowser.gologin.com/connect"

/** Maximum number of connection retry attempts */
const MAX_RETRIES = 3

/** Base delay in ms for exponential backoff (1s, 2s, 4s) */
const BASE_DELAY_MS = 1000

export interface GoLoginConnection {
  browser: Browser
  context: BrowserContext
  page: Page
  /**
   * The GoLogin profile ID of this connection. Stored so callers can
   * invoke `stopCloudBrowser(profileId)` in a finally block to free
   * the cloud-browser slot — `disconnectProfile(browser)` alone is a
   * no-op and leaves the remote session running until GoLogin's
   * server-side timeout, which exhausts parallel-launch quota.
   * Surfaced by Phase 13 UAT 2026-04-24.
   */
  profileId: string
}

/**
 * Connect to a GoLogin Cloud browser profile via CDP WebSocket.
 *
 * Includes retry logic with exponential backoff (1s, 2s, 4s).
 *
 * @param profileId - The GoLogin profile ID to connect to
 * @returns A connection object with browser, context, and page
 */
export async function connectToProfile(
  profileId: string
): Promise<GoLoginConnection> {
  const token = process.env.GOLOGIN_API_TOKEN
  if (!token) {
    throw new Error(
      "GOLOGIN_API_TOKEN is not set. Add it to your environment variables."
    )
  }

  const wsUrl = `${GOLOGIN_CLOUD_URL}?token=${token}&profile=${profileId}`

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const browser = await chromium.connectOverCDP(wsUrl)
      const context = browser.contexts()[0] ?? (await browser.newContext())
      const page = context.pages()[0] ?? (await context.newPage())

      return { browser, context, page, profileId }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw new Error(
    `GoLogin CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`
  )
}

/**
 * Safely detach from a GoLogin Cloud browser session without terminating
 * the remote browser.
 *
 * Playwright's `browser.close()` on a CDP-connected browser sends the
 * Chromium `Browser.close` command which terminates the underlying
 * browser — fine for worker pipelines that own the session, fatal when
 * the user still needs to interact with the same browser via the GoLogin
 * web viewer. We don't have a true "disconnect only" primitive in
 * playwright-core, so we leave the connection to garbage-collect when the
 * request handler returns.
 *
 * Callers that actually want to kill the browser should use
 * `gologin/client#stopCloudBrowser(profileId)` instead.
 *
 * @param _browser - The Playwright Browser instance (unused; kept for API stability)
 */
export async function disconnectProfile(_browser: Browser): Promise<void> {
  // Intentional no-op — see doc comment above.
}

/**
 * Fully release a GoLogin Cloud session: closes the CDP connection
 * locally AND calls GoLogin's stopCloudBrowser API to free the
 * remote parallel-launch slot.
 *
 * Use in worker/cron finally blocks — `disconnectProfile(browser)`
 * alone is a no-op and burns the cloud-browser slot until GoLogin's
 * server-side auto-close timeout, producing HTTP 403
 * "max parallel cloud launches limit" on subsequent runs.
 *
 * Swallows all errors — must never throw from a finally block that
 * runs after the primary pipeline has already recorded its status.
 * Logs failures to console for ops visibility.
 *
 * Surfaced by Phase 13 UAT 2026-04-24.
 */
export async function releaseProfile(
  connection: GoLoginConnection | undefined,
): Promise<void> {
  if (!connection) return
  try {
    await connection.browser.close()
  } catch (err) {
    // Non-fatal: browser may already be closed by GoLogin-side.
    console.warn(
      "[gologin] browser.close() failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    )
  }
  try {
    await stopCloudBrowser(connection.profileId)
  } catch (err) {
    console.warn(
      "[gologin] stopCloudBrowser failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    )
  }
}
