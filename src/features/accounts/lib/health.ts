/**
 * Account health state machine with cooldown persistence.
 *
 * State transitions:
 *   warmup -> (via warmup cron) -> healthy
 *   healthy -> warning (rate_limited / captcha)
 *   healthy -> healthy (single action_failed ignored)
 *   warning -> cooldown (repeated failure, 48h auto-cooldown)
 *   cooldown -> healthy (cooldown_expired)
 *   any -> banned (banned_detected)
 *   non-banned -> healthy (manual_reset)
 *
 * cooldown_until is persisted to social_accounts so the warmup
 * cron can auto-resume accounts after 48h.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { HealthStatus } from "./types"

export interface HealthTransition {
  newStatus: HealthStatus
  reason: string
  cooldownUntil?: string // ISO timestamp for cooldown end
}

// State machine transitions (pure logic)
export function transitionHealth(
  currentStatus: HealthStatus,
  event:
    | "action_failed"
    | "rate_limited"
    | "captcha"
    | "banned_detected"
    | "cooldown_expired"
    | "manual_reset",
): HealthTransition {
  switch (event) {
    case "action_failed":
      if (currentStatus === "healthy") {
        return { newStatus: "healthy", reason: "Single failure ignored" }
      }
      if (currentStatus === "warning") {
        const cooldownEnd = new Date(
          Date.now() + 48 * 60 * 60 * 1000,
        ).toISOString()
        return {
          newStatus: "cooldown",
          reason: "Repeated failure during warning",
          cooldownUntil: cooldownEnd,
        }
      }
      return { newStatus: currentStatus, reason: "No transition" }

    case "rate_limited":
      if (currentStatus === "healthy") {
        return { newStatus: "warning", reason: "Rate limited by Reddit" }
      }
      if (currentStatus === "warning") {
        const cooldownEnd = new Date(
          Date.now() + 48 * 60 * 60 * 1000,
        ).toISOString()
        return {
          newStatus: "cooldown",
          reason: "Rate limited during warning",
          cooldownUntil: cooldownEnd,
        }
      }
      return { newStatus: currentStatus, reason: "No transition" }

    case "captcha":
      return {
        newStatus: "warning",
        reason: "CAPTCHA triggered -- possible detection",
      }

    case "banned_detected":
      return { newStatus: "banned", reason: "Account banned by Reddit" }

    case "cooldown_expired":
      if (currentStatus === "cooldown") {
        return { newStatus: "healthy", reason: "48h cooldown completed" }
      }
      return { newStatus: currentStatus, reason: "No transition" }

    case "manual_reset":
      if (currentStatus !== "banned") {
        return { newStatus: "healthy", reason: "Manual reset by user" }
      }
      return { newStatus: "banned", reason: "Cannot reset banned account" }

    default:
      return { newStatus: currentStatus, reason: "Unknown event" }
  }
}

// Apply health transition and persist to DB, including cooldown_until
export async function applyHealthTransition(
  supabase: SupabaseClient,
  accountId: string,
  transition: HealthTransition,
): Promise<void> {
  const update: Record<string, unknown> = {
    health_status: transition.newStatus,
  }
  // Persist cooldown_until when transitioning to cooldown
  if (transition.cooldownUntil) {
    update.cooldown_until = transition.cooldownUntil
  }
  // Clear cooldown_until when transitioning out of cooldown
  if (transition.newStatus === "healthy") {
    update.cooldown_until = null
  }
  await supabase
    .from("social_accounts")
    .update(update)
    .eq("id", accountId)
}

// Get display-friendly health info
export function getHealthDisplay(status: HealthStatus): {
  label: string
  color: "green" | "amber" | "yellow" | "red"
} {
  switch (status) {
    case "warmup":
      return { label: "Warming up", color: "amber" }
    case "healthy":
      return { label: "Healthy", color: "green" }
    case "warning":
      return { label: "Warning", color: "amber" }
    case "cooldown":
      return { label: "Cooldown", color: "yellow" }
    case "banned":
      return { label: "Banned", color: "red" }
  }
}
