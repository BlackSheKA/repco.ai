"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function addKeyword(keyword: string) {
  const trimmed = keyword.trim().toLowerCase()

  if (trimmed.length < 1) {
    return { error: "Keyword must be at least 1 character" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("monitoring_signals")
    .select("id")
    .eq("user_id", user.id)
    .eq("signal_type", "reddit_keyword")
    .eq("value", trimmed)
    .limit(1)

  if (existing && existing.length > 0) {
    return { error: "Keyword already added" }
  }

  const { error } = await supabase.from("monitoring_signals").insert({
    user_id: user.id,
    signal_type: "reddit_keyword" as const,
    value: trimmed,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}

export async function removeKeyword(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { error } = await supabase
    .from("monitoring_signals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}

export async function addSubreddit(subreddit: string) {
  let normalized = subreddit.trim().toLowerCase()

  // Auto-prepend r/ if missing
  if (!normalized.startsWith("r/")) {
    normalized = `r/${normalized}`
  }

  // Validate format
  if (!/^r\/\w+$/.test(normalized)) {
    return { error: "Invalid subreddit format (e.g., r/SaaS)" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("monitoring_signals")
    .select("id")
    .eq("user_id", user.id)
    .eq("signal_type", "subreddit")
    .eq("value", normalized)
    .limit(1)

  if (existing && existing.length > 0) {
    return { error: "Subreddit already added" }
  }

  const { error } = await supabase.from("monitoring_signals").insert({
    user_id: user.id,
    signal_type: "subreddit" as const,
    value: normalized,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}

export async function removeSubreddit(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { error } = await supabase
    .from("monitoring_signals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  return { success: true }
}
