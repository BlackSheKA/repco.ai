/**
 * Main action execution pipeline orchestrator with anti-ban wiring.
 *
 * Pipeline: webhook -> claim -> target isolation -> warmup gate ->
 * active hours -> limits -> delay -> Browserbase session ->
 * (LinkedIn: Stagehand) | (Reddit: raw CDP page) ->
 * CU/Stagehand execute -> screenshot upload -> status update -> job log
 *
 * Phase 17.5 plan-03: predecessor vendor replaced with Browserbase. LinkedIn executors
 * receive a Stagehand instance for selector resilience (D17.5-06); Reddit
 * keeps raw Haiku CU on a Playwright page from `chromium.connectOverCDP`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Stagehand } from "@browserbasehq/stagehand"
import {
  chromium,
  type Browser,
  type Page,
} from "playwright-core"
import {
  createSession,
  releaseSession,
} from "@/lib/browserbase/client"
import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"
import { getBrowserProfileForAccount } from "@/features/browser-profiles/lib/get-browser-profile"
import { detectBanState } from "@/lib/computer-use/detect-ban-state"
import { sendAccountWarning } from "@/features/notifications/lib/send-account-warning"
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
import type { SupportedCountry } from "@/features/browser-profiles/lib/country-map"
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

  // Browserbase session + Playwright/Stagehand handles declared before try so finally can release them.
  let sessionId: string | undefined
  let browser: Browser | undefined
  let stagehand: Stagehand | undefined

  // 2. Get social account
  const { data: account } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("id", action.account_id)
    .single<SocialAccount>()

  // Phase 14: account-quarantine guard (LNKD-02, LNKD-06).
  if (account) {
    // Phase 18: extend Phase 14 quarantine guard with two new ENUM values
    // (D-04 + D-18). L-5: BOTH 'needs_reconnect' AND 'captcha_required' must
    // appear; forgetting one is a silent escape.
    const isQuarantined =
      account.health_status === "warning" ||
      account.health_status === "banned" ||
      account.health_status === "needs_reconnect" ||
      account.health_status === "captcha_required" ||
      (account.cooldown_until !== null &&
        account.cooldown_until !== undefined &&
        new Date(account.cooldown_until).getTime() > Date.now())
    if (isQuarantined) {
      runError = "account_quarantined"
      runStatus = "failed"
      runPlatform = account.platform as string
      await updateActionStatus(supabase, actionId, "failed", "account_quarantined")
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

    // Phase 18 (BPRX-08, D-13): Reddit-only preflight gate.
    // Runs BEFORE Browserbase session creation. Definitive ban signals flip
    // health_status='banned' without ever creating a Browserbase session
    // (no credit burn, no concurrent-slot consumption). Cached 1h via
    // social_accounts.last_preflight_at + last_preflight_status.
    if (account.platform === "reddit" && account.handle) {
      const preflight = await runRedditPreflight({
        handle: account.handle,
        supabase,
        accountId: account.id,
      })
      if (preflight.kind === "banned") {
        await supabase
          .from("social_accounts")
          .update({ health_status: "banned" })
          .eq("id", account.id)

        runStatus = "failed"
        runError = `preflight_${preflight.reason}`
        runPlatform = "reddit"
        await updateActionStatus(
          supabase,
          actionId,
          "failed",
          `preflight_${preflight.reason}`,
        )
        await supabase.from("job_logs").insert({
          job_type: "action" as const,
          status: "failed",
          user_id: runUserId,
          action_id: runActionId,
          started_at: new Date(startMs).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startMs,
          error: runError,
          metadata: {
            correlation_id: correlationId,
            platform: "reddit",
            action_type: runActionType,
            failure_mode: "preflight_banned",
            preflight_reason: preflight.reason,
          },
        })
        logger.warn("Action blocked: preflight banned", {
          actionId,
          correlationId,
          accountId: account.id,
          preflightReason: preflight.reason,
        })
        await logger.flush()
        return { success: false, error: "account_quarantined" }
      }
      if (preflight.kind === "transient") {
        runStatus = "failed"
        runError = "preflight_transient"
        runPlatform = "reddit"
        await updateActionStatus(
          supabase,
          actionId,
          "failed",
          "preflight_transient",
        )
        await supabase.from("job_logs").insert({
          job_type: "action" as const,
          status: "failed",
          user_id: runUserId,
          action_id: runActionId,
          started_at: new Date(startMs).toISOString(),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startMs,
          error: runError,
          metadata: {
            correlation_id: correlationId,
            platform: "reddit",
            action_type: runActionType,
            failure_mode: "preflight_transient",
            preflight_error: preflight.error,
          },
        })
        await logger.flush()
        return { success: false, error: "preflight_transient" }
      }
      // preflight.kind === 'ok' → fall through.
    }
  }

  // 3. Resolve browser profile via Phase 15 helper.
  const browserProfile = account
    ? await getBrowserProfileForAccount(account.id, supabase)
    : null

  // 4. ANTI-BAN: Check active hours (ABAN-05).
  if (browserProfile) {
    if (
      !isWithinActiveHours(
        account!.timezone ?? "UTC",
        account!.active_hours_start ?? 8,
        account!.active_hours_end ?? 22,
      )
    ) {
      await updateActionStatus(supabase, actionId, "approved", null) // Re-queue
      logger.info("Action deferred: outside active hours", {
        actionId,
        correlationId,
        timezone: account!.timezone,
      })
      return { success: false, error: "Outside active hours -- re-queued" }
    }
  }

  try {
    let earlyReturn: { success: boolean; error?: string } | null = null
    let linkedinProfileHandle: string | null = null

    // 5. Check browser profile.
    if (!browserProfile) {
      runError = "No browser profile"
      runStatus = "failed"
      await updateActionStatus(supabase, actionId, "failed", runError)
      earlyReturn = { success: false, error: runError }
    }

    if (!earlyReturn) {
      runPlatform = account!.platform as string

      const warmup = getWarmupState(
        account!.warmup_day,
        account!.warmup_completed_at,
        account!.platform as "reddit" | "linkedin",
      )
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
      const target = await checkAndAssignTarget(
        supabase,
        action.prospect_id,
        action.account_id!,
      )
      if (!target.allowed) {
        runError = target.error ?? "Target isolation blocked"
        runStatus = "failed"
        await updateActionStatus(supabase, actionId, "failed", runError)
        earlyReturn = { success: false, error: runError }
      }
    }

    if (!earlyReturn) {
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

    // 9. Open Browserbase session and attach Playwright (+ Stagehand for LinkedIn).
    let page: Page
    try {
      const session = await createSession({
        contextId: browserProfile!.browserbase_context_id,
        country: browserProfile!.country_code as SupportedCountry,
        // D17.5-07: per-action default 300s.
        timeoutSeconds: 300,
        keepAlive: false,
      })
      sessionId = session.id

      browser = await chromium.connectOverCDP(session.connectUrl)
      const context = browser.contexts()[0] ?? (await browser.newContext())
      page = context.pages()[0] ?? (await context.newPage())

      if (account!.platform === "linkedin") {
        // Bind Stagehand to the existing Browserbase session so it operates on
        // the same browser the Playwright `page` is attached to. Stagehand
        // calls receive `{ page }` in act/extract options.
        stagehand = new Stagehand({
          env: "BROWSERBASE",
          apiKey: process.env.BROWSERBASE_API_KEY!,
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
          browserbaseSessionID: session.id,
          model: {
            modelName: "claude-haiku-4-5-20251001",
            apiKey: process.env.ANTHROPIC_API_KEY!,
          },
          verbose: 0,
        })
        await stagehand.init()
      }
    } catch (err) {
      runError = `Browserbase connection failed: ${err instanceof Error ? err.message : String(err)}`
      runStatus = "failed"
      await updateActionStatus(supabase, actionId, "failed", runError)
      return { success: false, error: "Browserbase connection failed" }
    }

    // 10. Navigate to starting URL (platform-specific)
    if (account!.platform === "linkedin") {
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
      // Match Claude CU's declared display dimensions for click-coordinate calibration.
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      linkedinProfileHandle = (prospectData?.handle as string | null) ?? null
    } else {
      await page.goto("https://www.reddit.com", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
    }

    // 11. ANTI-BAN: Inject behavioral noise before real action (ABAN-04)
    if (shouldInjectNoise()) {
      const noisePrompts = generateNoiseActions()
      for (const noisePrompt of noisePrompts) {
        await executeCUAction(page, noisePrompt)
        await sleep(randomDelay(30, 15, 10))
      }
    }

    // 12. Build CU prompt — ONLY for Reddit.
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
      const slug = linkedinProfileHandle ?? handle
      prompt = getLinkedInConnectPrompt(
        slug,
        action.final_content ?? action.drafted_content ?? "",
      )
    }

    // 13. Execute the action.
    let result: {
      success: boolean
      steps: number
      screenshots: string[]
      stepLog: import("@/features/actions/lib/types").CUStepLog[]
      error?: string
    }
    if (account!.platform === "linkedin") {
      // Stagehand is guaranteed defined here (instantiated in linkedin branch above).
      const sh = stagehand!
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
          page,
          sh,
          profileUrl as string,
          action.final_content ?? action.drafted_content ?? "",
        )
        const finalScreenshot = await captureScreenshot(page)
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
          page,
          sh,
          profileUrl as string,
          body,
        )
        const finalScreenshot = await captureScreenshot(page)
        result = {
          success: dmResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: dmResult.failureMode,
        }
      } else if (action.action_type === "follow") {
        const profileUrl =
          linkedinProfileHandle ??
          (await supabase
            .from("prospects")
            .select("profile_url")
            .eq("id", action.prospect_id)
            .maybeSingle()
            .then((r) => (r.data?.profile_url as string | null) ?? handle))
        const followResult = await followLinkedInProfile(
          page,
          sh,
          profileUrl as string,
        )
        const finalScreenshot = await captureScreenshot(page)
        result = {
          success: followResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: followResult.failureMode,
        }
      } else if (action.action_type === "like") {
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
        const likeResult = await likeLinkedInPost(page, sh, postUrl)
        const finalScreenshot = await captureScreenshot(page)
        result = {
          success: likeResult.success,
          steps: 1,
          screenshots: [finalScreenshot],
          stepLog: [],
          error: likeResult.failureMode,
        }
      } else if (action.action_type === "public_reply") {
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
          page,
          sh,
          postUrl,
          body,
        )
        const finalScreenshot = await captureScreenshot(page)
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
        page,
        prompt ?? `Perform a ${action.action_type} action for ${handle}`,
        "claude-haiku-4-5-20251001",
      )
    }

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

      // Phase 18 (BPRX-07 adapted for Browserbase): best-effort cookie jar
      // dump to browser_profiles.cookies_jar for backup/audit. Browserbase
      // contexts auto-persist cookies via browserSettings.context.persist=true,
      // so this is purely a backup snapshot — never throws out of the worker.
      try {
        const ctx = browser?.contexts()[0]
        if (ctx && browserProfile?.id) {
          const jar = await ctx.cookies()
          const { error: cookieErr } = await supabase
            .from("browser_profiles")
            .update({ cookies_jar: jar })
            .eq("id", browserProfile.id)
          if (cookieErr) {
            logger.warn("cookies_jar backup write failed (non-fatal)", {
              actionId,
              correlationId,
              error: cookieErr.message,
            })
          }
        }
      } catch (cookieDumpErr) {
        logger.warn("cookies_jar backup dump threw (non-fatal)", {
          actionId,
          correlationId,
          error:
            cookieDumpErr instanceof Error
              ? cookieDumpErr.message
              : String(cookieDumpErr),
        })
      }

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
      await updateActionStatus(supabase, actionId, "failed", runError)

      if (runPlatform === "linkedin" && runError) {
        if (
          runError === "security_checkpoint" ||
          runError === "session_expired"
        ) {
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
          await supabase
            .from("prospects")
            .update({ pipeline_status: "connected" })
            .eq("id", action.prospect_id)
        }
      }
    }

    // Phase 18 (BPRX-09, D-14 + D-16): post-action ban-state detector pass.
    // Runs against the final screenshot AFTER the CU loop returns (NOT a tool
    // inside the executor). Per L-3 / D-23: detector failures return all-false
    // and MUST NOT flip health_status.
    if (result.screenshots.length > 0 && account) {
      try {
        const finalScreenshot = result.screenshots[result.screenshots.length - 1]
        const verdict = await detectBanState(finalScreenshot)
        logger.info("detect_ban_state verdict", {
          actionId,
          correlationId,
          accountId: account.id,
          verdict,
        })

      let userEmail: string | null = null
      try {
        const userResp = await supabase
          .from("users")
          .select("email")
          .eq("id", account.user_id)
          .single<{ email: string }>()
        userEmail = userResp.data?.email ?? null
      } catch {
        // user lookup failure leaves userEmail null; email send is gated below
      }
      const platform = (account.platform as "reddit" | "linkedin") ?? "reddit"

      if (verdict.banned || verdict.suspended) {
        await supabase
          .from("social_accounts")
          .update({ health_status: "banned" })
          .eq("id", account.id)
        if (userEmail) {
          try {
            await sendAccountWarning(
              userEmail,
              account.handle ?? account.id,
              "banned",
              {
                platform,
                supabase,
                userId: account.user_id,
                accountId: account.id,
              },
            )
          } catch (emailErr) {
            logger.warn("sendAccountWarning(banned) failed", {
              actionId,
              correlationId,
              accountId: account.id,
              error:
                emailErr instanceof Error ? emailErr.message : String(emailErr),
            })
          }
        }
      } else if (verdict.captcha) {
        await supabase
          .from("social_accounts")
          .update({ health_status: "captcha_required" })
          .eq("id", account.id)
        if (userEmail) {
          try {
            await sendAccountWarning(
              userEmail,
              account.handle ?? account.id,
              "captcha_required",
              {
                platform,
                supabase,
                userId: account.user_id,
                accountId: account.id,
              },
            )
          } catch (emailErr) {
            logger.warn("sendAccountWarning(captcha_required) failed", {
              actionId,
              correlationId,
              accountId: account.id,
              error:
                emailErr instanceof Error ? emailErr.message : String(emailErr),
            })
          }
        }
      }
      // all-false → no status change. Action result stands.
      } catch (detectorErr) {
        // Per L-3 / D-23: detector failures must NOT flip health_status or
        // break the action. Just log and let the original action result stand.
        logger.warn("detect_ban_state pipeline failed", {
          actionId,
          correlationId,
          error:
            detectorErr instanceof Error
              ? detectorErr.message
              : String(detectorErr),
        })
      }
    }

    return { success: result.success, error: result.error }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
    runStatus = "failed"
    return { success: false, error: runError }
  } finally {
    // T-17.5-LIFECYCLE-01: release session unconditionally. browser.close()
    // alone does NOT free the Browserbase concurrent slot — releaseSession
    // (REQUEST_RELEASE) must run on every code path.
    if (stagehand) {
      await stagehand.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
    if (sessionId) {
      await releaseSession(sessionId).catch(() => {})
    }
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
