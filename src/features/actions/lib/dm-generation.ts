import Anthropic from "@anthropic-ai/sdk"
import { runQualityControl } from "./quality-control"

export interface DmGenerationInput {
  postContent: string
  productDescription: string
  suggestedAngle: string
}

export interface DmGenerationResult {
  content: string
  passed: boolean
  failureReason?: string
}

const SYSTEM_PROMPT = `You are writing a Reddit DM on behalf of a product owner. Rules:
- Max 3 sentences
- No links or URLs
- No mentions of price, discount, or promotion
- Reference something specific from their post
- Casual, helpful tone -- no hard sell
- End with a question or soft CTA
- Do NOT start with "Hey, I saw your post"`

function buildUserMessage(input: DmGenerationInput): string {
  return `Post: ${input.postContent}

Product: ${input.productDescription}

Angle: ${input.suggestedAngle}

Write a DM.`
}

export async function generateDM(
  input: DmGenerationInput,
): Promise<DmGenerationResult> {
  const client = new Anthropic()

  // First attempt
  const firstResponse = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  })

  const firstContent =
    firstResponse.content[0].type === "text"
      ? firstResponse.content[0].text
      : ""

  const firstQC = runQualityControl(firstContent, input.postContent)
  if (firstQC.passed) {
    return { content: firstContent, passed: true }
  }

  // Second attempt with stricter prompt
  const stricterSystem = `${SYSTEM_PROMPT}\nIMPORTANT: Your previous attempt was rejected because: ${firstQC.reason}. Fix this issue.`

  const secondResponse = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 300,
    system: stricterSystem,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  })

  const secondContent =
    secondResponse.content[0].type === "text"
      ? secondResponse.content[0].text
      : ""

  const secondQC = runQualityControl(secondContent, input.postContent)
  if (secondQC.passed) {
    return { content: secondContent, passed: true }
  }

  // Both attempts failed
  return { content: "", passed: false, failureReason: secondQC.reason }
}
