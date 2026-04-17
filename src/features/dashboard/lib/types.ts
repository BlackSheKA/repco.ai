export interface IntentSignal {
  id: string
  user_id: string
  platform: string
  post_url: string
  post_content: string | null
  subreddit: string | null
  author_handle: string | null
  author_profile_url: string | null
  intent_type: string | null
  intent_strength: number | null
  intent_reasoning: string | null
  suggested_angle: string | null
  classification_status: string
  status: string
  is_public: boolean
  dismissed_at: string | null
  detected_at: string
}
