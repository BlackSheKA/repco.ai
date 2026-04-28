import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as Sentry from "@sentry/nextjs"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 30

// Two zombie classes need different cutoffs:
//   pending:    cron INSERTed row, Apify never delivered (or webhook rejected
//               the call). Generous 30 min — Reddit Puppeteer scrapes legit
//               run 4-5 minutes.
//   processing: webhook claimed the row but the final UPDATE never landed
//               (transient PG error, function crashed mid-ingest). The route
//               has maxDuration=300, so anything stuck >10 min is dead.
//               Critical because signals may already be inserted; we mark
//               'expired' with a distinct error so operator triage knows the
//               row needs re-ingestion judgment, not a fresh re-run.
const PENDING_ZOMBIE_MINUTES = 30
const PROCESSING_ZOMBIE_MINUTES = 10

interface ZombieRow {
  run_id: string
  user_id: string
  platform: string
  started_at: string
  status?: string
}

// Loose supabase type — the route uses createClient() with no Database
// generic; the parameter shape varies between supabase-js minor versions
// and this helper only calls the chain methods we actually use.
type SupabaseLike = {
  from: (table: string) => {
    update: (vals: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        lt: (col: string, val: unknown) => {
          select: (cols: string) => Promise<{
            data: unknown[] | null
            error: { message: string } | null
          }>
        }
      }
    }
  }
}

async function expireBucket(
  supabase: SupabaseLike,
  fromStatus: "pending" | "processing",
  thresholdMinutes: number,
  correlationId: string,
): Promise<{ rows: ZombieRow[]; error?: { message: string } }> {
  const cutoff = new Date(
    Date.now() - thresholdMinutes * 60 * 1000,
  ).toISOString()
  const { data, error } = await supabase
    .from("apify_runs")
    .update({
      status: "expired",
      ingested_at: new Date().toISOString(),
      error:
        fromStatus === "pending"
          ? `Webhook never received within ${thresholdMinutes} min`
          : `Ingest crashed mid-flight; row stuck in 'processing' >${thresholdMinutes} min`,
    })
    .eq("status", fromStatus)
    .lt("started_at", cutoff)
    .select("run_id, user_id, platform, started_at")
  if (error) {
    logger.error("Apify zombie cleanup query failed", {
      correlationId,
      fromStatus,
      error,
    })
    return { rows: [], error }
  }
  return {
    rows: ((data ?? []) as ZombieRow[]).map((r) => ({
      ...r,
      status: fromStatus,
    })),
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const pendingResult = await expireBucket(
    supabase as unknown as SupabaseLike,
    "pending",
    PENDING_ZOMBIE_MINUTES,
    correlationId,
  )
  if (pendingResult.error) {
    await logger.flush()
    return NextResponse.json(
      { error: "Cleanup failed", message: pendingResult.error.message },
      { status: 500 },
    )
  }

  const processingResult = await expireBucket(
    supabase as unknown as SupabaseLike,
    "processing",
    PROCESSING_ZOMBIE_MINUTES,
    correlationId,
  )
  if (processingResult.error) {
    await logger.flush()
    return NextResponse.json(
      { error: "Cleanup failed", message: processingResult.error.message },
      { status: 500 },
    )
  }

  const allZombies = [...pendingResult.rows, ...processingResult.rows]
  const expiredCount = allZombies.length

  if (expiredCount > 0) {
    // Split byPlatform per origin status — a 'processing' zombie means signals
    // may already be in intent_signals (mid-ingest crash), which is more
    // serious than a 'pending' zombie (Apify never started).
    const byPlatform = allZombies.reduce<
      Record<string, { pending: number; processing: number }>
    >((acc, r) => {
      const bucket = (acc[r.platform] ??= { pending: 0, processing: 0 })
      if (r.status === "processing") bucket.processing += 1
      else bucket.pending += 1
      return acc
    }, {})

    const processingCount = processingResult.rows.length
    Sentry.captureMessage(
      `Apify zombie runs expired: pending=${pendingResult.rows.length} processing=${processingCount}`,
      {
        // 'processing' zombies are operationally worse — partial ingest,
        // potentially duplicate signals on re-run. Bump severity when present.
        level: processingCount > 0 ? "error" : "warning",
        fingerprint: [
          processingCount > 0
            ? "apify_zombie_runs_processing"
            : "apify_zombie_runs",
        ],
        extra: {
          correlationId,
          expiredCount,
          byPlatform,
          zombies: allZombies.slice(0, 50),
        },
      },
    )
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  logger.info("Apify zombie cleanup complete", {
    correlationId,
    expiredCount,
    pendingExpired: pendingResult.rows.length,
    processingExpired: processingResult.rows.length,
    durationMs,
  })
  await logger.flush()

  return NextResponse.json({
    ok: true,
    expiredCount,
    pendingExpired: pendingResult.rows.length,
    processingExpired: processingResult.rows.length,
    durationMs,
  })
}
