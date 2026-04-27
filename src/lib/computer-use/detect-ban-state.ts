/**
 * Phase 18 (BPRX-09, D-14): Post-action ban-state detector.
 *
 * Single-shot Haiku classification of the final post-action screenshot.
 * NOT registered as a tool inside the executor's CU loop — runs as a
 * post-loop call from worker.ts so per-action cost stays predictable
 * (~$0.001 + ~1-2s per action).
 *
 * Defensive (per L-3 / D-23): any failure (Anthropic API error, parse
 * failure, missing block) returns all-false and logs. Caller MUST NOT
 * flip health_status on all-false — detector failure ≠ banned signal.
 */

import Anthropic from "@anthropic-ai/sdk"

const DETECT_BAN_STATE_SYSTEM_PROMPT = `You are a Reddit and LinkedIn page-state classifier. You inspect a screenshot of a
browser viewport and decide whether the page indicates the user has been BANNED,
SUSPENDED, or is being shown a CAPTCHA challenge.

Return ONLY a single JSON object on one line, with these three boolean keys, in
this order:

  {"banned": <bool>, "suspended": <bool>, "captcha": <bool>}

Definitions:

- "banned": A subreddit-level rule violation, account ban, or "you broke a rule"
  modal is visible. Includes "Account Suspended" pages, "you have been banned
  from r/X" notices, and Reddit/LinkedIn account-restriction interstitials.

- "suspended": Account-level suspension is shown. The account is logged out OR
  the page shows a permanent or temporary suspension notice naming the
  specific account.

- "captcha": A captcha challenge is visible — Cloudflare turnstile, Reddit
  captcha modal, LinkedIn "verify you are human" page, hCaptcha, reCAPTCHA, or
  any image-grid / checkbox / puzzle that blocks further interaction.

If the screenshot shows a normal feed, post, profile, DM thread, or any other
page where the user can continue working, return all three flags as false.

Do not include explanations, reasoning, markdown fences, or any text other
than the JSON object.`

export type BanStateVerdict = {
  banned: boolean
  suspended: boolean
  captcha: boolean
}

const ALL_FALSE: BanStateVerdict = {
  banned: false,
  suspended: false,
  captcha: false,
}

export async function detectBanState(
  screenshotBase64: string,
): Promise<BanStateVerdict> {
  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: DETECT_BAN_STATE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: screenshotBase64,
              },
            },
            { type: "text", text: "Inspect this screenshot." },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    const text = textBlock && "text" in textBlock ? textBlock.text : ""
    const match = text.match(/\{[^}]+\}/)
    if (!match) return ALL_FALSE
    let parsed: { banned?: unknown; suspended?: unknown; captcha?: unknown }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return ALL_FALSE
    }
    return {
      banned: parsed.banned === true,
      suspended: parsed.suspended === true,
      captcha: parsed.captcha === true,
    }
  } catch (err) {
    console.error(
      "[detect-ban-state] failed (returning all-false):",
      err instanceof Error ? err.message : String(err),
    )
    return ALL_FALSE
  }
}
