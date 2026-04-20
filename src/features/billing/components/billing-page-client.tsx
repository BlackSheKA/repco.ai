"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { createCheckoutSession } from "@/features/billing/actions/checkout"
import { cancelSubscription } from "@/features/billing/actions/manage-subscription"
import { PlanCard } from "@/features/billing/components/plan-card"
import { CreditPackCard } from "@/features/billing/components/credit-pack-card"
import type {
  CreditPack,
  PricingPlan,
} from "@/features/billing/lib/types"

interface BillingPageClientProps {
  view: "plans" | "packs" | "cancel"
  plans: PricingPlan[]
  packs: CreditPack[]
  currentPlanPriceId: string | null
  subscriptionActive: boolean
  successParam?: string
  canceledParam?: string
}

type BillingPeriod = PricingPlan["period"]

export function BillingPageClient({
  view,
  plans,
  packs,
  currentPlanPriceId,
  successParam,
  canceledParam,
}: BillingPageClientProps) {
  const [isPending, startTransition] = useTransition()
  const [selectedPeriod, setSelectedPeriod] =
    useState<BillingPeriod>("annual")
  const [toastShown, setToastShown] = useState(false)

  // Surface success/canceled toasts from Stripe redirect
  useEffect(() => {
    if (toastShown) return
    if (successParam === "true") {
      toast.success("Payment successful — your account is updated.")
      setToastShown(true)
    } else if (canceledParam === "true") {
      toast("Checkout canceled. You have not been charged.")
      setToastShown(true)
    }
  }, [successParam, canceledParam, toastShown])

  function handleSubscribe(priceId: string) {
    startTransition(async () => {
      try {
        await createCheckoutSession(priceId, "subscription")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // NEXT_REDIRECT is Next.js internal signal for server action redirect;
        // the browser navigates, no error to show.
        if (!message.includes("NEXT_REDIRECT")) {
          toast.error(`Could not start checkout: ${message}`)
        }
      }
    })
  }

  function handleBuyPack(priceId: string) {
    startTransition(async () => {
      try {
        await createCheckoutSession(priceId, "payment")
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!message.includes("NEXT_REDIRECT")) {
          toast.error(`Could not start checkout: ${message}`)
        }
      }
    })
  }

  function handleCancel() {
    startTransition(async () => {
      try {
        const result = await cancelSubscription()
        if (result.success) {
          const date = result.endsAt
            ? new Date(result.endsAt * 1000).toLocaleDateString()
            : "end of billing period"
          toast.success(`Subscription will end on ${date}.`)
        } else {
          toast.error(result.message ?? "Could not cancel subscription.")
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error(`Cancellation failed: ${message}`)
      }
    })
  }

  if (view === "plans") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-1 self-start">
          {(["monthly", "quarterly", "annual"] as BillingPeriod[]).map(
            (period) => (
              <button
                key={period}
                type="button"
                onClick={() => setSelectedPeriod(period)}
                className={`rounded-sm px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  selectedPeriod === period
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {period}
              </button>
            ),
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.period}
              plan={plan}
              isCurrentPlan={plan.stripePriceId === currentPlanPriceId}
              onSelect={handleSubscribe}
              isPending={isPending}
            />
          ))}
        </div>
        {plans.length === 0 ? null : (
          <p className="text-xs text-muted-foreground">
            Selected period:{" "}
            <span className="font-medium capitalize">{selectedPeriod}</span>
          </p>
        )}
      </div>
    )
  }

  if (view === "packs") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Need more credits? Buy a pack anytime.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {packs.map((pack) => (
            <CreditPackCard
              key={pack.name}
              pack={pack}
              onBuy={handleBuyPack}
              isPending={isPending}
            />
          ))}
        </div>
      </div>
    )
  }

  // view === "cancel"
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Manage subscription
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              Cancel subscription
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel subscription</AlertDialogTitle>
              <AlertDialogDescription>
                Your plan stays active until the end of the billing period. You
                will not be charged again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep subscription</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel}>
                Confirm cancellation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
