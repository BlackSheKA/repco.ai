import { createElement } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { AccountWarningEmail } from "../emails/account-warning"
import { resend } from "./resend-client"

export type WarningStatus =
  | "warning"
  | "banned"
  | "needs_reconnect"
  | "captcha_required"

export type WarningPlatform = "reddit" | "linkedin"

export type WarningOpts = {
  platform?: WarningPlatform
  supabase?: SupabaseClient
  userId?: string
  accountId?: string
}

/**
 * Phase 18 (BPRX-09, D-19 + L-6): account-warning email helper.
 *
 * Backward-compatible: callers without `opts` keep the original 2-arg
 * behavior (no debounce, no job_logs insert).
 *
 * With `opts.supabase + opts.accountId`: 24h debounce — skip if a recent
 * `account_warning_email` job_log exists for this account.
 *
 * After successful Resend dispatch, writes a `job_logs` row that drives
 * the next debounce (job_type='account_warning_email', metadata.account_id
 * as string per L-6).
 */
export async function sendAccountWarning(
  to: string,
  accountHandle: string,
  status: WarningStatus,
  opts?: WarningOpts,
) {
  // 24h debounce — only when caller provides supabase + accountId.
  if (opts?.supabase && opts.accountId) {
    const since = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString()
    const { data: recent } = await opts.supabase
      .from("job_logs")
      .select("id")
      .eq("job_type", "account_warning_email")
      .filter("metadata->>account_id", "eq", opts.accountId)
      .gte("finished_at", since)
      .limit(1)
    if (recent && recent.length > 0) {
      return null
    }
  }

  const platform: WarningPlatform = opts?.platform ?? "reddit"
  const subject = renderSubject(status, accountHandle, platform)

  const { data, error } = await resend.emails.send({
    from: "repco <notifications@repco.ai>",
    to,
    subject,
    react: createElement(AccountWarningEmail, {
      accountHandle,
      status,
      platform,
    }),
  })
  if (error) throw error

  // Write the job_logs row that drives the next 24h debounce check.
  if (opts?.supabase && opts.accountId) {
    await opts.supabase.from("job_logs").insert({
      job_type: "account_warning_email" as const,
      status: "completed" as const,
      user_id: opts.userId ?? null,
      finished_at: new Date().toISOString(),
      metadata: { account_id: opts.accountId, status },
    })
  }

  return data
}

function renderSubject(
  status: WarningStatus,
  handle: string,
  platform: WarningPlatform,
): string {
  const platformLabel = platform === "reddit" ? "Reddit" : "LinkedIn"
  const handlePrefixed = platform === "reddit" ? `u/${handle}` : handle
  switch (status) {
    case "banned":
      return `Your ${platformLabel} account ${handlePrefixed} was suspended`
    case "needs_reconnect":
      return `Reconnect needed for ${handlePrefixed}`
    case "captcha_required":
      return `Captcha is blocking ${handlePrefixed} — quick fix`
    case "warning":
    default:
      return `Account @${handle} needs attention`
  }
}
