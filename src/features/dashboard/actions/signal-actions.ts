"use server"

import { createClient } from "@/lib/supabase/server"

export async function contactSignal(signalId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: signal, error: fetchError } = await supabase
    .from("intent_signals")
    .select("*")
    .eq("id", signalId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !signal) {
    return { error: "Signal not found" }
  }

  const { error: insertError } = await supabase.from("prospects").insert({
    user_id: user.id,
    platform: signal.platform,
    handle: signal.author_handle,
    profile_url: signal.author_profile_url,
    intent_signal_id: signalId,
    pipeline_status: "detected",
  })

  if (insertError) {
    return { error: insertError.message }
  }

  const { error: updateError } = await supabase
    .from("intent_signals")
    .update({ status: "actioned" })
    .eq("id", signalId)
    .eq("user_id", user.id)

  if (updateError) {
    return { error: updateError.message }
  }

  return { success: true }
}

export async function dismissSignal(signalId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { error } = await supabase
    .from("intent_signals")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", signalId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

export async function restoreSignal(signalId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { error } = await supabase
    .from("intent_signals")
    .update({ dismissed_at: null })
    .eq("id", signalId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
