"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AccountCard } from "./account-card"
import { ConnectionFlow } from "./connection-flow"
import { useRealtimeAccounts } from "@/features/accounts/lib/use-realtime-accounts"
import {
  connectAccount,
  skipWarmup,
  assignAccountToPlatform,
} from "@/features/accounts/actions/account-actions"
import type {
  SocialAccount,
  AccountDailyUsage,
} from "@/features/accounts/lib/types"

interface AccountListProps {
  initialAccounts: SocialAccount[]
  initialUsages: Record<string, AccountDailyUsage>
  userId: string
}

export function AccountList({
  initialAccounts,
  initialUsages,
  userId,
}: AccountListProps) {
  const { accounts } = useRealtimeAccounts(userId, initialAccounts)
  const [connecting, setConnecting] = useState(false)
  const [newAccountId, setNewAccountId] = useState<string | null>(null)
  const [newProfileId, setNewProfileId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleConnect() {
    setConnecting(true)
    const handle = prompt("Enter your Reddit username:")
    if (!handle) {
      setConnecting(false)
      return
    }

    const result = await connectAccount("reddit", handle)
    if (result.error) {
      toast.error(result.error)
      setConnecting(false)
      return
    }

    setNewAccountId(result.accountId ?? null)
    setNewProfileId(result.profileId ?? null)
  }

  function handleSkipWarmup(accountId: string) {
    startTransition(async () => {
      const result = await skipWarmup(accountId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Warmup skipped")
      }
    })
  }

  function handleAssignPlatform(
    accountId: string,
    platform: "reddit" | "linkedin",
  ) {
    startTransition(async () => {
      const result = await assignAccountToPlatform(accountId, platform)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Platform assignment updated")
      }
    })
  }

  if (accounts.length === 0 && !connecting) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <h2 className="text-xl font-semibold">No accounts connected</h2>
        <p className="max-w-md text-center text-base text-muted-foreground">
          Connect a Reddit account to start sending messages. Each account
          gets a unique browser profile for safety.
        </p>
        <Button onClick={handleConnect} disabled={isPending}>
          <Plus className="mr-2 h-4 w-4" />
          Connect Reddit Account
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {connecting && newAccountId && newProfileId && (
        <ConnectionFlow
          accountId={newAccountId}
          profileId={newProfileId}
          onComplete={() => {
            setConnecting(false)
            setNewAccountId(null)
            setNewProfileId(null)
            toast.success("Account connected successfully")
          }}
          onCancel={() => {
            setConnecting(false)
            setNewAccountId(null)
            setNewProfileId(null)
          }}
        />
      )}

      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          usage={
            initialUsages[account.id] ?? {
              dm_count: 0,
              engage_count: 0,
              reply_count: 0,
              dm_limit: account.daily_dm_limit,
              engage_limit: account.daily_engage_limit,
              reply_limit: account.daily_reply_limit,
            }
          }
          onSkipWarmup={handleSkipWarmup}
          onAssignPlatform={handleAssignPlatform}
        />
      ))}

      {accounts.length > 0 && (
        <Button
          variant="outline"
          onClick={handleConnect}
          disabled={isPending || connecting}
          className="w-fit"
        >
          <Plus className="mr-2 h-4 w-4" />
          Connect Reddit Account
        </Button>
      )}
    </div>
  )
}
