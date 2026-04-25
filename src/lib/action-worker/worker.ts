/**
 * Main action execution pipeline orchestrator with anti-ban wiring.
 *
 * Pipeline: webhook -> claim -> target isolation -> warmup gate ->
 * active hours -> limits -> delay -> noise -> GoLogin connect ->
 * CU execute -> screenshot upload -> status update -> job log
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { connectToProfile, releaseProfile } from "@/lib/gologin/adapter"
import { executeCUAction } from "@/lib/computer-use/executor"
import { sendLinkedInConnection } from "@/lib/action-worker/actions/linkedin-connect-executor"
import { sendLinkedInDM } from "@/lib/action-worker/actions/linkedin-dm-executor"
import { followLinkedInProfile } from "@/lib/action-worker/actions/linkedin-follow-executor"
import { likeLinkedInPost } from "@/lib/action-worker/actions/linkedin-like-executor"
import { commentLinkedInPost } from "@/lib/action-worker/actions/linkedin-comment-executor"
import { captureScreenshot } from "@/lib/computer-use/screenshot"
import { uploadScreenshot } from "@/lib/computer-use/screenshot"
import { getRedditDMPrompt } from "@/lib/computer-use/actions/reddit-dm"
import {
  getRedditLikePrompt,
  getRedditFollowPrompt,
} from "@/lib/computer-use/actions/reddit-engage"
import { getLinkedInConnectPrompt } from "@/lib/computer-use/actions/linkedin-connect"
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

  // Shared pipeline state for single job_logs insert in finally
  const startMs = Date.now()
  let runStatus: "completed" | "failed" = "failed"
  let runError: string | null = null
  let cuSteps: number | null = null
  let screenshotCount: number | null = null
  let cuStepLog: unknown = null
  let runPlatform: string | null = null
  const runActionType: string | null = action.action_type as string
  const runUserId: string | null = action.user_id as string | null
  const runActionId: string | null = actionId

  // Connection must be declared before try so finally can access it
  let connection: Awaited<ReturnType<typeof connectToProfile>> | undefined

  // 2. Get social account
  const { data: account } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("id", action.account_id)
    .single<SocialAccount>()

  // Phase 14: account-quarantine guard (LNKD-02, LNKD-06).
  // Defense-in-depth — claim_action RPC (migration 00018) already filters
  // quarantined accounts at row-lock time, but a stale webhook firing against
  // an already-claimed action, or a race where health_status flips after
  // claim, would still get here. Re-check before any GoLogin/Playwright work
  // to prevent session burn on a flagged profile.
  if (account) {
    const isQuarantined =
      account.health_status === "warning" ||
      account.health_status === "banned" ||
      (account.cooldown_until !== null &&
        account.cooldown_until !== undefined &&
        new Date(account.cooldown_until).getTime() > Date.now())
    if (isQuarantined) {
      runError = "account_quarantined"
      runStatus = "failed"
      runPlatform = account.platform as string
      await updateActionStatus(supabase, actionId, "failed", "account_quarantined")
      // Insert job_logs synchronously here — the existing finally block also
      // writes job_logs but only when the pipeline reaches the try{}.
      // We short-circuit BEFORE the try block to avoid touching GoLogin, so
      // we mirror the finally block's job_logs schema EXACTLY.
      // job_type MUST be "action" per the enum in 00001_enums.sql.
      await supabase.from("job_logs").insert({
        job_type: "action" as const,
        status: "failed",
        user_id: runUserId,
        action_id: runActionId,
        started_at: new Date(startMs).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startMs,
        error: "account_quarantined",
        metadata: {
          correlation_id: correlationId,
          platform: runPlatform,
          action_type: runActionType,
          failure_mode: "account_quarantined",
        },
      })
      logger.warn("Action blocked: account quarantined", {
        actionId,
        correlationId,
        accountId: account.id,
        healthStatus: account.health_status,
        cooldownUntil: account.cooldown_until,
      })
      await logger.flush()
      return { success: false, error: "account_quarantined" }
    }
  }

  // 3. Check GoLogin profile — must exist before active-hours check (both are pre-try)
  if (!account?.gologin_profile_id) {
    // This is a configuration error — log it in job_logs via the try/finally below
    // by falling through to the try block with earlyReturn set
  }

  // 4. ANTI-BAN: Check active hours (ABAN-05) — re-queue path does NOT log to job_logs.
  //    Only check if account exists and has a profile (otherwise fall to try block for logging).
  if (account?.gologin_profile_id) {
    if (
      !isWithinActiveHours(
        account.timezone ?? "UTC",
        account.active_hours_start ?? 8,
        account.active_hours_end ?? 22,
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
  }

  try {
    // Early-return flag: set to non-null to short-circuit remaining pipeline steps
    let earlyReturn: { success: boolean; error?: string } | null = null
    // LinkedIn profile handle stashed from step 10 navigation (for use in step 12)
    let linkedinProfileHandle: string | null = null

    // 5. Check GoLogin profile (failed accounts log via finally block)
    if (!account?.gologin_profile_id) {
      runError = "No GoLogin profile"
      runStatus = "failed"
      await updateActionStatus(supabase, actionId, "failed", runError)
      earlyReturn = { success: false, error: runError }
    }

    if (!earlyReturn) {
      // Set platform now that we know account is valid
      runPlatform = account!.platform as string

      // 5. ANTI-BAN: Check warmup gate (ABAN-02)
      //    Platform-aware progression per 13-CONTEXT.md §Warmup gates.
      const warmup = getWarmupState(
        account!.warmup_day,
        account!.warmup_completed_at,
        account!.platform as "reddit" | "linkedin",
      )
      // H-05: followup_dm is not in WarmupState.allowedActions — treat it as
      // the same gate as `dm`. Without this mapping, a warmed day-7+ LinkedIn
      // account would never be allowed to send a follow-up DM.
      const gateType =
        action.action_type === "followup_dm" ? "dm" : action.action_type
      if (
        !warmup.allowedActions.includes(
          gateType as
            | "dm"
            | "like"
            | "follow"
            | "public_reply"
            | "connection_request",
        )
      ) {
        runError = `Warmup day ${warmup.day}: ${action.action_type} not yet allowed`
        runStatus = "failed"
        await updateActionStatus(
          supabase,
          actionId,
          "failed",
          `Warmup day ${warmup.day}: ${action.action_type} not yet allowed`,
        )
        earlyReturn = {
          success: false,
          error: `Warmup gate: ${action.action_type} not allowed on day ${warmup.day}`,
        }
      }
    }

    if (!earlyReturn) {
      // 6. ANTI-BAN: Target isolation (ABAN-06)
      const target = await checkAndAssignTarget(
        supabase,
        action.prospect_id,
        action.account_id!,
      )
      if (!target.allowed) {
        runError = target.error ?? "Target isolation blocked"
        runStatus = "failed"
        await updateActionStatus(
          supabase,
          actionId,
          "failed",
          runError,
        )
        earlyReturn = { success: false, error: runError }
      }
    }

    if (!earlyReturn) {
      // 7. Check daily limits
      const withinLimits = await checkAndIncrementLimit(
        supabase,
        action.account_id!,
        action.action_type,
      )
      if (!withinLimits) {
        runError = "Daily limit reached"
        runStatus = "failed"
        await updateActionStatus(supabase, actionId, "failed", runError)
        earlyReturn = { success: false, error: runError }
      }
    }

    if (earlyReturn) {
      return earlyReturn
    }

    // 8. ANTI-BAN: Random delay before execution (ABAN-03)
    const delay = randomDelay()
    logger.info("Anti-ban delay", {
      actionId,
      correlationId,
      delaySeconds: delay,
    })
    await sleep(delay)

    // 9. Connect GoLogin profile
    try {
      connection = await connectToProfile(account!.gologin_profile_id!)
    } catch (err) {
      runError = `GoLogin connection failed: ${err}`
      runStatus = "failed"
      await updateActionStatus(
        supabase,
        actionId,
        "failed",
        runError,
      )
      return { success: false, error: "GoLogin connection failed" }
    }

    // 10. Navigate to starting URL (platform-specific)
    if (account!.platform === "linkedin") {
      // For LinkedIn connections, navigate directly to the prospect's profile.
      // profile_url is stored from Apify ingestion in Phase 6.
      const { data: prospectData } = await supabase
        .from("prospects")
        .select("handle, profile_url")
        .eq("id", action.prospect_id)
        .single()
      const profileUrl = (prospectData?.profile_url as string | null) ?? null
      if (!profileUrl) {
        runError =
          "No profile_url on prospect — cannot navigate to LinkedIn profile"
        runStatus = "failed"
        await updateActionStatus(supabase, actionId, "failed", runError)
        return { success: false, error: runError }
      }
      // Match Claude CU's declared display dimensions so clicks at the
      // model's coordinates hit the right DOM elements. Without this, the
      // page may render at the GoLogin profile's default resolution
      // (1920x1080) and click coordinates are miscalibrated.
      await connection.page.setViewportSize({ width: 1280, height: 900 })
      await connection.page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      // Stash for prompt building in step 12
      linkedinProfileHandle = (prospectData?.handle as string | null) ?? null
    } else {
      await connection.page.goto("https://www.reddit.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
    }

    // 11. ANTI-BAN: Inject behavioral noise before real action (ABAN-04)
    if (shouldInjectNoise()) {
      const noisePrompts = generateNoiseActions()
      for (const noisePrompt of noisePrompts) {
        await executeCUAction(connection.page, noisePrompt)
        await sleep(randomDelay(30, 15, 10))
      }
    }

    // 12. Build CU prompt — ONLY for Reddit. LinkedIn uses deterministic
    //     Playwright executors (per 13-CONTEXT.md §Enum strategy - public_reply
    //     is Reddit-reply AND LinkedIn-comment; dispatch by account.platform).
    let prompt: string | null = null
    const prospect = await supabase
      .from("prospects")
      .select("handle")
      .eq("id", action.prospect_id)
      .single()
    const handle = (prospect.data?.handle as string) ?? ""

    if (account!.platform !== "linkedin") {
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
    } else if (action.action_type === "connection_request") {
      // LinkedIn connection: prompt is informational only (executor is Playwright).
      const slug = linkedinProfileHandle ?? handle
      prompt = getLinkedInConnectPrompt(
        slug,
        action.final_content ?? action.drafted_content ?? "",
      )
    }

    // 13. Execute the action.
    //     Dispatch is by account.platform (per 13-CONTEXT.md §Enum strategy):
    //     - LinkedIn: deterministic Playwright executors per action_type.
    //       (connection_request shipped in Phase 10; dm/follow/like/public_reply
    //        land in Plans 13-01 / 13-02 / 13-03 of the Phase 13 wave.)
    //     - Reddit: Claude Haiku CU drives the browser via prompt.
    let result: {
      success: boolean
      steps: number
      screenshots: string[]
      stepLog: import("@/features/actions/lib/types").CUStepLog[]
      error?: string
    }
    if (account!.platform === "linkedin") {
      if (action.action_type === "connection_request") {
        const profileUrl =
          linkedinProfileHandle ??
          (await supabase
            .from("prospects")
            .select("profile_url")
            .eq("id", action.prospect_id)
            .maybeSingle()
            .then((r) => (r.data?.profile_url as string | null) ?? handle))
        const connectResult = await sendLinkedInConnection(
          connection.page,
          profileUrl as string,
          action.final_content ?? action.drafted_content ?? "",
        )
        const finalScreenshot = await captureScreenshot(connection.page)
        result = {
          success: connectResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: connectResult.failureMode,
        }
      } else if (
        action.action_type === "dm" ||
        action.action_type === "followup_dm"
      ) {
        // LNKD-01: deterministic LinkedIn DM executor (1st-degree only).
        // No auto-swap on not_connected — user re-approves as connection_request
        // per 13-CONTEXT.md §Non-1st-degree DM handling.
        const profileUrl =
          linkedinProfileHandle ??
          (await supabase
            .from("prospects")
            .select("profile_url")
            .eq("id", action.prospect_id)
            .maybeSingle()
            .then((r) => (r.data?.profile_url as string | null) ?? handle))
        const body = action.final_content ?? action.drafted_content ?? ""
        const dmResult = await sendLinkedInDM(
          connection.page,
          profileUrl as string,
          body,
        )
        const finalScreenshot = await captureScreenshot(connection.page)
        result = {
          success: dmResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: dmResult.failureMode,
        }
      } else if (action.action_type === "follow") {
        // LNKD-02: deterministic LinkedIn Follow (primary CTA + overflow fallback).
        const profileUrl =
          linkedinProfileHandle ??
          (await supabase
            .from("prospects")
            .select("profile_url")
            .eq("id", action.prospect_id)
            .maybeSingle()
            .then((r) => (r.data?.profile_url as string | null) ?? handle))
        const followResult = await followLinkedInProfile(
          connection.page,
          profileUrl as string,
        )
        const finalScreenshot = await captureScreenshot(connection.page)
        result = {
          success: followResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: followResult.failureMode,
        }
      } else if (action.action_type === "like") {
        // LNKD-03 (like): deterministic DOM React-Like scoped to main post.
        // Resolve post_url via prospect.intent_signal_id -> intent_signals.
        const { data: prospectWithSignal } = await supabase
          .from("prospects")
          .select("intent_signal_id, profile_url")
          .eq("id", action.prospect_id)
          .single()
        let postUrl: string | null = null
        if (prospectWithSignal?.intent_signal_id) {
          const { data: signal } = await supabase
            .from("intent_signals")
            .select("post_url")
            .eq("id", prospectWithSignal.intent_signal_id)
            .maybeSingle()
          postUrl = (signal?.post_url as string | null) ?? null
        }
        if (!postUrl) {
          postUrl = (prospectWithSignal?.profile_url as string | null) ?? null
        }
        if (!postUrl) {
          runError = "No post_url for LinkedIn like"
          runStatus = "failed"
          await updateActionStatus(supabase, actionId, "failed", runError)
          return { success: false, error: runError }
        }
        const likeResult = await likeLinkedInPost(connection.page, postUrl)
        const finalScreenshot = await captureScreenshot(connection.page)
        result = {
          success: likeResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: likeResult.failureMode,
        }
      } else if (action.action_type === "public_reply") {
        // LNKD-03 / LNKD-04 (comment): deterministic Quill composer fill.
        // public_reply on linkedin = Comment (CONTEXT §Enum strategy — same
        // action_type covers Reddit reply AND LinkedIn comment).
        const { data: prospectWithSignal } = await supabase
          .from("prospects")
          .select("intent_signal_id, profile_url")
          .eq("id", action.prospect_id)
          .single()
        let postUrl: string | null = null
        if (prospectWithSignal?.intent_signal_id) {
          const { data: signal } = await supabase
            .from("intent_signals")
            .select("post_url")
            .eq("id", prospectWithSignal.intent_signal_id)
            .maybeSingle()
          postUrl = (signal?.post_url as string | null) ?? null
        }
        if (!postUrl) {
          postUrl = (prospectWithSignal?.profile_url as string | null) ?? null
        }
        if (!postUrl) {
          runError = "No post_url for LinkedIn public_reply"
          runStatus = "failed"
          await updateActionStatus(supabase, actionId, "failed", runError)
          return { success: false, error: runError }
        }
        const body = action.final_content ?? action.drafted_content ?? ""
        const commentResult = await commentLinkedInPost(
          connection.page,
          postUrl,
          body,
        )
        const finalScreenshot = await captureScreenshot(connection.page)
        result = {
          success: commentResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: commentResult.failureMode,
        }
      } else {
        throw new Error(
          `LinkedIn ${action.action_type} executor not implemented`,
        )
      }
    } else {
      result = await executeCUAction(
        connection.page,
        prompt ?? `Perform a ${action.action_type} action for ${handle}`,
        "claude-haiku-4-5-20251001",
      )
    }

    // Capture telemetry for metadata
    cuSteps = result.steps
    screenshotCount = result.screenshots.length
    cuStepLog = result.stepLog

    // 14. Upload final screenshot
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

    // 15. Update status
    if (result.success) {
      runStatus = "completed"
      runError = null
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
                (account!.platform as string) ?? "unknown"
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
      } else if (action.action_type === "public_reply") {
        // 13-03 per 13-RESEARCH.md §5 Open Question 2 — public_reply → engaged
        // for both platforms (Reddit reply AND LinkedIn comment).
        await supabase
          .from("prospects")
          .update({ pipeline_status: "engaged" })
          .eq("id", action.prospect_id)
      } else if (action.action_type === "connection_request") {
        await supabase
          .from("prospects")
          .update({ pipeline_status: "contacted" })
          .eq("id", action.prospect_id)
      }
    } else {
      runStatus = "failed"
      runError = result.error ?? "CU action failed"
      await updateActionStatus(
        supabase,
        actionId,
        "failed",
        runError,
      )

      // LinkedIn-specific failure mode handling (all LinkedIn actions — Phase 13)
      // Full taxonomy per 13-CONTEXT.md §Failure-mode taxonomy:
      //   connection_request: session_expired, security_checkpoint, weekly_limit_reached,
      //                       already_connected, profile_unreachable, dialog_never_opened,
      //                       no_connect_available, send_button_missing
      //   dm:                 not_connected, message_disabled, dialog_never_opened,
      //                       weekly_limit_reached, session_expired, security_checkpoint
      //   follow:             follow_premium_gated, profile_unreachable, session_expired, already_following
      //   like:               post_unreachable, post_deleted, react_button_missing, session_expired
      //   comment:            comment_disabled, post_unreachable, char_limit_exceeded,
      //                       comment_post_failed, session_expired
      if (runPlatform === "linkedin" && runError) {
        if (
          runError === "security_checkpoint" ||
          runError === "session_expired"
        ) {
          // Transition account to warning + log for NTFY-03 alert
          await supabase
            .from("social_accounts")
            .update({ health_status: "warning" })
            .eq("id", action.account_id)
          logger.warn("LinkedIn account health degraded", {
            actionId,
            correlationId,
            accountId: action.account_id,
            failureMode: runError,
          })
        } else if (runError === "weekly_limit_reached") {
          // Expected LinkedIn throttle — set cooldown_until = now + 24h, no health change
          const cooldownUntil = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString()
          await supabase
            .from("social_accounts")
            .update({ cooldown_until: cooldownUntil })
            .eq("id", action.account_id)
          logger.info("LinkedIn weekly limit reached — cooldown 24h set", {
            actionId,
            correlationId,
            accountId: action.account_id,
            cooldownUntil,
          })
        } else if (runError === "already_connected") {
          // Prospect is already a 1st-degree connection — mark pipeline accordingly
          await supabase
            .from("prospects")
            .update({ pipeline_status: "connected" })
            .eq("id", action.prospect_id)
        }
        // profile_unreachable: no health change, failure is prospect-level
      }
    }

    return { success: result.success, error: result.error }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
    runStatus = "failed"
    return { success: false, error: runError }
  } finally {
    // releaseProfile both closes the CDP connection AND calls GoLogin's
    // stopCloudBrowser API to free the parallel-launch slot. Without
    // the server-side stop, the cloud browser lingers until GoLogin's
    // auto-close timeout and blocks subsequent runs with HTTP 403
    // "max parallel cloud launches limit". Surfaced by Phase 13 UAT
    // 2026-04-24.
    await releaseProfile(connection)
    const finishMs = Date.now()
    await supabase.from("job_logs").insert({
      job_type: "action" as const,
      status: runStatus,
      user_id: runUserId,
      action_id: runActionId,
      started_at: new Date(startMs).toISOString(),
      finished_at: new Date(finishMs).toISOString(),
      duration_ms: finishMs - startMs,
      error: runError,
      metadata: {
        correlation_id: correlationId,
        platform: runPlatform,
        action_type: runActionType,
        ...(cuSteps !== null ? { cu_steps: cuSteps } : {}),
        ...(screenshotCount !== null
          ? { screenshot_count: screenshotCount }
          : {}),
        ...(cuStepLog ? { cu_step_log: cuStepLog } : {}),
        // Include failure_mode for any LinkedIn failure (Phase 13 taxonomy slicing)
        ...(runPlatform === "linkedin" && runError
          ? { failure_mode: runError }
          : {}),
      },
    })
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
