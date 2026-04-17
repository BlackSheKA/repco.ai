"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Card, CardContent } from "@/components/ui/card"
import {
  deriveAgentState,
  getAgentMessage,
  type AgentContext,
  type AgentState,
} from "@/features/dashboard/lib/agent-state"
import { createClient } from "@/lib/supabase/client"

interface AgentCardProps {
  userId: string
  initialStats?: { signalsFound: number; actionsPending: number }
}

const STATE_LABELS: Record<AgentState, string> = {
  scanning: "Scanning",
  found: "Found one",
  waiting: "Waiting on you",
  sent: "Sent",
  reply: "Reply received",
  cooldown: "Cooling down",
  quiet: "Quiet",
}

const REFRESH_INTERVAL_MS = 30_000

export function AgentCard({ userId, initialStats }: AgentCardProps) {
  const supabaseRef = useRef(createClient())
  const [state, setState] = useState<AgentState>("quiet")
  const [message, setMessage] = useState("Quiet day. Keeping an eye out.")
  const [stats, setStats] = useState({
    signalsFound: initialStats?.signalsFound ?? 0,
    actionsPending: initialStats?.actionsPending ?? 0,
  })

  const fetchContext = useCallback(async () => {
    const supabase = supabaseRef.current
    const now = new Date()
    const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString()
    const fifteenMinAgo = new Date(
      now.getTime() - 15 * 60 * 1000,
    ).toISOString()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString()

    const [
      monitoringResult,
      highIntentResult,
      pendingResult,
      dmsSentResult,
      repliesResult,
      warningResult,
      signalsResult,
    ] = await Promise.all([
      // isMonitoringActive
      supabase
        .from("job_logs")
        .select("id", { count: "exact", head: true })
        .eq("job_type", "monitor")
        .eq("status", "completed")
        .gte("started_at", twentyMinAgo),
      // recentHighIntentCount
      supabase
        .from("intent_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("intent_strength", 8)
        .gte("detected_at", fifteenMinAgo),
      // pendingApprovals
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending_approval"),
      // recentDmsSent
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed")
        .eq("action_type", "dm")
        .gte("created_at", oneHourAgo),
      // recentReplies (will be 0 in Phase 2)
      supabase
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_status", "replied")
        .gte("updated_at", oneHourAgo),
      // hasWarningAccount
      supabase
        .from("social_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("health_status", ["warning", "cooldown"]),
      // signalsLast24h
      supabase
        .from("intent_signals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("detected_at", twentyFourHoursAgo),
    ])

    const ctx: AgentContext = {
      isMonitoringActive: (monitoringResult.count ?? 0) > 0,
      recentHighIntentCount: highIntentResult.count ?? 0,
      pendingApprovals: pendingResult.count ?? 0,
      recentDmsSent: dmsSentResult.count ?? 0,
      recentReplies: repliesResult.count ?? 0,
      hasWarningAccount: (warningResult.count ?? 0) > 0,
      signalsLast24h: signalsResult.count ?? 0,
    }

    const newState = deriveAgentState(ctx)
    const newMessage = getAgentMessage(newState, ctx)

    setState(newState)
    setMessage(newMessage)
    setStats({
      signalsFound: signalsResult.count ?? 0,
      actionsPending: pendingResult.count ?? 0,
    })
  }, [userId])

  useEffect(() => {
    fetchContext()

    const interval = setInterval(fetchContext, REFRESH_INTERVAL_MS)

    // Subscribe to intent_signals for immediate state updates
    const supabase = supabaseRef.current
    const channel = supabase
      .channel("agent-card-signals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intent_signals",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchContext()
        },
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [userId, fetchContext])

  return (
    <Card
      role="status"
      aria-live="polite"
      className="mt-6 border bg-secondary p-6"
    >
      <CardContent className="flex flex-col gap-4 p-0 md:flex-row md:items-center">
        {/* Left section: avatar + info */}
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-stone-800">
            <span className="font-sans text-2xl font-semibold text-[#4338CA]">
              r
            </span>
          </div>

          {/* Name, state, message */}
          <div className="flex flex-col">
            <span className="font-sans text-xl font-semibold">repco</span>
            <span className="text-sm font-medium text-muted-foreground">
              {STATE_LABELS[state]}
            </span>
            <span className="mt-1 text-base">{message}</span>
          </div>
        </div>

        {/* Right section: stats */}
        <div className="flex gap-8 md:ml-auto">
          <div className="flex flex-col">
            <span className="text-[28px] font-normal">{stats.signalsFound}</span>
            <span className="text-sm text-muted-foreground">
              Signals found
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[28px] font-normal">
              {stats.actionsPending}
            </span>
            <span className="text-sm text-muted-foreground">
              Actions pending
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
