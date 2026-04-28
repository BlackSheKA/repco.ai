"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  createSession,
  deleteContext,
  getSessionDebugUrl,
  listRunningSessionsByMetadata,
  releaseSession,
  retrieveSessionStatus,
} from "@/lib/browserbase/client"
import {
  getBrowserProfileForAccount,
  getBrowserProfileById,
} from "@/features/browser-profiles/lib/get-browser-profile"
import { allocateBrowserProfile } from "@/features/browser-profiles/lib/allocator"
import type { SupportedCountry } from "@/features/browser-profiles/lib/country-map"

// Login URLs surfaced to the UI; Browserbase navigates server-side, but we
// expose the URL as a copy/paste fallback if needed.
const ACCOUNT_LOGIN_URLS: Record<string, string> = {
  reddit: "https://www.reddit.com/login/",
  linkedin: "https://www.linkedin.com/login",
}

// D-11 user-facing copy. Never expose vendor names or HTTP codes.
const D11_COPY =
  "Could not set up the account right now — please try again in a moment."

export async function connectAccount(
  platform: "reddit" | "linkedin",
  handle: string,
): Promise<{
  success?: boolean
  accountId?: string
  contextId?: string
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // LinkedIn flow skips upfront handle (extracted post-login). Use placeholder.
  const effectiveHandle =
    platform === "linkedin" && !handle.trim()
      ? `linkedin-${user.id.slice(0, 8)}`
      : handle

  try {
    // D-01: country hardcoded "US" in this phase.
    const result = await allocateBrowserProfile({
      userId: user.id,
      platform,
      handle: effectiveHandle,
      country: "US",
      supabase,
    })
    return {
      success: true,
      accountId: result.socialAccountId,
      contextId: result.browserbaseContextId,
    }
  } catch (err) {
    // Full err logged server-side; vendor names never leak to the user.
    console.error("[connectAccount] allocation failed", {
      userId: user.id,
      platform,
      err,
    })
    return { error: D11_COPY }
  }
}

export async function skipWarmup(accountId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("social_accounts")
    .update({
      health_status: "healthy",
      warmup_day: 0,
      warmup_completed_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/accounts")
  return { success: true }
}

export async function startAccountBrowser(accountId: string): Promise<{
  success: boolean
  debuggerFullscreenUrl?: string
  loginUrl?: string
  sessionId?: string
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { data: account } = await supabase
    .from("social_accounts")
    .select("browser_profile_id, platform")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  if (!account) {
    return { success: false, error: D11_COPY }
  }

  const browserProfile = await getBrowserProfileForAccount(accountId, supabase)
  if (!browserProfile) {
    return { success: false, error: D11_COPY }
  }

  try {
    // D17.5-07: connect/login flow uses 1800s timeout. keepAlive=true
    // because we connect+disconnect via Playwright CDP to navigate to
    // loginUrl below — Browserbase treats Playwright `browser.close()` as
    // REQUEST_RELEASE, and even disconnect can race the lifecycle. With
    // keepAlive=true the session survives until its 1800s timeout. We
    // explicitly release it from stopAccountBrowser when the user finishes.
    const session = await createSession({
      contextId: browserProfile.browserbase_context_id,
      country: browserProfile.country_code as SupportedCountry,
      timeoutSeconds: 1800,
      // keepAlive=true: server-side initial nav opens its own CDP connection
      // and calls browser.close() afterwards. Without keepAlive, that close
      // would also end the BB session before the user iframe even attaches.
      // With keepAlive, the session stays RUNNING until either its 1800s
      // timeout OR an explicit releaseSession() from stopAccountBrowser.
      keepAlive: true,
      userMetadata: { accountId, kind: "connect_flow" },
    })

    // Browserbase sessions start at about:blank. Navigate the existing tab to
    // the platform login URL via CDP so the embedded iframe lands on the right
    // page. NOTE: calling browser.close() on a CDP-connected Browserbase
    // session terminates the session entirely (Browserbase treats Playwright
    // close as REQUEST_RELEASE). We MUST NOT close — just disconnect by
    // letting the client go out of scope. The session keeps running until its
    // own 1800s timeout.
    const loginUrl = ACCOUNT_LOGIN_URLS[account.platform]
    if (loginUrl) {
      try {
        // DYNAMIC import: a top-level `import { chromium } from "playwright-core"`
        // gets bundled by Turbopack in the Next.js dev server in a way that
        // breaks the CDP WebSocket handshake against Browserbase ("Target
        // page, context or browser has been closed"). Loading playwright-core
        // at request time bypasses Turbopack and matches the standalone
        // .mjs repro that verified this exact pattern works.
        const { chromium } = await import("playwright-core")
        const browser = await chromium.connectOverCDP(session.connectUrl)
        const context = browser.contexts()[0] ?? (await browser.newContext())
        const page = context.pages()[0] ?? (await context.newPage())
        await page.goto(loginUrl, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        })
        // Do NOT close the page or browser. We want the page to stay open
        // on `loginUrl` so the iframe (which connects via debuggerFullscreenUrl)
        // displays the login form to the user. `browser.close()` would close
        // the page in the BB session ("no pages found") and `page.close()`
        // alone would clear our work. With keepAlive=true the BB session
        // stays RUNNING until stopAccountBrowser releases it; the orphaned
        // wss client is harmless and Node will GC it.
      } catch (navErr) {
        // Best effort: iframe falls back to about:blank with the address bar.
        console.warn("[startAccountBrowser] initial nav failed", {
          platform: account.platform,
          message:
            navErr instanceof Error ? navErr.message : String(navErr),
        })
      }
    }

    const debuggerFullscreenUrl = await getSessionDebugUrl(session.id)
    // T-17.5-03: never log debuggerFullscreenUrl. session.id is returned to
    // the client so it can poll liveness directly via retrieveSessionStatus.
    return {
      success: true,
      debuggerFullscreenUrl,
      loginUrl,
      sessionId: session.id,
    }
  } catch (err) {
    console.error("[startAccountBrowser] failed", {
      userId: user.id,
      accountId,
      // err.message only — no debuggerFullscreenUrl or context id leakage.
      message: err instanceof Error ? err.message : String(err),
    })
    return { success: false, error: D11_COPY }
  }
}

/**
 * Phase 17.5: connect-flow sessions are created with keepAlive=true so the
 * Playwright CDP nav-to-loginUrl handshake doesn't accidentally release the
 * session. We need an explicit REQUEST_RELEASE here when the user finishes
 * (or cancels) the connect flow so the slot frees immediately rather than
 * waiting for the 1800s timeout.
 *
 * Best-effort: we look up the latest running session on the account's context
 * and ask BB to release it. We don't track session IDs in the DB (per
 * D17.5-09 — session lifecycle is owned by BB).
 */
/**
 * Returns whether a specific Browserbase session is still RUNNING. Polled by
 * ConnectionFlow to detect idle-timeout and surface a recovery UI ("session
 * expired, click Retry") instead of a frozen iframe. Direct retrieve is
 * faster and more reliable than the list-by-metadata path (BB indexes
 * sessions for list asynchronously, so freshly-created sessions can show as
 * "missing" for ~minutes).
 */
export async function getSessionAliveStatus(
  sessionId: string,
): Promise<{ alive: boolean; status?: string }> {
  if (!sessionId) return { alive: false }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { alive: false }
  try {
    const status = await retrieveSessionStatus(sessionId)
    return { alive: status === "RUNNING", status }
  } catch {
    // Treat probe failures as alive — better than spuriously flipping the
    // iframe to error on a transient BB API hiccup.
    return { alive: true }
  }
}

export async function stopAccountBrowser(
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: true }
  // List + release every RUNNING connect-flow session tagged with this
  // accountId. Best-effort: errors are swallowed so Cancel never blocks.
  try {
    const sessions = await listRunningSessionsByMetadata({
      accountId,
      kind: "connect_flow",
    })
    await Promise.allSettled(sessions.map((s) => releaseSession(s.id)))
  } catch (err) {
    console.warn("[stopAccountBrowser] release failed", {
      accountId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
  return { success: true }
}

/**
 * Delete a social account. Refcount-based cleanup: if this was the last
 * social_account using the underlying browser_profile, also delete the
 * browser_profiles row and the Browserbase context. Otherwise leave the
 * profile + context alone (D-02 reuse — still in use by other accounts).
 */
export async function deleteAccount(accountId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  // Look up the browser_profile + context id BEFORE deleting the account row.
  const { data: account } = await supabase
    .from("social_accounts")
    .select("browser_profile_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  let browserProfileId: string | null = account?.browser_profile_id ?? null
  let browserbaseContextId: string | null = null
  if (browserProfileId) {
    const profile = await getBrowserProfileById(browserProfileId, supabase)
    browserbaseContextId = profile?.browserbase_context_id ?? null
  }

  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)

  if (error) return { success: false, error: D11_COPY }

  // Refcount: if any other social_accounts still reference this browser_profile,
  // leave it alone. Otherwise delete the row + Browserbase context (D-10 best-effort).
  if (browserProfileId) {
    const { count } = await supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("browser_profile_id", browserProfileId)

    if ((count ?? 0) === 0) {
      await supabase
        .from("browser_profiles")
        .delete()
        .eq("id", browserProfileId)
        .then(() => undefined, () => undefined)
      if (browserbaseContextId) {
        await deleteContext(browserbaseContextId).catch(() => {})
      }
    }
  }

  revalidatePath("/accounts")
  return { success: true }
}

export async function verifyAccountSession(accountId: string): Promise<{
  success: boolean
  verified: boolean
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return { success: false, verified: false, error: "Not authenticated" }

  const { error } = await supabase
    .from("social_accounts")
    .update({ session_verified_at: new Date().toISOString() })
    .eq("id", accountId)
    .eq("user_id", user.id)

  if (error) {
    if (!/column .*session_verified_at.* does not exist/i.test(error.message)) {
      return { success: false, verified: false, error: error.message }
    }
  }

  revalidatePath("/accounts")
  return { success: true, verified: true }
}
