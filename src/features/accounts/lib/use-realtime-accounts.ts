"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { SocialAccount } from "./types"
import { getHealthDisplay } from "./health"

const supabase = createClient()

export function useRealtimeAccounts(
  userId: string,
  initialAccounts: SocialAccount[],
) {
  const [accounts, setAccounts] = useState<SocialAccount[]>(initialAccounts)

  useEffect(() => {
    const channel = supabase
      .channel("social-accounts")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "social_accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as SocialAccount
          setAccounts((prev) => {
            const old = prev.find((a) => a.id === updated.id)
            if (
              old &&
              old.health_status !== updated.health_status
            ) {
              const display = getHealthDisplay(updated.health_status)
              toast(
                `${updated.handle ?? "Account"} status changed to ${display.label}`,
              )
            }
            return prev.map((a) =>
              a.id === updated.id ? updated : a,
            )
          })
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "social_accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newAccount = payload.new as SocialAccount
          setAccounts((prev) => [...prev, newAccount])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return { accounts, setAccounts }
}
