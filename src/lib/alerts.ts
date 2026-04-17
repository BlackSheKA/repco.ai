import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ThresholdResult {
  totalActions: number;
  successRate: number;
  timeoutRate: number;
  alertsFired: string[];
}

/**
 * OBSV-04: Check action success/timeout rate thresholds.
 * Queries job_logs for the last hour and fires Sentry alerts
 * when success rate < 80% or timeout rate > 5%.
 */
export async function checkActionThresholds(
  supabase: SupabaseClient,
  correlationId: string,
): Promise<ThresholdResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: logs, error } = await supabase
    .from("job_logs")
    .select("status")
    .eq("job_type", "action")
    .gte("finished_at", oneHourAgo);

  if (error) {
    throw new Error(`Failed to query job_logs for thresholds: ${error.message}`);
  }

  const entries = logs ?? [];
  const totalActions = entries.length;
  const successCount = entries.filter((e) => e.status === "completed").length;
  const timeoutCount = entries.filter((e) => e.status === "timeout").length;

  const successRate = totalActions > 0 ? (successCount / totalActions) * 100 : 100;
  const timeoutRate = totalActions > 0 ? (timeoutCount / totalActions) * 100 : 0;

  const alertsFired: string[] = [];

  // Skip alerting if fewer than 5 actions in the window (not enough data)
  if (totalActions < 5) {
    return { totalActions, successRate, timeoutRate, alertsFired };
  }

  if (successRate < 80) {
    Sentry.captureMessage("OBSV-04: Action success rate below 80%", {
      level: "warning",
      fingerprint: ["obsv04-low-success-rate"],
      extra: { successRate, totalActions, successCount, timeoutCount, correlationId },
    });
    logger.warn("OBSV-04: Action success rate below threshold", {
      correlationId,
      successRate,
      totalActions,
      successCount,
      timeoutCount,
    });
    alertsFired.push("obsv04-low-success-rate");
  }

  if (timeoutRate > 5) {
    Sentry.captureMessage("OBSV-04: Action timeout rate above 5%", {
      level: "warning",
      fingerprint: ["obsv04-high-timeout-rate"],
      extra: { timeoutRate, totalActions, timeoutCount, correlationId },
    });
    logger.warn("OBSV-04: Action timeout rate above threshold", {
      correlationId,
      timeoutRate,
      totalActions,
      timeoutCount,
    });
    alertsFired.push("obsv04-high-timeout-rate");
  }

  return { totalActions, successRate, timeoutRate, alertsFired };
}
