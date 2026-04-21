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
  const isLinkedIn = signal.platform === "linkedin"

  const contactLabel = isLinkedIn ? "Connect" : "Contact"
  const contactedLabel = isLinkedIn ? "Connected" : "Contacted"
  const viewLinkLabel = isLinkedIn ? "View on LinkedIn" : "View on Reddit"
  const contactAriaLabel = isLinkedIn
    ? `Connect with ${signal.author_handle ?? "author"}`
    : `Save ${signal.author_handle ?? "author"} as prospect`

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
        <div className="flex min-w-0 items-center gap-2">
          {isLinkedIn ? (
            <Badge
              className="h-6 rounded-full bg-[#0A66C2] px-2 text-sm font-normal text-white hover:bg-[#0A66C2]/90"
            >
              LinkedIn
            </Badge>
          ) : (
            <Badge
              className="h-6 rounded-full bg-[#FF4500] text-sm font-medium text-white hover:bg-[#FF4500]/90"
            >
              Reddit
            </Badge>
          )}

          {isLinkedIn ? (
            <>
              {signal.author_handle && (
                <span className="text-sm text-muted-foreground">
                  {signal.author_handle}
                </span>
              )}
              {signal.author_headline && (
                <>
                  <span className="text-sm text-muted-foreground">&middot;</span>
                  <span className="max-w-[60%] truncate text-sm text-muted-foreground">
                    {signal.author_headline}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              {signal.subreddit && (
                <span className="text-sm font-medium text-muted-foreground">
                  {signal.subreddit}
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
          {viewLinkLabel}
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
                  {contactedLabel}
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isPending}
                  aria-label={contactAriaLabel}
                  onClick={() => {
                    startTransition(async () => {
                      await onContact()
                    })
                  }}
                >
                  {isPending ? "Saving..." : contactLabel}
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
