"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"

export interface TerminalEntry {
  id: string
  text: string
  type: "scanning" | "found" | "classifying" | "complete" | "quiet"
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
            content_snippet: string
            intent_strength: number
            detected_at: string
          }
          const excerpt = truncate(row.content_snippet ?? "", 50)
          addEntry({
            id: row.id,
            text: `> Intent detected: ${row.author_handle} "${excerpt}" [${row.intent_strength}/10]`,
            type: "found",
            timestamp: new Date(row.detected_at),
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(jobChannel)
      supabase.removeChannel(signalChannel)
    }
  }, [userId, addEntry])

  return { entries }
}
