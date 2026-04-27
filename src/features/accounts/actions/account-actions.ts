"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  deleteProfile,
  startCloudBrowser,
  stopCloudBrowser,
} from "@/lib/gologin/client"
import {
  getBrowserProfileForAccount,
  getBrowserProfileById,
} from "@/features/browser-profiles/lib/get-browser-profile"
import { allocateBrowserProfile } from "@/features/browser-profiles/lib/allocator"

// Login URLs shown to the user in the connection flow. GoLogin's Cloud
// Browser web-viewer mode ignores profile startUrl, so the user navigates
// here manually — we surface the URL in the UI via startAccountBrowser return.
const ACCOUNT_LOGIN_URLS: Record<string, string> = {
  reddit: "https://www.reddit.com/login/",
  linkedin: "https://www.linkedin.com/login",
}

export async function connectAccount(
  platform: "reddit" | "linkedin",
  handle: string,
) {
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
    // D-01: country hardcoded 'US' in this phase. Future phases wire a real source here.
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
      profileId: result.gologinProfileId,
      cloudBrowserUrl: result.cloudBrowserUrl,
    }
  } catch (err) {
    // D-11: exact user-facing copy. Full err logged server-side.
    console.error("[connectAccount] allocation failed", {
      userId: user.id,
      platform,
      err,
    })
    return {
      error:
        "Could not set up the account right now — please try again in a moment.",
    }
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
  url?: string
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
    return { success: false, error: "Account not found" }
  }

  const browserProfile = await getBrowserProfileForAccount(accountId, supabase)
  if (!browserProfile) {
    return {
      success: false,
      error: "Account has no browser profile yet. Reconnect after the allocator ships.",
    }
  }

  try {
    const session = await startCloudBrowser(browserProfile.gologin_profile_id)
    return {
      success: true,
      url: session.remoteOrbitaUrl,
      loginUrl: ACCOUNT_LOGIN_URLS[account.platform],
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function stopAccountBrowser(
  accountId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const browserProfile = await getBrowserProfileForAccount(accountId, supabase)
  if (!browserProfile) {
    return { success: true }
  }

  try {
    await stopCloudBrowser(browserProfile.gologin_profile_id)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Marks the account's session as verified (user asserts they logged in via
 * the remote browser). We trust the user here because GoLogin's /browser/{id}/web
 * viewer mode does not expose a CDP endpoint we can use to inspect the page
 * server-side. The first real action (warmup scan, DM, like/follow) will
 * naturally fail via Haiku CU if the login wasn't actually completed, and
 * the health state machine will downgrade the account to "warning".
 *
 * Stores the assertion on the account record so the worker pipeline can
 * later gate outreach on session_verified_at presence.
 */
/**
 * Delete a social account. Also best-effort stops any running cloud browser
 * and deletes the underlying GoLogin profile so the user's GoLogin dashboard
 * stays clean. The DB row is deleted first — GoLogin calls are fire-and-forget
 * (failures are logged but don't block the UI).
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

  // Look up profile ID before deleting the row so we can clean up GoLogin.
  const { data: account } = await supabase
    .from("social_accounts")
    .select("browser_profile_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  let gologinProfileId: string | null = null
  if (account?.browser_profile_id) {
    const browserProfile = await getBrowserProfileById(
      account.browser_profile_id,
      supabase,
    )
    gologinProfileId = browserProfile?.gologin_profile_id ?? null
  }

  const { error } = await supabase
    .from("social_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id)

  if (error) return { success: false, error: error.message }

  // Best-effort GoLogin cleanup — don't fail the whole op if these 500.
  // Accounts with no browser_profile_id (Phase 16 transitional, D-04) skip cleanup.
  if (gologinProfileId) {
    try {
      await stopCloudBrowser(gologinProfileId)
    } catch {
      // ignore
    }
    try {
      await deleteProfile(gologinProfileId)
    } catch {
      // ignore
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
    // If the column doesn't exist yet, still succeed — worker pipeline will
    // handle the absence of the timestamp gracefully.
    if (!/column .*session_verified_at.* does not exist/i.test(error.message)) {
      return { success: false, verified: false, error: error.message }
    }
  }

  revalidatePath("/accounts")
  return { success: true, verified: true }
}
