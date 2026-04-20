"use server"

import Papa from "papaparse"

import { createClient } from "@/lib/supabase/server"

export async function exportProspectsCSV() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" as const }
  }

  const { data, error } = await supabase
    .from("prospects")
    .select(
      "handle, platform, pipeline_status, display_name, bio, notes, tags, created_at, updated_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return { error: "Failed to fetch prospects" as const }
  }

  const rows = (data ?? []).map((row) => ({
    handle: row.handle ?? "",
    platform: row.platform ?? "",
    pipeline_status: row.pipeline_status ?? "",
    display_name: row.display_name ?? "",
    bio: row.bio ?? "",
    notes: row.notes ?? "",
    tags: Array.isArray(row.tags) ? row.tags.join(", ") : "",
    created_at: row.created_at ?? "",
  }))

  const csv = Papa.unparse(rows, {
    header: true,
    columns: [
      "handle",
      "platform",
      "pipeline_status",
      "display_name",
      "bio",
      "notes",
      "tags",
      "created_at",
    ],
  })

  return { success: true as const, csv }
}
