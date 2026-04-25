import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import {
  fetchRunPosts as fetchRedditRunPosts,
} from "@/features/monitoring/lib/reddit-adapter"
import {
  fetchLinkedInRunPosts,
} from "@/features/monitoring/lib/linkedin-adapter"
import { ingestRedditPosts } from "@/features/monitoring/lib/ingestion-pipeline"
import { ingestLinkedInPosts } from "@/features/monitoring/lib/linkedin-ingestion-pipeline"
import { classifyPendingSignals } from "@/features/monitoring/lib/classification-pipeline"

export const runtime = "nodejs"
export const maxDuration = 300

interface ApifyWebhookPayload {
  eventType?: string
  resource?: {
    id?: string
    status?: string
    defaultDatasetId?: string
  }
}

export async function POST(request: Request) {
  // ---- 1. Authorize ------------------------------------------------------
  const authHeader = request.headers.get("authorization")
  const expected = `Bearer ${process.env.APIFY_WEBHOOK_SECRET ?? ""}`
  if (
    !process.env.APIFY_WEBHOOK_SECRET ||
    !authHeader ||
    authHeader !== expected
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  let payload: ApifyWebhookPayload
  try {
    payload = (await request.json()) as ApifyWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const runId = payload.resource?.id
  const status = payload.resource?.status
  const eventType = payload.eventType
  if (!runId || !status) {
    return NextResponse.json(
      { error: "Missing run id or status" },
      { status: 400 },
    )
  }

  // ---- 2. Lookup pending run --------------------------------------------
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: pending, error: lookupErr } = await supabase
    .from("apify_runs")
    .select("user_id, platform, status")
    .eq("run_id", runId)
    .maybeSingle()

  if (lookupErr) {
    logger.error("Apify webhook lookup failed", {
      correlationId,
      runId,
      error: lookupErr,
    })
    await logger.flush()
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
  }

  if (!pending) {
    // Unknown run — likely from a different deployment or already processed.
    logger.info("Apify webhook for unknown runId — ignoring", {
      correlationId,
      runId,
      eventType,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, ignored: true })
  }

  // Idempotency: don't re-ingest a run we've already finished.
  if (pending.status === "completed") {
    logger.info("Apify webhook duplicate — already completed", {
      correlationId,
      runId,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // ---- 3. Branch on status ----------------------------------------------
  if (status === "FAILED" || status === "ABORTED") {
    await supabase
      .from("apify_runs")
      .update({
        status: "failed",
        ingested_at: new Date().toISOString(),
        error: `Apify run ${status}`,
      })
      .eq("run_id", runId)

    logger.error("Apify run failed", {
      correlationId,
      runId,
      apifyStatus: status,
      platform: pending.platform,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, status: "failed" })
  }

  // SUCCEEDED and TIMED-OUT both have partial data worth reading.
  let signalCount = 0
  let ingestError: string | null = null
  try {
    if (pending.platform === "reddit") {
      const posts = await fetchRedditRunPosts(runId)
      const result = await ingestRedditPosts(
        posts,
        pending.user_id,
        supabase,
      )
      signalCount = result.signalCount
    } else if (pending.platform === "linkedin") {
      const posts = await fetchLinkedInRunPosts(runId)
      const result = await ingestLinkedInPosts(
        posts,
        pending.user_id,
        runId,
        supabase,
      )
      signalCount = result.signalCount
    } else {
      throw new Error(`Unknown platform: ${pending.platform}`)
    }
  } catch (err) {
    ingestError = err instanceof Error ? err.message : String(err)
  }

  // ---- 4. Classify (best-effort) ----------------------------------------
  let classified = 0
  try {
    const result = await classifyPendingSignals(supabase)
    classified = result.classified
  } catch (err) {
    logger.error("Apify webhook classification failed", {
      correlationId,
      runId,
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }

  // ---- 5. Mark run complete ---------------------------------------------
  await supabase
    .from("apify_runs")
    .update({
      status: ingestError ? "failed" : "completed",
      ingested_at: new Date().toISOString(),
      signal_count: signalCount,
      error: ingestError,
    })
    .eq("run_id", runId)

  logger.info("Apify webhook ingest complete", {
    correlationId,
    runId,
    platform: pending.platform,
    apifyStatus: status,
    signalCount,
    classified,
    ingestError,
  })
  await logger.flush()

  return NextResponse.json({
    ok: true,
    runId,
    signalCount,
    classified,
    ingestError,
  })
}
