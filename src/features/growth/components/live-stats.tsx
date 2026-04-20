"use client"

export interface LiveStatsData {
  signals_last_hour: number
  signals_last_24h: number
  active_users: number
  dms_sent_24h: number
  replies_24h: number
  conversion_rate: number
}

interface LiveStatsProps {
  stats: LiveStatsData
}

interface StatItem {
  label: string
  value: string
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

export function LiveStats({ stats }: LiveStatsProps) {
  const items: StatItem[] = [
    { label: "Last hour", value: formatNumber(stats.signals_last_hour) },
    { label: "Last 24h", value: formatNumber(stats.signals_last_24h) },
    { label: "Active users", value: formatNumber(stats.active_users) },
    { label: "DMs sent", value: formatNumber(stats.dms_sent_24h) },
    { label: "Replies", value: formatNumber(stats.replies_24h) },
    {
      label: "Conversion rate",
      value: formatPercent(stats.conversion_rate),
    },
  ]

  return (
    <div
      role="list"
      aria-label="Live stats"
      className="grid grid-cols-3 gap-4 md:grid-cols-6"
    >
      {items.map((item) => (
        <div
          key={item.label}
          role="listitem"
          className="flex flex-col items-center gap-1 rounded-lg border bg-card px-4 py-3"
        >
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {item.value}
          </span>
          <span className="text-sm text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  )
}
