"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"

interface CreditBalanceProps {
  balance: number
  dailyBurn: number
}

export function CreditBalance({ balance, dailyBurn }: CreditBalanceProps) {
  const isCritical = balance < 50
  const isWarning = !isCritical && balance < 100

  return (
    <Link
      href="/billing"
      aria-label={`Credits: ${balance}, burning ${dailyBurn} per day`}
      className={cn(
        "block rounded-md px-2 py-1.5 text-sm transition-colors",
        "hover:bg-sidebar-accent hover:underline cursor-pointer",
        isCritical && "text-red-500",
        isWarning && "text-orange-500",
        !isCritical && !isWarning && "text-muted-foreground",
      )}
    >
      <span className="font-mono">{balance}</span>
      <span> credits &middot; </span>
      <span className="font-mono">-{dailyBurn}</span>
      <span>/day</span>
    </Link>
  )
}
