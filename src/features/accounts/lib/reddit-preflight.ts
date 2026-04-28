import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Reddit account preflight via about.json.
 *
 * Direct fetch from the worker process (no Browserbase / no proxy hop) — the
 * Browserbase residential proxy is browser-only and unreachable from a Node
 * fetch (RESEARCH §1).
 *
 * Cache: 1h via `social_accounts.last_preflight_at` + `last_preflight_status`
 * (columns added by migration 00026, plan 18-01). Cache hit on `status='ok'`
 * within TTL → skip fetch entirely.
 *
 * Mapping (RESEARCH §3):
 *   200 + is_suspended:true   → banned/suspended
 *   200 + total_karma<5       → banned/low_karma  (only if !is_suspended; L-4)
 *   200 + total_karma>=5      → ok
 *   404                       → banned/404
 *   403                       → banned/403
 *   429 / 5xx / network error → transient (retry once, 2s backoff)
 */

const REDDIT_USER_AGENT = "repco.ai/1.0 (+https://repco.ai)"
const PREFLIGHT_CACHE_TTL_MS = 60 * 60 * 1000 // 1h

export type PreflightResult =
  | { kind: "ok" }
  | { kind: "banned"; reason: "suspended" | "low_karma" | "404" | "403" }
  | { kind: "transient"; error: string }

interface RunArgs {
  handle: string
  supabase: SupabaseClient
  accountId: string
}

export async function runRedditPreflight(
  args: RunArgs,
): Promise<PreflightResult> {
  const { handle, supabase, accountId } = args

  // Cache check — skip fetch on fresh 'ok' result.
  const { data: cache } = await supabase
    .from("social_accounts")
    .select("last_preflight_at, last_preflight_status")
    .eq("id", accountId)
    .single()

  if (cache?.last_preflight_at && cache.last_preflight_status === "ok") {
    const ageMs = Date.now() - new Date(cache.last_preflight_at).getTime()
    if (ageMs < PREFLIGHT_CACHE_TTL_MS) {
      return { kind: "ok" }
    }
  }

  const result = await doFetchWithRetry(handle)

  // Persist result to cache columns. Failure to write is non-fatal.
  const status =
    result.kind === "ok"
      ? "ok"
      : result.kind === "banned"
        ? "banned"
        : "transient"
  await supabase
    .from("social_accounts")
    .update({
      last_preflight_at: new Date().toISOString(),
      last_preflight_status: status,
    })
    .eq("id", accountId)

  return result
}

async function doFetchWithRetry(handle: string): Promise<PreflightResult> {
  const first = await doFetchOnce(handle)
  if (first.kind !== "transient") return first
  // Single retry with 2s backoff, ONLY on transient.
  await new Promise((r) => setTimeout(r, 2000))
  return doFetchOnce(handle)
}

async function doFetchOnce(handle: string): Promise<PreflightResult> {
  const url = `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": REDDIT_USER_AGENT,
        Accept: "application/json",
      },
    })
  } catch (err) {
    return {
      kind: "transient",
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (response.status === 404) return { kind: "banned", reason: "404" }
  if (response.status === 403) return { kind: "banned", reason: "403" }
  if (response.status === 429) {
    return { kind: "transient", error: "rate_limited" }
  }
  if (response.status >= 500) {
    return { kind: "transient", error: `http_${response.status}` }
  }
  if (!response.ok) {
    return { kind: "transient", error: `http_${response.status}` }
  }

  let payload: { data?: { is_suspended?: boolean; total_karma?: number } }
  try {
    payload = await response.json()
  } catch {
    return { kind: "transient", error: "invalid_json" }
  }

  // L-4: check is_suspended FIRST (suspended payloads omit total_karma).
  if (payload?.data?.is_suspended === true) {
    return { kind: "banned", reason: "suspended" }
  }
  if (
    typeof payload?.data?.total_karma === "number" &&
    payload.data.total_karma < 5
  ) {
    return { kind: "banned", reason: "low_karma" }
  }
  return { kind: "ok" }
}
