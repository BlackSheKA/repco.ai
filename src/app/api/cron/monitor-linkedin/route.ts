import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { logger } from "@/lib/logger"
import { runCanaryCheck } from "@/features/monitoring/lib/linkedin-canary"
import { runLinkedInIngestionForUser } from "@/features/monitoring/lib/linkedin-ingestion-pipeline"
import { classifyPendingSignals } from "@/features/monitoring/lib/classification-pipeline"
import type { MonitoringConfig } from "@/features/monitoring/lib/types"

export const runtime = "nodejs"
export const maxDuration = 300

const DEFAULT_APIFY_ACTOR = "apimaestro~linkedin-post-search-scraper"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Monitor-linkedin cron started", {
    correlationId,
    jobType: "monitor-linkedin",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // --- Canary gate --------------------------------------------------------
  const canaryResult = await runCanaryCheck()

  if (!canaryResult.ok) {
    Sentry.captureMessage(
      `LinkedIn canary failed: reason=${canaryResult.reason} resultCount=${canaryResult.resultCount}`,
      {
        level: "error",
        fingerprint: ["linkedin_canary_failure"],
        extra: {
          correlationId,
          canaryReason: canaryResult.reason,
          canaryCount: canaryResult.resultCount,
          errorMessage: canaryResult.errorMessage,
        },
      },
    )

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "failed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      error: `LinkedIn canary failed: ${canaryResult.reason}`,
      metadata: {
        cron: "monitor-linkedin",
        correlation_id: correlationId,
        silent_failure: true,
        canary_count: canaryResult.resultCount,
        canary_reason: canaryResult.reason,
      },
    })

    logger.error("Monitor-linkedin canary failed — aborting run", {
      correlationId,
      canaryReason: canaryResult.reason,
      canaryCount: canaryResult.resultCount,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "LinkedIn canary failed", reason: canaryResult.reason },
      { status: 500 },
    )
  }

  // --- User loop ----------------------------------------------------------
  try {
    const { data: activeUsers, error: usersError } = await supabase
      .from("monitoring_signals")
      .select("user_id")
      .eq("signal_type", "linkedin_keyword")
      .eq("active", true)

    if (usersError) throw usersError

    const userIds = [...new Set(activeUsers?.map((r) => r.user_id) ?? [])]

    let totalSignals = 0
    let usersProcessed = 0

    for (const userId of userIds) {
      try {
        const { data: signals } = await supabase
          .from("monitoring_signals")
          .select("signal_type, value")
          .eq("user_id", userId)
          .eq("active", true)

        const keywords = (signals ?? [])
          .filter((s) => s.signal_type === "linkedin_keyword")
          .map((s) => s.value)
        const competitors = (signals ?? [])
          .filter((s) => s.signal_type === "competitor")
          .map((s) => s.value)

        if (keywords.length === 0) {
          logger.info("Skipping user — no linkedin_keyword rows", {
            correlationId,
            userId,
          })
          continue
        }

        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("name, description")
          .eq("user_id", userId)
          .limit(1)

        const profile = profiles?.[0]

        const config: MonitoringConfig = {
          userId,
          keywords,
          subreddits: [],
          competitors,
          productName: profile?.name ?? "",
          productDescription: profile?.description ?? "",
        }

        const result = await runLinkedInIngestionForUser(config, supabase)
        totalSignals += result.signalCount
        usersProcessed++

        logger.info("User LinkedIn ingestion complete", {
          correlationId,
          userId,
          signalCount: result.signalCount,
          skippedCount: result.skippedCount,
          apifyRunId: result.apifyRunId,
        })
      } catch (userErr) {
        logger.error("User LinkedIn ingestion failed", {
          correlationId,
          userId,
          error:
            userErr instanceof Error ? userErr : new Error(String(userErr)),
          errorMessage:
            userErr instanceof Error ? userErr.message : String(userErr),
        })
      }
    }

    // Classify pending signals (shared pipeline — platform-agnostic)
    let classResult = { classified: 0, errors: 0 }
    try {
      classResult = await classifyPendingSignals(supabase)
      logger.info("LinkedIn classification complete", {
        correlationId,
        classified: classResult.classified,
        classificationErrors: classResult.errors,
      })
    } catch (classErr) {
      logger.error("LinkedIn classification failed", {
        correlationId,
        error:
          classErr instanceof Error ? classErr : new Error(String(classErr)),
        errorMessage:
          classErr instanceof Error ? classErr.message : String(classErr),
      })
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      metadata: {
        cron: "monitor-linkedin",
        correlation_id: correlationId,
        total_signals: totalSignals,
        users_processed: usersProcessed,
        canary_count: canaryResult.resultCount,
        classified: classResult.classified,
        classification_errors: classResult.errors,
        apify_actor: process.env.APIFY_ACTOR_ID ?? DEFAULT_APIFY_ACTOR,
      },
    })

    logger.info("Monitor-linkedin cron completed", {
      correlationId,
      usersProcessed,
      totalSignals,
      canaryCount: canaryResult.resultCount,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      usersProcessed,
      totalSignals,
      canaryCount: canaryResult.resultCount,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

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
        cron: "monitor-linkedin",
        correlation_id: correlationId,
      },
    })

    logger.error("Monitor-linkedin cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Monitor-linkedin failed", message: error.message },
      { status: 500 },
    )
  }
}
