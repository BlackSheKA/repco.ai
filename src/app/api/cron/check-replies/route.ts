/**
 * Reply detection cron (RPLY-01, RPLY-02, RPLY-04).
 *
 * Runs every 2 hours. For each active Reddit social account:
 *   1. Connects to the GoLogin Cloud profile via Playwright CDP.
 *   2. Navigates to the Reddit inbox and asks Haiku CU to read the message list.
 *   3. Parses the CU JSON response into a list of { sender, preview, unread } entries.
 *   4. For each unread sender that matches a prospect:
 *        - Calls handleReplyDetected (cancels follow-ups, flips pipeline_status to replied).
 *        - Sends a reply-alert email to the user via Resend.
 *   5. Bumps `last_inbox_check_at` and resets `consecutive_inbox_failures` on success.
 *
 * On failure for a given account, increments `consecutive_inbox_failures`.
 * If the counter reaches 3, emails an account-warning notification to the user.
 *
 * Each account is processed independently — one failure does not block the others.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"

import { logger } from "@/lib/logger"
import { connectToProfile, disconnectProfile } from "@/lib/gologin/adapter"
import { captureScreenshot } from "@/lib/computer-use/screenshot"
import { matchReplyToProspect } from "@/features/sequences/lib/reply-matching"
import { handleReplyDetected } from "@/features/sequences/lib/stop-on-reply"
import { sendReplyAlert } from "@/features/notifications/lib/send-reply-alert"
import { sendAccountWarning } from "@/features/notifications/lib/send-account-warning"

export const runtime = "nodejs"
// Inbox checks involve GoLogin connect + Playwright navigation + Haiku CU vision,
// each of which can take 10-30s per account. 5 min gives headroom for up to ~10 accounts.
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

/**
 * Parse the CU text response into a message array.
 * Tries JSON.parse first, then falls back to extracting a JSON block via regex.
 * Returns an empty array if nothing parses (safe default — no false-positive replies).
 */
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
    // fall through to regex extraction
  }

  // Regex fallback: find the first {...} JSON block
  const match = text.match(/\{[\s\S]*"messages"[\s\S]*\}/)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (Array.isArray(parsed?.messages)) {
        return parsed.messages as InboxMessage[]
      }
    } catch {
      // swallow
    }
  }
  return []
}

/**
 * Read the Reddit inbox for a given account using Haiku vision.
 * Navigates the account's existing page to the inbox URL, takes a screenshot,
 * and asks Haiku to produce a JSON summary of visible messages.
 */
async function readInboxWithHaiku(
  page: import("playwright-core").Page,
): Promise<InboxMessage[]> {
  // Navigate to the inbox (idempotent — cheap if already there)
  await page.goto("https://www.reddit.com/message/inbox/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  })

  const screenshot = await captureScreenshot(page)

  // Per-call Anthropic instantiation (serverless-safety pattern)
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

  // Extract first text block from the response
  const textBlock = response.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined

  return parseInboxResponse(textBlock?.text ?? "")
}

/**
 * Fetch the user's email for notifications. Returns null if unknown.
 */
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
    // Fetch all active Reddit accounts eligible for reply checking
    const { data: accountsRaw, error: accountsError } = await supabase
      .from("social_accounts")
      .select(
        "id, user_id, handle, gologin_profile_id, consecutive_inbox_failures",
      )
      .eq("platform", "reddit")
      .eq("active", true)
      .in("health_status", ["healthy", "warmup"])

    if (accountsError) throw accountsError

    const accounts = (accountsRaw ?? []) as Array<{
      id: string
      user_id: string
      handle: string | null
      gologin_profile_id: string | null
      consecutive_inbox_failures: number | null
    }>

    let accountsChecked = 0
    let totalReplies = 0
    let totalFailures = 0

    for (const account of accounts) {
      if (!account.gologin_profile_id) {
        logger.warn("Skipping account — no gologin_profile_id", {
          correlationId,
          accountId: account.id,
        })
        continue
      }

      accountsChecked++
      const accountStartedAt = new Date()
      let connection: Awaited<ReturnType<typeof connectToProfile>> | null = null

      try {
        // 1. Connect to the GoLogin profile
        connection = await connectToProfile(account.gologin_profile_id)

        // 2. Read the inbox with Haiku vision
        const messages = await readInboxWithHaiku(connection.page)

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

            // Notify the user via email
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

        // 4. On success: reset failure counter, bump last_inbox_check_at
        await supabase
          .from("social_accounts")
          .update({
            last_inbox_check_at: new Date().toISOString(),
            consecutive_inbox_failures: 0,
          })
          .eq("id", account.id)

        // 5. Log success to job_logs
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

        // Increment consecutive failures counter
        const nextFailures = (account.consecutive_inbox_failures ?? 0) + 1
        await supabase
          .from("social_accounts")
          .update({ consecutive_inbox_failures: nextFailures })
          .eq("id", account.id)

        // After 3 consecutive failures, email the user an account warning
        if (nextFailures >= 3) {
          const userEmail = await getUserEmail(supabase, account.user_id)
          if (userEmail) {
            try {
              await sendAccountWarning(
                userEmail,
                account.handle ?? account.id,
                "warning",
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

        // Log failure to job_logs
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
        // Always clean up the GoLogin connection, even on failure
        if (connection?.browser) {
          try {
            await disconnectProfile(connection.browser)
          } catch (disconnectErr) {
            logger.warn("disconnectProfile failed", {
              correlationId,
              accountId: account.id,
              error:
                disconnectErr instanceof Error
                  ? disconnectErr.message
                  : String(disconnectErr),
            })
          }
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
