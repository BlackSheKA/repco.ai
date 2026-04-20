"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import {
  createProfile,
  startCloudBrowser,
  stopCloudBrowser,
} from "@/lib/gologin/client"

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
    .select("gologin_profile_id")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()

  if (!account?.gologin_profile_id) {
    return { success: false, error: "No GoLogin profile on this account" }
  }

  try {
    const session = await startCloudBrowser(account.gologin_profile_id)
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
