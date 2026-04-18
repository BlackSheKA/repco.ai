/**
 * DB Webhook handler for action execution.
 *
 * Triggered by Supabase Database Webhooks when an action's
 * status changes to 'approved'. Executes the full action pipeline.
 */

import { NextRequest, NextResponse } from "next/server"
import { executeAction } from "@/lib/action-worker/worker"
import { logger } from "@/lib/logger"

export const maxDuration = 300 // 5 minutes for Vercel Pro Fluid Compute

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = crypto.randomUUID()
  const payload = await req.json()
  const {
    type,
    record: newRecord,
    old_record: oldRecord,
  } = payload as {
    type: string
    record: { id: string; status: string } | null
    old_record: { status: string } | null
  }

  // 2. Only process status changes to 'approved'
  if (type !== "UPDATE" || newRecord?.status !== "approved") {
    return NextResponse.json({ skipped: true })
  }
  if (oldRecord?.status === "approved") {
    return NextResponse.json({ skipped: true })
  }

  logger.info("Action webhook received", {
    actionId: newRecord.id,
    correlationId,
  })

  // 3. Execute action
  const result = await executeAction(newRecord.id, correlationId)

  await logger.flush()
  return NextResponse.json(result)
}
