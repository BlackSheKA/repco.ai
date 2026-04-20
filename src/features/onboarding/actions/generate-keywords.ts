"use server"

import Anthropic from "@anthropic-ai/sdk"

import type { GeneratedKeywords } from "../lib/types"

function stripCodeFences(text: string): string {
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/
  const match = text.trim().match(fencePattern)
  return match ? match[1].trim() : text.trim()
}

interface GenerateKeywordsInput {
  productDescription: string
  targetCustomer: string
  competitors: string[]
}

export async function generateKeywords(
  input: GenerateKeywordsInput
): Promise<GeneratedKeywords> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  const model = process.env.SONNET_MODEL_ID ?? "claude-sonnet-4-6"

  const competitorsLine =
    input.competitors.length > 0
      ? input.competitors.join(", ")
      : "(none specified)"

  const prompt = `You are helping configure a Reddit monitoring tool for a SaaS product.

Product description: ${input.productDescription}
Target customer: ${input.targetCustomer}
Competitors: ${competitorsLine}

Generate monitoring targets. Return ONLY a JSON object (no prose, no markdown) with this exact shape:

{
  "keywords": [5-10 short phrases people would post when looking for a product like this],
  "subreddits": [3-5 subreddit names without the "r/" prefix, ordered by most relevant first],
  "competitor_keywords": [2-3 phrases like "alternative to X" or "X vs" for each competitor; empty array if no competitors]
}

Keywords should be real phrases people type, not product features. Subreddits should exist and be active. Keep everything short.`

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  const text =
    response.content[0].type === "text" ? response.content[0].text : ""

  const cleaned = stripCodeFences(text)

  const parsed = JSON.parse(cleaned) as {
    keywords?: unknown
    subreddits?: unknown
    competitor_keywords?: unknown
  }

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((k): k is string => typeof k === "string")
    : []
  const subreddits = Array.isArray(parsed.subreddits)
    ? parsed.subreddits
        .filter((s): s is string => typeof s === "string")
        .map((s) => (s.startsWith("r/") ? s : `r/${s}`))
    : []
  const competitorKeywords = Array.isArray(parsed.competitor_keywords)
    ? parsed.competitor_keywords.filter(
        (k): k is string => typeof k === "string"
      )
    : []

  return {
    keywords,
    subreddits,
    competitorKeywords,
  }
}
