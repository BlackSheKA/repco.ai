import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

import {
  anonymizeSignals,
  type IntentType,
  type RawSignal,
} from "@/features/growth/lib/anonymize"
import type { LiveStatsData } from "@/features/growth/components/live-stats"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEFAULT_STATS: LiveStatsData = {
  signals_last_hour: 0,
  signals_last_24h: 0,
  active_users: 0,
  dms_sent_24h: 0,
  replies_24h: 0,
  conversion_rate: 0,
}

export async function GET() {
  const correlationId = logger.createCorrelationId()
  const supabase = await createClient()

  // Aggregate stats -- single row, but we pick the most recently updated
  const statsRes = await supabase
    .from("live_stats")
    .select(
      "signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (statsRes.error) {
    logger.warn("live_stats query failed", {
      correlationId,
      error: statsRes.error.message,
    })
  }

  const stats: LiveStatsData = statsRes.data
    ? {
        signals_last_hour: statsRes.data.signals_last_hour ?? 0,
        signals_last_24h: statsRes.data.signals_last_24h ?? 0,
        active_users: statsRes.data.active_users ?? 0,
        dms_sent_24h: statsRes.data.dms_sent_24h ?? 0,
        replies_24h: statsRes.data.replies_24h ?? 0,
        conversion_rate: Number(statsRes.data.conversion_rate ?? 0),
      }
    : DEFAULT_STATS

  // Public signals -- only is_public = true are exposed via anon RLS policy
  const signalsRes = await supabase
    .from("intent_signals")
    .select(
      "id, platform, intent_type, intent_strength, detected_at, author_handle, post_url, post_content",
    )
    .eq("is_public", true)
    .order("detected_at", { ascending: false })
    .limit(20)

  if (signalsRes.error) {
    logger.warn("intent_signals query failed", {
      correlationId,
      error: signalsRes.error.message,
    })
  }

  const rawSignals: RawSignal[] = (signalsRes.data ?? []).map((row) => ({
    id: row.id,
    platform: row.platform,
    intent_type: (row.intent_type ?? null) as IntentType | null,
    intent_strength: row.intent_strength,
    detected_at: row.detected_at,
    author_handle: row.author_handle,
    post_url: row.post_url,
    post_content: row.post_content,
  }))

  const signals = anonymizeSignals(rawSignals)

  await logger.flush()

  return NextResponse.json(
    { stats, signals },
    {
      headers: {
        // Browsers cache for 10s, stale-while-revalidate for 30s
        "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
      },
    },
  )
}
