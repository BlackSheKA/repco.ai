"use client"

import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface CreditCardProps {
  balance: number
}

export function CreditCard({ balance }: CreditCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[20px]">Credit Balance</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="font-mono text-2xl">{balance}</div>

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
