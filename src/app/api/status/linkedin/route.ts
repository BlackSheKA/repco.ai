import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * Status endpoint consumed by the dashboard staleness banner.
 * Returns the latest successful monitor-linkedin cron finish timestamp
 * plus hours-since. Requires an authenticated user.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("job_logs")
    .select("started_at, finished_at, status, metadata")
    .eq("job_type", "monitor")
    .eq("status", "completed")
    .contains("metadata", { cron: "monitor-linkedin" })
    .order("finished_at", { ascending: false })
    .limit(1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const lastRun = data?.[0] ?? null
  const lastSuccessAt = lastRun?.finished_at ?? null
  const hoursAgo = lastSuccessAt
    ? (Date.now() - new Date(lastSuccessAt).getTime()) / 3600000
    : null

  return NextResponse.json({ lastSuccessAt, hoursAgo })
}
