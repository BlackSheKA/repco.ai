"use client"

import { Flame } from "lucide-react"

import { cn } from "@/lib/utils"

interface FlameIndicatorProps {
  strength: number | null
}

function getTier(strength: number) {
  if (strength >= 7) return { label: "hot", color: "text-[#4338CA]", opacity: 1.0 }
  if (strength >= 4) return { label: "warm", color: "text-amber-500", opacity: 0.8 }
  return { label: "cold", color: "text-zinc-400", opacity: 0.5 }
}

export function FlameIndicator({ strength }: FlameIndicatorProps) {
  if (strength == null) {
    return (
      <span className="animate-pulse text-sm font-medium text-muted-foreground">
        Classifying...
      </span>
    )
  }

  const tier = getTier(strength)

  return (
    <div
      className="flex items-center gap-1"
      aria-label={`Intent strength ${strength} out of 10, ${tier.label}`}
    >
      <Flame
        className={cn("h-4 w-4", tier.color)}
        style={{ opacity: tier.opacity }}
      />
      <span className={cn("text-sm font-medium", tier.color)}>
        {strength}/10
      </span>
    </div>
  )
}
