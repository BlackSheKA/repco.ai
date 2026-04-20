import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { findDueFollowUps } from "@/features/sequences/lib/scheduler"
import { generateDM } from "@/features/actions/lib/dm-generation"
import type { FollowUpStep } from "@/features/sequences/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

const FOLLOW_UP_ANGLE_PROMPTS: Record<FollowUpStep, string> = {
  1: "Write a follow-up focusing on a specific feature or benefit of the product",
  2: "Write a follow-up sharing a valuable insight or tip related to their problem",
  3: "Write a casual, low-pressure check-in. Keep it very brief",
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Schedule-followups cron started", {
    correlationId,
    jobType: "schedule-followups",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const dueFollowUps = await findDueFollowUps(supabase)

    let scheduledCount = 0
    let failedCount = 0

    for (const followUp of dueFollowUps) {
      try {
        // Fetch intent signal for post context
        const { data: signal, error: signalError } = await supabase
          .from("intent_signals")
          .select("post_content, suggested_angle")
          .eq("id", followUp.intentSignalId)
          .single()

        if (signalError || !signal) {
          logger.warn("Intent signal not found for follow-up", {
            correlationId,
            prospectId: followUp.prospectId,
            intentSignalId: followUp.intentSignalId,
          })
          failedCount++
          continue
        }

        // Fetch user's product profile + auto_send preference
        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select("auto_send_followups")
          .eq("id", followUp.userId)
          .single()

        if (userError || !userRow) {
          logger.warn("User not found for follow-up", {
            correlationId,
            userId: followUp.userId,
          })
          failedCount++
          continue
        }

        const { data: profiles } = await supabase
          .from("product_profiles")
          .select("description")
          .eq("user_id", followUp.userId)
          .limit(1)

        const productDescription = profiles?.[0]?.description ?? ""

        // Build DM generation input with the follow-up angle override
        const angleOverride = FOLLOW_UP_ANGLE_PROMPTS[followUp.step]

        const dmResult = await generateDM({
          postContent: signal.post_content ?? "",
          productDescription,
          suggestedAngle: angleOverride,
        })

        if (!dmResult.passed) {
          logger.warn("Follow-up DM generation failed QC — skipping", {
            correlationId,
            prospectId: followUp.prospectId,
            step: followUp.step,
            failureReason: dmResult.failureReason,
          })
          failedCount++
          continue
        }

        const autoSendEnabled = userRow.auto_send_followups === true
        const expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString()

        const { error: insertError } = await supabase.from("actions").insert({
          user_id: followUp.userId,
          prospect_id: followUp.prospectId,
          account_id: followUp.accountId,
          action_type: "followup_dm",
          status: autoSendEnabled ? "approved" : "pending_approval",
          drafted_content: dmResult.content,
          sequence_step: followUp.step,
          expires_at: expiresAt,
        })

        if (insertError) {
          logger.error("Failed to insert follow-up action", {
            correlationId,
            prospectId: followUp.prospectId,
            error: insertError,
            errorMessage: insertError.message,
          })
          failedCount++
          continue
        }

        scheduledCount++
      } catch (followUpErr) {
        logger.error("Follow-up scheduling failed for prospect", {
          correlationId,
          prospectId: followUp.prospectId,
          error:
            followUpErr instanceof Error
              ? followUpErr
              : new Error(String(followUpErr)),
          errorMessage:
            followUpErr instanceof Error
              ? followUpErr.message
              : String(followUpErr),
        })
        failedCount++
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
        cron: "schedule-followups",
        scheduled_count: scheduledCount,
        failed_count: failedCount,
        due_count: dueFollowUps.length,
        correlation_id: correlationId,
      },
    })

    logger.info("Schedule-followups cron completed", {
      correlationId,
      scheduledCount,
      failedCount,
      dueCount: dueFollowUps.length,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      scheduledCount,
      failedCount,
      dueCount: dueFollowUps.length,
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
        cron: "schedule-followups",
        correlation_id: correlationId,
      },
    })

    logger.error("Schedule-followups cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Schedule-followups failed", message: error.message },
      { status: 500 },
    )
  }
}
