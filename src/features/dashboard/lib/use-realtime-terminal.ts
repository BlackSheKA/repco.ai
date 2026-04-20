"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"

export interface TerminalEntry {
  id: string
  text: string
  type:
    | "scanning"
    | "found"
    | "classifying"
    | "complete"
    | "quiet"
    | "followup"
    | "reply"
    | "inbox"
  timestamp: Date
}

const MAX_ENTRIES = 5

function transformJobLog(row: {
  id: string
  status: string
  started_at: string
  metadata: Record<string, unknown> | null
}): TerminalEntry {
  const totalSignals = (row.metadata?.total_signals as number) ?? 0

  if (row.status === "completed" && totalSignals > 0) {
    return {
      id: row.id,
      text: `\u2713 ${totalSignals} new signals added to your feed`,
      type: "complete",
      timestamp: new Date(row.started_at),
    }
  }

  if (row.status === "completed" && totalSignals === 0) {
    return {
      id: row.id,
      text: "> No new signals this scan",
      type: "quiet",
      timestamp: new Date(row.started_at),
    }
  }

  if (row.status === "started" || row.status === "in_progress") {
    return {
      id: row.id,
      text: "> Scanning Reddit...",
      type: "scanning",
      timestamp: new Date(row.started_at),
    }
  }

  // failed
  return {
    id: row.id,
    text: "> Scanning interrupted \u2014 retrying in 15 minutes",
    type: "quiet",
    timestamp: new Date(row.started_at),
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen) + "..."
}

export function useRealtimeTerminal(userId: string) {
  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const supabaseRef = useRef(createClient())

  const addEntry = useCallback((entry: TerminalEntry) => {
    setEntries((prev) => {
      const next = [...prev, entry]
      if (next.length > MAX_ENTRIES) {
        return next.slice(next.length - MAX_ENTRIES)
      }
      return next
    })
  }, [])

  useEffect(() => {
    const supabase = supabaseRef.current

    // Fetch initial entries
    async function fetchInitial() {
      const { data } = await supabase
        .from("job_logs")
        .select("id, status, started_at, metadata")
        .eq("job_type", "monitor")
        .order("started_at", { ascending: false })
        .limit(MAX_ENTRIES)

      if (data && data.length > 0) {
        const transformed = data
          .reverse()
          .map((row) =>
            transformJobLog(
              row as {
                id: string
                status: string
                started_at: string
                metadata: Record<string, unknown> | null
              },
            ),
          )
        setEntries(transformed)
      }
    }

    fetchInitial()

    // Subscribe to job_logs inserts
    const jobChannel = supabase
      .channel("terminal-job-logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_logs",
          filter: "job_type=eq.monitor",
        },
        (payload) => {
          const row = payload.new as {
            id: string
            status: string
            started_at: string
            metadata: Record<string, unknown> | null
          }
          addEntry(transformJobLog(row))
        },
      )
      .subscribe()

    // Subscribe to intent_signals inserts for this user
    const signalChannel = supabase
      .channel("terminal-intent-signals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intent_signals",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            author_handle: string
            post_content: string
            intent_strength: number
            detected_at: string
          }
          const excerpt = truncate(row.post_content ?? "", 50)
          addEntry({
            id: row.id,
            text: `> Intent detected: ${row.author_handle} "${excerpt}" [${row.intent_strength}/10]`,
            type: "found",
            timestamp: new Date(row.detected_at),
          })
        },
      )
      .subscribe()

    // Subscribe to follow-up actions for this user (scheduled + sent)
    const followupChannel = supabase
      .channel("terminal-followups")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "actions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            action_type: string | null
            sequence_step: number | null
            prospect_id: string
            created_at: string
          }
          if (row.action_type !== "followup_dm") return
          const step = row.sequence_step ?? 1
          const dayMap: Record<number, number> = { 1: 3, 2: 7, 3: 14 }
          const day = dayMap[step] ?? step
          addEntry({
            id: `${row.id}-scheduled`,
            text: `> Follow-up ${step} scheduled (day ${day})`,
            type: "followup",
            timestamp: new Date(row.created_at),
          })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "actions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            action_type: string | null
            sequence_step: number | null
            status: string | null
            executed_at: string | null
          }
          if (row.action_type !== "followup_dm") return
          if (row.status !== "completed") return
          const step = row.sequence_step ?? 1
          addEntry({
            id: `${row.id}-sent`,
            text: `> Follow-up ${step} sent`,
            type: "followup",
            timestamp: row.executed_at
              ? new Date(row.executed_at)
              : new Date(),
          })
        },
      )
      .subscribe()

    // Subscribe to reply detections for this user
    const replyChannel = supabase
      .channel("terminal-replies")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "prospects",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newRow = payload.new as {
            id: string
            handle: string | null
            pipeline_status: string | null
            replied_detected_at: string | null
          }
          const oldRow = payload.old as {
            pipeline_status: string | null
          } | null
          if (newRow.pipeline_status !== "replied") return
          if (oldRow && oldRow.pipeline_status === "replied") return
          addEntry({
            id: `${newRow.id}-reply`,
            text: `> Reply received from u/${newRow.handle ?? "unknown"}`,
            type: "reply",
            timestamp: newRow.replied_detected_at
              ? new Date(newRow.replied_detected_at)
              : new Date(),
          })
        },
      )
      .subscribe()

    // Subscribe to inbox check job_logs (reply_check type, global not per-user)
    const inboxChannel = supabase
      .channel("terminal-inbox")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "job_logs",
          filter: "job_type=eq.reply_check",
        },
        (payload) => {
          const row = payload.new as {
            id: string
            status: string | null
            started_at: string
            metadata: Record<string, unknown> | null
          }
          const isFailed = row.status === "failed"
          addEntry({
            id: `${row.id}-inbox-start`,
            text: isFailed
              ? "> Inbox check failed"
              : "> Checking inbox for replies...",
            type: "inbox",
            timestamp: new Date(row.started_at),
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(jobChannel)
      supabase.removeChannel(signalChannel)
      supabase.removeChannel(followupChannel)
      supabase.removeChannel(replyChannel)
      supabase.removeChannel(inboxChannel)
    }
  }, [userId, addEntry])

  return { entries }
}
