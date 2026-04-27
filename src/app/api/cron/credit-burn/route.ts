import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { logger } from "@/lib/logger"
import {
  calculateAccountBurn,
  calculateMonitoringBurn,
} from "@/features/billing/lib/credit-burn"

export const runtime = "nodejs"
export const maxDuration = 60

interface UserRow {
  id: string
  subscription_active: boolean | null
  trial_ends_at: string | null
}

interface MonitoringSignalRow {
  user_id: string
  mechanism_id: string
  frequency: string
  active: boolean
}

interface SocialAccountRow {
  user_id: string
  platform: string
  active: boolean
  created_at: string | null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("Credit burn cron started", {
    correlationId,
    jobType: "credit_burn",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const nowIso = new Date().toISOString()

    // 1. Load eligible users: active subscription OR trial still ongoing
    const [subRes, trialRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, subscription_active, trial_ends_at")
        .eq("subscription_active", true),
      supabase
        .from("users")
        .select("id, subscription_active, trial_ends_at")
        .gt("trial_ends_at", nowIso),
    ])

    if (subRes.error) throw subRes.error
    if (trialRes.error) throw trialRes.error

    const usersById = new Map<string, UserRow>()
    for (const u of [...(subRes.data ?? []), ...(trialRes.data ?? [])] as UserRow[]) {
      usersById.set(u.id, u)
    }
    const users = [...usersById.values()]

    if (users.length === 0) {
      logger.info("Credit burn: no eligible users", { correlationId })
      await logger.flush()
      return NextResponse.json({
        ok: true,
        processed: 0,
        total_deducted: 0,
        insufficient: 0,
      })
    }

    const userIds = users.map((u) => u.id)

    // 2. Load signals + accounts in bulk to avoid per-user round trips
    const [signalsRes, accountsRes] = await Promise.all([
      supabase
        .from("monitoring_signals")
        .select("user_id, mechanism_id, frequency, active")
        .in("user_id", userIds)
        .eq("active", true),
      supabase
        .from("social_accounts")
        .select("user_id, platform, active, created_at")
        .in("user_id", userIds)
        .eq("active", true),
    ])

    if (signalsRes.error) throw signalsRes.error
    if (accountsRes.error) throw accountsRes.error

    const signalsByUser = new Map<string, MonitoringSignalRow[]>()
    for (const s of (signalsRes.data ?? []) as MonitoringSignalRow[]) {
      const arr = signalsByUser.get(s.user_id) ?? []
      arr.push(s)
      signalsByUser.set(s.user_id, arr)
    }

    const accountsByUser = new Map<string, SocialAccountRow[]>()
    for (const a of (accountsRes.data ?? []) as SocialAccountRow[]) {
      const arr = accountsByUser.get(a.user_id) ?? []
      arr.push(a)
      accountsByUser.set(a.user_id, arr)
    }

    // Sort each user's accounts by creation date so extras beyond INCLUDED_ACCOUNTS
    // are the newest ones (matches insertion-order semantics in calculateAccountBurn).
    for (const [, arr] of accountsByUser) {
      arr.sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return at - bt
      })
    }

    let processed = 0
    let totalDeducted = 0
    let insufficient = 0

    for (const user of users) {
      const signals = signalsByUser.get(user.id) ?? []
      const accounts = accountsByUser.get(user.id) ?? []

      const monitoringBurn = await calculateMonitoringBurn(signals)
      const accountBurn = calculateAccountBurn(accounts)
      const total = monitoringBurn + accountBurn

      if (total <= 0) continue

      processed += 1

      const { data: newBalance, error: rpcError } = await supabase.rpc(
        "deduct_credits",
        {
          p_user_id: user.id,
          p_amount: total,
          p_type: "monitoring_burn",
          p_description: `Daily burn: ${monitoringBurn} monitoring + ${accountBurn} accounts`,
        },
      )

      if (rpcError) {
        logger.error("deduct_credits RPC failed", {
          correlationId,
          userId: user.id,
          total,
          error: rpcError,
          errorMessage: rpcError.message,
        })
        continue
      }

      const balance =
        typeof newBalance === "number" ? newBalance : Number(newBalance)

      if (balance === -1) {
        insufficient += 1
        logger.warn("Credit burn: insufficient credits", {
          correlationId,
          userId: user.id,
          total,
          monitoringBurn,
          accountBurn,
        })
      } else {
        totalDeducted += total
        logger.info("Credit burn: deducted", {
          correlationId,
          userId: user.id,
          total,
          monitoringBurn,
          accountBurn,
          newBalance: balance,
        })
      }
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    // Log the cron run itself to job_logs (best-effort)
    try {
      await supabase.from("job_logs").insert({
        job_type: "monitor",
        status: "completed",
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        metadata: {
          cron: "credit-burn",
          processed,
          total_deducted: totalDeducted,
          insufficient,
          correlation_id: correlationId,
        },
      })
    } catch (logErr) {
      logger.warn("Failed to insert job_log for credit-burn cron", {
        correlationId,
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }

    logger.info("Credit burn cron completed", {
      correlationId,
      processed,
      total_deducted: totalDeducted,
      insufficient,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      processed,
      total_deducted: totalDeducted,
      insufficient,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("Credit burn cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "Credit burn failed", message: error.message },
      { status: 500 },
    )
  }
}
