/**
 * Browserbase REST client (Phase 17.5 — replaces gologin/client.ts).
 *
 * Server-only. Uses `@browserbasehq/sdk` for typed API access.
 *
 * Required env vars (T-17.5-01):
 *   - BROWSERBASE_API_KEY  (server-only, never NEXT_PUBLIC_, never logged)
 *   - BROWSERBASE_PROJECT_ID
 *
 * Operations:
 *   - createContext()        — persistent Chrome user-data-dir snapshot
 *   - deleteContext(id)      — best-effort delete; swallows 404
 *   - createSession(args)    — short-lived browser attached to a context, with proxies
 *   - getSessionDebugUrl(id) — debuggerFullscreenUrl for iframe embed (T-17.5-03)
 *   - releaseSession(id)     — REQUEST_RELEASE; swallows 404
 *
 * No `console.log` in this module (T-17.5-03 — never log debuggerFullscreenUrl,
 * session ids, or context ids).
 */

import Browserbase from "@browserbasehq/sdk"

import type { SupportedCountry } from "@/features/browser-profiles/lib/country-map"

let _client: Browserbase | undefined

function client(): Browserbase {
  if (!_client) {
    const apiKey = process.env.BROWSERBASE_API_KEY
    if (!apiKey) throw new Error("BROWSERBASE_API_KEY not set")
    _client = new Browserbase({ apiKey })
  }
  return _client
}

function projectId(): string {
  const id = process.env.BROWSERBASE_PROJECT_ID
  if (!id) throw new Error("BROWSERBASE_PROJECT_ID not set")
  return id
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false
  const status = (err as { status?: unknown }).status
  if (typeof status === "number" && status === 404) return true
  const message = (err as { message?: unknown }).message
  if (typeof message === "string" && /not\s*found/i.test(message)) return true
  return false
}

export async function createContext(): Promise<{ id: string }> {
  const ctx = await client().contexts.create({ projectId: projectId() })
  return { id: ctx.id }
}

export async function deleteContext(contextId: string): Promise<void> {
  // SDK bug (@browserbasehq/sdk@2.10.0): contexts.delete sets
  // Content-Type: application/json on a body-less DELETE; the BB API
  // responds 400 "Body cannot be empty". Bypass with raw fetch (no
  // Content-Type header) — server returns 204 cleanly. Every D-10 rollback
  // funnels through here, so a silent SDK 400 leaks BB contexts.
  const apiKey = process.env.BROWSERBASE_API_KEY
  if (!apiKey) throw new Error("BROWSERBASE_API_KEY not set")
  const res = await fetch(
    `https://api.browserbase.com/v1/contexts/${contextId}`,
    { method: "DELETE", headers: { "X-BB-API-Key": apiKey } },
  )
  if (res.status === 204 || res.status === 404) return
  throw new Error(`deleteContext ${res.status}: ${await res.text()}`)
}

export interface CreateSessionArgs {
  contextId: string
  country: SupportedCountry
  /** Per D17.5-07: connect=1800s, per-action=300s, Reddit CU=180s. */
  timeoutSeconds: number
  /** Default false — sessions auto-release on timeout. */
  keepAlive?: boolean
  /** Tag the session so we can list+release later (e.g. on user Cancel). */
  userMetadata?: Record<string, string>
}

export interface BrowserbaseSession {
  id: string
  /** wss:// CDP endpoint with auth baked in. */
  connectUrl: string
}

export async function createSession(
  args: CreateSessionArgs,
): Promise<BrowserbaseSession> {
  const s = await client().sessions.create({
    projectId: projectId(),
    browserSettings: {
      context: { id: args.contextId, persist: true },
      // Match the embedded iframe size (h=480px CSS in connection-flow). BB's
      // default viewport is 1024×768 which causes content overflow + an
      // in-iframe "use a smaller window" hint. Tighter match = better fit.
      viewport: { width: 1280, height: 720 },
    },
    proxies: [
      { type: "browserbase", geolocation: { country: args.country } },
    ],
    timeout: args.timeoutSeconds,
    keepAlive: args.keepAlive ?? false,
    ...(args.userMetadata ? { userMetadata: args.userMetadata } : {}),
  })
  return { id: s.id, connectUrl: s.connectUrl }
}

/**
 * Navigate the active page in a Browserbase session via raw Chrome DevTools
 * Protocol over WebSocket. We use this instead of Playwright's
 * `connectOverCDP` because the latter consistently fails with "Target page,
 * context or browser has been closed" against BB from Node 24 / Windows.
 *
 * Best-effort: throws on transport errors; caller decides what to do.
 */
export async function navigateBrowserbaseSession(
  connectUrl: string,
  url: string,
  timeoutMs = 15000,
): Promise<void> {
  const { default: WebSocket } = await import("ws")
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(connectUrl)
    let nextId = 1
    let pageTargetId: string | null = null
    let pageSessionId: string | null = null
    const pending = new Map<number, (msg: unknown) => void>()
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error("CDP nav timeout"))
    }, timeoutMs)
    const send = (
      payload: Record<string, unknown>,
      cb?: (msg: unknown) => void,
    ) => {
      const id = nextId++
      const msg = { id, ...payload }
      if (cb) pending.set(id, cb)
      ws.send(JSON.stringify(msg))
    }
    ws.on("open", () => {
      send({ method: "Target.getTargets" }, (resp) => {
        const targets = (resp as { result?: { targetInfos?: Array<{ targetId: string; type: string }> } })
          .result?.targetInfos
        const page = targets?.find((t) => t.type === "page")
        if (!page) {
          ws.close()
          reject(new Error("no page target"))
          return
        }
        pageTargetId = page.targetId
        send(
          {
            method: "Target.attachToTarget",
            params: { targetId: pageTargetId, flatten: true },
          },
          (attachResp) => {
            pageSessionId = (
              attachResp as { result?: { sessionId?: string } }
            ).result?.sessionId ?? null
            if (!pageSessionId) {
              ws.close()
              reject(new Error("attach failed"))
              return
            }
            send({
              sessionId: pageSessionId,
              method: "Page.navigate",
              params: { url },
            })
            // Don't wait for navigation completion — close after dispatch.
            setTimeout(() => {
              clearTimeout(timer)
              ws.close()
              resolve()
            }, 500)
          },
        )
      })
    })
    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { id?: number }
        if (typeof msg.id === "number" && pending.has(msg.id)) {
          const cb = pending.get(msg.id)!
          pending.delete(msg.id)
          cb(msg)
        }
      } catch {}
    })
    ws.on("error", (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/** One-shot session status retrieval. Returns the BB status string. */
export async function retrieveSessionStatus(sessionId: string): Promise<string> {
  const s = await client().sessions.retrieve(sessionId)
  return s.status
}

/**
 * Poll session status until RUNNING (or timeout). Newly created BB sessions
 * report RUNNING almost immediately, but the CDP wss endpoint sometimes
 * needs an extra ~1-3s to actually accept a client. Returns the final
 * status string.
 */
export async function waitForSessionRunning(
  sessionId: string,
  timeoutMs = 15000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let last = "UNKNOWN"
  while (Date.now() < deadline) {
    const s = await client().sessions.retrieve(sessionId)
    last = s.status
    if (s.status === "RUNNING") return s.status
    if (s.status === "ERROR" || s.status === "TIMED_OUT" || s.status === "COMPLETED") {
      throw new Error(`session ${s.status}`)
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return last
}

/**
 * List running sessions matching a userMetadata filter. Used by
 * stopAccountBrowser to release on-the-fly without persisting session ids.
 */
export async function listRunningSessionsByMetadata(
  match: Record<string, string>,
): Promise<Array<{ id: string }>> {
  const sessions = await client().sessions.list({
    status: "RUNNING",
    q: Object.entries(match)
      .map(([k, v]) => `user_metadata['${k}']:'${v}'`)
      .join(" AND "),
  })
  return sessions.map((s) => ({ id: s.id }))
}

/**
 * Returns the debuggerFullscreenUrl for iframe embed (UI-SPEC.md).
 *
 * T-17.5-03: caller MUST NOT log/toast/console-print the returned URL.
 * URL is unauthenticated (session-scoped token); session timeout bounds exposure.
 */
export async function getSessionDebugUrl(sessionId: string): Promise<string> {
  const d = await client().sessions.debug(sessionId)
  return d.debuggerFullscreenUrl
}

export async function releaseSession(sessionId: string): Promise<void> {
  try {
    await client().sessions.update(sessionId, {
      projectId: projectId(),
      status: "REQUEST_RELEASE",
    })
  } catch (err: unknown) {
    if (isNotFound(err)) return
    throw err
  }
}
