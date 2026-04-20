"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CreditPack } from "@/features/billing/lib/types"

interface CreditPackCardProps {
  pack: CreditPack
  onBuy: (priceId: string) => void
  isPending?: boolean
}

function perCreditCost(pack: CreditPack): string {
  const cost = pack.price / pack.credits
  return `$${cost.toFixed(3)}/credit`
}

export function CreditPackCard({ pack, onBuy, isPending }: CreditPackCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="gap-2">
        <CardTitle className="text-base font-medium">{pack.name}</CardTitle>
        <p className="font-mono text-2xl font-semibold">
          {pack.credits.toLocaleString()}
        </p>
        <p className="text-sm text-muted-foreground">credits</p>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-semibold">${pack.price}</span>
          <span className="text-xs text-muted-foreground">
            {perCreditCost(pack)}
          </span>
        </div>
        <Button
          onClick={() => onBuy(pack.stripePriceId)}
          disabled={isPending || !pack.stripePriceId}
          className="w-full"
        >
          {isPending ? "Redirecting..." : "Buy credits"}
        </Button>
      </CardContent>
    </Card>
  )
}
