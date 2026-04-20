"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, X } from "lucide-react"

import { Button } from "@/components/ui/button"

interface UpgradeBannerProps {
  balance: number
}

export function UpgradeBanner({ balance }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (balance >= 50) return null
  if (dismissed) return null

  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
      <p className="flex-1 text-foreground">
        Credits running low -- buy a pack or upgrade
      </p>
      <Button asChild size="sm" variant="default">
        <Link href="/billing">Buy credits</Link>
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="rounded p-1 text-muted-foreground hover:bg-foreground/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
