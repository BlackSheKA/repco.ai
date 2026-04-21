import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 30

const LIVE_STATS_ID = "00000000-0000-0000-0000-000000000001"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("refresh-live-stats started", {
    correlationId,
    jobType: "refresh_live_stats",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString()

    // Run all 3 aggregate queries in parallel
    const [signalsRes, dmsRes, repliesRes] = await Promise.all([
      // signals_last_hour + signals_last_24h + active_users (all from intent_signals)
      // Fetch rows (not COUNT) to filter signals_last_hour in JS — avoids 2 DB round-trips
      // Only detected_at + user_id fetched so payload stays small even with growth
      supabase
        .from("intent_signals")
        .select("detected_at, user_id")
        .gte("detected_at", twentyFourHoursAgo),

      // dms_sent_24h — COUNT only
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .in("action_type", ["dm", "followup_dm"])
        .eq("status", "completed")
        .gte("executed_at", twentyFourHoursAgo),

      // replies_24h — COUNT only
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .gte("replied_detected_at", twentyFourHoursAgo),
    ])

    if (signalsRes.error) throw signalsRes.error
    if (dmsRes.error) throw dmsRes.error
    if (repliesRes.error) throw repliesRes.error

    const signals24h = signalsRes.data ?? []
    const signals_last_24h = signals24h.length
    const signals_last_hour = signals24h.filter(
      (s) => s.detected_at >= oneHourAgo,
    ).length
    const active_users = new Set(signals24h.map((s) => s.user_id)).size

    const dms_sent_24h = dmsRes.count ?? 0
    const replies_24h = repliesRes.count ?? 0
    const conversion_rate =
      dms_sent_24h > 0
        ? Math.round((replies_24h / dms_sent_24h) * 100 * 100) / 100
        : 0

    // UPSERT into the single seeded live_stats row
    const { error: upsertError } = await supabase.from("live_stats").upsert(
      {
        id: LIVE_STATS_ID,
        signals_last_hour,
        signals_last_24h,
        active_users,
        dms_sent_24h,
        replies_24h,
        conversion_rate,
        updated_at: now.toISOString(),
      },
      { onConflict: "id" },
    )

    if (upsertError) throw upsertError

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      metadata: {
        cron: "refresh-live-stats",
        signals_last_hour,
        signals_last_24h,
        active_users,
        dms_sent_24h,
        replies_24h,
        conversion_rate,
        correlation_id: correlationId,
      },
    })

    logger.info("refresh-live-stats completed", {
      correlationId,
      signals_last_hour,
      signals_last_24h,
      active_users,
      dms_sent_24h,
      replies_24h,
      conversion_rate,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      signals_last_hour,
      signals_last_24h,
      active_users,
      dms_sent_24h,
      replies_24h,
      conversion_rate,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("refresh-live-stats failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "refresh-live-stats failed", message: error.message },
      { status: 500 },
    )
  }
}
