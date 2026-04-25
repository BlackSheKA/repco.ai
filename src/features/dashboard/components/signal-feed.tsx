"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { createClient } from "@/lib/supabase/client"

import { SignalCard } from "./signal-card"
import {
  FilterBar,
  getFiltersFromParams,
  type Filters,
} from "./filter-bar"
import { StalenessBanner } from "./staleness-banner"
import { useRealtimeSignals } from "../lib/use-realtime-signals"
import {
  contactSignal,
  dismissSignal,
  restoreSignal,
} from "../actions/signal-actions"
import type { IntentSignal } from "../lib/types"

const PAGE_SIZE = 20

interface SignalFeedProps {
  initialSignals: IntentSignal[]
  userId: string
  /**
   * Render a trimmed dashboard preview: hides filters and infinite scroll,
   * caps to the first 5 signals, and shows a "View all signals" link.
   */
  compact?: boolean
}

const COMPACT_LIMIT = 5

export function SignalFeed({
  initialSignals,
  userId,
  compact = false,
}: SignalFeedProps) {
  const searchParams = useSearchParams()
  const [signals, setSignals] = useState<IntentSignal[]>(initialSignals)
  const [filters, setFilters] = useState<Filters>(() =>
    getFiltersFromParams(searchParams),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(
    initialSignals.length >= PAGE_SIZE,
  )
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { newSignals, clearNewSignals } = useRealtimeSignals(userId)

  // Merge realtime signals into local state
  useEffect(() => {
    if (newSignals.length > 0) {
      setSignals((prev) => {
        const existingIds = new Set(prev.map((s) => s.id))
        const unique = newSignals.filter((s) => !existingIds.has(s.id))
        return [...unique, ...prev]
      })
      clearNewSignals()
    }
  }, [newSignals, clearNewSignals])

  // Filter signals client-side
  const filteredSignals = useMemo(() => {
    return signals.filter((signal) => {
      if (
        filters.platform !== "all" &&
        signal.platform !== filters.platform
      ) {
        return false
      }
      if (filters.minIntent > 0) {
        if (
          signal.intent_strength == null ||
          signal.intent_strength < filters.minIntent
        ) {
          return false
        }
      }
      if (!filters.showDismissed && signal.dismissed_at != null) {
        return false
      }
      return true
    })
  }, [signals, filters])

  // Infinite scroll
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return
    setIsLoading(true)

    const supabase = createClient()
    let query = supabase
      .from("intent_signals")
      .select("*")
      .eq("user_id", userId)
      .order("detected_at", { ascending: false })
      .range(signals.length, signals.length + PAGE_SIZE - 1)

    if (!filters.showDismissed) {
      query = query.is("dismissed_at", null)
    }

    const { data } = await query

    if (data) {
      setSignals((prev) => {
        const existingIds = new Set(prev.map((s) => s.id))
        const unique = data.filter(
          (s: IntentSignal) => !existingIds.has(s.id),
        )
        return [...prev, ...unique]
      })
      setHasMore(data.length >= PAGE_SIZE)
    } else {
      setHasMore(false)
    }

    setIsLoading(false)
  }, [isLoading, hasMore, signals.length, userId, filters.showDismissed])

  // IntersectionObserver for sentinel
  useEffect(() => {
    if (compact) return
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore()
        }
      },
      { threshold: 0.1 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore, compact])

  // Optimistic action handlers
  const handleContact = useCallback(
    async (signalId: string) => {
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, status: "actioned" } : s,
        ),
      )

      const result = await contactSignal(signalId)

      if (result.error) {
        setSignals((prev) =>
          prev.map((s) =>
            s.id === signalId ? { ...s, status: "pending" } : s,
          ),
        )
        toast.error(result.error)
      } else {
        toast.success(
          "Prospect saved -- outreach available in Phase 3",
        )
      }
    },
    [],
  )

  const handleDismiss = useCallback(
    async (signalId: string) => {
      const now = new Date().toISOString()
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, dismissed_at: now } : s,
        ),
      )

      const result = await dismissSignal(signalId)

      if (result.error) {
        setSignals((prev) =>
          prev.map((s) =>
            s.id === signalId ? { ...s, dismissed_at: null } : s,
          ),
        )
        toast.error(result.error)
      }
    },
    [],
  )

  const handleRestore = useCallback(
    async (signalId: string) => {
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, dismissed_at: null } : s,
        ),
      )

      const result = await restoreSignal(signalId)

      if (result.error) {
        const now = new Date().toISOString()
        setSignals((prev) =>
          prev.map((s) =>
            s.id === signalId ? { ...s, dismissed_at: now } : s,
          ),
        )
        toast.error(result.error)
      }
    },
    [],
  )

  // Empty states
  const isEmpty = filteredSignals.length === 0 && !isLoading
  const isNoSignalsAtAll = signals.length === 0
  const isFilteredEmpty = !isNoSignalsAtAll && isEmpty

  const displaySignals = compact
    ? filteredSignals.slice(0, COMPACT_LIMIT)
    : filteredSignals
  const hasMoreInCompact =
    compact && filteredSignals.length > COMPACT_LIMIT

  return (
    <div>
      <StalenessBanner />
      {!compact && (
        <div className="mt-2">
          <FilterBar filters={filters} onFiltersChange={setFilters} />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4">
        {isEmpty && isNoSignalsAtAll && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-lg font-semibold">No signals yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              repco is scanning Reddit and LinkedIn for intent signals. Add
              keywords, subreddits, or LinkedIn targets on the Sources tab to
              get started.
            </p>
          </div>
        )}

        {isFilteredEmpty && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-lg font-semibold">
              No signals match these filters
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Try lowering the minimum intent strength or clearing
              filters.
            </p>
          </div>
        )}

        {displaySignals.map((signal) => (
          <div
            key={signal.id}
            className="animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <SignalCard
              signal={signal}
              isDismissed={signal.dismissed_at != null}
              onContact={() => handleContact(signal.id)}
              onDismiss={() => handleDismiss(signal.id)}
              onRestore={() => handleRestore(signal.id)}
            />
          </div>
        ))}

        {!compact && isLoading && (
          <>
            <Skeleton className="h-[140px] rounded-lg" />
            <Skeleton className="h-[140px] rounded-lg" />
            <Skeleton className="h-[140px] rounded-lg" />
          </>
        )}

        {compact && hasMoreInCompact && (
          <div className="flex justify-center pt-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/signals">
                View all signals →
              </Link>
            </Button>
          </div>
        )}

        {!compact && <div ref={sentinelRef} className="h-1" />}
      </div>
    </div>
  )
}
