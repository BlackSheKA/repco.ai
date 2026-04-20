"use client"

import { useState } from "react"
import { TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface InboxWarningBannerProps {
  accountHandle: string
  lastSuccessfulCheck: string | null
}

function formatHoursAgo(iso: string | null): string {
  if (!iso) return "unknown"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "unknown"
  const hours = Math.max(0, Math.floor((Date.now() - then) / (60 * 60 * 1000)))
  return `${hours}h`
}

export function InboxWarningBanner({
  accountHandle,
  lastSuccessfulCheck,
}: InboxWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const hoursAgo = formatHoursAgo(lastSuccessfulCheck)

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <div className="flex items-center gap-2">
        <TriangleAlert
          className="h-5 w-5 text-amber-500"
          aria-hidden="true"
        />
        <p className="text-sm">
          Reply check failed for @{accountHandle} -- last successful check:{" "}
          {hoursAgo} ago
        </p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss warning"
            onClick={() => setDismissed(true)}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dismiss</TooltipContent>
      </Tooltip>
    </div>
  )
}
