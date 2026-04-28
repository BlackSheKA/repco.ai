// UAT Scenario 4 runner — Phase 17.5 Plan 04
// Verifies BPRX-05: BB session with proxies.geolocation.country = X
// produces an egress IP geolocated to country X for X in
// [US, GB, DE, PL, FR, CA, AU].
//
// Run: `node --env-file=.env.local scripts/uat-17.5-04-geolocation.mjs`
//
// Output: JSON results array printed to stdout. Cleans up created contexts.

import Browserbase from "@browserbasehq/sdk"
import WebSocket from "ws"

const COUNTRIES = ["US", "GB", "DE", "PL", "FR", "CA", "AU"]

const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
if (!apiKey || !projectId) {
  console.error("Missing BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID")
  process.exit(1)
}
const bb = new Browserbase({ apiKey })

async function evaluateInBBSession(connectUrl, expression, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(connectUrl)
    let nextId = 1
    let pageSessionId = null
    const pending = new Map()
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error("CDP timeout"))
    }, timeoutMs)
    const send = (payload, cb) => {
      const id = nextId++
      if (cb) pending.set(id, cb)
      ws.send(JSON.stringify({ id, ...payload }))
    }
    ws.on("open", () => {
      send({ method: "Target.getTargets" }, (resp) => {
        const page = resp.result?.targetInfos?.find((t) => t.type === "page")
        if (!page) {
          ws.close()
          reject(new Error("no page target"))
          return
        }
        send(
          {
            method: "Target.attachToTarget",
            params: { targetId: page.targetId, flatten: true },
          },
          (a) => {
            pageSessionId = a.result?.sessionId
            if (!pageSessionId) {
              ws.close()
              reject(new Error("attach failed"))
              return
            }
            send({
              sessionId: pageSessionId,
              method: "Runtime.evaluate",
              params: { expression, awaitPromise: true, returnByValue: true },
            }, (er) => {
              clearTimeout(timer)
              ws.close()
              if (er.result?.exceptionDetails) {
                reject(new Error("eval exception: " + JSON.stringify(er.result.exceptionDetails)))
                return
              }
              resolve(er.result?.result?.value)
            })
          },
        )
      })
    })
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const cb = pending.get(msg.id)
          pending.delete(msg.id)
          cb(msg)
        }
      } catch {}
    })
    ws.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

async function waitForRunning(sessionId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const s = await bb.sessions.retrieve(sessionId)
    if (s.status === "RUNNING") return
    if (["ERROR", "TIMED_OUT", "COMPLETED"].includes(s.status)) {
      throw new Error("session " + s.status)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("session never RUNNING")
}

async function runOne(country) {
  const r = { country, expected: country, started_at: new Date().toISOString() }
  let ctxId = null
  let sessId = null
  try {
    const ctx = await bb.contexts.create({ projectId })
    ctxId = ctx.id
    r.context_id = ctxId
    const sess = await bb.sessions.create({
      projectId,
      browserSettings: { context: { id: ctxId, persist: false } },
      proxies: [{ type: "browserbase", geolocation: { country } }],
      timeout: 300,
      keepAlive: false,
    })
    sessId = sess.id
    r.session_id = sessId
    await waitForRunning(sessId)
    // Small extra wait for CDP wss to fully accept clients.
    await new Promise((res) => setTimeout(res, 1500))
    // Inside the BB browser, fetch ipify + ipinfo via fetch() so we use the proxy.
    const res = await evaluateInBBSession(
      sess.connectUrl,
      `(async () => {
        const ip = await fetch("https://api.ipify.org?format=json").then(r => r.json())
        const info = await fetch("https://ipinfo.io/" + ip.ip + "/json").then(r => r.json())
        return { ip: ip.ip, country: info.country, region: info.region, city: info.city }
      })()`,
    )
    r.observed_ip = res?.ip
    r.observed_country = res?.country
    r.observed_region = res?.region
    r.observed_city = res?.city
    r.pass = res?.country === country
  } catch (err) {
    r.error = err.message
    r.pass = false
  } finally {
    if (sessId) {
      try {
        await bb.sessions.update(sessId, { projectId, status: "REQUEST_RELEASE" })
      } catch {}
    }
    if (ctxId) {
      try {
        await bb.contexts.delete(ctxId)
      } catch {}
    }
  }
  r.finished_at = new Date().toISOString()
  return r
}

const results = []
for (const c of COUNTRIES) {
  process.stderr.write(`[uat-04] running ${c}…\n`)
  const r = await runOne(c)
  process.stderr.write(
    `[uat-04] ${c} -> observed ${r.observed_country ?? "ERR"} (${r.observed_ip ?? "-"}) ${r.pass ? "PASS" : "FAIL"}\n`,
  )
  results.push(r)
}

console.log(JSON.stringify({ scenario: 4, results }, null, 2))
process.exit(results.every((r) => r.pass) ? 0 : 1)
