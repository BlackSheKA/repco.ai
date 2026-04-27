"use server"

import { revalidatePath } from "next/cache"
import { logger } from "@/lib/logger"
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
  try {
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

    // Dedup matches a normalized value: validate() lowercases keywords/
    // companies/authors and normalizeSubreddit produces canonical lowercase
    // r/<name>, so both insert and lookup compare bytes against the same
    // canonical form. Migration 00022 also adds a partial UNIQUE index
    // (user_id, signal_type, value) WHERE active=true as a backstop in case
    // this SELECT ever fails silently.
    const { data: existing, error: dedupErr } = await supabase
      .from("monitoring_signals")
      .select("id")
      .eq("user_id", user.id)
      .eq("signal_type", signalType)
      .eq("value", result.value)
      .limit(1)

    if (dedupErr) {
      logger.error("addSource dedup query failed", {
        signalType,
        userId: user.id,
        error: dedupErr,
        errorMessage: dedupErr.message,
      })
      return { error: "Could not check duplicates. Try again." }
    }

    if (existing && existing.length > 0) {
      return { error: "Already added" }
    }

    const { error } = await supabase.from("monitoring_signals").insert({
      user_id: user.id,
      signal_type: signalType,
      value: result.value,
    })

    if (error) {
      // 23505 = unique_violation: the UNIQUE index caught a duplicate that
      // slipped past the dedup SELECT (race or stale cache). Treat as the
      // same user-facing message as the explicit dedup hit above.
      if (error.code === "23505") {
        return { error: "Already added" }
      }
      return { error: error.message }
    }

    revalidatePath("/signals")
    return { success: true }
  } catch (err) {
    logger.error("addSource action failed", {
      signalType,
      error: err instanceof Error ? err : new Error(String(err)),
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return { error: "Something went wrong. Try again." }
  }
}

export async function removeSource(id: string) {
  try {
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
  } catch (err) {
    logger.error("removeSource action failed", {
      sourceId: id,
      error: err instanceof Error ? err : new Error(String(err)),
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return { error: "Something went wrong. Try again." }
  }
}
