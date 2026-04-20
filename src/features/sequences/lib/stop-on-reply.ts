import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Handle reply detection for a prospect:
 *   1. Cancel all pending/approved followup_dm actions
 *   2. Update prospect pipeline_status to 'replied'
 *   3. Set sequence_stopped = true
 *   4. Store reply snippet and detection timestamp
 *
 * Returns true if the reply was processed, false if prospect already replied
 * or prospect was not found.
 */
export async function handleReplyDetected(
  supabase: SupabaseClient,
  prospectId: string,
  replySnippet: string,
): Promise<boolean> {
  // Idempotency guard — check current status first
  const { data: prospect } = await supabase
    .from("prospects")
    .select("pipeline_status")
    .eq("id", prospectId)
    .single()

  if (!prospect) return false
  if ((prospect as { pipeline_status: string }).pipeline_status === "replied") {
    return false
  }

  // 1. Cancel all pending follow-ups
  await supabase
    .from("actions")
    .update({ status: "cancelled" })
    .eq("prospect_id", prospectId)
    .eq("action_type", "followup_dm")
    .in("status", ["pending_approval", "approved"])

  // 2. Update prospect (single UPDATE for all sequence-stop fields)
  await supabase
    .from("prospects")
    .update({
      pipeline_status: "replied",
      sequence_stopped: true,
      last_reply_snippet: replySnippet,
      replied_detected_at: new Date().toISOString(),
    })
    .eq("id", prospectId)

  return true
}
