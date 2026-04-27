"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  createSession,
  deleteContext,
  getSessionDebugUrl,
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
): Promise<
  | { success: true; accountId: string; contextId: string }
  | { success?: false; error: string }
> {
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
    // D17.5-07: connect/login flow uses 1800s timeout.
    const session = await createSession({
      contextId: browserProfile.browserbase_context_id,
      country: browserProfile.country_code as SupportedCountry,
      timeoutSeconds: 1800,
      keepAlive: false,
    })
    const debuggerFullscreenUrl = await getSessionDebugUrl(session.id)
    // T-17.5-03: never log debuggerFullscreenUrl or session.id.
    return {
      success: true,
      debuggerFullscreenUrl,
      loginUrl: ACCOUNT_LOGIN_URLS[account.platform],
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
 * Phase 17.5: Browserbase sessions auto-release on timeout; persistent context
 * flushes cookies on session end. No explicit stop needed. Function kept exported
 * for UI symmetry (Cancel button) but the body is now a no-op.
 */
export async function stopAccountBrowser(
  _accountId: string,
): Promise<{ success: boolean; error?: string }> {
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
