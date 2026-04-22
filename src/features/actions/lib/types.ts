/**
 * Action domain types shared across Phase 3 plans.
 *
 * These types define the contracts for:
 * - Action records (DB row shape)
 * - Approval queue card data
 * - DM generation input/output
 * - Computer Use execution results
 */

export type ActionType = "like" | "follow" | "public_reply" | "dm" | "followup_dm" | "connection_request"

export type ActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelled"

export interface Action {
  id: string
  user_id: string
  prospect_id: string
  account_id: string | null
  action_type: ActionType
  status: ActionStatus
  drafted_content: string | null
  final_content: string | null
  approved_at: string | null
  executed_at: string | null
  error: string | null
  sequence_step: number | null
  expires_at: string | null
  screenshot_url: string | null
  created_at: string
}

export interface ApprovalCardData {
  action: Action
  signal: {
    post_url: string
    post_content: string | null
    subreddit: string | null
    author_handle: string | null
    intent_strength: number | null
    suggested_angle: string | null
    platform: string
    detected_at: string
  }
}

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

export interface CUStepLog {
  step: number
  action: string
  /** Sanitized action input (text truncated, coords flattened) */
  input: Record<string, unknown>
  /** Short reasoning text from the model, if emitted before the tool call */
  reasoning?: string
}

export interface CUResult {
  success: boolean
  steps: number
  screenshots: string[]
  /** Per-step log of what the CU model did — used for debugging stuck runs */
  stepLog: CUStepLog[]
  error?: string
}
