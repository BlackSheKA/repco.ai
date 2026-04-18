/**
 * Daily action limit checking and incrementing.
 *
 * Uses the check_and_increment_limit DB function for atomic
 * limit enforcement across concurrent workers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export async function checkAndIncrementLimit(
  supabase: SupabaseClient,
  accountId: string,
  actionType: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_and_increment_limit", {
    p_account_id: accountId,
    p_action_type: actionType,
  })

  if (error) return false
  return data === true
}

export async function getDailyUsage(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ dm_count: number; engage_count: number; reply_count: number }> {
  const { data } = await supabase
    .from("action_counts")
    .select("dm_count, engage_count, reply_count")
    .eq("account_id", accountId)
    .eq("date", new Date().toISOString().split("T")[0])
    .single()

  return data ?? { dm_count: 0, engage_count: 0, reply_count: 0 }
}
