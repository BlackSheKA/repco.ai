// Quick diagnostic: navigate to LinkedIn /feed/ in outsi.com BB context
// and report the landed URL + auth signals.

import Browserbase from "@browserbasehq/sdk"
import { chromium } from "playwright-core"
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
const BB_CONTEXT_ID = "8cc8ee68-02d4-4847-ae3d-c493c1727b53"
const CHROME_PATH = process.env.LOCALAPPDATA + "\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe"

const bb = new Browserbase({ apiKey })
const sess = await bb.sessions.create({
  projectId,
  browserSettings: {
    context: { id: BB_CONTEXT_ID, persist: true },
    viewport: { width: 1280, height: 900 },
  },
  proxies: [{ type: "browserbase", geolocation: { country: "US" } }],
  timeout: 300,
})
for (let i = 0; i < 30; i++) {
  const s = await bb.sessions.retrieve(sess.id)
  if (s.status === "RUNNING") break
  await new Promise((r) => setTimeout(r, 500))
}
await new Promise((r) => setTimeout(r, 1500))

const browser = await chromium.connectOverCDP(sess.connectUrl)
const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage())

async function probe(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForTimeout(3000)
  const landed = page.url()
  const title = await page.title().catch(() => "")
  const cookies = await page.context().cookies("https://www.linkedin.com")
  const liAt = cookies.find((c) => c.name === "li_at")
  const body = (await page.textContent("body").catch(() => "")) ?? ""
  return {
    target: url,
    landed,
    title,
    has_liAt_cookie: !!liAt,
    liAt_expires: liAt?.expires,
    body_excerpt: body.slice(0, 300),
    has_signin_text: /sign in|join linkedin/i.test(body),
    has_feed_text: /feed|trending|jobs you may be interested/i.test(body),
  }
}

const r1 = await probe("https://www.linkedin.com/feed/")
console.error("FEED:", JSON.stringify(r1, null, 2))

await mkdir("screenshots", { recursive: true })
await page.screenshot({ path: "screenshots/uat-17.5-s7-diag-feed.png", fullPage: false })

const r2 = await probe("https://www.linkedin.com/in/williamhgates/")
console.error("BILL GATES:", JSON.stringify(r2, null, 2))
await page.screenshot({ path: "screenshots/uat-17.5-s7-diag-billgates.png", fullPage: false })

await browser.close().catch(() => {})
await bb.sessions.update(sess.id, { projectId, status: "REQUEST_RELEASE" }).catch(() => {})

console.log(JSON.stringify({ feed: r1, billGates: r2 }, null, 2))
