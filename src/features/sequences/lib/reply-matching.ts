import type { SupabaseClient } from "@supabase/supabase-js"

export interface MatchedReply {
  prospectId: string
  prospectHandle: string
  userId: string
  replySnippet: string
}

/**
 * Match a reply sender to a prospect record.
 *
 * Normalizes handles to lowercase and strips a leading "u/" prefix so Reddit
 * username display variants ("TestUser", "u/TestUser", "U/testuser") all map
 * to the stored prospect handle.
 *
 * Only matches prospects for the given (user_id, platform) pair and skips
 * prospects already in `replied` status.
 *
 * Returns a MatchedReply when a prospect is found; null otherwise. The
 * replySnippet is returned empty here — callers populate it with the message
 * preview extracted from the CU response.
 */
export async function matchReplyToProspect(
  supabase: SupabaseClient,
  senderHandle: string,
  platform: string,
  accountUserId: string,
): Promise<MatchedReply | null> {
  const normalized = senderHandle.replace(/^u\//i, "").toLowerCase()

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
  ).find((p) => p.handle?.toLowerCase() === normalized)

  if (!match) return null

  return {
    prospectId: match.id,
    prospectHandle: match.handle ?? normalized,
    userId: match.user_id,
    replySnippet: "",
  }
}
