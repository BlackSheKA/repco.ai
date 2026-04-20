import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"

import { LiveFeed } from "@/features/growth/components/live-feed"
import type { LiveStatsData } from "@/features/growth/components/live-stats"
import {
  anonymizeSignals,
  type IntentType,
  type RawSignal,
} from "@/features/growth/lib/anonymize"

export const metadata: Metadata = {
  title: "repco is watching",
  description:
    "Real-time intent signals from across the internet. See who is looking for your product right now.",
}

export const dynamic = "force-dynamic"

const DEFAULT_STATS: LiveStatsData = {
  signals_last_hour: 0,
  signals_last_24h: 0,
  active_users: 0,
  dms_sent_24h: 0,
  replies_24h: 0,
  conversion_rate: 0,
}

export default async function LivePage() {
  const supabase = await createClient()

  const [statsRes, signalsRes] = await Promise.all([
    supabase
      .from("live_stats")
      .select(
        "signals_last_hour, signals_last_24h, active_users, dms_sent_24h, replies_24h, conversion_rate",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intent_signals")
      .select(
        "id, platform, intent_type, intent_strength, detected_at, author_handle, post_url, post_content",
      )
      .eq("is_public", true)
      .order("detected_at", { ascending: false })
      .limit(20),
  ])

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

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-10 px-6 py-16">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-[28px] font-semibold leading-tight">
          repco is watching
        </h1>
        <p className="text-base text-muted-foreground">
          Real-time intent signals from across the internet
        </p>
      </section>

      <LiveFeed initialSignals={signals} initialStats={stats} />
    </div>
  )
}
