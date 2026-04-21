import type { SupabaseClient } from "@supabase/supabase-js"

import { normalizeHandle } from "@/lib/handles/normalize"

export interface MatchedReply {
  prospectId: string
  prospectHandle: string
  userId: string
  replySnippet: string
}

/**
 * Match a reply sender to a prospect record.
 *
 * Normalizes BOTH the inbox sender AND the stored prospect handle via the
 * shared `normalizeHandle` utility so the production storage form
 * (`u/<name>` for Reddit — written verbatim by ingestion-pipeline.ts and
 * copied into prospects.handle by create-actions.ts) matches any inbox
 * sender variant the Haiku vision pass reports (`"alice"`, `"u/alice"`,
 * `"U/Alice"`, …). Normalizing only one side — as a previous revision did —
 * silently returned null in production and broke the RPLY-02/03/04 +
 * FLLW-04 cascade (see .planning/phases/07-reply-detection-fix).
 *
 * Only matches prospects for the given (user_id, platform) pair and skips
 * prospects already in `replied` status.
 *
 * Returns a MatchedReply when a prospect is found; null otherwise. The
 * `prospectHandle` returned is the stored display form (preserves `u/` on
 * Reddit) so downstream UI + email renders the user-facing shape. The
 * replySnippet is returned empty here — callers populate it with the message
 * preview extracted from the CU response.
 */
export async function matchReplyToProspect(
  supabase: SupabaseClient,
  senderHandle: string,
  platform: string,
  accountUserId: string,
): Promise<MatchedReply | null> {
  const normalized = normalizeHandle(senderHandle, platform)
  if (!normalized) return null

  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, handle, user_id, pipeline_status")
    .eq("user_id", accountUserId)
    .eq("platform", platform)
    .neq("pipeline_status", "replied")

  if (!prospects?.length) return null

  const match = (
    prospects as Array<{
      id: string
      handle: string | null
      user_id: string
      pipeline_status: string
    }>
  ).find((p) => normalizeHandle(p.handle, platform) === normalized)

  if (!match) return null

  return {
    prospectId: match.id,
    prospectHandle: match.handle ?? normalized,
    userId: match.user_id,
    replySnippet: "",
  }
}
