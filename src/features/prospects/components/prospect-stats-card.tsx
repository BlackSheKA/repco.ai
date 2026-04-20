import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ProspectStatsCardProps {
  total: number
  replied: number
  converted: number
  avgDealValue: number | null
}

export function ProspectStatsCard({
  total,
  replied,
  converted,
  avgDealValue,
}: ProspectStatsCardProps) {
  const revenue =
    avgDealValue !== null && avgDealValue > 0 ? avgDealValue * converted : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[20px]">Prospects</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col">
            <div className="font-mono text-2xl">{total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="flex flex-col">
            <div className="font-mono text-2xl">{replied}</div>
            <div className="text-xs text-muted-foreground">Replied</div>
          </div>
          <div className="flex flex-col">
            <div className="font-mono text-2xl">{converted}</div>
            <div className="text-xs text-muted-foreground">Converted</div>
          </div>
        </div>

        <div className="flex flex-col border-t pt-3">
          <div className="text-xs text-muted-foreground">Est. revenue</div>
          {revenue !== null ? (
            <div className="font-mono text-xl">${revenue.toLocaleString()}</div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Set your average deal value in{" "}
              <Link
                href="/settings"
                className="text-primary hover:underline"
              >
                Settings
              </Link>{" "}
              to see estimated revenue.
            </div>
          )}
        </div>

        <Link
          href="/prospects"
          className="text-sm font-medium text-primary hover:underline"
        >
          View pipeline
        </Link>
      </CardContent>
    </Card>
  )
}
