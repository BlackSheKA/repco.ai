"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AccountCard } from "./account-card"
import { ConnectionFlow } from "./connection-flow"
import { useRealtimeAccounts } from "@/features/accounts/lib/use-realtime-accounts"
import {
  connectAccount,
  skipWarmup,
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
  const [connectingPlatform, setConnectingPlatform] = useState<
    "reddit" | "linkedin"
  >("reddit")
  const [handleInput, setHandleInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [newAccountId, setNewAccountId] = useState<string | null>(null)
  const [newProfileId, setNewProfileId] = useState<string | null>(null)
  const [newAccountPlatform, setNewAccountPlatform] = useState<
    "reddit" | "linkedin"
  >("reddit")
  const [isPending, startTransition] = useTransition()

  async function openConnectDialog(platform: "reddit" | "linkedin") {
    setHandleInput("")
    setConnectingPlatform(platform)
    setConnecting(true)

    // LinkedIn: skip the handle form — provision immediately and jump to the
    // browser-login step. Handle is auto-generated; extracted from the
    // session after login (worker pipeline picks up the real identity).
    if (platform === "linkedin") {
      setSubmitting(true)
      const result = await connectAccount("linkedin", "")
      setSubmitting(false)
      if (result.error) {
        toast.error(result.error)
        setConnecting(false)
        return
      }
      setNewAccountId(result.accountId ?? null)
      setNewProfileId(result.profileId ?? null)
      setNewAccountPlatform("linkedin")
    }
  }

  function cancelConnect() {
    setConnecting(false)
    setHandleInput("")
    setNewAccountId(null)
    setNewProfileId(null)
    setNewAccountPlatform("reddit")
  }

  async function submitRedditHandle(e: React.FormEvent) {
    e.preventDefault()
    const handle = handleInput.trim().replace(/^u\//, "")
    if (!handle) return

    setSubmitting(true)
    const result = await connectAccount("reddit", handle)
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    setNewAccountId(result.accountId ?? null)
    setNewProfileId(result.profileId ?? null)
    setNewAccountPlatform("reddit")
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

  function handleReconnect(
    accountId: string,
    profileId: string | null,
    platform: "reddit" | "linkedin",
  ) {
    if (!profileId) {
      toast.error("This account has no browser profile")
      return
    }
    setConnecting(true)
    setNewAccountId(accountId)
    setNewProfileId(profileId)
    setNewAccountPlatform(platform)
  }

  if (accounts.length === 0 && !connecting) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <h2 className="text-xl font-semibold">No accounts connected</h2>
        <p className="max-w-md text-center text-base text-muted-foreground">
          Connect a Reddit or LinkedIn account to start sending messages. Each
          account gets a dedicated browser profile for safety.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => openConnectDialog("reddit")}
            disabled={isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect Reddit Account
          </Button>
          <Button
            variant="outline"
            onClick={() => openConnectDialog("linkedin")}
            disabled={isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect LinkedIn Account
          </Button>
        </div>
      </div>
    )
  }

  const showHandleForm = connecting && !newAccountId && !newProfileId

  return (
    <div className="flex flex-col gap-4">
      {showHandleForm && connectingPlatform === "reddit" && (
        <Card>
          <CardContent>
            <form onSubmit={submitRedditHandle} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  Connect a Reddit account
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter the Reddit username you want to connect. repco will
                  create a dedicated browser profile for this account.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reddit-handle">Reddit username</Label>
                <div className="flex items-center gap-2">
                  <span className="text-base text-muted-foreground">u/</span>
                  <Input
                    id="reddit-handle"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="your_username"
                    autoFocus
                    disabled={submitting}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelConnect}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !handleInput.trim()}
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitting ? "Creating profile..." : "Continue"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {connecting && newAccountId && newProfileId && (
        <ConnectionFlow
          accountId={newAccountId}
          profileId={newProfileId}
          platform={newAccountPlatform}
          onComplete={() => {
            setConnecting(false)
            setNewAccountId(null)
            setNewProfileId(null)
            toast.success("Account connected successfully")
          }}
          onCancel={cancelConnect}
        />
      )}

      {connecting &&
        connectingPlatform === "linkedin" &&
        !newAccountId &&
        submitting && (
          <Card>
            <CardContent className="flex items-center gap-3 py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-base">
                Creating your LinkedIn browser profile...
              </p>
            </CardContent>
          </Card>
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
          onReconnect={handleReconnect}
        />
      ))}

      {accounts.length > 0 && !connecting && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => openConnectDialog("reddit")}
            disabled={isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect Reddit Account
          </Button>
          <Button
            variant="outline"
            onClick={() => openConnectDialog("linkedin")}
            disabled={isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect LinkedIn Account
          </Button>
        </div>
      )}
    </div>
  )
}
