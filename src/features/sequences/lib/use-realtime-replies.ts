"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"

export interface ReplyData {
  id: string
  handle: string
  platform: string
  last_reply_snippet: string | null
  replied_detected_at: string | null
  intent_signal_id: string | null
  original_dm: string | null
  post_url: string | null
}

interface ProspectRow {
  id: string
  user_id: string
  handle: string | null
  platform: string | null
  pipeline_status: string | null
  last_reply_snippet: string | null
  replied_detected_at: string | null
  intent_signal_id: string | null
}

async function fetchReplyExtras(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  intentSignalId: string | null,
): Promise<{ original_dm: string | null; post_url: string | null }> {
  const [actionResult, signalResult] = await Promise.all([
    supabase
      .from("actions")
      .select("final_content, drafted_content, created_at")
      .eq("prospect_id", prospectId)
      .eq("action_type", "dm")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    intentSignalId
      ? supabase
          .from("intent_signals")
          .select("post_url")
          .eq("id", intentSignalId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const action = actionResult.data as
    | { final_content: string | null; drafted_content: string | null }
    | null
  const signal = (signalResult as { data: { post_url: string | null } | null })
    .data

  return {
    original_dm: action?.final_content ?? action?.drafted_content ?? null,
    post_url: signal?.post_url ?? null,
  }
}

/**
 * Subscribe to prospect status changes and emit reply events.
 * Fires Sonner toast and returns the live reply array.
 *
 * Note: agent emotional state transitions happen automatically via the
 * AgentCard's own Realtime subscription; we do not attempt to mutate
 * its internal state from here.
 */
export function useRealtimeReplies(
  initialReplies: ReplyData[],
  userId: string,
) {
  const supabaseRef = useRef(createClient())
  const [replies, setReplies] = useState<ReplyData[]>(initialReplies)

  useEffect(() => {
    const supabase = supabaseRef.current

    const channel = supabase
      .channel(`prospects-replies-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "prospects",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const newRow = payload.new as ProspectRow
          const oldRow = payload.old as ProspectRow | null

          if (newRow.pipeline_status !== "replied") return
          // Only fire once per transition to 'replied'
          if (oldRow && oldRow.pipeline_status === "replied") return

          const extras = await fetchReplyExtras(
            supabase,
            newRow.id,
            newRow.intent_signal_id,
          )

          const reply: ReplyData = {
            id: newRow.id,
            handle: newRow.handle ?? "unknown",
            platform: newRow.platform ?? "reddit",
            last_reply_snippet: newRow.last_reply_snippet,
            replied_detected_at: newRow.replied_detected_at,
            intent_signal_id: newRow.intent_signal_id,
            original_dm: extras.original_dm,
            post_url: extras.post_url,
          }

          setReplies((prev) => {
            if (prev.some((r) => r.id === reply.id)) return prev
            return [reply, ...prev]
          })

          toast(`u/${reply.handle} replied to your message`)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return replies
}
