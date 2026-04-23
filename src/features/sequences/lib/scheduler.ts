// AUDIT(13-04): no-change — findDueFollowUps is platform-agnostic. Filters only
// on pipeline_status='contacted' + sequence_stopped=false. LinkedIn prospects whose
// DM completed land in pipeline_status='contacted' (worker.ts line 576-578) and are
// eligible for followup_dm identically to Reddit prospects. pipeline_status='unreachable'
// (LNKD-06) is naturally excluded by the .eq('contacted') filter — unreachable and
// contacted are mutually exclusive enum values. Verified 2026-04-23 for LNKD-05.
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  FOLLOW_UP_SCHEDULE,
  type DueFollowUp,
  type FollowUpStep,
} from "./types"

/**
 * Determine the action status to use when creating a follow-up DM.
 *
 * When the user has `auto_send_followups = true`, follow-ups are pre-approved
 * and will be executed without manual approval. Otherwise they land in the
 * approval queue.
 */
export function getFollowUpStatus(
  autoSendEnabled: boolean,
): "pending_approval" | "approved" {
  return autoSendEnabled ? "approved" : "pending_approval"
}

/**
 * Returns an ISO timestamp 24 hours from now, used as the `expires_at` value
 * when creating follow-up DM actions.
 */
export function getFollowUpExpiresAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Determine the next follow-up step for a prospect based on completed actions.
 *
 * Walks FOLLOW_UP_SCHEDULE in order and returns the first step that:
 *   1. Has not already been completed
 *   2. Has had its dayOffset reached (daysSinceInitialDm >= dayOffset)
 *
 * Returns null if the sequence is complete (all 3 steps done) or no step is due.
 */
export function getNextFollowUpStep(
  completedSteps: number[],
  daysSinceInitialDm: number,
): FollowUpStep | null {
  for (const entry of FOLLOW_UP_SCHEDULE) {
    if (completedSteps.includes(entry.step)) continue
    if (daysSinceInitialDm >= entry.dayOffset) return entry.step
    // Not yet due for this step — don't skip ahead to later entries
    return null
  }
  return null
}

/**
 * Find all prospects whose next follow-up is due.
 *
 * Returns DueFollowUp[] for prospects where:
 *   - pipeline_status = 'contacted'
 *   - sequence_stopped = false
 *   - No pending/approved followup_dm actions exist
 *   - Enough days have passed since the initial DM for the next step
 */
export async function findDueFollowUps(
  supabase: SupabaseClient,
): Promise<DueFollowUp[]> {
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select(
      `id, user_id, handle, platform, intent_signal_id, assigned_account_id, pipeline_status, sequence_stopped`,
    )
    .eq("pipeline_status", "contacted")
    .eq("sequence_stopped", false)

  if (error || !prospects?.length) return []

  const result: DueFollowUp[] = []

  for (const prospect of prospects as Array<{
    id: string
    user_id: string
    handle: string | null
    platform: string
    intent_signal_id: string
    assigned_account_id: string
  }>) {
    // Skip if any pending/approved followup_dm already exists for this prospect
    const { data: pendingActions } = await supabase
      .from("actions")
      .select("id")
      .eq("prospect_id", prospect.id)
      .eq("action_type", "followup_dm")
      .in("status", ["pending_approval", "approved"])
      .limit(1)

    if (pendingActions && pendingActions.length > 0) continue

    // Fetch all completed initial DM + follow-up actions for this prospect
    const { data: completedActions } = await supabase
      .from("actions")
      .select("action_type, sequence_step, executed_at, created_at")
      .eq("prospect_id", prospect.id)
      .in("action_type", ["dm", "followup_dm"])
      .eq("status", "completed")
      .order("created_at", { ascending: true })

    if (!completedActions?.length) continue

    const initialDm = (
      completedActions as Array<{
        action_type: string
        sequence_step: number | null
        executed_at: string | null
      }>
    ).find((a) => a.action_type === "dm")
    if (!initialDm?.executed_at) continue

    const daysSinceInitialDm = Math.floor(
      (Date.now() - new Date(initialDm.executed_at).getTime()) /
        (1000 * 60 * 60 * 24),
    )

    const completedSteps = (
      completedActions as Array<{
        action_type: string
        sequence_step: number | null
      }>
    )
      .filter((a) => a.action_type === "followup_dm" && a.sequence_step != null)
      .map((a) => a.sequence_step as number)

    const nextStep = getNextFollowUpStep(completedSteps, daysSinceInitialDm)
    if (!nextStep) continue

    const scheduleEntry = FOLLOW_UP_SCHEDULE.find((s) => s.step === nextStep)
    if (!scheduleEntry) continue

    result.push({
      prospectId: prospect.id,
      userId: prospect.user_id,
      step: nextStep,
      angle: scheduleEntry.angle,
      intentSignalId: prospect.intent_signal_id,
      accountId: prospect.assigned_account_id,
      prospectHandle: prospect.handle ?? "",
      platform: prospect.platform,
    })
  }

  return result
}
