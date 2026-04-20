"use server"

import { createClient } from "@/lib/supabase/server"

import type { GeneratedKeywords, OnboardingAnswers } from "../lib/types"

interface SaveOnboardingInput {
  answers: OnboardingAnswers
  generated: GeneratedKeywords
}

export async function saveOnboarding(
  input: SaveOnboardingInput
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const { answers, generated } = input

  // Upsert product profile (one per user — match on user_id)
  const { data: existingProfile } = await supabase
    .from("product_profiles")
    .select("id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle()

  const productPayload = {
    user_id: user.id,
    name: answers.productDescription.slice(0, 120),
    description: answers.productDescription,
    problem_solved: answers.targetCustomer,
    competitors: answers.competitors,
    keywords: generated.keywords,
    subreddits: generated.subreddits,
    updated_at: new Date().toISOString(),
  }

  if (existingProfile) {
    const { error: updateError } = await supabase
      .from("product_profiles")
      .update(productPayload)
      .eq("id", existingProfile.id)
    if (updateError) {
      return { error: updateError.message }
    }
  } else {
    const { error: insertError } = await supabase
      .from("product_profiles")
      .insert(productPayload)
    if (insertError) {
      return { error: insertError.message }
    }
  }

  // Seed monitoring_signals rows for keywords + subreddits
  // Merge competitor_keywords into keyword signals so "alternative to X" phrases
  // are actively monitored.
  const keywordSignals = [
    ...generated.keywords,
    ...generated.competitorKeywords,
  ].map((value) => ({
    user_id: user.id,
    signal_type: "reddit_keyword" as const,
    value: value.trim().toLowerCase(),
  }))

  const subredditSignals = generated.subreddits.map((value) => ({
    user_id: user.id,
    signal_type: "subreddit" as const,
    value: value.trim().toLowerCase(),
  }))

  const signalRows = [...keywordSignals, ...subredditSignals].filter(
    (r) => r.value.length > 0
  )

  if (signalRows.length > 0) {
    const { error: signalsError } = await supabase
      .from("monitoring_signals")
      .insert(signalRows)
    if (signalsError) {
      return { error: signalsError.message }
    }
  }

  // Mark onboarding complete on users row
  const { error: userError } = await supabase
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id)

  if (userError) {
    return { error: userError.message }
  }

  return { success: true }
}
