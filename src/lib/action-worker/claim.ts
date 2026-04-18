/**
 * Atomic action claiming via Supabase RPC.
 *
 * Uses the claim_action DB function which performs
 * FOR UPDATE SKIP LOCKED to prevent duplicate execution.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Action } from "@/features/actions/lib/types"

export async function claimAction(
  supabase: SupabaseClient,
  actionId: string,
): Promise<{
  claimed: boolean
  action: Action | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc("claim_action", {
    p_action_id: actionId,
  })

  if (error) {
    return { claimed: false, action: null, error: error.message }
  }

  if (!data || (data as unknown[]).length === 0) {
    return {
      claimed: false,
      action: null,
      error: "Already claimed or not approved",
    }
  }

  return {
    claimed: true,
    action: (data as Action[])[0],
    error: null,
  }
}
