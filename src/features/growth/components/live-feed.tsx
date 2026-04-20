"use client"

import { useEffect, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"

import type { AnonymizedSignal } from "../lib/anonymize"
import { AnonymizedSignalCard } from "./anonymized-signal-card"
import { LiveStats, type LiveStatsData } from "./live-stats"

interface LiveFeedProps {
  initialSignals: AnonymizedSignal[]
  initialStats: LiveStatsData
}

const POLL_INTERVAL_MS = 10000
const MAX_SIGNALS = 50

interface LivePayload {
  stats: LiveStatsData
  signals: AnonymizedSignal[]
}

export function LiveFeed({ initialSignals, initialStats }: LiveFeedProps) {
  const [signals, setSignals] = useState<AnonymizedSignal[]>(initialSignals)
  const [stats, setStats] = useState<LiveStatsData>(initialStats)
  const [loading, setLoading] = useState(initialSignals.length === 0)
  const knownIdsRef = useRef<Set<string>>(
    new Set(initialSignals.map((s) => s.id)),
  )

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch("/api/live", { cache: "no-store" })
        if (!res.ok) return
        const payload = (await res.json()) as LivePayload
        if (cancelled) return

        setStats(payload.stats)

        const incoming = payload.signals ?? []
        const fresh: AnonymizedSignal[] = []
        for (const sig of incoming) {
          if (!knownIdsRef.current.has(sig.id)) {
            knownIdsRef.current.add(sig.id)
            fresh.push(sig)
          }
        }

        if (fresh.length > 0) {
          setSignals((prev) => {
            const combined = [...fresh, ...prev]
            if (combined.length > MAX_SIGNALS) {
              for (const dropped of combined.slice(MAX_SIGNALS)) {
                knownIdsRef.current.delete(dropped.id)
              }
              return combined.slice(0, MAX_SIGNALS)
            }
            return combined
          })
        }
        setLoading(false)
      } catch {
        // Silent retry on public page (network hiccup, offline, etc.)
      }
    }

    // Initial poll catches any drift between server render and mount.
    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <LiveStats stats={stats} />

      <div className="flex flex-col gap-3">
        {loading && signals.length === 0 ? (
          <LoadingSkeleton />
        ) : signals.length === 0 ? (
          <EmptyState />
        ) : (
          signals.map((signal, idx) => (
            <AnonymizedSignalCard
              key={signal.id}
              signal={signal}
              animateIn={idx < 3}
            />
          ))
        )}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
      No signals yet. Fresh ones appear here in real time.
    </div>
  )
}
