"use client"

import { useEffect, useState } from "react"
import { WarningIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

interface Status {
  lastSuccessAt: string | null
  hoursAgo: number | null
}

/**
 * Dashboard banner shown when the last successful LinkedIn monitoring run
 * is older than 8h (delayed) or 12h (failed). Self-returns null when healthy.
 * Polls /api/status/linkedin every 5 minutes.
 */
export function StalenessBanner() {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/status/linkedin")
        if (!res.ok) return
        const data = (await res.json()) as Status
        if (!cancelled) setStatus(data)
      } catch {
        // Swallow network errors — banner stays hidden until next poll
      }
    }
    load()
    const id = setInterval(load, 5 * 60 * 1000) // 5-min refresh
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const h = status?.hoursAgo
  if (!status || h == null || h < 8) return null

  const failed = h >= 12
  const rounded = Math.floor(h)
  const text = failed
    ? `LinkedIn monitoring failed — last successful check: ${rounded}h ago. Retrying automatically.`
    : `LinkedIn monitoring delayed — last successful check: ${rounded}h ago`

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm",
        "bg-amber-50 border-amber-200 text-amber-800",
        "dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-200",
      )}
    >
      <WarningIcon
        size={16}
        className="text-amber-600 dark:text-amber-400"
      />
      <span>{text}</span>
    </div>
  )
}
