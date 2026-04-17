import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { runIngestionForUser } from "@/features/monitoring/lib/ingestion-pipeline"
import type { MonitoringConfig } from "@/features/monitoring/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Monitor-reddit cron started", {
    correlationId,
    jobType: "monitor-reddit",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    // Get all users with active monitoring signals
    const { data: activeUsers, error: usersError } = await supabase
      .from("monitoring_signals")
      .select("user_id")
      .eq("active", true)

    if (usersError) throw usersError

    // Deduplicate user_ids
    const userIds = [...new Set(activeUsers?.map((r) => r.user_id) ?? [])]

    let totalSignals = 0
    let usersProcessed = 0

    for (const userId of userIds) {
      try {
        // Fetch user's monitoring config
        const { data: signals } = await supabase
          .from("monitoring_signals")
          .select("signal_type, value")
          .eq("user_id", userId)
          .eq("active", true)

        const keywords = (signals ?? [])
          .filter((s) => s.signal_type === "reddit_keyword")
          .map((s) => s.value)
        const subreddits = (signals ?? [])
          .filter((s) => s.signal_type === "subreddit")
          .map((s) => s.value)
        const competitors = (signals ?? [])
          .filter((s) => s.signal_type === "competitor")
          .map((s) => s.value)

        // Skip users with no keywords or subreddits configured
        if (keywords.length === 0 || subreddits.length === 0) {
          logger.info("Skipping user — no keywords or subreddits", {
            correlationId,
            userId,
          })
          continue
        }

        // Fetch product profile for context
        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("name, description")
          .eq("user_id", userId)
          .limit(1)

        const profile = profiles?.[0]

        const config: MonitoringConfig = {
          userId,
          keywords,
          subreddits,
          competitors,
          productName: profile?.name ?? "",
          productDescription: profile?.description ?? "",
        }

        const result = await runIngestionForUser(config, supabase)
        totalSignals += result.signalCount
        usersProcessed++

        logger.info("User ingestion complete", {
          correlationId,
          userId,
          signalCount: result.signalCount,
          skippedCount: result.skippedCount,
        })
      } catch (userErr) {
        logger.error("User ingestion failed", {
          correlationId,
          userId,
          error:
            userErr instanceof Error ? userErr : new Error(String(userErr)),
          errorMessage:
            userErr instanceof Error ? userErr.message : String(userErr),
        })
      }
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    // Log the cron run to job_logs
    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      metadata: {
        cron: "monitor-reddit",
        correlation_id: correlationId,
        total_signals: totalSignals,
        users_processed: usersProcessed,
      },
    })

    logger.info("Monitor-reddit cron completed", {
      correlationId,
      usersProcessed,
      totalSignals,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      usersProcessed,
      totalSignals,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    // Log failure to job_logs
    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "failed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      error: error.message,
      metadata: {
        cron: "monitor-reddit",
        correlation_id: correlationId,
      },
    })

    logger.error("Monitor-reddit cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Monitor-reddit failed", message: error.message },
      { status: 500 },
    )
  }
}
