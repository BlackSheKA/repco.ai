// Helper for kamil's LinkedIn re-login during Phase 17.5 Plan 04 UAT.
// Magic-link logs in as outsi.com, opens /accounts, leaves the window
// open so kamil can drive the connect-flow iframe manually.
//
// Run: `node --env-file=.env.local scripts/uat-17.5-04-relogin-helper.mjs`
// Browser stays open until terminated (Ctrl+C or window close).

import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"

const TEST_EMAIL = "kamil.wandtke@outsi.com"
const APP_BASE = "http://localhost:3001"
const CHROME_PATH = process.env.LOCALAPPDATA + "\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email: TEST_EMAIL,
  options: { redirectTo: `${APP_BASE}/auth/callback` },
})
if (error) {
  console.error("magiclink error:", error)
  process.exit(1)
}

const browser = await chromium.launch({ headless: false, executablePath: CHROME_PATH })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

console.log("[helper] visiting magic-link → /")
await page.goto(data.properties.action_link, { waitUntil: "networkidle", timeout: 30000 })
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 15000 })
console.log("[helper] logged in. URL =", page.url())

console.log("[helper] navigating to /accounts")
await page.goto(`${APP_BASE}/accounts`, { waitUntil: "networkidle" })
console.log("[helper] /accounts open. Drive the LinkedIn re-login flow manually.")
console.log("[helper] Keep this window open. When done, terminate this script.")

// Park forever; user closes the window or Ctrl+C kills.
await new Promise(() => {})
