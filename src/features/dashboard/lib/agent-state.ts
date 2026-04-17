import type { SupabaseClient } from "@supabase/supabase-js"

export type AgentState =
  | "scanning"
  | "found"
  | "waiting"
  | "sent"
  | "reply"
  | "cooldown"
  | "quiet"

export interface AgentContext {
  isMonitoringActive: boolean // true if a monitor cron ran in last 20 minutes
  recentHighIntentCount: number // signals with intent_strength >= 8 in last 15 min
  pendingApprovals: number // actions with status = 'pending_approval'
  recentDmsSent: number // actions with status = 'completed' and type = 'dm' in last hour
  recentReplies: number // prospects with pipeline_status = 'replied' updated in last hour
  hasWarningAccount: boolean // any social_account with health_status = 'warning' or 'cooldown'
  signalsLast24h: number // intent_signals detected in last 24h
}

const MESSAGES: Record<AgentState, string[]> = {
  scanning: [
    "Scanning Reddit for buyers...",
    "Checking the subreddits...",
    "Looking for intent signals...",
  ],
  found: [
    "Found a good one -- someone's asking about alternatives.",
    "Spotted a hot lead. Worth a look.",
    "New high-intent signal detected.",
  ],
  waiting: ["waiting-template"],
  sent: [
    "Reached out. Ball's in their court.",
    "Message sent. Fingers crossed.",
  ],
  reply: [
    "They replied. Looks positive.",
    "Got a reply -- check it out.",
  ],
  cooldown: [
    "Taking a break on an account -- resumes tomorrow.",
    "Account cooling down. Back at it soon.",
  ],
  quiet: [
    "Quiet day. Keeping an eye out.",
    "Nothing new yet. Monitoring continues.",
    "All caught up. Watching for signals.",
  ],
}

/**
 * Derive the agent's emotional state from system data.
 * Priority order: first match wins.
 */
export function deriveAgentState(ctx: AgentContext): AgentState {
  if (ctx.hasWarningAccount) return "cooldown"
  if (ctx.recentReplies > 0) return "reply"
  if (ctx.recentDmsSent > 0) return "sent"
  if (ctx.pendingApprovals > 0) return "waiting"
  if (ctx.recentHighIntentCount > 0) return "found"
  if (ctx.isMonitoringActive) return "scanning"
  return "quiet"
}

/**
 * Get a contextual message for the agent's current state.
 * Uses Math.random to pick from the message bank.
 */
export function getAgentMessage(
  state: AgentState,
  ctx: AgentContext,
): string {
  if (state === "waiting") {
    const count = ctx.pendingApprovals
    return `${count} ${count === 1 ? "person" : "people"} waiting for your go-ahead.`
  }

  const messages = MESSAGES[state]
  const index = Math.floor(Math.random() * messages.length)
  return messages[index]
}

/**
 * Query today's agent stats from the database.
 */
export async function getAgentStats(
  supabaseClient: SupabaseClient,
  userId: string,
): Promise<{ signalsFound: number; actionsPending: number }> {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString()

  const [signalsResult, actionsResult] = await Promise.all([
    supabaseClient
      .from("intent_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("detected_at", twentyFourHoursAgo),
    supabaseClient
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending_approval"),
  ])

  return {
    signalsFound: signalsResult.count ?? 0,
    actionsPending: actionsResult.count ?? 0,
  }
}
