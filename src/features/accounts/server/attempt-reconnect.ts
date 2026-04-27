"use server"

import { revalidatePath } from "next/cache"

import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"
import { createClient } from "@/lib/supabase/server"

/**
 * User-triggered recovery flow for accounts in `needs_reconnect` /
 * `captcha_required` (and any other degraded state). Runs the Reddit
 * preflight against the proxy-less about.json endpoint; on `ok`, clears
 * `health_status` back to `warmup` (if warmup not yet completed) or
 * `healthy`. Definitive `banned` results leave the row untouched and
 * surface a `still_banned` error for the UI toast (D-11). LinkedIn is
 * deferred (CONTEXT D-06) — returns `platform_unsupported`.
 */
export async function attemptReconnect(
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { data: account, error: accountError } = await supabase
    .from("social_accounts")
    .select("id, handle, platform, health_status, warmup_completed_at")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()
  if (accountError || !account) {
    return { success: false, error: "Account not found" }
  }

  // Reddit-only for this phase (CONTEXT D-06). LinkedIn parity deferred.
  if (account.platform !== "reddit") {
    return { success: false, error: "platform_unsupported" }
  }

  if (!account.handle) {
    return { success: false, error: "Account handle missing" }
  }

  const result = await runRedditPreflight({
    handle: account.handle,
    supabase,
    accountId: account.id,
  })

  if (result.kind === "banned") {
    return { success: false, error: "still_banned" }
  }
  if (result.kind === "transient") {
    return { success: false, error: "try_again" }
  }

  // result.kind === 'ok' — clear health_status. If warmup not yet
  // completed, return to 'warmup'; else 'healthy'.
  const nextStatus =
    account.warmup_completed_at == null ? "warmup" : "healthy"

  const { error: updateError } = await supabase
    .from("social_accounts")
    .update({ health_status: nextStatus })
    .eq("id", account.id)
    .eq("user_id", user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  revalidatePath("/accounts")
  revalidatePath("/")
  return { success: true }
}
