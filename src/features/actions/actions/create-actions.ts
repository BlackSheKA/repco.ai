"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { generateDM } from "@/features/actions/lib/dm-generation"

export async function createActionsFromSignal(signalId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // 1. Get signal data
  const { data: signal } = await supabase
    .from("intent_signals")
    .select("*")
    .eq("id", signalId)
    .eq("user_id", user.id)
    .single()
  if (!signal) return { error: "Signal not found" }

  // 2. Get or create prospect
  const { data: existingProspect } = await supabase
    .from("prospects")
    .select("id")
    .eq("user_id", user.id)
    .eq("handle", signal.author_handle)
    .eq("platform", signal.platform)
    .maybeSingle()

  let prospectId = existingProspect?.id
  if (!prospectId) {
    const { data: newProspect } = await supabase
      .from("prospects")
      .insert({
        user_id: user.id,
        platform: signal.platform,
        handle: signal.author_handle,
        profile_url: signal.author_profile_url,
        intent_signal_id: signalId,
        pipeline_status: "detected",
      })
      .select("id")
      .single()
    prospectId = newProspect?.id
  }
  if (!prospectId) return { error: "Failed to create prospect" }

  // 3. Get user's first active account for this platform
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", signal.platform)
    .eq("active", true)
    .limit(1)
    .maybeSingle()

  // 4. Create engage actions (auto-approved, ACTN-01)
  const engageActions = [
    {
      user_id: user.id,
      prospect_id: prospectId,
      account_id: account?.id ?? null,
      action_type: "like" as const,
      status: "approved" as const,
    },
    {
      user_id: user.id,
      prospect_id: prospectId,
      account_id: account?.id ?? null,
      action_type: "follow" as const,
      status: "approved" as const,
    },
  ]
  await supabase.from("actions").insert(engageActions)

  // 5. Generate DM draft
  const { data: productProfile } = await supabase
    .from("product_profiles")
    .select("description")
    .eq("user_id", user.id)
    .maybeSingle()

  const dmResult = await generateDM({
    postContent: `${signal.post_content ?? ""}`,
    productDescription: productProfile?.description ?? "A helpful product",
    suggestedAngle: signal.suggested_angle ?? "",
  })

  // 6. Create DM action (pending_approval or drop if QC failed, ACTN-04)
  if (dmResult.passed) {
    const expiresAt = new Date(
      Date.now() + 4 * 60 * 60 * 1000,
    ).toISOString()
    await supabase.from("actions").insert({
      user_id: user.id,
      prospect_id: prospectId,
      account_id: account?.id ?? null,
      action_type: "dm",
      status: "pending_approval",
      drafted_content: dmResult.content,
      expires_at: expiresAt,
    })
  }

  // 7. Update signal status
  await supabase
    .from("intent_signals")
    .update({ status: "actioned" })
    .eq("id", signalId)

  revalidatePath("/")
  return { success: true }
}
