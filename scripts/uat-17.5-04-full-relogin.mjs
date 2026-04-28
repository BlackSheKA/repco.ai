// Full LinkedIn re-login flow for outsi.com user via Playwright + parallel CDP.
//
// Outer Playwright drives the repco UI (Connect LinkedIn → submit handle →
// "I've logged in" → wait verify). A parallel CDP client attached to the
// same BB session types the LinkedIn credentials into the actual chromium
// page (because typing through BB's cross-origin debugger iframe via
// frameLocator is fragile — BB's debugger UI may render via canvas/
// postMessage, not nested DOM, so reaching the inner page from the outer
// page is unreliable).
//
// Net effect for the user: identical to a normal manual login flow, just
// driven by code.
//
// Run: `node --env-file=.env.local scripts/uat-17.5-04-full-relogin.mjs`

import { chromium } from "playwright-core"
import { createClient } from "@supabase/supabase-js"
import Browserbase from "@browserbasehq/sdk"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const REPCO_USER_EMAIL = "kamil.wandtke@outsi.com"
const REPCO_USER_ID = "a855c3ab-958f-4b49-9a20-0b45c24c0330"
const LI_EMAIL = "grunty@outsi.pl"
const LI_PASSWORD = "hack00LN!"
const APP_BASE = "http://localhost:3001"
const CHROME_PATH = process.env.LOCALAPPDATA + "\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe"
const SCREENSHOT_DIR = "screenshots"

const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
const bb = new Browserbase({ apiKey })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

await mkdir(SCREENSHOT_DIR, { recursive: true })
const log = (...a) => process.stderr.write("[full] " + a.join(" ") + "\n")

// 1. Magic-link → repco /accounts ────────────────────────────────────────────
const { data: ml } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email: REPCO_USER_EMAIL,
  options: { redirectTo: `${APP_BASE}/auth/callback` },
})

log("launching outer Chromium")
const outer = await chromium.launch({ headless: false, executablePath: CHROME_PATH })
const ctx = await outer.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()

log("magic-link → /")
await page.goto(ml.properties.action_link, { waitUntil: "networkidle", timeout: 30000 })
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 15000 })

log("→ /accounts")
await page.goto(`${APP_BASE}/accounts`, { waitUntil: "networkidle" })

// 2. Click Connect LinkedIn ──────────────────────────────────────────────────
log("click Connect LinkedIn Account (no handle form for LinkedIn — direct to iframe)")
await page.getByRole("button", { name: /Connect LinkedIn Account/i }).click()

// 3. Wait for iframe + new browser_profile in DB ─────────────────────────────
log("waiting for iframe to render")
const iframeLoc = page.locator("iframe").first()
await iframeLoc.waitFor({ state: "visible", timeout: 60000 })
await page.waitForTimeout(3500)

// Look up the freshly-created browser_profile + accountId for this user.
let bp, sa
for (let i = 0; i < 20; i++) {
  const { data: bps } = await supabase
    .from("browser_profiles")
    .select("id, browserbase_context_id")
    .eq("user_id", REPCO_USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
  if (bps?.length) {
    bp = bps[0]
    const { data: sas } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("user_id", REPCO_USER_ID)
      .eq("platform", "linkedin")
      .order("created_at", { ascending: false })
      .limit(1)
    sa = sas?.[0]
    if (sa) break
  }
  await new Promise((r) => setTimeout(r, 500))
}
if (!bp || !sa) {
  console.error("Failed to find new browser_profile or social_account")
  await outer.close()
  process.exit(1)
}
log(`browser_profile=${bp.id} context=${bp.browserbase_context_id} account=${sa.id}`)

// 4. Find the BB session via userMetadata + connect parallel CDP ─────────────
log("locating BB session via userMetadata.accountId")
let bbSession
for (let i = 0; i < 20; i++) {
  const sessions = await bb.sessions.list({
    status: "RUNNING",
    q: `user_metadata['accountId']:'${sa.id}'`,
  })
  if (sessions.length > 0) {
    bbSession = sessions[0]
    break
  }
  await new Promise((r) => setTimeout(r, 500))
}
if (!bbSession) {
  console.error("BB session not found via metadata")
  await outer.close()
  process.exit(1)
}
log(`BB session=${bbSession.id} status=${bbSession.status}`)

// Retrieve the connectUrl
const fullSession = await bb.sessions.retrieve(bbSession.id)
const connectUrl = fullSession.connectUrl
log("connectOverCDP to BB session (parallel client)")
const inner = await chromium.connectOverCDP(connectUrl)
const innerCtx = inner.contexts()[0] ?? (await inner.newContext())
const innerPage = innerCtx.pages()[0] ?? (await innerCtx.newPage())

// 5. Drive LinkedIn login ────────────────────────────────────────────────────
log("inner.url =", innerPage.url())
const currentUrl = innerPage.url()
if (!/linkedin\.com/i.test(currentUrl)) {
  log("navigating to linkedin.com/login")
  await innerPage.goto("https://www.linkedin.com/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
}
await innerPage.waitForTimeout(2000)
log("inner.url after =", innerPage.url())

// LinkedIn email field is typically id="username" or input[name="session_key"]
log("filling LinkedIn email")
const emailField = innerPage.locator(
  'input[name="session_key"], input#username, input[autocomplete="username"]',
).first()
await emailField.waitFor({ state: "visible", timeout: 15000 })
await emailField.fill(LI_EMAIL)

log("filling LinkedIn password")
const passField = innerPage.locator(
  'input[name="session_password"], input#password, input[type="password"]',
).first()
await passField.fill(LI_PASSWORD)

log("submitting login")
await innerPage.locator(
  'button[type="submit"], button[aria-label*="Sign in" i], button:has-text("Sign in")',
).first().click()

// Wait for navigation to feed OR to a challenge / 2FA page.
await innerPage.waitForTimeout(8000)
const postLoginUrl = innerPage.url()
log("post-login url:", postLoginUrl)

// Take screenshot of inner page state
try {
  await innerPage.screenshot({ path: join(SCREENSHOT_DIR, "uat-17.5-relogin-postlogin.png") })
} catch {}

// Check for challenges that need human intervention
const challengeHit =
  /\/checkpoint\//i.test(postLoginUrl) ||
  /\/challenge\//i.test(postLoginUrl)
const feedHit = /\/feed\//i.test(postLoginUrl) || /\/in\//i.test(postLoginUrl)
const stillLogin = /\/login\b/i.test(postLoginUrl) || /\/uas\/login/i.test(postLoginUrl)

log(`challenge=${challengeHit} feed=${feedHit} stillLogin=${stillLogin}`)

if (challengeHit) {
  log("⚠ LinkedIn served a challenge page — manual intervention may be required")
  log("⚠ Pausing 60s for kamil to solve the challenge if visible in iframe")
  await page.waitForTimeout(60000)
}

// Verify cookies before proceeding
const cookies = await innerCtx.cookies()
const liAt = cookies.find((c) => c.name === "li_at" && /linkedin\.com/i.test(c.domain))
log("li_at cookie present?", !!liAt)

// Disconnect inner CDP without closing pages (close = REQUEST_RELEASE per CONTEXT)
log("disconnecting inner CDP (NOT closing — would release the session)")
// Just let it go out of scope. Don't call inner.close().

// 6. In outer repco UI, click "I've logged in" ───────────────────────────────
log("clicking 'I've logged in' in repco UI")
await page.getByRole("button", { name: /I'?ve logged in/i }).click()

// Step 2: Verifying… → Step 3: connected (or not)
log("waiting for verification result")
const verifiedHeading = page.getByText("Account connected", { exact: true })
const failedHeading = page.getByText("Could not verify login", { exact: true })
const result = await Promise.race([
  verifiedHeading.waitFor({ state: "visible", timeout: 60000 }).then(() => "VERIFIED"),
  failedHeading.waitFor({ state: "visible", timeout: 60000 }).then(() => "FAILED"),
]).catch((e) => "TIMEOUT: " + e.message)

log("verify result:", result)
await page.screenshot({ path: join(SCREENSHOT_DIR, "uat-17.5-relogin-final.png"), fullPage: true })

// 7. Confirm li_at via diagnostic probe (fresh BB session) ───────────────────
log("opening fresh BB session against the same context to confirm cookie persistence")
const diagSess = await bb.sessions.create({
  projectId,
  browserSettings: {
    context: { id: bp.browserbase_context_id, persist: true },
    viewport: { width: 1280, height: 900 },
  },
  proxies: [{ type: "browserbase", geolocation: { country: "US" } }],
  timeout: 180,
})
for (let i = 0; i < 30; i++) {
  const s = await bb.sessions.retrieve(diagSess.id)
  if (s.status === "RUNNING") break
  await new Promise((r) => setTimeout(r, 500))
}
await new Promise((r) => setTimeout(r, 1500))

const diagBrowser = await chromium.connectOverCDP(diagSess.connectUrl)
const diagCtx = diagBrowser.contexts()[0]
const diagPage = diagCtx.pages()[0] ?? (await diagCtx.newPage())
await diagPage.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30000 })
await diagPage.waitForTimeout(3000)
const diagUrl = diagPage.url()
const diagCookies = await diagCtx.cookies()
const diagLiAt = diagCookies.find((c) => c.name === "li_at" && /linkedin/i.test(c.domain))

const final = {
  result,
  inner_li_at_present: !!liAt,
  fresh_session_landed: diagUrl,
  fresh_session_li_at_present: !!diagLiAt,
  fresh_session_pass: /\/feed\//.test(diagUrl) && !!diagLiAt,
  context_id: bp.browserbase_context_id,
  account_id: sa.id,
}
log("FINAL:", JSON.stringify(final))

await diagBrowser.close().catch(() => {})
await bb.sessions.update(diagSess.id, { projectId, status: "REQUEST_RELEASE" }).catch(() => {})

// Keep outer browser open for visual inspection
log("outer browser staying open for 30s for visual confirmation; close anytime")
await page.waitForTimeout(30000)
await outer.close()

console.log(JSON.stringify(final, null, 2))
process.exit(final.fresh_session_pass ? 0 : 1)
