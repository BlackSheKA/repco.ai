"use client"

import { useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import type { ApprovalCardData } from "./types"

const supabase = createClient()

async function fetchApprovalCard(
  actionId: string,
): Promise<ApprovalCardData | null> {
  const { data } = await supabase
    .from("actions")
    .select("*, prospects!inner(handle, intent_signal_id, platform)")
    .eq("id", actionId)
    .single()
  if (!data) return null

  const { data: signal } = await supabase
    .from("intent_signals")
    .select(
      "post_url, post_content, subreddit, author_handle, intent_strength, suggested_angle, platform, detected_at",
    )
    .eq("id", data.prospects.intent_signal_id)
    .single()

  return {
    action: data,
    signal: signal ?? {
      post_url: "",
      post_content: null,
      subreddit: null,
      author_handle: data.prospects.handle,
      intent_strength: null,
      suggested_angle: null,
      platform: data.prospects.platform,
      detected_at: "",
    },
  }
}

export function useRealtimeApprovals(
  userId: string,
  initialApprovals: ApprovalCardData[],
) {
  const [approvals, setApprovals] = useState(initialApprovals)

  useEffect(() => {
    const channel = supabase
      .channel("approvals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "actions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (
            (payload.new as Record<string, unknown>).status ===
            "pending_approval"
          ) {
            fetchApprovalCard(
              (payload.new as Record<string, unknown>).id as string,
            ).then((card) => {
              if (card) setApprovals((prev) => [card, ...prev])
            })
          }
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
          const newRecord = payload.new as Record<string, unknown>
          const newStatus = newRecord.status
          if (newStatus !== "pending_approval") {
            // Remove from queue (approved, rejected, expired, etc.)
            setApprovals((prev) =>
              prev.filter((a) => a.action.id !== newRecord.id),
            )
          } else {
            // Update in place (e.g., regenerated content)
            setApprovals((prev) =>
              prev.map((a) =>
                a.action.id === newRecord.id
                  ? {
                      ...a,
                      action: {
                        ...a.action,
                        ...(newRecord as unknown as ApprovalCardData["action"]),
                      },
                    }
                  : a,
              ),
            )
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return approvals
}
