import Anthropic from "@anthropic-ai/sdk"

export interface ConnectionNoteInput {
  postContent: string
  authorHeadline: string | null
  productDescription: string
  suggestedAngle: string
}

export interface ConnectionNoteResult {
  content: string
  passed: boolean
  failureReason?: string
}

const MAX_CONNECTION_NOTE_CHARS = 300

const SYSTEM_PROMPT = `You are drafting a LinkedIn connection request note on behalf of a product owner. Rules:
- Hard limit: 300 characters total (LinkedIn enforces this). Shorter is better.
- Professional, warm tone -- no salesy phrasing.
- Reference something concrete from the target's post or headline.
- No links, no pricing, no discount mentions.
- Do NOT ask for a meeting or demo in the note -- that comes after acceptance.
- Do NOT start with "Hey" or "Hi there".
- Single paragraph, no line breaks.
- NEVER use em-dashes (—) or en-dashes (–). Use a regular hyphen (-) or rewrite.`

function stripDashes(text: string): string {
  return text.replace(/[—–]/g, "-")
}

function buildUserMessage(input: ConnectionNoteInput): string {
  return `Post: ${input.postContent}

Author headline: ${input.authorHeadline ?? "(none)"}

Product: ${input.productDescription}

Angle: ${input.suggestedAngle}

Write a LinkedIn connection request note (max 300 chars).`
}

/**
 * Generates a <=300 character professional connection note referencing the
 * LinkedIn post. Uses Claude Sonnet 4.6 (same model as DM generation) with
 * a LinkedIn-specific system prompt. Returns failed=true when the draft is
 * over the 300-char limit (callers can retry or surface the error).
 */
export async function generateConnectionNote(
  input: ConnectionNoteInput,
): Promise<ConnectionNoteResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  })

  const rawContent =
    response.content[0]?.type === "text" ? response.content[0].text : ""
  const content = stripDashes(rawContent).trim()

  if (content.length === 0) {
    return {
      content: "",
      passed: false,
      failureReason: "empty_response",
    }
  }
  if (content.length > MAX_CONNECTION_NOTE_CHARS) {
    return {
      content,
      passed: false,
      failureReason: `over_limit:${content.length}`,
    }
  }

  return { content, passed: true }
}
