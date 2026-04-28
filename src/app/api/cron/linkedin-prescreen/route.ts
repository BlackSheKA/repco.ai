/**
 * /api/cron/linkedin-prescreen — LNKD-05 + LNKD-06
 *
 * Phase 17.5 plan-03: rewrites legacy browser connect to Browserbase + Stagehand
 * for fragile profile DOM signals. Connection lifecycle: createSession →
 * chromium.connectOverCDP → Stagehand bound to same session → finally
 * close + releaseSession (T-17.5-LIFECYCLE-01).
 *
 * T-13-05-01 mitigation: Bearer CRON_SECRET check first.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Stagehand } from "@browserbasehq/stagehand"
import { chromium, type Browser } from "playwright-core"
import { z } from "zod"
import { logger } from "@/lib/logger"
import {
  createSession,
  releaseSession,
} from "@/lib/browserbase/client"
import { getBrowserProfileById } from "@/features/browser-profiles/lib/get-browser-profile"
import { extractLinkedInSlug } from "@/lib/action-worker/actions/linkedin-connect-executor"
import { detectLinkedInAuthwall } from "@/lib/action-worker/actions/linkedin-authwall"
import type { SupportedCountry } from "@/features/browser-profiles/lib/country-map"

export const runtime = "nodejs"
export const maxDuration = 300

export type PrescreenState = {
  urlContainsCheckpoint: boolean
  isAuthwall: boolean
  is404: boolean
  hasMessageSidebar: boolean
  hasConnectButton: boolean
  hasFollowButton: boolean
}

export type PrescreenVerdict =
  | "security_checkpoint"
  | "account_logged_out"
  | "profile_unreachable"
  | "already_connected"
  | "creator_mode_no_connect"

export function classifyPrescreenResult(
  state: PrescreenState,
): PrescreenVerdict | null {
  if (state.urlContainsCheckpoint) return "security_checkpoint"
  if (state.isAuthwall) return "account_logged_out"
  if (state.is404) return "profile_unreachable"
  if (state.hasMessageSidebar) return "already_connected"
  if (state.hasFollowButton && !state.hasConnectButton)
    return "creator_mode_no_connect"
  return null
}

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()
  logger.info("linkedin-prescreen started", {
    correlationId,
    jobType: "linkedin_prescreen",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const reasons: Record<PrescreenVerdict, number> = {
    security_checkpoint: 0,
    account_logged_out: 0,
    profile_unreachable: 0,
    already_connected: 0,
    creator_mode_no_connect: 0,
  }
  let screened = 0
  let runError: string | null = null
  let sessionId: string | undefined
  let browser: Browser | undefined
  let stagehand: Stagehand | undefined

  try {
    const { data: accounts } = await supabase
      .from("social_accounts")
      .select("id, browser_profile_id, user_id")
      .eq("platform", "linkedin")
      .eq("health_status", "healthy")
      .not("browser_profile_id", "is", null)
      .order("session_verified_at", { ascending: true, nullsFirst: true })
      .limit(1)

    const account = accounts?.[0]
    if (!account) {
      logger.warn("linkedin-prescreen: no healthy account", { correlationId })
      await supabase.from("job_logs").insert({
        job_type: "monitor" as const,
        status: "completed" as const,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        metadata: {
          cron: "linkedin-prescreen",
          correlation_id: correlationId,
          reason: "no_healthy_account",
          screened: 0,
        },
      })
      await logger.flush()
      return NextResponse.json({
        ok: true,
        screened: 0,
        reason: "no_healthy_account",
      })
    }

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const { data: claimed } = await supabase
      .from("prospects")
      .select("id, handle, profile_url")
      .eq("platform", "linkedin")
      .eq("pipeline_status", "detected")
      .or(
        `last_prescreen_attempt_at.is.null,last_prescreen_attempt_at.lt.${sevenDaysAgo}`,
      )
      .order("last_prescreen_attempt_at", { ascending: true, nullsFirst: true })
      .limit(50)

    const prospects = (claimed ?? []) as Array<{
      id: string
      handle: string | null
      profile_url: string | null
    }>

    if (prospects.length === 0) {
      await supabase.from("job_logs").insert({
        job_type: "monitor" as const,
        status: "completed" as const,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        metadata: {
          cron: "linkedin-prescreen",
          correlation_id: correlationId,
          screened: 0,
          reasons,
        },
      })
      await logger.flush()
      return NextResponse.json({ ok: true, screened: 0, reasons })
    }

    const browserProfile = await getBrowserProfileById(
      account.browser_profile_id as string,
      supabase,
    )
    if (!browserProfile) {
      logger.warn("linkedin-prescreen: browser profile not found", {
        correlationId,
        accountId: account.id,
      })
      await supabase.from("job_logs").insert({
        job_type: "monitor" as const,
        status: "completed" as const,
        user_id: account.user_id,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        metadata: {
          cron: "linkedin-prescreen",
          correlation_id: correlationId,
          reason: "browser_profile_not_found",
          screened: 0,
        },
      })
      await logger.flush()
      return NextResponse.json({
        ok: true,
        screened: 0,
        reason: "browser_profile_not_found",
      })
    }

    // Open Browserbase session + Playwright + Stagehand.
    const session = await createSession({
      contextId: browserProfile.browserbase_context_id,
      country: browserProfile.country_code as SupportedCountry,
      timeoutSeconds: 300, // D17.5-07: prescreen
      keepAlive: false,
    })
    sessionId = session.id

    browser = await chromium.connectOverCDP(session.connectUrl)
    const context = browser.contexts()[0] ?? (await browser.newContext())
    const page = context.pages()[0] ?? (await context.newPage())
    await page.setViewportSize({ width: 1280, height: 900 })

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: process.env.BROWSERBASE_API_KEY!,
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      browserbaseSessionID: session.id,
      model: {
        // Stagehand v3+ requires "provider/model" format.
        modelName: "anthropic/claude-haiku-4-5-20251001",
        apiKey: process.env.ANTHROPIC_API_KEY!,
      },
      verbose: 0,
    })
    await stagehand.init()

    for (const prospect of prospects) {
      if (!prospect.profile_url && !prospect.handle) continue
      const slug = prospect.profile_url
        ? extractLinkedInSlug(prospect.profile_url)
        : (prospect.handle as string)
      const url = `https://www.linkedin.com/in/${slug}`

      let navError = false
      try {
        await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
      } catch {
        navError = true
      }

      const currentUrl = page.url()
      const isCheckpoint = /\/checkpoint\//.test(currentUrl)
      if (isCheckpoint) {
        await supabase
          .from("social_accounts")
          .update({ health_status: "warning" })
          .eq("id", account.id)
        reasons.security_checkpoint += 1
        logger.warn("linkedin-prescreen: security_checkpoint — aborting run", {
          correlationId,
          accountId: account.id,
        })
        break
      }

      const isAuthwall = await detectLinkedInAuthwall(page)

      let pageBody = ""
      try {
        pageBody = (await page.content()) ?? ""
      } catch {
        pageBody = ""
      }

      const state: PrescreenState = {
        urlContainsCheckpoint: false,
        isAuthwall,
        is404:
          navError ||
          /profile-unavailable|this profile is unavailable/i.test(pageBody) ||
          currentUrl.includes("/404"),
        hasMessageSidebar: isAuthwall
          ? false
          : await page
              .locator("main button[aria-label^='Message']")
              .isVisible({ timeout: 1500 })
              .catch(() => false),
        hasConnectButton: isAuthwall
          ? false
          : await page
              .locator("main button[aria-label^='Connect']")
              .isVisible({ timeout: 1500 })
              .catch(() => false),
        hasFollowButton: isAuthwall
          ? false
          : await page
              .locator("main button[aria-label^='Follow']")
              .isVisible({ timeout: 1500 })
              .catch(() => false),
      }

      let verdict = classifyPrescreenResult(state)
      screened += 1
      const nowIso = new Date().toISOString()

      if (verdict === "account_logged_out") {
        await supabase
          .from("social_accounts")
          .update({ health_status: "warning" })
          .eq("id", account.id)
        reasons.account_logged_out += 1
        logger.warn(
          "linkedin-prescreen: account_logged_out — aborting run",
          { correlationId, accountId: account.id },
        )
        break
      }

      // When deterministic signals leave verdict null, ask Stagehand to
      // classify the buyer-persona / pipeline status of this profile. This
      // is the high-volatility selector path that benefits most from the
      // LLM (D17.5-06).
      if (!verdict) {
        try {
          const stagehandVerdict = await stagehand.extract(
            "Classify this LinkedIn profile page: is the viewer already a 1st-degree connection? Is this a creator-mode profile with no Connect option?",
            z.object({
              alreadyConnected: z.boolean(),
              creatorModeNoConnect: z.boolean(),
            }),
            { page },
          )
          if (stagehandVerdict.alreadyConnected) {
            verdict = "already_connected"
          } else if (stagehandVerdict.creatorModeNoConnect) {
            verdict = "creator_mode_no_connect"
          }
        } catch {
          /* fall through — leave verdict null */
        }
      }

      if (!verdict) {
        await supabase
          .from("prospects")
          .update({ last_prescreen_attempt_at: nowIso })
          .eq("id", prospect.id)
        continue
      }

      reasons[verdict] += 1

      if (verdict === "already_connected") {
        await supabase
          .from("prospects")
          .update({
            pipeline_status: "connected",
            last_prescreen_attempt_at: nowIso,
          })
          .eq("id", prospect.id)
      } else {
        await supabase
          .from("prospects")
          .update({
            pipeline_status: "unreachable",
            unreachable_reason: verdict,
            last_prescreen_attempt_at: nowIso,
          })
          .eq("id", prospect.id)
      }
    }

    await supabase.from("job_logs").insert({
      job_type: "monitor" as const,
      status: "completed" as const,
      user_id: account.user_id,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      metadata: {
        cron: "linkedin-prescreen",
        correlation_id: correlationId,
        account_id: account.id,
        screened,
        reasons,
      },
    })

    logger.info("linkedin-prescreen completed", {
      correlationId,
      screened,
      reasons,
    })
    await logger.flush()
    return NextResponse.json({ ok: true, screened, reasons })
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
    logger.error("linkedin-prescreen failed", {
      correlationId,
      errorMessage: runError,
    })
    try {
      await supabase.from("job_logs").insert({
        job_type: "monitor" as const,
        status: "failed" as const,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        error: runError,
        metadata: {
          cron: "linkedin-prescreen",
          correlation_id: correlationId,
          screened,
          reasons,
        },
      })
    } catch {
      /* swallow */
    }
    await logger.flush()
    return NextResponse.json(
      { error: "linkedin-prescreen failed", message: runError },
      { status: 500 },
    )
  } finally {
    // T-17.5-LIFECYCLE-01: release session unconditionally.
    if (stagehand) {
      await stagehand.close().catch(() => {})
    }
    if (browser) {
      await browser.close().catch(() => {})
    }
    if (sessionId) {
      await releaseSession(sessionId).catch(() => {})
    }
  }
}
