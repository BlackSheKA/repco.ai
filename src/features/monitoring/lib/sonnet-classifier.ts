import Anthropic from "@anthropic-ai/sdk"
import type { ClassificationResult } from "./types"

const SONNET_LABEL_TO_ENUM: Record<string, ClassificationResult["intent_type"]> =
  {
    buying: "direct",
    comparing: "competitive",
    complaining: "problem",
    asking: "engagement",
  }

function stripCodeFences(text: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/
  const match = text.trim().match(fencePattern)
  return match ? match[1].trim() : text.trim()
}

function mapSonnetLabel(
  label: string,
): ClassificationResult["intent_type"] {
  return SONNET_LABEL_TO_ENUM[label.toLowerCase()] ?? "engagement"
}

export async function classifySignals(
  posts: { url: string; title: string; body: string }[],
  productContext: {
    name: string
    description: string
    keywords: string[]
  },
): Promise<ClassificationResult[]> {
  if (posts.length === 0) return []

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  const model =
    process.env.SONNET_MODEL_ID ?? "claude-sonnet-4-6-20250514"

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Classify these Reddit posts for purchase intent related to: ${productContext.name} - ${productContext.description}

Keywords: ${productContext.keywords.join(", ")}

Posts:
${posts.map((p, i) => `[${i + 1}] URL: ${p.url}\nTitle: ${p.title}\nBody: ${p.body}\n`).join("\n")}

For each post, return a JSON array. Each object: { "post_url": string, "intent_type": "buying"|"comparing"|"complaining"|"asking", "intent_strength": 1-10, "reasoning": "one sentence", "suggested_angle": "one sentence" }. Return ONLY the JSON array.`,
        },
      ],
    })

    const text =
      response.content[0].type === "text" ? response.content[0].text : ""

    const cleaned = stripCodeFences(text)
    const parsed = JSON.parse(cleaned) as Array<{
      post_url: string
      intent_type: string
      intent_strength: number
      reasoning: string
      suggested_angle: string
    }>

    // Map Sonnet labels to DB enum values
    return parsed.map((item) => ({
      post_url: item.post_url,
      intent_type: mapSonnetLabel(item.intent_type),
      intent_strength: item.intent_strength,
      reasoning: item.reasoning,
      suggested_angle: item.suggested_angle,
    }))
  } catch (error) {
    console.error("[sonnet-classifier] Failed to classify signals:", error)
    return []
  }
}
