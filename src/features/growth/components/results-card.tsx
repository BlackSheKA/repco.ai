import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export interface WeeklyStats {
  signals: number
  dms: number
  replies: number
  replyRate: number
  conversions: number
}

interface WeeklyStatsCardProps {
  stats: WeeklyStats
}

export function WeeklyStatsCard({ stats }: WeeklyStatsCardProps) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Signals", value: String(stats.signals) },
    { label: "DMs sent", value: String(stats.dms) },
    { label: "Replies", value: String(stats.replies) },
    { label: "Reply rate", value: `${stats.replyRate}%` },
    { label: "Conversions", value: String(stats.conversions) },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between gap-2 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Last 7 days
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col">
              <div className="font-mono text-lg leading-tight">
                {item.value}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
