"use client"

import { Card, CardContent } from "@/components/ui/card"

import { ShareButtons, type ResultsCardStats } from "./share-buttons"

interface ResultsCardProps {
  stats: ResultsCardStats
  imageUrl: string
}

export function ResultsCard({ stats, imageUrl }: ResultsCardProps) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Posts scanned", value: String(stats.scanned) },
    { label: "Signals", value: String(stats.signals) },
    { label: "DMs sent", value: String(stats.dms) },
    { label: "Replies", value: String(stats.replies) },
    { label: "Reply rate", value: `${stats.replyRate}%` },
    { label: "Conversions", value: String(stats.conversions) },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div
          aria-label="Weekly results preview"
          className="relative overflow-hidden rounded-lg"
          style={{
            background: "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
            color: "#ffffff",
            padding: "32px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "4px",
              background: "#4338CA",
            }}
          />
          <div className="mb-6 text-2xl font-semibold tracking-tight">
            repco weekly
          </div>
          <div className="grid grid-cols-3 gap-3">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex flex-col rounded-md border border-white/10 bg-white/5 p-4"
              >
                <div className="text-3xl font-bold leading-tight">
                  {item.value}
                </div>
                <div className="mt-1 text-xs text-stone-400">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-right text-xs text-stone-500">
            repco.ai
          </div>
        </div>

        <ShareButtons imageUrl={imageUrl} stats={stats} />
      </CardContent>
    </Card>
  )
}
