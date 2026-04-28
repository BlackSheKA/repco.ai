// AUDIT(13-04): no-change — this cron handles REPLY detection, not follow-up creation.
/**
 * Reply detection cron (RPLY-01, RPLY-02, RPLY-04).
 *
 * Phase 17.5 plan-03: Browserbase + raw `chromium.connectOverCDP` for the
 * Reddit inbox CU loop. NO Stagehand here (D17.5-06 — Reddit CU stays raw
 * Haiku). D17.5-07: per-account session timeout 180s.
 *
 * Each account opens its own short-lived Browserbase session, scrapes the
 * inbox via Haiku vision, and releases the session unconditionally in
 * finally (T-17.5-LIFECYCLE-01).
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"
import { chromium, type Browser } from "playwright-core"

import { logger } from "@/lib/logger"
import {
  createSession,
  releaseSession,
} from "@/lib/browserbase/client"
import { getBrowserProfileForAccount } from "@/features/browser-profiles/lib/get-browser-profile"
import { captureScreenshot } from "@/lib/computer-use/screenshot"
import { matchReplyToProspect } from "@/features/sequences/lib/reply-matching"
import { handleReplyDetected } from "@/features/sequences/lib/stop-on-reply"
import { sendReplyAlert } from "@/features/notifications/lib/send-reply-alert"
import { sendAccountWarning } from "@/features/notifications/lib/send-account-warning"
import type { SupportedCountry } from "@/features/browser-profiles/lib/country-map"

export const runtime = "nodejs"
export const maxDuration = 300

const INBOX_CHECK_PROMPT = `You are checking a Reddit DM inbox. Follow these steps:

1. You are on Reddit. Navigate to https://www.reddit.com/message/inbox/
2. Look at the message list. For each conversation:
   - Read the sender's username (starts with u/)
   - Read the most recent message preview text
   - Note if it's a new/unread message
3. When done reading all visible messages, respond with a JSON summary:
   { "messages": [{ "sender": "username", "preview": "message text", "unread": true }] }

IMPORTANT:
- Only read messages, do NOT click on or open any conversations
- Do NOT send any messages or replies
- If you see a "Message requests" tab, check it too
- Report the exact username as displayed (case-sensitive)
- If the inbox is empty, return { "messages": [] }`

interface InboxMessage {
  sender: string
  preview: string
  unread: boolean
}

function parseInboxResponse(text: string): InboxMessage[] {
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed?.messages)) {
      return parsed.messages.filter(
        (m: unknown): m is InboxMessage =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as InboxMessage).sender === "string",
      )
    }
  } catch {
    /* fall through */
  }

  const match = text.match(/\{[\s\S]*"messages"[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed?.messages)) {
        return parsed.messages as InboxMessage[]
      }
    } catch {
      /* swallow */
    }
  }
  return []
}

async function readInboxWithHaiku(
  page: import("playwright-core").Page,
): Promise<InboxMessage[]> {
  await page.goto("https://www.reddit.com/message/inbox/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })

  const screenshot = await captureScreenshot(page)

  const client = new Anthropic()
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: screenshot,
            },
          },
          { type: "text", text: INBOX_CHECK_PROMPT },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined

  return parseInboxResponse(textBlock?.text ?? "")
}

async function getUserEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single()

  return (data as { email?: string } | null)?.email ?? null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const correlationId = logger.createCorrelationId()
  const startedAt = new Date()

  logger.info("check-replies cron started", {
    correlationId,
    jobType: "reply_check",
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  try {
    const { data: accountsRaw, error: accountsError } = await supabase
      .from("social_accounts")
      .select(
        "id, user_id, handle, browser_profile_id, consecutive_inbox_failures",
      )
      .eq("platform", "reddit")
      .eq("active", true)
      .in("health_status", ["healthy", "warmup"])

    if (accountsError) throw accountsError

    const accounts = (accountsRaw ?? []) as Array<{
      id: string
      user_id: string
      handle: string | null
      browser_profile_id: string | null
      consecutive_inbox_failures: number | null
    }>

    let accountsChecked = 0
    let totalReplies = 0
    let totalFailures = 0

    for (const account of accounts) {
      const browserProfile = await getBrowserProfileForAccount(
        account.id,
        supabase,
      )
      if (!browserProfile) {
        logger.warn("Skipping account — no browser profile", {
          correlationId,
          accountId: account.id,
        })
        continue
      }

      accountsChecked++
      const accountStartedAt = new Date()
      let sessionId: string | undefined
      let browser: Browser | undefined

      try {
        // 1. Open Browserbase session + Playwright CDP attach. NO Stagehand
        //    — Reddit CU stays raw Haiku (D17.5-06).
        const session = await createSession({
          contextId: browserProfile.browserbase_context_id,
          country: browserProfile.country_code as SupportedCountry,
          // D17.5-07: Reddit CU 180s.
          timeoutSeconds: 180,
          keepAlive: false,
        })
        sessionId = session.id

        browser = await chromium.connectOverCDP(session.connectUrl)
        const context = browser.contexts()[0] ?? (await browser.newContext())
        const page = context.pages()[0] ?? (await context.newPage())

        // 2. Read the inbox with Haiku vision
        const messages = await readInboxWithHaiku(page)

        // 3. Match unread messages to prospects
        let repliesMatched = 0
        for (const msg of messages) {
          if (!msg.unread || !msg.sender) continue

          const match = await matchReplyToProspect(
            supabase,
            msg.sender,
            "reddit",
            account.user_id,
          )
          if (!match) continue

          const handled = await handleReplyDetected(
            supabase,
            match.prospectId,
            msg.preview ?? "",
          )

          if (handled) {
            repliesMatched++
            totalReplies++

            const userEmail = await getUserEmail(supabase, account.user_id)
            if (userEmail) {
              try {
                await sendReplyAlert(userEmail, match.prospectHandle, "Reddit")
              } catch (emailErr) {
                logger.warn("sendReplyAlert failed", {
                  correlationId,
                  accountId: account.id,
                  prospectId: match.prospectId,
                  error:
                    emailErr instanceof Error
                      ? emailErr.message
                      : String(emailErr),
                })
              }
            }
          }
        }

        await supabase
          .from("social_accounts")
          .update({
            last_inbox_check_at: new Date().toISOString(),
            consecutive_inbox_failures: 0,
          })
          .eq("id", account.id)

        const finishedAt = new Date()
        await supabase.from("job_logs").insert({
          job_type: "reply_check" as const,
          status: "completed" as const,
          user_id: account.user_id,
          started_at: accountStartedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt.getTime() - accountStartedAt.getTime(),
          metadata: {
            account_id: account.id,
            messages_found: messages.length,
            replies_matched: repliesMatched,
            correlation_id: correlationId,
          },
        })

        logger.info("Inbox check succeeded", {
          correlationId,
          accountId: account.id,
          messagesFound: messages.length,
          repliesMatched,
        })
      } catch (accountErr) {
        totalFailures++
        const errorMessage =
          accountErr instanceof Error ? accountErr.message : String(accountErr)

        logger.error("Inbox check failed for account", {
          correlationId,
          accountId: account.id,
          error: accountErr instanceof Error ? accountErr : undefined,
          errorMessage,
        })

        const nextFailures = (account.consecutive_inbox_failures ?? 0) + 1
        await supabase
          .from("social_accounts")
          .update({ consecutive_inbox_failures: nextFailures })
          .eq("id", account.id)

        if (nextFailures >= 3) {
          const userEmail = await getUserEmail(supabase, account.user_id)
          if (userEmail) {
            try {
              await sendAccountWarning(
                userEmail,
                account.handle ?? account.id,
                "warning",
                {
                  platform:
                    (account.platform as "reddit" | "linkedin") ?? "reddit",
                  supabase,
                  userId: account.user_id,
                  accountId: account.id,
                },
              )
            } catch (emailErr) {
              logger.warn("sendAccountWarning failed", {
                correlationId,
                accountId: account.id,
                error:
                  emailErr instanceof Error
                    ? emailErr.message
                    : String(emailErr),
              })
            }
          }
        }

        const finishedAt = new Date()
        await supabase.from("job_logs").insert({
          job_type: "reply_check" as const,
          status: "failed" as const,
          user_id: account.user_id,
          started_at: accountStartedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_ms: finishedAt.getTime() - accountStartedAt.getTime(),
          error: errorMessage,
          metadata: {
            account_id: account.id,
            consecutive_failures: nextFailures,
            correlation_id: correlationId,
          },
        })
      } finally {
        // T-17.5-LIFECYCLE-01: release Browserbase session unconditionally.
        if (browser) {
          await browser.close().catch(() => {})
        }
        if (sessionId) {
          await releaseSession(sessionId).catch(() => {})
        }
      }
    }

    const finishedAt = new Date()
    const durationMs = finishedAt.getTime() - startedAt.getTime()

    logger.info("check-replies cron completed", {
      correlationId,
      accountsChecked,
      totalReplies,
      totalFailures,
      durationMs,
    })

    await logger.flush()

    return NextResponse.json({
      ok: true,
      accountsChecked,
      totalReplies,
      totalFailures,
      durationMs,
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    logger.error("check-replies cron failed", {
      correlationId,
      error,
      errorMessage: error.message,
    })

    await logger.flush()

    return NextResponse.json(
      { error: "check-replies failed", message: error.message },
      { status: 500 },
    )
  }
}
