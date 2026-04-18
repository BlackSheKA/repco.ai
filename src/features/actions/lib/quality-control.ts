export interface QCResult {
  passed: boolean
  reason?:
    | "empty"
    | "too_many_sentences"
    | "contains_url"
    | "mentions_price"
    | "no_post_reference"
}

export function runQualityControl(
  dm: string,
  originalPost: string,
): QCResult {
  // 1. Empty check
  if (dm.trim().length === 0) {
    return { passed: false, reason: "empty" }
  }

  // 2. Sentence count (max 3)
  const sentences = dm.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  if (sentences.length > 3) {
    return { passed: false, reason: "too_many_sentences" }
  }

  // 3. URL check
  if (/https?:\/\/|www\./i.test(dm)) {
    return { passed: false, reason: "contains_url" }
  }

  // 4. Price / promotion check
  if (/\b(price|discount|promo|offer|deal|free trial)\b/i.test(dm)) {
    return { passed: false, reason: "mentions_price" }
  }

  // 5. Post reference check (at least one 5+ char word from original post)
  const postWords = originalPost
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
  const dmLower = dm.toLowerCase()
  const hasReference = postWords.some((w) => dmLower.includes(w))
  if (!hasReference) {
    return { passed: false, reason: "no_post_reference" }
  }

  // 6. All checks passed
  return { passed: true }
}
