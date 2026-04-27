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
  try {
    await client().contexts.delete(contextId)
  } catch (err: unknown) {
    if (isNotFound(err)) return
    throw err
  }
}

export interface CreateSessionArgs {
  contextId: string
  country: SupportedCountry
  /** Per D17.5-07: connect=1800s, per-action=300s, Reddit CU=180s. */
  timeoutSeconds: number
  /** Default false — sessions auto-release on timeout. */
  keepAlive?: boolean
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
    browserSettings: { context: { id: args.contextId, persist: true } },
    proxies: [
      { type: "browserbase", geolocation: { country: args.country } },
    ],
    timeout: args.timeoutSeconds,
    keepAlive: args.keepAlive ?? false,
  })
  return { id: s.id, connectUrl: s.connectUrl }
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
