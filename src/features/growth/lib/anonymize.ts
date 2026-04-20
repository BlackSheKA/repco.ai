/**
 * Server-side anonymization for public /live page signals.
 *
 * Strips author handles, post URLs, subreddit names, and post content,
 * replacing content with generic category descriptions derived from the
 * classified intent_type. Designed so the public feed cannot expose
 * private user context or identifying information about post authors.
 */

export type IntentType = "direct" | "competitive" | "problem" | "engagement"

export interface RawSignal {
  id: string
  platform: string
  intent_type: IntentType | null
  intent_strength: number | null
  detected_at: string
  author_handle?: string | null
  post_url?: string | null
  post_content?: string | null
  subreddit?: string | null
}

export interface AnonymizedSignal {
  id: string
  platform: string
  intent_type: IntentType | null
  intent_strength: number | null
  detected_at: string
  description: string
  author_handle: null
  post_url: "#"
}

const DESCRIPTIONS: Record<IntentType, string> = {
  direct: "Someone looking for a solution like yours",
  competitive: "Someone looking for an alternative",
  problem: "Someone describing a problem your product solves",
  engagement: "Someone discussing a relevant topic",
}

const FALLBACK_DESCRIPTION = "Someone discussing a relevant topic"

export function anonymizeSignal(signal: RawSignal): AnonymizedSignal {
  const description =
    signal.intent_type && DESCRIPTIONS[signal.intent_type]
      ? DESCRIPTIONS[signal.intent_type]
      : FALLBACK_DESCRIPTION

  return {
    id: signal.id,
    platform: signal.platform,
    intent_type: signal.intent_type,
    intent_strength: signal.intent_strength,
    detected_at: signal.detected_at,
    description,
    author_handle: null,
    post_url: "#",
  }
}

export function anonymizeSignals(signals: RawSignal[]): AnonymizedSignal[] {
  return signals.map(anonymizeSignal)
}
