"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import type { AnonymizedSignal } from "../lib/anonymize"

interface AnonymizedSignalCardProps {
  signal: AnonymizedSignal
  /**
   * When true, the card starts with opacity 0 and transitions to 1 on mount,
   * giving newly-prepended cards a gentle fade-in on the /live feed.
   */
  animateIn?: boolean
}

export function AnonymizedSignalCard({
  signal,
  animateIn = false,
}: AnonymizedSignalCardProps) {
  const [visible, setVisible] = useState(!animateIn)

  useEffect(() => {
    if (!animateIn) return
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [animateIn])

  const platformLabel = signal.platform === "reddit" ? "Reddit" : "LinkedIn"
  const platformClass =
    signal.platform === "reddit"
      ? "bg-[#FF4500] text-white hover:bg-[#FF4500]/90"
      : "bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90"

  return (
    <div
      role="article"
      className={cn(
        "rounded-lg border bg-card p-4 transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            className={cn(
              "h-6 rounded-full text-sm font-medium",
              platformClass,
            )}
          >
            {platformLabel}
          </Badge>
          <StrengthBadge strength={signal.intent_strength} />
        </div>
        <span className="text-sm text-muted-foreground">
          {formatDistanceToNow(new Date(signal.detected_at), {
            addSuffix: true,
          })}
        </span>
      </div>

      <p className="mt-2 text-base">{signal.description}</p>
    </div>
  )
}

function StrengthBadge({ strength }: { strength: number | null }) {
  if (strength == null) return null

  let tone = "text-zinc-500"
  let label = "cold"
  if (strength >= 7) {
    tone = "text-[#4338CA]"
    label = "hot"
  } else if (strength >= 4) {
    tone = "text-amber-500"
    label = "warm"
  }

  return (
    <span
      className={cn("text-sm font-medium", tone)}
      aria-label={`Intent strength ${strength} out of 10, ${label}`}
    >
      {strength}/10
    </span>
  )
}
