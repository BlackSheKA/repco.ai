"use client"

import { MessageSquare } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HealthBadge } from "./health-badge"
import { WarmupProgress } from "./warmup-progress"
import type {
  SocialAccount,
  AccountDailyUsage,
} from "@/features/accounts/lib/types"

interface AccountCardProps {
  account: SocialAccount
  usage: AccountDailyUsage
  onSkipWarmup: (accountId: string) => void
  onAssignPlatform: (accountId: string, platform: "reddit" | "linkedin") => void
}

function formatTimeAgo(dateString: string): string {
  const now = Date.now()
  const date = new Date(dateString).getTime()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function LimitDisplay({
  used,
  max,
  label,
}: {
  used: number
  max: number
  label: string
}) {
  const ratio = max > 0 ? used / max : 0
  const atLimit = used >= max
  const nearLimit = ratio > 0.8

  let numberClass = ""
  if (atLimit) {
    numberClass = "text-amber-500"
  } else if (nearLimit) {
    numberClass = "text-amber-500/60"
  }

  return (
    <div
      className="flex flex-col items-center"
      aria-label={`${used} of ${max} ${label} used today`}
    >
      <span className={`text-xl ${numberClass}`}>
        {used}/{max}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function AccountCard({
  account,
  usage,
  onSkipWarmup,
  onAssignPlatform,
}: AccountCardProps) {
  const username = account.handle ?? "unknown"

  return (
    <Card
      role="article"
      aria-label={`Account ${username}`}
    >
      <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left section */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <span className="text-xl font-semibold">{username}</span>
            <HealthBadge status={account.health_status} />
          </div>
          <span className="text-sm text-muted-foreground">
            Last action: {formatTimeAgo(account.created_at)}
          </span>
          <div className="mt-2">
            <span className="text-sm text-muted-foreground">
              Responds to:
            </span>
            <Select
              value={account.platform}
              onValueChange={(value) =>
                onAssignPlatform(
                  account.id,
                  value as "reddit" | "linkedin",
                )
              }
            >
              <SelectTrigger className="mt-1 h-8 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reddit">Reddit</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Center section */}
        <div className="min-w-48">
          <WarmupProgress
            warmupDay={account.warmup_day}
            completedAt={account.warmup_completed_at}
            username={username}
            onSkipWarmup={() => onSkipWarmup(account.id)}
          />
        </div>

        {/* Right section -- Daily limits */}
        <div className="flex gap-4">
          <LimitDisplay
            used={usage.dm_count}
            max={usage.dm_limit}
            label="DMs"
          />
          <LimitDisplay
            used={usage.engage_count}
            max={usage.engage_limit}
            label="Engage"
          />
          <LimitDisplay
            used={usage.reply_count}
            max={usage.reply_limit}
            label="Replies"
          />
        </div>
      </CardContent>
    </Card>
  )
}
