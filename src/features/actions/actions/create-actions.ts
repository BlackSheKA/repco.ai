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

  // 1. Read everything we need up front. No writes yet.
  const [{ data: signal }, { data: account }, { data: productProfile }] =
    await Promise.all([
      supabase
        .from("intent_signals")
        .select("*")
        .eq("id", signalId)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("social_accounts")
        .select("id,platform")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("product_profiles")
        .select("description")
        .eq("user_id", user.id)
        .maybeSingle(),
    ])

  if (!signal) return { error: "Signal not found" }

  const platformAccount = (account ?? []).find(
    (a: { platform: string; id: string }) => a.platform === signal.platform,
  )

  // 2. Generate DM FIRST. If this fails (missing API key, QC rejects both
  //    attempts, etc.) we have not yet created any records, so nothing to
  //    roll back. This is the single most likely failure point.
  const dmResult = await generateDM({
    postContent: `${signal.post_content ?? ""}`,
    productDescription: productProfile?.description ?? "A helpful product",
    suggestedAngle: signal.suggested_angle ?? "",
  })

  if (!dmResult.passed) {
    return {
      error: `Could not draft a DM that passes quality control${
        dmResult.failureReason ? ": " + dmResult.failureReason : ""
      }`,
    }
  }

  // 3. Only now start writing. Get or create the prospect.
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

  // 4. Create engage actions (auto-approved, ACTN-01)
  const engageActions = [
    {
      user_id: user.id,
      prospect_id: prospectId,
      account_id: platformAccount?.id ?? null,
      action_type: "like" as const,
      status: "approved" as const,
    },
    {
      user_id: user.id,
      prospect_id: prospectId,
      account_id: platformAccount?.id ?? null,
      action_type: "follow" as const,
      status: "approved" as const,
    },
  ]
  await supabase.from("actions").insert(engageActions)

  // 5. Create DM action (ACTN-04). 12h expiry per CONTEXT (ACTN-10).
  const expiresAt = new Date(
    Date.now() + 12 * 60 * 60 * 1000,
  ).toISOString()
  await supabase.from("actions").insert({
    user_id: user.id,
    prospect_id: prospectId,
    account_id: platformAccount?.id ?? null,
    action_type: "dm",
    status: "pending_approval",
    drafted_content: dmResult.content,
    expires_at: expiresAt,
  })

  // 6. Mark signal actioned.
  await supabase
    .from("intent_signals")
    .update({ status: "actioned" })
    .eq("id", signalId)

  revalidatePath("/")
  return { success: true }
}
