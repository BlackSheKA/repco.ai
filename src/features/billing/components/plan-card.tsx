"use client"

import { Check } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { PricingPlan } from "@/features/billing/lib/types"

interface PlanCardProps {
  plan: PricingPlan
  isCurrentPlan: boolean
  onSelect: (priceId: string) => void
  isPending?: boolean
}

const SAVINGS_BY_PERIOD: Record<PricingPlan["period"], number> = {
  monthly: 0,
  quarterly: 29,
  annual: 49,
}

function priceLabel(plan: PricingPlan): string {
  switch (plan.period) {
    case "monthly":
      return "$49/mo"
    case "quarterly":
      return "$35/mo, billed quarterly"
    case "annual":
      return "$25/mo, billed annually"
  }
}

function periodLabel(period: PricingPlan["period"]): string {
  switch (period) {
    case "monthly":
      return "Monthly"
    case "quarterly":
      return "Quarterly"
    case "annual":
      return "Annual"
  }
}

export function PlanCard({
  plan,
  isCurrentPlan,
  onSelect,
  isPending,
}: PlanCardProps) {
  const savings = SAVINGS_BY_PERIOD[plan.period]

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        isCurrentPlan && "ring-2 ring-primary",
      )}
    >
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            {periodLabel(plan.period)}
          </CardTitle>
          {savings > 0 && (
            <Badge
              className="border-transparent text-white"
              style={{ backgroundColor: "oklch(0.72 0.19 142)" }}
            >
              Save {savings}%
            </Badge>
          )}
        </div>
        <p className="text-2xl font-semibold">{priceLabel(plan)}</p>
        <p className="text-sm text-muted-foreground">
          ${plan.totalPrice} billed {plan.period}
        </p>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-3">
        {isCurrentPlan ? (
          <Badge variant="outline" className="w-fit gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Current plan
          </Badge>
        ) : (
          <Button
            onClick={() => onSelect(plan.stripePriceId)}
            disabled={isPending || !plan.stripePriceId}
            className="w-full"
          >
            {isPending ? "Redirecting..." : "Subscribe"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
