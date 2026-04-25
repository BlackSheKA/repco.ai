import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 30

// An Apify run still 'pending' after this many minutes is treated as a zombie:
// either Apify never delivered the webhook, or the webhook was rejected/lost.
// We mark such rows 'expired' so they stop accumulating and surface in Sentry
// for investigation. Threshold is generous because Reddit Puppeteer scrapes
// can run 4-5 minutes legitimately.
const ZOMBIE_THRESHOLD_MINUTES = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()
  const cutoff = new Date(
    Date.now() - ZOMBIE_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: zombies, error } = await supabase
    .from("apify_runs")
    .update({
      status: "expired",
      ingested_at: new Date().toISOString(),
      error: `Webhook never received within ${ZOMBIE_THRESHOLD_MINUTES} min`,
    })
    .eq("status", "pending")
    .lt("started_at", cutoff)
    .select("run_id, user_id, platform, started_at")

  if (error) {
    logger.error("Apify zombie cleanup query failed", {
      correlationId,
      error,
    })
    await logger.flush()
    return NextResponse.json(
      { error: "Cleanup failed", message: error.message },
      { status: 500 },
    )
  }

  const expiredCount = zombies?.length ?? 0

  if (expiredCount > 0) {
    Sentry.captureMessage(
      `Apify zombie runs expired: count=${expiredCount}`,
      {
        level: "warning",
        fingerprint: ["apify_zombie_runs"],
        extra: {
          correlationId,
          expiredCount,
          runIds: zombies?.map((r) => r.run_id),
        },
      },
    )
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  logger.info("Apify zombie cleanup complete", {
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
}
