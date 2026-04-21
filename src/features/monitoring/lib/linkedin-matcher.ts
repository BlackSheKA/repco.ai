import type { LinkedInPost, MatchResult, MonitoringConfig } from "./types"

const HASHTAG_RE = /#(\w+)/g
const MENTION_RE = /@([\w-]+)/g
const MIN_POST_LENGTH_FOR_STRUCTURAL = 50
const ARTICLE_INTENT_BOOST = 1

function normalizeKeyword(k: string): string {
  return k.trim().toLowerCase().replace(/^#/, "")
}

function extractHashtags(text: string): string[] {
  return Array.from(text.matchAll(HASHTAG_RE)).map((m) => m[1].toLowerCase())
}

function extractMentions(text: string): string[] {
  return Array.from(text.matchAll(MENTION_RE)).map((m) => m[1].toLowerCase())
}

/**
 * Structural match for a LinkedIn post. Mirrors reddit's structural matcher
 * contract (MatchResult) so the classification pipeline is platform agnostic.
 *
 * Handles:
 *  - #hashtag normalization (e.g., "#AI" matches keyword "ai")
 *  - @mention parsing for competitor lists
 *  - article postType yields a small intent boost when a competitor is named
 *  - short posts (< 50 chars) flagged ambiguous to force Sonnet review
 */
export function matchLinkedInPost(
  post: LinkedInPost,
  config: MonitoringConfig,
): MatchResult {
  const rawText = post.text ?? ""
  const text = rawText.toLowerCase()
  const hashtags = extractHashtags(rawText)
  const mentions = extractMentions(rawText)
  const keywords = config.keywords.map(normalizeKeyword)
  const competitors = config.competitors.map((c) => c.toLowerCase())

  const keywordHit =
    keywords.some((k) => text.includes(k)) ||
    keywords.some((k) => hashtags.includes(k))
  const competitorHit =
    competitors.some((c) => text.includes(c)) ||
    competitors.some((c) => mentions.includes(c))

  const matched = keywordHit || competitorHit
  const short = rawText.length < MIN_POST_LENGTH_FOR_STRUCTURAL
  const isArticle = post.postType === "article"

  let intent_strength = 5
  if (competitorHit) intent_strength += 2
  if (isArticle && competitorHit) intent_strength += ARTICLE_INTENT_BOOST
  intent_strength = Math.min(10, Math.max(1, intent_strength))

  const intent_type: MatchResult["intent_type"] = competitorHit
    ? "competitive"
    : "direct"

  // Ambiguous when the match is weak enough that Sonnet should review:
  // - Short posts are engagement farming noise — always send to Sonnet.
  const ambiguous = matched && short

  return {
    matched,
    intent_strength,
    intent_type,
    match_source: "body",
    ambiguous,
  }
}

// Exported constants for test + integration use
export { MIN_POST_LENGTH_FOR_STRUCTURAL }
