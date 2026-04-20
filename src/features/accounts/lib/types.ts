/**
 * Account domain types shared across Phase 3 plans.
 *
 * These types define the contracts for:
 * - Social account records (DB row shape)
 * - Daily usage tracking
 * - Warmup state machine
 */

export type HealthStatus =
  | "warmup"
  | "healthy"
  | "warning"
  | "cooldown"
  | "banned"

export interface SocialAccount {
  id: string
  user_id: string
  platform: "reddit" | "linkedin"
  handle: string | null
  profile_url: string | null
  gologin_profile_id: string | null
  proxy_id: string | null
  health_status: HealthStatus
  warmup_day: number
  warmup_completed_at: string | null
  cooldown_until: string | null
  daily_dm_limit: number
  daily_engage_limit: number
  daily_reply_limit: number
  timezone: string
  active_hours_start: number
  active_hours_end: number
  active: boolean
  session_verified_at: string | null
  created_at: string
}

export interface AccountDailyUsage {
  dm_count: number
  engage_count: number
  reply_count: number
  dm_limit: number
  engage_limit: number
  reply_limit: number
}

export interface WarmupState {
  day: number
  maxDay: 7
  completed: boolean
  skipped: boolean
  allowedActions: ("browse" | "like" | "follow" | "public_reply" | "dm")[]
}

/**
 * Compute the warmup state for a social account based on its
 * warmup day counter and completion timestamp.
 *
 * Progressive warmup schedule:
 * - Days 1-3: browse only
 * - Days 4-5: browse + like + follow
 * - Days 6-7: browse + like + follow + public_reply
 * - Day 8+/completed: all actions including DM
 */
export function getWarmupState(
  warmupDay: number,
  completedAt: string | null
): WarmupState {
  const completed = completedAt !== null
  const skipped = warmupDay === 0 && completedAt !== null

  let allowedActions: WarmupState["allowedActions"] = ["browse"]

  if (completed || warmupDay >= 8) {
    allowedActions = ["browse", "like", "follow", "public_reply", "dm"]
  } else if (warmupDay >= 6) {
    allowedActions = ["browse", "like", "follow", "public_reply"]
  } else if (warmupDay >= 4) {
    allowedActions = ["browse", "like", "follow"]
  }

  return { day: warmupDay, maxDay: 7, completed, skipped, allowedActions }
}
