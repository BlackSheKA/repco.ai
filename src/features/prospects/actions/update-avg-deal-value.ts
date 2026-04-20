"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export async function updateAvgDealValue(
  value: number | null,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { error: "Avg deal value must be a non-negative number" }
  }

  const { error } = await supabase
    .from("users")
    .update({ avg_deal_value: value })
    .eq("id", user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/settings")
  revalidatePath("/")
  return { error: null }
}
