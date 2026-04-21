export interface RedditPost {
  id: string
  title: string
  selftext: string
  author: { name: string }
  subreddit: { display_name: string }
  url: string
  created_utc: number
  permalink: string
}

export interface MatchResult {
  matched: boolean
  intent_strength: number // 1-10
  intent_type: "direct" | "competitive" | "problem" | "engagement"
  match_source: "title" | "body" | "both"
  ambiguous: boolean // true = send to Sonnet
}

export interface ClassificationResult {
  post_url: string
  intent_type: "direct" | "competitive" | "problem" | "engagement"
  intent_strength: number // 1-10
  reasoning: string
  suggested_angle: string
}

export interface MonitoringConfig {
  userId: string
  keywords: string[]
  subreddits: string[]
  competitors: string[]
  productName: string
  productDescription: string
}

// ---------------------------------------------------------------------------
// Phase 6 — LinkedIn
// ---------------------------------------------------------------------------

export interface LinkedInPost {
  url: string
  text: string
  postedAt: string // ISO 8601
  reactions: number
  comments: number
  author: {
    name: string
    headline: string | null
    company: string | null
    profileUrl: string
    urn: string
  }
  postType: "post" | "article" | null
  contentLanguage: string | null
}

export interface LinkedInSearchResult {
  posts: LinkedInPost[]
  apifyRunId: string
}
