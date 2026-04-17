import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const correlationId = logger.createCorrelationId();
  const startedAt = new Date();

  logger.info("Zombie recovery started", {
    correlationId,
    jobType: "zombie_recovery",
  });

  // Use service_role client to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Reset stuck actions: status = 'executing' AND executed_at older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: stuckActions, error: selectError } = await supabase
      .from("actions")
      .select("id, user_id")
      .eq("status", "executing")
      .lt("executed_at", tenMinutesAgo);

    if (selectError) throw selectError;

    const stuckCount = stuckActions?.length || 0;

    if (stuckCount > 0) {
      const stuckIds = stuckActions!.map((a) => a.id);

      // Update stuck actions to failed
      const { error: updateError } = await supabase
        .from("actions")
        .update({
          status: "failed",
          error: "Zombie recovery: execution exceeded 10 minutes",
        })
        .in("id", stuckIds);

      if (updateError) throw updateError;

      // Log each recovery to job_logs
      const jobLogEntries = stuckActions!.map((a) => ({
        job_type: "action" as const,
        status: "timeout" as const,
        user_id: a.user_id,
        action_id: a.id,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: 0,
        metadata: { recovery: "zombie", correlation_id: correlationId },
      }));

      const { error: logError } = await supabase
        .from("job_logs")
        .insert(jobLogEntries);

      if (logError) {
        logger.warn("Failed to insert job_logs for zombie recovery", {
          correlationId,
          error: logError.message,
        });
      }
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Log the cron run itself to job_logs
    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: durationMs,
      metadata: {
        cron: "zombie-recovery",
        stuck_count: stuckCount,
        correlation_id: correlationId,
      },
    });

    logger.info("Zombie recovery completed", {
      correlationId,
      stuckCount,
      durationMs,
    });

    await logger.flush();

    return NextResponse.json({
      ok: true,
      stuckCount,
      durationMs,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    logger.error("Zombie recovery failed", {
      correlationId,
      error,
      errorMessage: error.message,
    });

    await logger.flush();

    return NextResponse.json(
      { error: "Zombie recovery failed", message: error.message },
      { status: 500 },
    );
  }
}
