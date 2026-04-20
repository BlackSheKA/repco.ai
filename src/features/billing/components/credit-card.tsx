"use client"

import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface CreditCardProps {
  balance: number
  monitoringBurn: number
  accountBurn: number
  actionBurn: number
  projectedDays: number
}

export function CreditCard({
  balance,
  monitoringBurn,
  accountBurn,
  actionBurn,
  projectedDays,
}: CreditCardProps) {
  const total = monitoringBurn + accountBurn + actionBurn
  const hasBurn = total > 0

  const daysLabel = !hasBurn
    ? "No burn yet"
    : !isFinite(projectedDays)
      ? "Infinite"
      : `${projectedDays} days remaining`

  const daysColor = !hasBurn
    ? "text-muted-foreground"
    : projectedDays > 30
      ? "text-green-600 dark:text-green-500"
      : projectedDays >= 7
        ? "text-orange-500"
        : "text-red-500"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[20px]">Credit Balance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="font-mono text-2xl">{balance}</div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Monitoring</span>
            <span className="font-mono">-{monitoringBurn}/day</span>
          </div>
          <div className="flex justify-between">
            <span>Accounts</span>
            <span className="font-mono">-{accountBurn}/day</span>
          </div>
          <div className="flex justify-between">
            <span>Actions</span>
            <span className="font-mono">~{actionBurn}/day (avg)</span>
          </div>
          <div className="mt-1 flex justify-between border-t pt-1 font-medium text-foreground">
            <span>Total</span>
            <span className="font-mono">-{total}/day</span>
          </div>
        </div>

        <div className={cn("text-sm font-medium", daysColor)}>
          {daysLabel}
        </div>

        {balance < 50 && (
          <Link
            href="/billing"
            className="text-sm font-medium text-primary hover:underline"
          >
            Buy credits
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
