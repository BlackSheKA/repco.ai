import { NextResponse } from "next/server"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import { PRICING_PLANS } from "@/features/billing/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")

type BillingPeriod = "monthly" | "quarterly" | "annual"

function billingPeriodForPriceId(priceId: string): BillingPeriod | null {
  const plan = PRICING_PLANS.find((p) => p.stripePriceId === priceId)
  return plan?.period ?? null
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID()

  // CRITICAL: raw text, not JSON, for signature verification
  const body = await request.text()
  const signature = request.headers.get("stripe-signature")

  if (!signature) {
    logger.warn("Stripe webhook missing signature", { correlationId })
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 },
    )
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn("Stripe webhook signature verification failed", {
      correlationId,
      error: message,
    })
    return NextResponse.json(
      { error: `Invalid signature: ${message}` },
      { status: 400 },
    )
  }

  logger.info("Stripe webhook received", {
    correlationId,
    eventType: event.type,
    eventId: event.id,
  })

  // Service role client (bypasses RLS for admin writes)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id

        if (!customerId) {
          logger.warn("checkout.session.completed without customer", {
            correlationId,
            sessionId: session.id,
          })
          break
        }

        // Resolve supabase user by stripe_customer_id or metadata
        let supabaseUserId =
          session.metadata?.supabase_user_id ?? null

        if (!supabaseUserId) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle()
          supabaseUserId = userRow?.id ?? null
        }

        if (!supabaseUserId) {
          logger.warn("Could not resolve Supabase user for checkout session", {
            correlationId,
            sessionId: session.id,
            customerId,
          })
          break
        }

        if (session.mode === "subscription") {
          // Pull subscription to get the price id + period
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id

          let billingPeriod: BillingPeriod | null = null
          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            const priceId = sub.items.data[0]?.price?.id
            if (priceId) {
              billingPeriod = billingPeriodForPriceId(priceId)
            }
          }

          const { error } = await supabase
            .from("users")
            .update({
              subscription_active: true,
              billing_period: billingPeriod,
              stripe_customer_id: customerId,
            })
            .eq("id", supabaseUserId)

          if (error) {
            logger.error("Failed to activate subscription", {
              correlationId,
              userId: supabaseUserId,
              error: error.message,
            })
          } else {
            logger.info("Subscription activated", {
              correlationId,
              userId: supabaseUserId,
              billingPeriod,
            })
          }
        } else if (session.mode === "payment") {
          // Credit pack purchase - add credits via RPC
          const creditsRaw = session.metadata?.credit_pack_credits
          const packName = session.metadata?.credit_pack_name ?? "pack"
          const credits = creditsRaw ? parseInt(creditsRaw, 10) : 0

          if (credits > 0) {
            const { data, error } = await supabase.rpc("add_credits", {
              p_user_id: supabaseUserId,
              p_amount: credits,
              p_type: "pack_purchase",
              p_description: `${packName} pack purchase`,
              p_stripe_payment_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
              p_pack_size: credits,
            })

            if (error) {
              logger.error("Failed to add credits from pack purchase", {
                correlationId,
                userId: supabaseUserId,
                error: error.message,
              })
            } else {
              logger.info("Credit pack credits added", {
                correlationId,
                userId: supabaseUserId,
                credits,
                newBalance: data,
              })
            }
          } else {
            logger.warn("Payment session missing credit_pack_credits metadata", {
              correlationId,
              sessionId: session.id,
            })
          }
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id

        const priceId = subscription.items.data[0]?.price?.id
        const billingPeriod = priceId
          ? billingPeriodForPriceId(priceId)
          : null
        const active =
          subscription.status === "active" ||
          subscription.status === "trialing"

        const { error } = await supabase
          .from("users")
          .update({
            subscription_active: active,
            billing_period: billingPeriod,
          })
          .eq("stripe_customer_id", customerId)

        if (error) {
          logger.error("Failed to update subscription", {
            correlationId,
            customerId,
            error: error.message,
          })
        } else {
          logger.info("Subscription updated", {
            correlationId,
            customerId,
            status: subscription.status,
            billingPeriod,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          })
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer.id

        const { error } = await supabase
          .from("users")
          .update({
            subscription_active: false,
            billing_period: null,
          })
          .eq("stripe_customer_id", customerId)

        if (error) {
          logger.error("Failed to deactivate subscription", {
            correlationId,
            customerId,
            error: error.message,
          })
        } else {
          logger.info("Subscription deleted", {
            correlationId,
            customerId,
          })
        }
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id

        await supabase.from("job_logs").insert({
          job_type: "monitor" as const,
          status: "failed" as const,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: 0,
          error: `Stripe invoice payment failed: ${invoice.id}`,
          metadata: {
            source: "stripe_webhook",
            event: "invoice.payment_failed",
            invoice_id: invoice.id,
            customer_id: customerId,
            customer_email: invoice.customer_email,
            amount_due: invoice.amount_due,
            correlation_id: correlationId,
          },
        })

        logger.warn("Invoice payment failed", {
          correlationId,
          invoiceId: invoice.id,
          customerId,
          amountDue: invoice.amount_due,
        })
        break
      }

      default:
        logger.info("Unhandled Stripe event", {
          correlationId,
          eventType: event.type,
        })
    }

    await logger.flush()
    return NextResponse.json({ received: true })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    logger.error("Stripe webhook handler error", {
      correlationId,
      eventType: event.type,
      error,
      errorMessage: error.message,
    })
    await logger.flush()
    return NextResponse.json(
      { error: "Webhook handler error", message: error.message },
      { status: 500 },
    )
  }
}
