"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  createProfile,
  startCloudBrowser,
  stopCloudBrowser,
} from "@/lib/gologin/client"
import {
  connectToProfile,
  disconnectProfile,
} from "@/lib/gologin/adapter"

const LOGIN_URLS: Record<string, string> = {
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

  // 1. Create GoLogin Cloud profile
  let profileId: string
  try {
    profileId = await createProfile(handle)
  } catch (err) {
    return { error: `Failed to create browser profile: ${err}` }
  }

  // 2. Insert social account record
  const { data, error } = await supabase
    .from("social_accounts")
    .insert({
      user_id: user.id,
      platform,
      handle,
      gologin_profile_id: profileId,
      health_status: "warmup",
      warmup_day: 1,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/accounts")
  return { success: true, accountId: data.id, profileId }
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
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { data: account } = await supabase
    .from("social_accounts")
    .select("gologin_profile_id, platform")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  if (!account?.gologin_profile_id) {
    return { success: false, error: "No GoLogin profile on this account" }
  }

  const profileId = account.gologin_profile_id

  try {
    const session = await startCloudBrowser(profileId)

    const loginUrl =
      LOGIN_URLS[account.platform] ?? "https://www.google.com"
    try {
      const connection = await connectToProfile(profileId)
      try {
        await connection.page.goto(loginUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
      } finally {
        await disconnectProfile(connection.browser)
      }
    } catch {
      // Navigate failed -- user can navigate manually in the remote browser.
      // The remote session itself is still valid.
    }

    return { success: true, url: session.remoteOrbitaUrl }
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

  const { data: account } = await supabase
    .from("social_accounts")
    .select("gologin_profile_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  if (!account?.gologin_profile_id) {
    return { success: true }
  }

  try {
    await stopCloudBrowser(account.gologin_profile_id)
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
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
  if (!user) return { success: false, verified: false, error: "Not authenticated" }

  // 1. Get account's GoLogin profile ID
  const { data: account } = await supabase
    .from("social_accounts")
    .select("gologin_profile_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  if (!account?.gologin_profile_id) {
    return { success: false, verified: false, error: "No GoLogin profile" }
  }

  // 2. Connect to GoLogin profile via Playwright CDP
  let connection
  try {
    connection = await connectToProfile(account.gologin_profile_id)
  } catch (err) {
    return {
      success: false,
      verified: false,
      error: `GoLogin connection failed: ${err}`,
    }
  }

  try {
    // 3. Navigate to Reddit and check login status
    await connection.page.goto("https://www.reddit.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // 4. Check for logged-in indicator via page.evaluate
    const isLoggedIn = await connection.page.evaluate(() => {
      const loginButton = document.querySelector(
        '[data-testid="login-button"], a[href*="login"]',
      )
      const userMenu = document.querySelector(
        '[data-testid="user-drawer-button"], #USER_DROPDOWN_ID, [aria-label*="profile"]',
      )
      return userMenu !== null || loginButton === null
    })

    return { success: true, verified: isLoggedIn }
  } catch (err) {
    return {
      success: false,
      verified: false,
      error: `Verification failed: ${err}`,
    }
  } finally {
    await disconnectProfile(connection.browser)
  }
}
