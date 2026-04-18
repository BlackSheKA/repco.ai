/**
 * Cron endpoint to expire stale pending_approval actions.
 *
 * Runs every hour. Actions older than 12 hours that are still
 * pending_approval are marked as expired, and their associated
 * prospects are reset to 'detected' status.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { expireStaleActions } from "@/lib/action-worker/expiry"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Expire actions cron started", {
    correlationId,
    jobType: "expire_actions",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const { expiredCount, error } = await expireStaleActions(supabase)

    if (error) {
      throw new Error(error)
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
        cron: "expire-actions",
        expired_count: expiredCount,
        correlation_id: correlationId,
      },
    })

    logger.info("Expire actions cron completed", {
      correlationId,
      expiredCount,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      expiredCount,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("Expire actions cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Expire actions failed", message: error.message },
      { status: 500 },
    )
  }
}
