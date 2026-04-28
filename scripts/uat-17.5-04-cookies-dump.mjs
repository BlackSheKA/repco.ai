// Dump every cookie the BB context has for LinkedIn — diagnose which
// cookies persisted vs which got dropped/server-revoked.
import Browserbase from "@browserbasehq/sdk"
import { chromium } from "playwright-core"

const BB_CONTEXT_ID = "8cc8ee68-02d4-4847-ae3d-c493c1727b53"
const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
const bb = new Browserbase({ apiKey })

const sess = await bb.sessions.create({
  projectId,
  browserSettings: {
    context: { id: BB_CONTEXT_ID, persist: true },
    viewport: { width: 1280, height: 900 },
  },
  proxies: [{ type: "browserbase", geolocation: { country: "US" } }],
  timeout: 180,
})
for (let i = 0; i < 30; i++) {
  const s = await bb.sessions.retrieve(sess.id)
  if (s.status === "RUNNING") break
  await new Promise((r) => setTimeout(r, 500))
}
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.connectOverCDP(sess.connectUrl)
const ctx = browser.contexts()[0]
const page = ctx.pages()[0] ?? (await ctx.newPage())

await page.goto("https://www.linkedin.com/", { waitUntil: "domcontentloaded", timeout: 30000 })
await page.waitForTimeout(3000)

const cookies = await ctx.cookies()
const linkedinCookies = cookies.filter((c) => /linkedin/i.test(c.domain))

console.log("Total cookies:", cookies.length)
console.log("LinkedIn cookies:", linkedinCookies.length)
for (const c of linkedinCookies) {
  const expiresIn = c.expires === -1 ? "session" :
    Math.round((c.expires - Date.now() / 1000) / 86400) + "d"
  console.log(`  ${c.name.padEnd(30)} domain=${c.domain.padEnd(20)} httpOnly=${c.httpOnly} secure=${c.secure} expires=${expiresIn}`)
}

await browser.close().catch(() => {})
await bb.sessions.update(sess.id, { projectId, status: "REQUEST_RELEASE" }).catch(() => {})
