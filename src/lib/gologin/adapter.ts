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

      return { browser, context, page }
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
 * Safely disconnect from a GoLogin Cloud browser profile.
 *
 * @param browser - The Playwright Browser instance to close
 */
export async function disconnectProfile(browser: Browser): Promise<void> {
  try {
    await browser.close()
  } catch {
    // Browser may already be disconnected -- ignore close errors
  }
}
