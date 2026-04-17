"use client"

import { useTransition } from "react"
import { formatDistanceToNow } from "date-fns"
import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { FlameIndicator } from "./flame-indicator"
import type { IntentSignal } from "../lib/types"

interface SignalCardProps {
  signal: IntentSignal
  onContact: () => Promise<void>
  onDismiss: () => Promise<void>
  onRestore?: () => Promise<void>
  isDismissed?: boolean
}

export function SignalCard({
  signal,
  onContact,
  onDismiss,
  onRestore,
  isDismissed = false,
}: SignalCardProps) {
  const [isPending, startTransition] = useTransition()
  const isActioned = signal.status === "actioned"
  const isClassifying = signal.classification_status === "pending"

  return (
    <div
      role="article"
      className={cn(
        "rounded-lg border bg-card p-4 transition-opacity",
        isDismissed && "opacity-50",
      )}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            className="h-6 rounded-full bg-[#FF4500] text-sm font-medium text-white hover:bg-[#FF4500]/90"
          >
            Reddit
          </Badge>
          {signal.subreddit && (
            <span className="text-sm font-medium text-muted-foreground">
              r/{signal.subreddit}
            </span>
          )}
          {signal.author_handle && (
            <>
              <span className="text-muted-foreground">&middot;</span>
              <span className="text-sm text-muted-foreground">
                u/{signal.author_handle}
              </span>
            </>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(signal.detected_at), {
            addSuffix: true,
          })}
        </span>
      </div>

      {/* Middle row */}
      <p className="mt-2 line-clamp-3 text-base">
        {signal.post_content}
      </p>

      {/* Bottom row */}
      <div className="mt-3 flex items-center justify-between">
        <FlameIndicator
          strength={isClassifying ? null : signal.intent_strength}
        />

        <a
          href={signal.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          View on Reddit
          <ExternalLink className="h-3 w-3" />
        </a>

        <div className="flex items-center gap-2">
          {isDismissed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRestore?.()}
            >
              Restore
            </Button>
          ) : (
            <>
              {isActioned ? (
                <Button variant="default" size="sm" disabled>
                  Contacted
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isPending}
                  aria-label={`Save ${signal.author_handle ?? "author"} as prospect`}
                  onClick={() => {
                    startTransition(async () => {
                      await onContact()
                    })
                  }}
                >
                  {isPending ? "Saving..." : "Contact"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Dismiss signal from ${signal.author_handle ?? "author"}`}
                onClick={() => onDismiss()}
              >
                Dismiss
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
