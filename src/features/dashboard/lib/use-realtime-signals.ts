"use client"

import { useEffect, useCallback, useState } from "react"

import { createClient } from "@/lib/supabase/client"

import type { IntentSignal } from "./types"

const supabase = createClient()

export function useRealtimeSignals(userId: string) {
  const [newSignals, setNewSignals] = useState<IntentSignal[]>([])

  useEffect(() => {
    const channel = supabase
      .channel("intent-signals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intent_signals",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const signal = payload.new as IntentSignal
          setNewSignals((prev) => [signal, ...prev])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const clearNewSignals = useCallback(() => {
    setNewSignals([])
  }, [])

  return { newSignals, clearNewSignals }
}
