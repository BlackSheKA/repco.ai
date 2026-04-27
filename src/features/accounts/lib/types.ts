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

export interface BrowserProfile {
  id: string
  gologin_profile_id: string
  gologin_proxy_id: string
  country_code: string
  timezone: string
  locale: string
  display_name: string | null
}

export interface SocialAccount {
  id: string
  user_id: string
  platform: "reddit" | "linkedin"
  handle: string | null
  profile_url: string | null
  browser_profile_id: string | null
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

export type SocialAccountWithProfile = SocialAccount & {
  browser_profiles: BrowserProfile | null
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
  /**
   * Last warmup day before the account is considered fully warmed. Platform-aware:
   *  - LinkedIn: 7 (DM gate opens at day 7)
   *  - Reddit:   8 (DM gate opens at day 8)
   * Consumers doing `day >= maxDay` treat that as "fully warmed".
   */
  maxDay: number
  completed: boolean
  skipped: boolean
  allowedActions: ("browse" | "like" | "follow" | "public_reply" | "dm" | "connection_request")[]
}

/**
 * Compute the warmup state for a social account based on its
 * warmup day counter and completion timestamp.
 *
 * Reddit schedule (default, back-compat with 2-arg callers):
 * - Days 1-3: browse only
 * - Days 4-5: browse + like + follow + connection_request
 * - Days 6-7: browse + like + follow + public_reply
 * - Day 8+/completed: all actions including DM
 *
 * LinkedIn schedule (per .planning/phases/13-linkedin-action-expansion/13-CONTEXT.md §Warmup gates):
 * - Day 1:   browse
 * - Day 2-3: browse + like + follow
 * - Day 4-6: browse + like + follow + public_reply + connection_request
 * - Day 7+/completed: all above + dm
 */
export function getWarmupState(
  warmupDay: number,
  completedAt: string | null,
  platform: "reddit" | "linkedin" = "reddit"
): WarmupState {
  const completed = completedAt !== null
  const skipped = warmupDay === 0 && completedAt !== null

  let allowedActions: WarmupState["allowedActions"] = ["browse"]

  if (platform === "linkedin") {
    if (completed || warmupDay >= 7) {
      allowedActions = [
        "browse",
        "like",
        "follow",
        "public_reply",
        "connection_request",
        "dm",
      ]
    } else if (warmupDay >= 4) {
      allowedActions = [
        "browse",
        "like",
        "follow",
        "public_reply",
        "connection_request",
      ]
    } else if (warmupDay >= 2) {
      allowedActions = ["browse", "like", "follow"]
    }
  } else {
    // Reddit (default)
    if (completed || warmupDay >= 8) {
      allowedActions = [
        "browse",
        "like",
        "follow",
        "public_reply",
        "dm",
        "connection_request",
      ]
    } else if (warmupDay >= 6) {
      allowedActions = ["browse", "like", "follow", "public_reply"]
    } else if (warmupDay >= 4) {
      allowedActions = ["browse", "like", "follow", "connection_request"]
    }
  }

  // H-03: platform-aware maxDay. LinkedIn warmup completes at day 7;
  // Reddit at day 8. A Reddit account on day 7 must NOT report fully-warmed.
  const maxDay = platform === "linkedin" ? 7 : 8
  return { day: warmupDay, maxDay, completed, skipped, allowedActions }
}
