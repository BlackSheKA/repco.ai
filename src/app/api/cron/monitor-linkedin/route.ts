import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { logger } from "@/lib/logger"
import { runCanaryCheck } from "@/features/monitoring/lib/linkedin-canary"
import { runLinkedInIngestionForUser } from "@/features/monitoring/lib/linkedin-ingestion-pipeline"
import { classifyPendingSignals } from "@/features/monitoring/lib/classification-pipeline"
import {
  effectiveLinkedInActorId,
  startAsyncLinkedInSearch,
} from "@/features/monitoring/lib/linkedin-adapter"
import type { MonitoringConfig } from "@/features/monitoring/lib/types"

export const runtime = "nodejs"
export const maxDuration = 300

// Production deployments use the async webhook flow so cron returns fast
// (<5s) and Apify drives ingestion via /api/webhooks/apify on completion.
// Local dev (`development` branch is excluded from Vercel deploys) keeps the
// synchronous .call() path — there's no public URL for Apify to POST back to.
function isAsyncEnv(): boolean {
  return process.env.VERCEL_ENV === "production"
}

function webhookUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  if (!base) throw new Error("Cannot determine webhook base URL")
  return `${base}/api/webhooks/apify`
}

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
      errorMessage: canaryResult.errorMessage,
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
      .in("signal_type", [
        "linkedin_keyword",
        "linkedin_company",
        "linkedin_author",
      ])
      .eq("active", true)

    if (usersError) throw usersError

    const userIds = [...new Set(activeUsers?.map((r) => r.user_id) ?? [])]

    let totalSignals = 0
    let usersProcessed = 0
    let runsStarted = 0

    const useAsync = isAsyncEnv()
    const hookUrl = useAsync ? webhookUrl() : ""
    const hookSecret = process.env.APIFY_WEBHOOK_SECRET ?? ""
    if (useAsync && !hookSecret) {
      throw new Error(
        "APIFY_WEBHOOK_SECRET must be set for async monitor flow",
      )
    }

    for (const userId of userIds) {
      try {
        const { data: signals } = await supabase
          .from("monitoring_signals")
          .select("signal_type, value")
          .eq("user_id", userId)
          .eq("active", true)

        const linkedinSignalTypes = new Set([
          "linkedin_keyword",
          "linkedin_company",
          "linkedin_author",
        ])
        const keywords = (signals ?? [])
          .filter((s) => linkedinSignalTypes.has(s.signal_type))
          .map((s) => s.value)
        const competitors = (signals ?? [])
          .filter((s) => s.signal_type === "competitor")
          .map((s) => s.value)

        if (keywords.length === 0) {
          logger.info("Skipping user — no linkedin source rows", {
            correlationId,
            userId,
          })
          continue
        }

        if (useAsync) {
          const { runId } = await startAsyncLinkedInSearch(
            keywords,
            hookUrl,
            hookSecret,
          )
          const { error: insertErr } = await supabase
            .from("apify_runs")
            .insert({
              run_id: runId,
              user_id: userId,
              platform: "linkedin" as const,
              metadata: {
                cron: "monitor-linkedin",
                correlation_id: correlationId,
              },
            })
          if (insertErr) {
            // Apify started but we couldn't record — webhook will reject as
            // unknown runId. Surface at error severity for Sentry. Don't
            // count as a processed user since the data is effectively lost.
            logger.error("Failed to insert LinkedIn apify_runs row", {
              correlationId,
              userId,
              runId,
              error: insertErr,
              errorMessage: insertErr.message,
            })
          } else {
            runsStarted++
            usersProcessed++
            logger.info("LinkedIn async run started", {
              correlationId,
              userId,
              runId,
            })
          }
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

    // In async mode classification runs in the webhook per completed run.
    if (useAsync) {
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
          mode: "async",
          users_processed: usersProcessed,
          runs_started: runsStarted,
          canary_count: canaryResult.resultCount,
        },
      })
      logger.info("Monitor-linkedin cron started async runs", {
        correlationId,
        usersProcessed,
        runsStarted,
        durationMs,
      })
      await logger.flush()
      return NextResponse.json({
        ok: true,
        mode: "async",
        usersProcessed,
        runsStarted,
        canaryCount: canaryResult.resultCount,
        durationMs,
      })
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
        apify_actor: effectiveLinkedInActorId(),
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
