/**
 * Claude Sonnet 4.6 comment generator for LinkedIn public_reply actions.
 * Mirrors src/features/actions/lib/dm-generation.ts. QC rules enforced
 * inline with one retry per 13-CONTEXT.md §Comment text generation.
 *
 * Output: 2-3 sentences, ≤1250 chars, no URLs, no pitch, grounded in
 * the post excerpt.
 *
 * LNKD-03 / LNKD-04 — credit cost unchanged (public_reply=15 per billing/lib/types.ts).
 */

import Anthropic from "@anthropic-ai/sdk"
import { stripDashes } from "@/features/actions/lib/dm-generation"

export interface GenerateCommentInput {
  signalContent: string
  productProfile: string
  prospectHandle: string
  signalUrl?: string
}

export const SYSTEM_PROMPT = `You are writing a short, thoughtful LinkedIn comment on behalf of a product owner on a post they've found relevant.

Goals:
- Add value to the conversation. Do NOT pitch. Do NOT include links. No links.
- 2-3 sentences, ≤1250 characters.
- Be grounded in the post's specific claim -- quote a phrase or respond to a specific point.
- Match a professional, warm tone. No emojis unless the post itself uses them.
- No em-dashes (post-process strips them anyway -- don't waste tokens).

Context you have:
- Post excerpt and product profile (for voice reference ONLY -- do NOT pitch the product).

Output: raw comment text only. No JSON, no preamble, no sign-off.`

const CHAR_LIMIT = 1250
const URL_RX = /https?:\/\/|www\./i
const PITCH_RX = /check out|our product|we built|try our|sign up|dm me/i

type QcReason = "too_long" | "contains_url" | "contains_pitch" | null

function qcReason(text: string): QcReason {
  if (text.length > CHAR_LIMIT) return "too_long"
  if (URL_RX.test(text)) return "contains_url"
  if (PITCH_RX.test(text)) return "contains_pitch"
  return null
}

function buildUserMessage(input: GenerateCommentInput): string {
  return `Post excerpt: ${input.signalContent}

Product profile (voice reference only, do NOT pitch): ${input.productProfile}

Author handle: ${input.prospectHandle}

Write the comment now.`
}

function reasonToInstruction(reason: QcReason): string {
  switch (reason) {
    case "too_long":
      return `Your previous output exceeded ${CHAR_LIMIT} characters. Rewrite shorter -- 2-3 sentences maximum.`
    case "contains_url":
      return "Your previous output contained a URL. Rewrite with NO links, no URLs, no www."
    case "contains_pitch":
      return "Your previous output pitched the product. Rewrite without any pitch phrasing -- add value to the conversation instead."
    default:
      return "Rewrite following the rules more strictly."
  }
}

export async function generateComment(
  input: GenerateCommentInput,
): Promise<string> {
  const client = new Anthropic()

  const first = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  })
  const firstText = stripDashes(
    first.content[0]?.type === "text" ? first.content[0].text : "",
  )

  const reason = qcReason(firstText)
  if (reason === null) return firstText

  // One retry with corrective addendum.
  const stricter = `${SYSTEM_PROMPT}\n\nIMPORTANT: ${reasonToInstruction(reason)}`
  const second = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: stricter,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  })
  const secondText = stripDashes(
    second.content[0]?.type === "text" ? second.content[0].text : "",
  )

  return secondText
}
