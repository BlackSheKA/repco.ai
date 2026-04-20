export const PIPELINE_STAGES = [
  "detected",
  "engaged",
  "contacted",
  "replied",
  "converted",
  "rejected",
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export interface ProspectWithSignal {
  id: string
  user_id: string
  platform: "reddit" | "linkedin"
  handle: string | null
  profile_url: string | null
  display_name: string | null
  bio: string | null
  pipeline_status: PipelineStage
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  intent_signal?: {
    post_url: string
    post_content: string | null
    intent_strength: number | null
    intent_type: string | null
    suggested_angle: string | null
    detected_at: string
  } | null
}
