import type { MatchResult } from "./types"

const BUYING_PHRASES = [
  "looking for",
  "need",
  "recommend",
  "alternative to",
  "best",
  "help me find",
  "suggestions for",
  "what do you use",
]

function scoreMatch(
  inTitle: boolean,
  inBody: boolean,
  titleLower: string,
): number {
  let score = 5 // base score for keyword match
  if (inTitle && inBody) score += 2 // strong signal: keyword in both
  else if (inTitle) score += 1 // title match slightly stronger

  // Boost for buying-intent phrases in title
  if (BUYING_PHRASES.some((p) => titleLower.includes(p))) score += 2

  return Math.min(score, 10)
}

export function matchPost(
  title: string,
  body: string,
  keywords: string[],
  competitors: string[],
): MatchResult {
  const titleLower = title.toLowerCase()
  const bodyLower = body.toLowerCase()

  // Direct keyword match
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase()
    const inTitle = titleLower.includes(kwLower)
    const inBody = bodyLower.includes(kwLower)

    if (inTitle || inBody) {
      return {
        matched: true,
        intent_strength: scoreMatch(inTitle, inBody, titleLower),
        intent_type: "direct",
        match_source: inTitle && inBody ? "both" : inTitle ? "title" : "body",
        ambiguous: false,
      }
    }
  }

  // Competitor mention
  for (const comp of competitors) {
    const compLower = comp.toLowerCase()
    if (titleLower.includes(compLower) || bodyLower.includes(compLower)) {
      return {
        matched: true,
        intent_strength: 7,
        intent_type: "competitive",
        match_source: titleLower.includes(compLower) ? "title" : "body",
        ambiguous: false,
      }
    }
  }

  // Buying phrase without keyword match -> problem intent
  if (BUYING_PHRASES.some((p) => titleLower.includes(p))) {
    return {
      matched: true,
      intent_strength: 4,
      intent_type: "problem",
      match_source: "title",
      ambiguous: true,
    }
  }

  // No structural match -- ambiguous, send to Sonnet
  return {
    matched: false,
    intent_strength: 0,
    intent_type: "direct",
    match_source: "body",
    ambiguous: true,
  }
}
