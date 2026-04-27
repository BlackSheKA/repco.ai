import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { z } from "zod"
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

// How recently the cron must have INSERTed a runId before we consider an
// "unknown runId" webhook to be a real cross-deployment leftover (200 OK)
// vs a possible read-after-write race (503 with retry-after so Apify retries).
const RECENT_INSERT_GRACE_MS = 60_000

// Apify status values we know how to handle. Anything outside this set is
// rejected at the parse boundary so future Apify-introduced statuses don't
// silently fall through to the success branch.
const ApifyRunStatusSchema = z.enum([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
])

const ApifyWebhookPayloadSchema = z.object({
  eventType: z.string().optional(),
  resource: z.object({
    id: z.string().min(1),
    status: ApifyRunStatusSchema,
    defaultDatasetId: z.string().optional(),
  }),
})

type ApifyRunStatus = z.infer<typeof ApifyRunStatusSchema>

function authHeaderMatches(received: string | null): boolean {
  const secret = process.env.APIFY_WEBHOOK_SECRET
  if (!secret || !received) return false
  const expected = `Bearer ${secret}`
  if (received.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  // ---- 1. Authorize ------------------------------------------------------
  const authHeader = request.headers.get("authorization")
  if (!authHeaderMatches(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = ApifyWebhookPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    // Schema drift on Apify's side or a genuinely malformed call. Log at
    // error severity so Sentry surfaces it — the webhook will keep failing
    // until the schema is updated.
    logger.error("Apify webhook payload failed validation", {
      correlationId,
      issues: parsed.error.issues,
    })
    await logger.flush()
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { eventType } = parsed.data
  const runId = parsed.data.resource.id
  const status: ApifyRunStatus = parsed.data.resource.status

  // ---- 2. Atomically claim the row ---------------------------------------
  // Conditional UPDATE on status='pending' returns the row only if we won
  // the race. Solves: (a) duplicate webhook deliveries, (b) idempotency on
  // any terminal state — completed/failed/expired all short-circuit here
  // instead of just 'completed' (so a late delivery on an already-zombied
  // run doesn't resurrect it), (c) two parallel deliveries can't both
  // double-classify because only one row gets claimed.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: claimed, error: claimErr } = await supabase
    .from("apify_runs")
    .update({ status: "processing" })
    .eq("run_id", runId)
    .eq("status", "pending")
    .select("user_id, platform, started_at")
    .maybeSingle()

  if (claimErr) {
    logger.error("Apify webhook claim failed", {
      correlationId,
      runId,
      error: claimErr,
      errorMessage: claimErr.message,
    })
    await logger.flush()
    return NextResponse.json({ error: "Claim failed" }, { status: 500 })
  }

  if (!claimed) {
    // Either the runId is unknown OR another delivery already claimed it.
    // Look up the row to differentiate so we react correctly.
    const { data: existing } = await supabase
      .from("apify_runs")
      .select("status, started_at")
      .eq("run_id", runId)
      .maybeSingle()

    if (!existing) {
      // Two cases collapse here: (a) read-after-write race — cron INSERTed
      // seconds ago, replication lag hides it from our SELECT; (b) genuine
      // cross-deployment leftover. We can't tell them apart without an age
      // signal, so we 503 with Retry-After. Apify's retry policy is bounded,
      // so cross-deployment runs simply exhaust retries and stop. The race
      // case resolves on the next attempt once the row is visible.
      logger.warn("Apify webhook for unknown runId", {
        correlationId,
        runId,
        eventType,
      })
      await logger.flush()
      return NextResponse.json(
        { error: "Unknown runId — possibly not yet committed" },
        { status: 503, headers: { "Retry-After": "10" } },
      )
    }

    // Row exists but in a non-pending state — duplicate or terminal.
    logger.info("Apify webhook duplicate — run already in terminal state", {
      correlationId,
      runId,
      existingStatus: existing.status,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // ---- 3. Branch on Apify status -----------------------------------------
  if (status === "FAILED" || status === "ABORTED") {
    const { error: updateErr } = await supabase
      .from("apify_runs")
      .update({
        status: "failed",
        ingested_at: new Date().toISOString(),
        error: `Apify run ${status}`,
      })
      .eq("run_id", runId)

    if (updateErr) {
      logger.error("Apify webhook fail-status update failed", {
        correlationId,
        runId,
        error: updateErr,
        errorMessage: updateErr.message,
      })
      await logger.flush()
      return NextResponse.json(
        { error: "Update failed" },
        { status: 500 },
      )
    }

    logger.error("Apify run failed", {
      correlationId,
      runId,
      apifyStatus: status,
      platform: claimed.platform,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, status: "failed" })
  }

  // SUCCEEDED and TIMED-OUT both have partial data worth reading.
  let signalCount = 0
  let ingestError: string | null = null
  try {
    if (claimed.platform === "reddit") {
      const posts = await fetchRedditRunPosts(runId)
      const result = await ingestRedditPosts(
        posts,
        claimed.user_id,
        supabase,
      )
      signalCount = result.signalCount
    } else if (claimed.platform === "linkedin") {
      const posts = await fetchLinkedInRunPosts(runId)
      const result = await ingestLinkedInPosts(
        posts,
        claimed.user_id,
        runId,
        supabase,
      )
      signalCount = result.signalCount
    } else {
      throw new Error(`Unknown platform: ${claimed.platform}`)
    }
  } catch (err) {
    ingestError = err instanceof Error ? err.message : String(err)
    logger.error("Apify webhook ingest failed", {
      correlationId,
      runId,
      platform: claimed.platform,
      apifyStatus: status,
      error: err instanceof Error ? err : new Error(String(err)),
      errorMessage: ingestError,
    })
  }

  // ---- 4. Classify (best-effort, doesn't block run finalization) ---------
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

  // ---- 5. Finalize run ---------------------------------------------------
  const { error: finalUpdateErr } = await supabase
    .from("apify_runs")
    .update({
      status: ingestError ? "failed" : "completed",
      ingested_at: new Date().toISOString(),
      signal_count: signalCount,
      error: ingestError,
    })
    .eq("run_id", runId)

  if (finalUpdateErr) {
    logger.error("Apify webhook finalize update failed", {
      correlationId,
      runId,
      error: finalUpdateErr,
      errorMessage: finalUpdateErr.message,
    })
    // Return 500 so Apify retries; the conditional claim at the top will
    // detect the row is now in 'processing' state and short-circuit on retry.
    await logger.flush()
    return NextResponse.json(
      { error: "Finalize failed" },
      { status: 500 },
    )
  }

  logger.info("Apify webhook ingest complete", {
    correlationId,
    runId,
    platform: claimed.platform,
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
