/**
 * Target isolation: ensures no two accounts contact the same prospect.
 *
 * Uses the unique index idx_prospects_target_isolation to prevent
 * race conditions during concurrent assignment.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// Check if any other account has already been assigned to this prospect
// If not, atomically assign this account
export async function checkAndAssignTarget(
  supabase: SupabaseClient,
  prospectId: string,
  accountId: string,
): Promise<{ allowed: boolean; error?: string }> {
  // 1. Check if prospect already has an assigned account
  const { data: prospect } = await supabase
    .from("prospects")
    .select("assigned_account_id")
    .eq("id", prospectId)
    .single()

  if (!prospect) return { allowed: false, error: "Prospect not found" }

  // 2. If already assigned to THIS account, allow
  if (prospect.assigned_account_id === accountId) return { allowed: true }

  // 3. If assigned to ANOTHER account, deny
  if (prospect.assigned_account_id !== null) {
    return {
      allowed: false,
      error: "Target already assigned to another account",
    }
  }

  // 4. Assign atomically (UNIQUE index prevents race conditions)
  const { error } = await supabase
    .from("prospects")
    .update({ assigned_account_id: accountId })
    .eq("id", prospectId)
    .is("assigned_account_id", null) // Optimistic lock

  if (error) return { allowed: false, error: error.message }
  return { allowed: true }
}
