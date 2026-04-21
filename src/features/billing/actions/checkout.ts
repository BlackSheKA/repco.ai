"use server"

import Stripe from "stripe"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { CREDIT_PACKS } from "@/features/billing/lib/types"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")

export async function createCheckoutSession(
  priceId: string,
  mode: "subscription" | "payment",
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Unauthorized")
  }

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from("users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single()

  let customerId = profile?.stripe_customer_id as string | null | undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from("users")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id)
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ""

  // Look up credit pack credits for one-time payments (stored in session metadata
  // so the webhook can add the correct credits amount)
  const metadata: Record<string, string> = {
    supabase_user_id: user.id,
  }

  if (mode === "payment") {
    const pack = CREDIT_PACKS.find((p) => p.stripePriceId === priceId)
    if (pack) {
      metadata.credit_pack_credits = String(pack.credits)
      metadata.credit_pack_name = pack.name
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode,
    success_url: `${siteUrl}/billing?success=true`,
    cancel_url: `${siteUrl}/billing?canceled=true`,
    metadata,
    ...(mode === "payment" && {
      payment_intent_data: {
        metadata,
      },
    }),
  })

  logger.info("Stripe checkout session created", {
    userId: user.id,
    mode,
    priceId,
    sessionId: session.id,
  })

  redirect(session.url!)
}
