import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { formatInTimeZone } from "date-fns-tz"
import { logger } from "@/lib/logger"
import { sendDailyDigest } from "@/features/notifications/lib/send-daily-digest"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Daily-digest cron started", {
    correlationId,
    jobType: "daily-digest",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, timezone")

    if (usersError) throw usersError

    const now = new Date()
    let sentCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const user of users ?? []) {
      try {
        const tz = user.timezone || "UTC"
        const localHour = parseInt(formatInTimeZone(now, tz, "H"), 10)

        if (localHour !== 8) {
          skippedCount++
          continue
        }

        if (!user.email) {
          skippedCount++
          continue
        }

        // Compute "yesterday" boundaries in user's timezone
        // Use formatInTimeZone to get yesterday's date string, then parse back to UTC ISO
        const yesterdayDateStr = formatInTimeZone(
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
          tz,
          "yyyy-MM-dd",
        )
        // Start of yesterday in user's TZ (expressed in UTC)
        const startOfYesterdayLocalUtc = new Date(
          formatInTimeZone(
            new Date(`${yesterdayDateStr}T00:00:00`),
            tz,
            "yyyy-MM-dd'T'HH:mm:ssXXX",
          ),
        ).toISOString()
        // End of yesterday in user's TZ (start of today in user's TZ)
        const todayDateStr = formatInTimeZone(now, tz, "yyyy-MM-dd")
        const endOfYesterdayLocalUtc = new Date(
          formatInTimeZone(
            new Date(`${todayDateStr}T00:00:00`),
            tz,
            "yyyy-MM-dd'T'HH:mm:ssXXX",
          ),
        ).toISOString()

        // Count yesterday's signals for this user
        const { count: signalCountRaw } = await supabase
          .from("intent_signals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("detected_at", startOfYesterdayLocalUtc)
          .lt("detected_at", endOfYesterdayLocalUtc)

        const signalCount = signalCountRaw ?? 0

        // Count pending DMs (any age — reflects current approval queue)
        const { count: pendingCountRaw } = await supabase
          .from("actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "pending_approval")

        const pendingCount = pendingCountRaw ?? 0

        // Count yesterday's replies
        const { count: replyCountRaw } = await supabase
          .from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("replied_detected_at", startOfYesterdayLocalUtc)
          .lt("replied_detected_at", endOfYesterdayLocalUtc)

        const replyCount = replyCountRaw ?? 0

        // Top signals by intent strength from yesterday
        const { data: topSignalsRaw } = await supabase
          .from("intent_signals")
          .select("post_content, post_url, intent_strength")
          .eq("user_id", user.id)
          .gte("detected_at", startOfYesterdayLocalUtc)
          .lt("detected_at", endOfYesterdayLocalUtc)
          .order("intent_strength", { ascending: false })
          .limit(3)

        const topSignals = (topSignalsRaw ?? []).map((s) => {
          // Extract subreddit from post_url (best-effort)
          const match = s.post_url?.match(/reddit\.com\/r\/([^/]+)/)
          const subreddit = match ? match[1] : "unknown"
          const excerpt = (s.post_content ?? "").slice(0, 200)
          return {
            excerpt,
            subreddit,
            intentStrength: s.intent_strength ?? 0,
          }
        })

        // Product name
        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("name")
          .eq("user_id", user.id)
          .limit(1)

        const productName = profiles?.[0]?.name ?? "your product"

        // Skip users with zero activity — avoid empty digests
        if (signalCount === 0 && pendingCount === 0 && replyCount === 0) {
          skippedCount++
          continue
        }

        await sendDailyDigest(user.email, {
          signalCount,
          pendingCount,
          replyCount,
          topSignals,
          productName,
        })

        sentCount++

        logger.info("Daily digest sent", {
          correlationId,
          userId: user.id,
          signalCount,
          pendingCount,
          replyCount,
        })
      } catch (userErr) {
        errorCount++
        logger.error("Daily digest failed for user", {
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

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      metadata: {
        cron: "daily-digest",
        sent_count: sentCount,
        skipped_count: skippedCount,
        error_count: errorCount,
        correlation_id: correlationId,
      },
    })

    logger.info("Daily-digest cron completed", {
      correlationId,
      sentCount,
      skippedCount,
      errorCount,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      sentCount,
      skippedCount,
      errorCount,
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
        cron: "daily-digest",
        correlation_id: correlationId,
      },
    })

    logger.error("Daily-digest cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Daily-digest failed", message: error.message },
      { status: 500 },
    )
  }
}
