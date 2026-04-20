"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export async function toggleAutoSend(enabled: boolean) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const { error } = await supabase
    .from("users")
    .update({ auto_send_followups: enabled })
    .eq("id", user.id)

  if (error) throw error

  revalidatePath("/settings")
  return { success: true }
}
