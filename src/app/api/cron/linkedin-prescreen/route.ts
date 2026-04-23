/**
 * /api/cron/linkedin-prescreen — LNKD-05 + LNKD-06
 *
 * Hourly pre-screen for `pipeline_status='new'` LinkedIn prospects.
 * Visits /in/{slug}, classifies DOM into one of four verdicts:
 *   - security_checkpoint -> abort run, flag account health=warning
 *   - profile_unreachable -> pipeline_status=unreachable, reason=profile_unreachable
 *   - already_connected   -> pipeline_status=connected (unreachable_reason NOT set)
 *   - creator_mode_no_connect -> pipeline_status=unreachable, reason=creator_mode_no_connect
 *   - (null)              -> leave as new; refresh last_prescreen_attempt_at
 *
 * Batch cap: 50 prospects per run. Single healthy LinkedIn account per run.
 * T-13-05-01 mitigation: Bearer CRON_SECRET check first.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"
import { connectToProfile, disconnectProfile } from "@/lib/gologin/adapter"
import { extractLinkedInSlug } from "@/lib/action-worker/actions/linkedin-connect-executor"

export const runtime = "nodejs"
// Playwright visits are slow; Vercel Pro cron allows up to 300s.
export const maxDuration = 300

export type PrescreenState = {
  urlContainsCheckpoint: boolean
  is404: boolean
  hasMessageSidebar: boolean
  hasConnectButton: boolean
  hasFollowButton: boolean
}

export type PrescreenVerdict =
  | "security_checkpoint"
  | "profile_unreachable"
  | "already_connected"
  | "creator_mode_no_connect"

/**
 * Priority order per 13-CONTEXT.md §Pre-screening DOM signals:
 * checkpoint > 404 > message-sidebar (already connected) > follow-only (creator mode).
 */
export function classifyPrescreenResult(
  state: PrescreenState,
): PrescreenVerdict | null {
  if (state.urlContainsCheckpoint) return "security_checkpoint"
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
    profile_unreachable: 0,
    already_connected: 0,
    creator_mode_no_connect: 0,
  }
  let screened = 0
  let runStatus: "completed" | "failed" = "completed"
  let runError: string | null = null
  let connection: Awaited<ReturnType<typeof connectToProfile>> | undefined

  try {
    // 1. Pick a healthy LinkedIn account with a GoLogin profile.
    const { data: accounts } = await supabase
      .from("social_accounts")
      .select("id, gologin_profile_id, user_id")
      .eq("platform", "linkedin")
      .eq("health_status", "healthy")
      .not("gologin_profile_id", "is", null)
      .order("last_used_at", { ascending: true, nullsFirst: true })
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

    // 2. Claim batch: up to 50 prospects whose last attempt was null or >7 days.
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString()
    const { data: claimed } = await supabase
      .from("prospects")
      .update({ last_prescreen_attempt_at: new Date().toISOString() })
      .eq("platform", "linkedin")
      .eq("pipeline_status", "new")
      .or(
        `last_prescreen_attempt_at.is.null,last_prescreen_attempt_at.lt.${sevenDaysAgo}`,
      )
      .select("id, handle, profile_url")
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

    // 3. Open GoLogin session.
    connection = await connectToProfile(account.gologin_profile_id as string)
    await connection.page.setViewportSize({ width: 1280, height: 900 })

    // 4. Iterate prospects. Abort entire run on first checkpoint.
    for (const prospect of prospects) {
      if (!prospect.profile_url && !prospect.handle) continue
      const slug = prospect.profile_url
        ? extractLinkedInSlug(prospect.profile_url)
        : (prospect.handle as string)
      const url = `https://www.linkedin.com/in/${slug}`

      let navError = false
      try {
        await connection.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
      } catch {
        navError = true
      }

      const currentUrl = connection.page.url()
      const isCheckpoint = /\/checkpoint\//.test(currentUrl)
      if (isCheckpoint) {
        // T-13-05-08: abort on first checkpoint; flip account to warning.
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

      let pageBody = ""
      try {
        pageBody = (await connection.page.content()) ?? ""
      } catch {
        pageBody = ""
      }

      const state: PrescreenState = {
        urlContainsCheckpoint: false,
        is404:
          navError ||
          /profile-unavailable|this profile is unavailable/i.test(pageBody) ||
          currentUrl.includes("/404"),
        hasMessageSidebar: await connection.page
          .locator("main button[aria-label*='Message']")
          .isVisible({ timeout: 1500 })
          .catch(() => false),
        hasConnectButton: await connection.page
          .locator("main button[aria-label^='Connect']")
          .isVisible({ timeout: 1500 })
          .catch(() => false),
        hasFollowButton: await connection.page
          .locator("main button[aria-label^='Follow']")
          .isVisible({ timeout: 1500 })
          .catch(() => false),
      }

      const verdict = classifyPrescreenResult(state)
      screened += 1
      if (!verdict) continue
      reasons[verdict] += 1

      if (verdict === "already_connected") {
        // 1st-degree — not unreachable. Move to 'connected'; do NOT set
        // unreachable_reason (see migration 00017 column comment).
        await supabase
          .from("prospects")
          .update({ pipeline_status: "connected" })
          .eq("id", prospect.id)
      } else {
        // profile_unreachable or creator_mode_no_connect -> unreachable + reason
        await supabase
          .from("prospects")
          .update({
            pipeline_status: "unreachable",
            unreachable_reason: verdict,
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
    runStatus = "failed"
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
      // swallow — we're already in the error path
    }
    await logger.flush()
    return NextResponse.json(
      { error: "linkedin-prescreen failed", message: runError },
      { status: 500 },
    )
  } finally {
    if (connection?.browser) {
      try {
        await disconnectProfile(connection.browser)
      } catch {
        // non-fatal
      }
    }
    // runStatus kept for potential future telemetry; referenced to avoid unused warning.
    void runStatus
  }
}
