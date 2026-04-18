import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Warmup progression started", {
    correlationId,
    jobType: "warmup",
  })

  // Use service_role client to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    // 1. Progress warmup accounts: increment warmup_day
    const { data: warmupAccounts, error: warmupError } = await supabase
      .from("social_accounts")
      .select("id, warmup_day")
      .eq("health_status", "warmup")
      .eq("active", true)

    if (warmupError) throw warmupError

    let updatedCount = 0
    let completedCount = 0

    if (warmupAccounts && warmupAccounts.length > 0) {
      for (const account of warmupAccounts) {
        const newDay = account.warmup_day + 1

        if (newDay >= 8) {
          // Warmup complete: transition to healthy
          const { error } = await supabase
            .from("social_accounts")
            .update({
              warmup_day: newDay,
              health_status: "healthy",
              warmup_completed_at: new Date().toISOString(),
            })
            .eq("id", account.id)

          if (error) {
            logger.warn("Failed to complete warmup for account", {
              correlationId,
              accountId: account.id,
              error: error.message,
            })
          } else {
            completedCount++
          }
        } else {
          // Increment warmup day
          const { error } = await supabase
            .from("social_accounts")
            .update({ warmup_day: newDay })
            .eq("id", account.id)

          if (error) {
            logger.warn("Failed to increment warmup day for account", {
              correlationId,
              accountId: account.id,
              error: error.message,
            })
          }
        }
        updatedCount++
      }
    }

    // 2. Auto-resume cooldown accounts whose cooldown_until has passed
    const { data: cooldownAccounts, error: cooldownError } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("health_status", "cooldown")
      .not("cooldown_until", "is", null)
      .lte("cooldown_until", new Date().toISOString())

    if (cooldownError) {
      logger.warn("Failed to query cooldown accounts", {
        correlationId,
        error: cooldownError.message,
      })
    }

    let resumedCount = 0

    if (cooldownAccounts && cooldownAccounts.length > 0) {
      for (const account of cooldownAccounts) {
        const { error } = await supabase
          .from("social_accounts")
          .update({
            health_status: "healthy",
            cooldown_until: null,
          })
          .eq("id", account.id)

        if (error) {
          logger.warn("Failed to resume cooldown account", {
            correlationId,
            accountId: account.id,
            error: error.message,
          })
        } else {
          resumedCount++
        }
      }
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
        cron: "warmup",
        warmup_updated: updatedCount,
        warmup_completed: completedCount,
        cooldown_resumed: resumedCount,
        correlation_id: correlationId,
      },
    })

    logger.info("Warmup progression completed", {
      correlationId,
      updatedCount,
      completedCount,
      resumedCount,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      updatedCount,
      completedCount,
      resumedCount,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("Warmup progression failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Warmup progression failed", message: error.message },
      { status: 500 },
    )
  }
}
