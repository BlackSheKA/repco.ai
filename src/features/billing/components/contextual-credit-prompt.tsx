"use client"

import Link from "next/link"

interface ContextualCreditPromptProps {
  actionCost: number
  remainingCredits: number
}

export function ContextualCreditPrompt({
  actionCost,
  remainingCredits,
}: ContextualCreditPromptProps) {
  const lowAbsolute = remainingCredits < 50
  const lowRelative = remainingCredits < actionCost * 2
  if (!lowAbsolute && !lowRelative) return null

  return (
    <div
      role="note"
      className="mt-3 flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
    >
      <span className="text-muted-foreground">
        This DM costs{" "}
        <span className="font-mono font-medium text-foreground">
          {actionCost}
        </span>{" "}
        credits.{" "}
        <span className="font-mono font-medium text-foreground">
          {remainingCredits}
        </span>{" "}
        remaining.
      </span>
      <Link
        href="/billing"
        className="font-medium text-primary hover:underline"
      >
        Buy credits
      </Link>
    </div>
  )
}
