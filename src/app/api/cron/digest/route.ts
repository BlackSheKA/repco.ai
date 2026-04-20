import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { formatInTimeZone } from "date-fns-tz"
import { Resend } from "resend"

import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 60

interface UserRow {
  id: string
  email: string | null
  timezone: string | null
  subscription_active: boolean | null
  trial_ends_at: string | null
}

interface IntentSignalRow {
  id: string
  post_content: string | null
  post_url: string | null
  intent_strength: number | null
}

function buildHtml(opts: {
  productName: string
  signalCount: number
  topSignal: IntentSignalRow | null
  pendingCount: number
  dashboardUrl: string
}): string {
  const { productName, signalCount, topSignal, pendingCount, dashboardUrl } =
    opts

  const excerpt =
    topSignal?.post_content && topSignal.post_content.trim().length > 0
      ? topSignal.post_content.replace(/\s+/g, " ").trim().slice(0, 100)
      : null

  const topSignalLine =
    topSignal && excerpt
      ? `<p style="margin:16px 0;color:#44403c;">Top signal: ${excerpt}${
          excerpt.length === 100 ? "..." : ""
        } (intent: ${topSignal.intent_strength ?? "?"}/10)</p>`
      : ""

  const pendingLine =
    pendingCount > 0
      ? `<p style="margin:16px 0;color:#44403c;">${pendingCount} DM${
          pendingCount === 1 ? "" : "s"
        } waiting for your approval</p>`
      : ""

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;font-family:Inter,Arial,sans-serif;background:#fafaf9;color:#1c1917;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <h1 style="font-size:20px;font-weight:600;margin:0 0 16px 0;">Your ${productName} digest</h1>
    <p style="margin:16px 0;color:#1c1917;">${signalCount} intent signal${
      signalCount === 1 ? "" : "s"
    } detected in the last 24 hours</p>
    ${topSignalLine}
    ${pendingLine}
    <p style="margin:24px 0 0 0;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#4338CA;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:500;">View dashboard</a>
    </p>
  </div>
</body>
</html>`
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

  const resendKey = process.env.RESEND_API_KEY
  const resend = resendKey ? new Resend(resendKey) : null
  const fromAddress =
    process.env.RESEND_FROM_ADDRESS ?? "repco <noreply@repco.ai>"
  const dashboardUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://repco.ai"

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
    const twentyFourHoursAgoIso = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString()

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

        // Last 24h intent signals count
        const { count: signalCountRaw, error: signalCountErr } = await supabase
          .from("intent_signals")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("detected_at", twentyFourHoursAgoIso)

        if (signalCountErr) throw signalCountErr

        const signalCount = signalCountRaw ?? 0

        // Top signal by intent_strength in last 24h
        const { data: topSignals, error: topErr } = await supabase
          .from("intent_signals")
          .select("id, post_content, post_url, intent_strength")
          .eq("user_id", user.id)
          .gte("detected_at", twentyFourHoursAgoIso)
          .order("intent_strength", { ascending: false })
          .limit(1)

        if (topErr) throw topErr

        const topSignal = (topSignals?.[0] as IntentSignalRow | undefined) ?? null

        // Pending DM approvals
        const { count: pendingCountRaw, error: pendingErr } = await supabase
          .from("actions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "pending_approval")

        if (pendingErr) throw pendingErr

        const pendingCount = pendingCountRaw ?? 0

        // Product name
        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("name")
          .eq("user_id", user.id)
          .limit(1)

        const productName = profiles?.[0]?.name ?? "your product"

        // Skip empty digests
        if (signalCount === 0 && pendingCount === 0) {
          skipped += 1
          continue
        }

        const subject = `${signalCount} people looking for ${productName} yesterday`
        const html = buildHtml({
          productName,
          signalCount,
          topSignal,
          pendingCount,
          dashboardUrl,
        })

        if (resend) {
          try {
            const { error: sendErr } = await resend.emails.send({
              from: fromAddress,
              to: user.email,
              subject,
              html,
            })
            if (sendErr) throw sendErr

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
        } else {
          // Fallback: Resend not configured, log the digest payload
          logger.info("Digest fallback (no RESEND_API_KEY)", {
            correlationId,
            userId: user.id,
            email: user.email,
            subject,
            signalCount,
            pendingCount,
          })

          await supabase.from("job_logs").insert({
            job_type: "monitor" as const,
            status: "completed" as const,
            user_id: user.id,
            started_at: startedAt.toISOString(),
            finished_at: new Date().toISOString(),
            metadata: {
              cron: "digest",
              mode: "fallback_log",
              email: user.email,
              subject,
              signal_count: signalCount,
              pending_count: pendingCount,
              correlation_id: correlationId,
            },
          })

          sent += 1
        }
      } catch (userErr) {
        failed += 1
        logger.error("Digest failed for user", {
          correlationId,
          userId: user.id,
          error: userErr instanceof Error ? userErr : new Error(String(userErr)),
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
