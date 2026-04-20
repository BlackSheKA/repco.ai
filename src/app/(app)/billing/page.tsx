import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { createClient } from "@/lib/supabase/server"

import {
  CREDIT_PACKS,
  PRICING_PLANS,
  type PricingPlan,
} from "@/features/billing/lib/types"
import {
  calculateDailyBurn,
} from "@/features/billing/lib/credit-burn"
import { getInvoices } from "@/features/billing/actions/manage-subscription"
import { BillingHistory } from "@/features/billing/components/billing-history"
import { BillingPageClient } from "@/features/billing/components/billing-page-client"

export const metadata: Metadata = {
  title: "Billing",
}

interface BillingPageProps {
  searchParams?: Promise<{ success?: string; canceled?: string }>
}

export default async function BillingPage({
  searchParams,
}: BillingPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [{ data: profile }, { data: signals }, { data: accounts }, invoices] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "stripe_customer_id, billing_period, subscription_active, credits_balance, trial_ends_at",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("monitoring_signals")
        .select("signal_type, active")
        .eq("user_id", user.id),
      supabase
        .from("social_accounts")
        .select("platform, active")
        .eq("user_id", user.id),
      getInvoices(),
    ])

  const creditsBalance = (profile?.credits_balance as number | null) ?? 0
  const billingPeriod =
    (profile?.billing_period as PricingPlan["period"] | null) ?? null
  const subscriptionActive = Boolean(profile?.subscription_active)
  const trialEndsAtRaw = profile?.trial_ends_at as string | null | undefined

  const dailyBurn = calculateDailyBurn(signals ?? [], accounts ?? [])
  const projectedDays =
    dailyBurn > 0 ? Math.floor(creditsBalance / dailyBurn) : null

  const now = Date.now()
  const trialEndsAt = trialEndsAtRaw ? new Date(trialEndsAtRaw).getTime() : null
  const trialActive = Boolean(
    trialEndsAt && trialEndsAt > now && !subscriptionActive,
  )
  const trialExpired = Boolean(
    trialEndsAt && trialEndsAt <= now && !subscriptionActive,
  )
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)))
    : 0

  const currentPlanPriceId = billingPeriod
    ? (PRICING_PLANS.find((p) => p.period === billingPeriod)?.stripePriceId ??
      null)
    : null

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your subscription, credits, and invoices.
          </p>
        </div>
        {trialActive && (
          <Badge
            className="border-transparent text-white"
            style={{ backgroundColor: "oklch(0.72 0.19 142)" }}
          >
            Trial · {trialDaysLeft} days left
          </Badge>
        )}
      </div>

      {trialExpired && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-lg">Your trial has ended</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Subscribe to keep scanning. Your signals and prospects are saved.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Tabs defaultValue="plans" className="w-full">
            <TabsList>
              <TabsTrigger value="plans">Plans</TabsTrigger>
              <TabsTrigger value="packs">Credit Packs</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="plans" className="mt-4">
              <BillingPageClient
                view="plans"
                plans={PRICING_PLANS}
                packs={CREDIT_PACKS}
                currentPlanPriceId={currentPlanPriceId}
                subscriptionActive={subscriptionActive}
                successParam={resolvedSearchParams.success}
                canceledParam={resolvedSearchParams.canceled}
              />
            </TabsContent>

            <TabsContent value="packs" className="mt-4">
              <BillingPageClient
                view="packs"
                plans={PRICING_PLANS}
                packs={CREDIT_PACKS}
                currentPlanPriceId={currentPlanPriceId}
                subscriptionActive={subscriptionActive}
                successParam={resolvedSearchParams.success}
                canceledParam={resolvedSearchParams.canceled}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <BillingHistory invoices={invoices} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="gap-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Credit balance
              </CardTitle>
              <p className="font-mono text-3xl font-semibold">
                {creditsBalance.toLocaleString()}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Daily burn</span>
                <span className="font-mono">
                  {dailyBurn > 0 ? `-${dailyBurn}/day` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Projected runway</span>
                <span className="font-mono">
                  {projectedDays !== null ? `${projectedDays} days` : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {subscriptionActive && (
            <BillingPageClient
              view="cancel"
              plans={PRICING_PLANS}
              packs={CREDIT_PACKS}
              currentPlanPriceId={currentPlanPriceId}
              subscriptionActive={subscriptionActive}
              successParam={resolvedSearchParams.success}
              canceledParam={resolvedSearchParams.canceled}
            />
          )}
        </div>
      </div>
    </div>
  )
}
