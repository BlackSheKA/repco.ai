import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { formatInTimeZone } from "date-fns-tz"

import { logger } from "@/lib/logger"
import { sendDailyDigest } from "@/features/notifications/lib/send-daily-digest"

export const runtime = "nodejs"
export const maxDuration = 60

interface UserRow {
  id: string
  email: string | null
  timezone: string | null
  subscription_active: boolean | null
  trial_ends_at: string | null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Digest cron started", {
    correlationId,
    jobType: "digest",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let sent = 0
  let skipped = 0
  let failed = 0

  try {
    const nowIso = new Date().toISOString()

    // Eligible users: subscription_active OR trial still active
    const [subRes, trialRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, email, timezone, subscription_active, trial_ends_at")
        .eq("subscription_active", true),
      supabase
        .from("users")
        .select("id, email, timezone, subscription_active, trial_ends_at")
        .gt("trial_ends_at", nowIso),
    ])

    if (subRes.error) throw subRes.error
    if (trialRes.error) throw trialRes.error

    const byId = new Map<string, UserRow>()
    for (const u of [
      ...(subRes.data ?? []),
      ...(trialRes.data ?? []),
    ] as UserRow[]) {
      byId.set(u.id, u)
    }
    const users = [...byId.values()]

    const now = new Date()

    for (const user of users) {
      try {
        const tz = user.timezone ?? "UTC"
        const localHour = parseInt(formatInTimeZone(now, tz, "H"), 10)

        // Only send if current hour in user timezone is 8
        if (localHour !== 8) {
          skipped += 1
          continue
        }

        if (!user.email) {
          skipped += 1
          continue
        }

        // Compute yesterday's TZ-aware boundaries for this user
        const yesterdayDateStr = formatInTimeZone(
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
          tz,
          "yyyy-MM-dd",
        )
        const startOfYesterdayLocalUtc = new Date(
          formatInTimeZone(
            new Date(`${yesterdayDateStr}T00:00:00`),
            tz,
            "yyyy-MM-dd'T'HH:mm:ssXXX",
          ),
        ).toISOString()
        const todayDateStr = formatInTimeZone(now, tz, "yyyy-MM-dd")
        const endOfYesterdayLocalUtc = new Date(
          formatInTimeZone(
            new Date(`${todayDateStr}T00:00:00`),
            tz,
            "yyyy-MM-dd'T'HH:mm:ssXXX",
          ),
        ).toISOString()

        // Yesterday's intent signals count
        const { count: signalCountRaw, error: signalCountErr } = await supabase
          .from("intent_signals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("detected_at", startOfYesterdayLocalUtc)
          .lt("detected_at", endOfYesterdayLocalUtc)

        if (signalCountErr) throw signalCountErr

        const signalCount = signalCountRaw ?? 0

        // Pending DM approvals
        const { count: pendingCountRaw, error: pendingErr } = await supabase
          .from("actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "pending_approval")

        if (pendingErr) throw pendingErr

        const pendingCount = pendingCountRaw ?? 0

        // Yesterday's replies
        const { count: replyCountRaw } = await supabase
          .from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("replied_detected_at", startOfYesterdayLocalUtc)
          .lt("replied_detected_at", endOfYesterdayLocalUtc)

        const replyCount = replyCountRaw ?? 0

        // Top 3 signals by intent_strength from yesterday
        const { data: topSignalsRaw, error: topErr } = await supabase
          .from("intent_signals")
          .select("post_content, post_url, intent_strength")
          .eq("user_id", user.id)
          .gte("detected_at", startOfYesterdayLocalUtc)
          .lt("detected_at", endOfYesterdayLocalUtc)
          .order("intent_strength", { ascending: false })
          .limit(3)

        if (topErr) throw topErr

        const topSignals = (topSignalsRaw ?? []).map((s) => {
          const match = s.post_url?.match(/reddit\.com\/r\/([^/]+)/)
          const subreddit = match ? match[1] : "unknown"
          const excerpt = (s.post_content ?? "").slice(0, 200)
          return { excerpt, subreddit, intentStrength: s.intent_strength ?? 0 }
        })

        // Product name
        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("name")
          .eq("user_id", user.id)
          .limit(1)

        const productName = profiles?.[0]?.name ?? "your product"

        // Skip empty digests
        if (signalCount === 0 && pendingCount === 0 && replyCount === 0) {
          skipped += 1
          continue
        }

        try {
          await sendDailyDigest(user.email, {
            signalCount,
            pendingCount,
            replyCount,
            topSignals,
            productName,
          })
          sent += 1
          await supabase.from("job_logs").insert({
            job_type: "monitor" as const,
            status: "completed" as const,
            user_id: user.id,
            started_at: startedAt.toISOString(),
            finished_at: new Date().toISOString(),
            metadata: {
              cron: "digest",
              email: user.email,
              signal_count: signalCount,
              pending_count: pendingCount,
              reply_count: replyCount,
              correlation_id: correlationId,
            },
          })
        } catch (sendErr) {
          failed += 1
          logger.error("Digest send failed", {
            correlationId,
            userId: user.id,
            error:
              sendErr instanceof Error
                ? sendErr
                : new Error(String(sendErr)),
            errorMessage:
              sendErr instanceof Error ? sendErr.message : String(sendErr),
          })
        }
      } catch (userErr) {
        failed += 1
        logger.error("Digest failed for user", {
          correlationId,
          userId: user.id,
          error:
            userErr instanceof Error ? userErr : new Error(String(userErr)),
          errorMessage:
            userErr instanceof Error ? userErr.message : String(userErr),
        })
      }
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    try {
      await supabase.from("job_logs").insert({
        job_type: "monitor" as const,
        status: "completed" as const,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        metadata: {
          cron: "digest",
          sent,
          skipped,
          failed,
          correlation_id: correlationId,
        },
      })
    } catch (logErr) {
      logger.warn("Failed to insert job_log for digest cron", {
        correlationId,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }

    logger.info("Digest cron completed", {
      correlationId,
      sent,
      skipped,
      failed,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({ sent, skipped, failed, durationMs })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("Digest cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Digest failed", message: error.message, sent, skipped, failed },
      { status: 500 },
    )
  }
}
