"use server"

import { createClient } from "@/lib/supabase/server"

import { isValidStageTransition } from "../lib/pipeline"
import type { PipelineStage } from "../lib/types"

export async function updateProspectStage(
  prospectId: string,
  newStage: PipelineStage,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const { data: current, error: fetchError } = await supabase
    .from("prospects")
    .select("pipeline_status")
    .eq("id", prospectId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !current) {
    return { error: "Prospect not found" as const }
  }

  const from = current.pipeline_status as PipelineStage
  if (!isValidStageTransition(from, newStage)) {
    return { error: "Invalid stage transition" as const }
  }

  const { error: updateError } = await supabase
    .from("prospects")
    .update({
      pipeline_status: newStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)
    .eq("user_id", user.id)

  if (updateError) {
    return { error: "Failed to update prospect stage" as const }
  }

  return { success: true as const, newStage }
}

export async function updateProspectNotes(
  prospectId: string,
  notes: string,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const { error } = await supabase
    .from("prospects")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", prospectId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "Failed to update notes" as const }
  }

  return { success: true as const }
}

export async function updateProspectTags(
  prospectId: string,
  tags: string[],
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const { error } = await supabase
    .from("prospects")
    .update({ tags, updated_at: new Date().toISOString() })
    .eq("id", prospectId)
    .eq("user_id", user.id)

  if (error) {
    return { error: "Failed to update tags" as const }
  }

  return { success: true as const }
}
