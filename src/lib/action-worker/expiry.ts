// AUDIT(13-04): no-change — expiry excludes ONLY connection_request (line 22);
// followup_dm expires uniformly for both reddit and linkedin accounts via the
// .neq("action_type","connection_request") filter. No platform guard present or
// needed. Verified 2026-04-23 for LNKD-05.
/**
 * Expiry logic for stale pending_approval actions.
 *
 * Actions older than 12 hours that are still pending_approval
 * are marked as expired, and their prospects are reset to detected.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export async function expireStaleActions(
  supabase: SupabaseClient,
): Promise<{ expiredCount: number; error?: string }> {
  const twelveHoursAgo = new Date(
    Date.now() - 12 * 60 * 60 * 1000,
  ).toISOString()

  // Find stale actions — connection_request rows do NOT expire (LinkedIn requests sit indefinitely).
  const { data: staleActions, error: selectError } = await supabase
    .from("actions")
    .select("id, prospect_id")
    .eq("status", "pending_approval")
    .neq("action_type", "connection_request")
    .lt("created_at", twelveHoursAgo)

  if (selectError) {
    return { expiredCount: 0, error: selectError.message }
  }

  if (!staleActions || staleActions.length === 0) {
    return { expiredCount: 0 }
  }

  const actionIds = staleActions.map((a) => a.id)
  const prospectIds = [
    ...new Set(staleActions.map((a) => a.prospect_id)),
  ]

  // Mark actions as expired
  const { error: updateError } = await supabase
    .from("actions")
    .update({ status: "expired" })
    .in("id", actionIds)

  if (updateError) {
    return { expiredCount: 0, error: updateError.message }
  }

  // Reset prospects to detected
  await supabase
    .from("prospects")
    .update({ pipeline_status: "detected" })
    .in("id", prospectIds)

  return { expiredCount: staleActions.length }
}
