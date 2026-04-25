"use server"

import Stripe from "stripe"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")

export interface InvoiceSummary {
  id: string
  amount_paid: number
  currency: string
  status: string
  created: number
  invoice_pdf: string | null
  period_start: number
  period_end: number
}

export async function cancelSubscription(): Promise<{
  success: boolean
  endsAt: number | null
  message?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  const customerId = profile?.stripe_customer_id as string | null | undefined

  if (!customerId) {
    return {
      success: false,
      endsAt: null,
      message: "No Stripe customer on record",
    }
  }

  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 5,
  })

  if (subs.data.length === 0) {
    return {
      success: false,
      endsAt: null,
      message: "No active subscription found",
    }
  }

  const subscription = subs.data[0]
  const updated = await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: true,
  })

  // Stripe v22+ moved current_period_end to SubscriptionItem
  const firstItem = updated.items.data[0]
  const endsAt = firstItem?.current_period_end ?? null

  logger.info("Subscription marked for cancellation at period end", {
    userId: user.id,
    subscriptionId: subscription.id,
    endsAt,
  })

  return {
    success: true,
    endsAt,
  }
}

export async function getInvoices(): Promise<InvoiceSummary[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  const customerId = profile?.stripe_customer_id as string | null | undefined

  if (!customerId) {
    return []
  }

  let invoices: Stripe.ApiList<Stripe.Invoice>
  try {
    invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 20,
    })
  } catch (err) {
    // Stale customer ID (e.g. test-mode id stored before live keys were swapped
    // in). Treat as "no invoices" rather than crashing the billing page.
    if (
      err instanceof Stripe.errors.StripeInvalidRequestError &&
      err.code === "resource_missing"
    ) {
      logger.warn("Stale stripe_customer_id; returning empty invoice list", {
        userId: user.id,
        customerId,
      })
      return []
    }
    throw err
  }

  return invoices.data.map((inv) => ({
    id: inv.id ?? "",
    amount_paid: inv.amount_paid,
    currency: inv.currency,
    status: inv.status ?? "unknown",
    created: inv.created,
    invoice_pdf: inv.invoice_pdf ?? null,
    period_start: inv.period_start,
    period_end: inv.period_end,
  }))
}
