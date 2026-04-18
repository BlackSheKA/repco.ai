"use server"

import { createClient } from "@/lib/supabase/server"
import { createActionsFromSignal } from "@/features/actions/actions/create-actions"

export async function contactSignal(signalId: string) {
  return createActionsFromSignal(signalId)
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
