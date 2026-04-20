"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { ReplyData } from "../lib/use-realtime-replies"

interface ReplyCardProps {
  reply: ReplyData
}

export function ReplyCard({ reply }: ReplyCardProps) {
  const [expanded, setExpanded] = useState(false)
  const handle = reply.handle || "unknown"
  const dmId = `reply-dm-${reply.id}`
  const hasDm = Boolean(reply.original_dm)
  const hasPostUrl = Boolean(reply.post_url)

  const timeAgo = reply.replied_detected_at
    ? formatDistanceToNow(new Date(reply.replied_detected_at), {
        addSuffix: true,
      })
    : ""

  return (
    <article
      role="article"
      aria-label={`Reply from u/${handle}`}
      className="rounded-lg border bg-muted/50 p-4"
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="h-6 rounded-full bg-[#FF4500] text-sm font-medium text-white hover:bg-[#FF4500]/90">
            Reddit
          </Badge>
          <span className="text-xl font-semibold">u/{handle}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          replied {timeAgo}
        </span>
      </div>

      {/* Original DM row (collapsible) */}
      {hasDm && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={dmId}
            className="flex w-full items-center gap-1 text-left text-sm text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span className="font-medium">Your message:</span>
            <span
              id={dmId}
              className={cn(
                "flex-1 text-muted-foreground",
                expanded
                  ? "whitespace-pre-wrap"
                  : "overflow-hidden text-ellipsis whitespace-nowrap",
              )}
            >
              {reply.original_dm}
            </span>
          </button>
        </div>
      )}

      {/* Reply row */}
      <div className="mt-4 rounded-md border-l-[3px] border-primary bg-background p-4">
        <p className="whitespace-pre-wrap text-base leading-relaxed">
          {reply.last_reply_snippet ?? "(reply text unavailable)"}
        </p>
      </div>

      {/* Sequence stopped badge */}
      <div className="mt-2">
        <Badge variant="secondary" className="text-[#22C55E]">
          Sequence stopped -- reply received
        </Badge>
      </div>

      {/* Action row */}
      <div className="mt-4 flex items-center gap-2">
        {hasPostUrl ? (
          <Button
            asChild
            variant="outline"
            size="sm"
            aria-label={`View conversation with u/${handle} on Reddit`}
          >
            <a
              href={reply.post_url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Reddit
              <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            View on Reddit
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled
          aria-label={`View prospect u/${handle} (coming in Phase 5)`}
        >
          View prospect
        </Button>
      </div>
    </article>
  )
}
