"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { generateDM, stripDashes } from "@/features/actions/lib/dm-generation"

export async function approveAction(
  actionId: string,
  editedContent?: string,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const updateData: Record<string, unknown> = {
    status: "approved",
    approved_at: new Date().toISOString(),
  }
  if (editedContent) {
    updateData.final_content = stripDashes(editedContent)
  }

  const { error } = await supabase
    .from("actions")
    .update(updateData)
    .eq("id", actionId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")

  if (error) return { error: error.message }
  revalidatePath("/")
  return { success: true }
}

const SaveEditsSchema = z.object({
  actionId: z.string().uuid(),
  editedContent: z
    .string()
    .trim()
    .min(1, "Content cannot be empty")
    .max(2000, "Content too long"),
})

export async function saveEdits(actionId: string, editedContent: string) {
  const parsed = SaveEditsSchema.safeParse({ actionId, editedContent })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("actions")
    .update({ drafted_content: stripDashes(parsed.data.editedContent) })
    .eq("id", parsed.data.actionId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")

  if (error) return { error: error.message }
  revalidatePath("/")
  return { success: true }
}

export async function rejectAction(actionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("actions")
    .update({ status: "rejected" })
    .eq("id", actionId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")

  if (error) return { error: error.message }
  revalidatePath("/")
  return { success: true }
}

export async function regenerateAction(actionId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // 1. Get current action with prospect + signal data
  const { data: action } = await supabase
    .from("actions")
    .select("*, prospects!inner(handle, intent_signal_id)")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .single()
  if (!action) return { error: "Action not found" }

  // 2. Get signal for context
  const { data: signal } = await supabase
    .from("intent_signals")
    .select("post_content, suggested_angle")
    .eq("id", action.prospects.intent_signal_id)
    .single()

  // 3. Get product profile
  const { data: profile } = await supabase
    .from("product_profiles")
    .select("description")
    .eq("user_id", user.id)
    .maybeSingle()

  // 4. Regenerate with different angle instruction
  const dmResult = await generateDM({
    postContent: signal?.post_content ?? "",
    productDescription: profile?.description ?? "A helpful product",
    suggestedAngle: `Try a completely different approach than: "${action.drafted_content?.slice(0, 50)}..."`,
  })

  if (!dmResult.passed) {
    return { error: "Regeneration failed quality control" }
  }

  // 5. Update action with new draft
  const { error } = await supabase
    .from("actions")
    .update({ drafted_content: dmResult.content, final_content: null })
    .eq("id", actionId)
    .eq("user_id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/")
  return { success: true, content: dmResult.content }
}
