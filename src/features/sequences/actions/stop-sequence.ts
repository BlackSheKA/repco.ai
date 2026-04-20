"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export async function stopSequence(prospectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Unauthorized")
  }

  // Cancel all pending/approved follow-ups for this prospect.
  const { error: cancelError } = await supabase
    .from("actions")
    .update({ status: "cancelled" })
    .eq("prospect_id", prospectId)
    .eq("user_id", user.id)
    .eq("action_type", "followup_dm")
    .in("status", ["pending_approval", "approved"])

  if (cancelError) {
    throw new Error(`Failed to cancel follow-ups: ${cancelError.message}`)
  }

  // Mark the sequence as stopped on the prospect record.
  const { error: prospectError } = await supabase
    .from("prospects")
    .update({ sequence_stopped: true })
    .eq("id", prospectId)
    .eq("user_id", user.id)

  if (prospectError) {
    throw new Error(
      `Failed to stop sequence: ${prospectError.message}`,
    )
  }

  revalidatePath("/")
  return { success: true }
}
