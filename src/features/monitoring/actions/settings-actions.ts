"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type SourceType =
  | "reddit_keyword"
  | "subreddit"
  | "linkedin_keyword"
  | "linkedin_company"
  | "linkedin_author"

function normalizeSubreddit(value: string): string | null {
  let normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (!normalized.startsWith("r/")) {
    normalized = `r/${normalized}`
  }
  if (!/^r\/\w+$/.test(normalized)) {
    return null
  }
  return normalized
}

function validate(
  value: string,
  signalType: SourceType,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = value.trim()
  if (signalType === "subreddit") {
    const normalized = normalizeSubreddit(trimmed)
    if (!normalized) {
      return { ok: false, error: "Invalid subreddit format (e.g., r/SaaS)" }
    }
    return { ok: true, value: normalized }
  }

  const lower = trimmed.toLowerCase()
  if (lower.length < 1) {
    return { ok: false, error: "Value must be at least 1 character" }
  }
  return { ok: true, value: lower }
}

export async function addSource(value: string, signalType: SourceType) {
  const result = validate(value, signalType)
  if (!result.ok) {
    return { error: result.error }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { data: existing } = await supabase
    .from("monitoring_signals")
    .select("id")
    .eq("user_id", user.id)
    .eq("signal_type", signalType)
    .eq("value", result.value)
    .limit(1)

  if (existing && existing.length > 0) {
    return { error: "Already added" }
  }

  const { error } = await supabase.from("monitoring_signals").insert({
    user_id: user.id,
    signal_type: signalType,
    value: result.value,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/signals")
  return { success: true }
}

export async function removeSource(id: string) {
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

  revalidatePath("/signals")
  return { success: true }
}
