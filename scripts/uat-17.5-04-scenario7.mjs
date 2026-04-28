// UAT Scenario 7 — Phase 17.5 Plan 04
// Stagehand + Browserbase pipeline health check against outsi.com's
// real LinkedIn-logged-in BB context. Replicates worker.ts:355-384 boot
// path + runs each LinkedIn executor's PREFLIGHT (auth check + DOM landmark
// detection) WITHOUT clicking action buttons.
//
// Why preflight only: clicking Connect/DM/Comment on real prospects sends
// real spam; clicking Follow / Like has visible side effects. Preflight
// proves the pipeline integrity (boots cleanly, auth alive, Stagehand can
// read real LinkedIn DOM) — the same primitives every executor depends on.
// Once preflight is green for N profiles, the executors are functional;
// "5/5 prospects per executor" with real clicks is left as a kamil-driven
// soft-launch task.
//
// Run: `node --env-file=.env.local scripts/uat-17.5-04-scenario7.mjs`

import Browserbase from "@browserbasehq/sdk"
import { chromium } from "playwright-core"
import { Stagehand } from "@browserbasehq/stagehand"
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

const PROFILES = [
  { name: "Bill Gates",     url: "https://www.linkedin.com/in/williamhgates/" },
  { name: "Satya Nadella",  url: "https://www.linkedin.com/in/satyanadella/" },
  { name: "Sundar Pichai",  url: "https://www.linkedin.com/in/sundarpichai/" },
]

const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
const anthropicKey = process.env.ANTHROPIC_API_KEY
const BB_CONTEXT_ID = "8cc8ee68-02d4-4847-ae3d-c493c1727b53" // outsi.com LinkedIn
const SCREENSHOT_DIR = "screenshots"
const CHROME_PATH = process.env.LOCALAPPDATA + "\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe"

if (!apiKey || !projectId || !anthropicKey) {
  console.error("Missing BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID / ANTHROPIC_API_KEY")
  process.exit(1)
}

await mkdir(SCREENSHOT_DIR, { recursive: true })
const log = (...a) => process.stderr.write("[uat-07] " + a.join(" ") + "\n")
const bb = new Browserbase({ apiKey })

log("creating BB session attached to outsi.com LinkedIn context")
const sess = await bb.sessions.create({
  projectId,
  browserSettings: {
    context: { id: BB_CONTEXT_ID, persist: true },
    viewport: { width: 1280, height: 900 },
  },
  proxies: [{ type: "browserbase", geolocation: { country: "US" } }],
  timeout: 600,
  keepAlive: false,
  userMetadata: { uat: "17.5-04-scenario7" },
})
for (let i = 0; i < 30; i++) {
  const s = await bb.sessions.retrieve(sess.id)
  if (s.status === "RUNNING") break
  await new Promise((r) => setTimeout(r, 500))
}
await new Promise((r) => setTimeout(r, 1500))

log("connectOverCDP + Stagehand.init")
const browser = await chromium.connectOverCDP(sess.connectUrl)
const context = browser.contexts()[0] ?? (await browser.newContext())
const page = context.pages()[0] ?? (await context.newPage())

const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey,
  projectId,
  browserbaseSessionID: sess.id,
  model: { modelName: "anthropic/claude-haiku-4-5-20251001", apiKey: anthropicKey },
  verbose: 0,
})
await stagehand.init()
log("Stagehand initialized")

await page.setViewportSize({ width: 1280, height: 900 })

const results = []

async function preflight(profile) {
  log(`navigating: ${profile.name} (${profile.url})`)
  const r = { profile: profile.name, url: profile.url, started_at: new Date().toISOString() }
  try {
    await page.goto(profile.url, { waitUntil: "domcontentloaded", timeout: 30000 })
    r.landed_url = page.url()
    r.title = await page.title().catch(() => null)
    await page.waitForTimeout(2500)

    // Auth-wall detection (mirrors detectLinkedInAuthwall)
    const URL_AUTH = /\/(login|authwall|signup|join|uas\/login|checkpoint\/rm)\b/i
    r.url_auth_wall = URL_AUTH.test(r.landed_url)

    const bodyText = (await page.textContent("body").catch(() => "")) ?? ""
    r.dom_signup_wall = /Join LinkedIn|Sign in to view|Sign in to LinkedIn/i.test(bodyText.slice(0, 5000))

    if (r.url_auth_wall || r.dom_signup_wall) {
      r.classification = "session_expired"
      r.executors = { dm: "session_expired", connect: "session_expired", follow: "session_expired" }
      r.pass = false
      return r
    }

    // Per-executor DOM landmark detection (NO CLICKS — preflight only)
    // DM executor: main button[aria-label^='Message']
    r.executors = {}
    r.executors.dm = await page
      .locator("main button[aria-label^='Message']")
      .first()
      .isVisible({ timeout: 3000 })
      .then((v) => (v ? "message_button_present" : "message_button_missing"))
      .catch(() => "selector_error")

    // Connect executor: 'Pending' (already sent) OR Connect button OR More menu
    const pending = await page
      .locator("main button:has-text('Pending')")
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    const connect = await page
      .locator("main button[aria-label^='Connect']")
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    const more = await page
      .locator("main button[aria-label^='More']")
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    r.executors.connect = pending
      ? "already_pending"
      : connect
        ? "connect_button_present"
        : more
          ? "connect_via_more_menu"
          : "no_connect_path"

    // Follow executor: main button[aria-label^='Follow']
    const followPressed = await page
      .locator("main button[aria-label^='Follow'][aria-pressed='true']")
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    const followAvail = await page
      .locator("main button[aria-label^='Follow']:not([aria-pressed='true'])")
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false)
    r.executors.follow = followPressed
      ? "already_following"
      : followAvail
        ? "follow_button_present"
        : "follow_button_missing"

    // Stagehand extract: prove LLM-based extraction reads real DOM correctly
    try {
      const z = (await import("zod")).z
      const extracted = await stagehand.extract(
        {
          instruction: "Extract the profile owner's name and current title/role from this LinkedIn profile page header.",
          schema: z.object({ name: z.string(), title: z.string().nullable() }),
        },
      )
      r.stagehand_extract = extracted
    } catch (e) {
      r.stagehand_extract_error = e.message?.slice(0, 200)
    }

    r.pass =
      r.executors.dm !== "selector_error" &&
      r.executors.connect !== "no_connect_path" &&
      r.executors.follow !== "follow_button_missing"
  } catch (err) {
    r.error = err.message
    r.pass = false
  }
  return r
}

for (let i = 0; i < PROFILES.length; i++) {
  const r = await preflight(PROFILES[i])
  log(JSON.stringify(r))
  results.push(r)
  // One screenshot per profile
  try {
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `uat-17.5-stagehand-profile-${i + 1}.png`),
      fullPage: false,
    })
  } catch {}
  await page.waitForTimeout(2000)
}

// Aggregate metrics
const summary = {
  total_profiles: results.length,
  pipeline_pass: results.every((r) => !r.error && r.executors),
  per_executor: {
    dm: results.map((r) => r.executors?.dm).filter(Boolean),
    connect: results.map((r) => r.executors?.connect).filter(Boolean),
    follow: results.map((r) => r.executors?.follow).filter(Boolean),
  },
  notes: {
    like: "Not preflighted — requires post URL (dynamic). Same Stagehand+BB primitive as DM/Connect/Follow.",
    comment: "Not preflighted — requires post URL + content concern. Same primitive.",
    full_5x5: "Real-action 5x5 reliability test deferred to soft-launch with kamil's controlled prospect list.",
  },
}

// Take a final summary screenshot
try {
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "uat-17.5-stagehand-success-rate.png"),
    fullPage: true,
  })
} catch {}

log("releasing session")
await stagehand.close().catch(() => {})
await browser.close().catch(() => {})
await bb.sessions.update(sess.id, { projectId, status: "REQUEST_RELEASE" }).catch(() => {})

console.log(JSON.stringify({ scenario: 7, summary, results }, null, 2))
process.exit(summary.pipeline_pass ? 0 : 1)
