/**
 * Main action execution pipeline orchestrator with anti-ban wiring.
 *
 * Pipeline: webhook -> claim -> target isolation -> warmup gate ->
 * active hours -> limits -> delay -> noise -> GoLogin connect ->
 * CU execute -> screenshot upload -> status update -> job log
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { connectToProfile, disconnectProfile } from "@/lib/gologin/adapter"
import { executeCUAction } from "@/lib/computer-use/executor"
import { uploadScreenshot } from "@/lib/computer-use/screenshot"
import { getRedditDMPrompt } from "@/lib/computer-use/actions/reddit-dm"
import {
  getRedditLikePrompt,
  getRedditFollowPrompt,
} from "@/lib/computer-use/actions/reddit-engage"
import { claimAction } from "./claim"
import { checkAndIncrementLimit } from "./limits"
import { checkAndAssignTarget } from "./target-isolation"
import { randomDelay, sleep, isWithinActiveHours } from "./delays"
import { shouldInjectNoise, generateNoiseActions } from "./noise"
import { getWarmupState } from "@/features/accounts/lib/types"
import { logger } from "@/lib/logger"
import type { SocialAccount } from "@/features/accounts/lib/types"
import { getActionCreditCost } from "@/features/billing/lib/credit-costs"
import type { ActionCreditType } from "@/features/billing/lib/types"

function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function executeAction(
  actionId: string,
  correlationId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient()

  // 1. Claim action (FOR UPDATE SKIP LOCKED)
  const claim = await claimAction(supabase, actionId)
  if (!claim.claimed) {
    return { success: false, error: claim.error ?? "Claim failed" }
  }
  const action = claim.action!

  // 2. Get social account
  const { data: account } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("id", action.account_id)
    .single<SocialAccount>()

  if (!account?.gologin_profile_id) {
    await updateActionStatus(supabase, actionId, "failed", "No GoLogin profile")
    return { success: false, error: "No GoLogin profile" }
  }

  // 3. ANTI-BAN: Check active hours (ABAN-05)
  if (
    !isWithinActiveHours(
      account.timezone,
      account.active_hours_start,
      account.active_hours_end,
    )
  ) {
    await updateActionStatus(supabase, actionId, "approved", null) // Re-queue
    logger.info("Action deferred: outside active hours", {
      actionId,
      correlationId,
      timezone: account.timezone,
    })
    return { success: false, error: "Outside active hours -- re-queued" }
  }

  // 4. ANTI-BAN: Check warmup gate (ABAN-02)
  const warmup = getWarmupState(account.warmup_day, account.warmup_completed_at)
  if (
    !warmup.allowedActions.includes(
      action.action_type as
        | "dm"
        | "like"
        | "follow"
        | "public_reply",
    )
  ) {
    await updateActionStatus(
      supabase,
      actionId,
      "failed",
      `Warmup day ${warmup.day}: ${action.action_type} not yet allowed`,
    )
    return {
      success: false,
      error: `Warmup gate: ${action.action_type} not allowed on day ${warmup.day}`,
    }
  }

  // 5. ANTI-BAN: Target isolation (ABAN-06)
  const target = await checkAndAssignTarget(
    supabase,
    action.prospect_id,
    action.account_id!,
  )
  if (!target.allowed) {
    await updateActionStatus(
      supabase,
      actionId,
      "failed",
      target.error ?? "Target isolation blocked",
    )
    return { success: false, error: target.error ?? "Target isolation blocked" }
  }

  // 6. Check daily limits
  const withinLimits = await checkAndIncrementLimit(
    supabase,
    action.account_id!,
    action.action_type,
  )
  if (!withinLimits) {
    await updateActionStatus(supabase, actionId, "failed", "Daily limit reached")
    return { success: false, error: "Daily limit reached" }
  }

  // 7. ANTI-BAN: Random delay before execution (ABAN-03)
  const delay = randomDelay()
  logger.info("Anti-ban delay", {
    actionId,
    correlationId,
    delaySeconds: delay,
  })
  await sleep(delay)

  // 8. Connect GoLogin profile
  let connection
  try {
    connection = await connectToProfile(account.gologin_profile_id)
  } catch (err) {
    await updateActionStatus(
      supabase,
      actionId,
      "failed",
      `GoLogin connection failed: ${err}`,
    )
    return { success: false, error: "GoLogin connection failed" }
  }

  try {
    // 9. Navigate to Reddit
    await connection.page.goto("https://www.reddit.com", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // 10. ANTI-BAN: Inject behavioral noise before real action (ABAN-04)
    if (shouldInjectNoise()) {
      const noisePrompts = generateNoiseActions()
      for (const noisePrompt of noisePrompts) {
        await executeCUAction(connection.page, noisePrompt)
        await sleep(randomDelay(30, 15, 10))
      }
    }

    // 11. Build CU prompt based on action type
    let prompt: string
    const prospect = await supabase
      .from("prospects")
      .select("handle")
      .eq("id", action.prospect_id)
      .single()
    const handle = (prospect.data?.handle as string) ?? ""

    if (
      action.action_type === "dm" ||
      action.action_type === "followup_dm"
    ) {
      prompt = getRedditDMPrompt(
        handle,
        action.final_content ?? action.drafted_content ?? "",
      )
    } else if (action.action_type === "like") {
      const { data: signal } = await supabase
        .from("intent_signals")
        .select("post_url")
        .eq("id", action.prospect_id)
        .maybeSingle()
      prompt = getRedditLikePrompt((signal?.post_url as string) ?? "")
    } else if (action.action_type === "follow") {
      prompt = getRedditFollowPrompt(handle)
    } else {
      prompt = `Perform a public reply action for ${handle}`
    }

    // 12. Execute CU action
    const result = await executeCUAction(connection.page, prompt)

    // 13. Upload final screenshot
    if (result.screenshots.length > 0) {
      const lastScreenshot = result.screenshots[result.screenshots.length - 1]
      const url = await uploadScreenshot(actionId, lastScreenshot, result.steps)
      if (url) {
        await supabase
          .from("actions")
          .update({ screenshot_url: url })
          .eq("id", actionId)
      }
    }

    // 14. Update status
    if (result.success) {
      await updateActionStatus(supabase, actionId, "completed", null)

      // Deduct action credits on successful completion.
      // Credit deduction must NOT block action completion -- the action already
      // succeeded; a failed deduction is logged as a warning only.
      try {
        const creditCost = getActionCreditCost(
          action.action_type as ActionCreditType,
        )
        if (creditCost > 0) {
          const { data: newBalance, error: creditError } = await supabase.rpc(
            "deduct_credits",
            {
              p_user_id: action.user_id,
              p_amount: creditCost,
              p_type: "action_spend",
              p_description: `${action.action_type} action on ${
                (account.platform as string) ?? "unknown"
              }`,
            },
          )
          if (creditError) {
            logger.warn("Action credit deduction failed", {
              actionId,
              correlationId,
              userId: action.user_id,
              creditCost,
              error: creditError.message,
            })
          } else if (typeof newBalance === "number" && newBalance === -1) {
            logger.warn("Action credit deduction: insufficient credits", {
              actionId,
              correlationId,
              userId: action.user_id,
              creditCost,
            })
          } else {
            logger.info("Action credits deducted", {
              actionId,
              correlationId,
              userId: action.user_id,
              creditCost,
              newBalance,
            })
          }
        }
      } catch (creditErr) {
        logger.warn("Action credit deduction threw", {
          actionId,
          correlationId,
          error:
            creditErr instanceof Error ? creditErr.message : String(creditErr),
        })
      }

      if (action.action_type === "dm") {
        await supabase
          .from("prospects")
          .update({ pipeline_status: "contacted" })
          .eq("id", action.prospect_id)
      } else if (
        action.action_type === "like" ||
        action.action_type === "follow"
      ) {
        await supabase
          .from("prospects")
          .update({ pipeline_status: "engaged" })
          .eq("id", action.prospect_id)
      }
    } else {
      await updateActionStatus(
        supabase,
        actionId,
        "failed",
        result.error ?? "CU action failed",
      )
    }

    // 15. Log to job_logs
    await supabase.from("job_logs").insert({
      job_type: "action",
      status: result.success ? "completed" : "failed",
      duration_ms: 0,
      details: { actionId, steps: result.steps, error: result.error },
      correlation_id: correlationId,
    })

    return { success: result.success, error: result.error }
  } finally {
    await disconnectProfile(connection.browser)
  }
}

async function updateActionStatus(
  supabase: SupabaseClient,
  actionId: string,
  status: string,
  error: string | null,
): Promise<void> {
  await supabase
    .from("actions")
    .update({
      status,
      error,
      executed_at: new Date().toISOString(),
    })
    .eq("id", actionId)
}
