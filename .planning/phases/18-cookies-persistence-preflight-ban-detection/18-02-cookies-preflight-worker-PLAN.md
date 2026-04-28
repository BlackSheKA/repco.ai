---
phase: 18
plan: 02
type: execute
wave: 2
depends_on:
  - 18-01
files_modified:
  - src/lib/gologin/client.ts
  - src/lib/gologin/adapter.ts
  - src/features/accounts/lib/reddit-preflight.ts
  - src/features/accounts/lib/reddit-preflight.test.ts
  - src/lib/action-worker/worker.ts
autonomous: true
requirements:
  - BPRX-07
  - BPRX-08
must_haves:
  truths:
    - "Worker saves the GoLogin cookie jar to browser_profiles.cookies_jar after every successful session"
    - "Worker idles a uniform-random 30-60s on success path before stopCloudBrowser; skips idle on failure"
    - "Worker restores cookies via POST /browser/{id}/cookies BEFORE connectToProfile when cookies_jar IS NOT NULL"
    - "Reddit worker actions hit reddit-preflight gate AFTER quarantine guard and BEFORE browser-profile resolution"
    - "Definitive ban signals (is_suspended, total_karma<5, 404, 403) flip health_status to 'banned' with NO connectToProfile call"
    - "Phase 14 quarantine guard short-circuits on 'needs_reconnect' AND 'captcha_required' (both new ENUM values)"
    - "Preflight result cached for 1h via social_accounts.last_preflight_at + last_preflight_status"
  artifacts:
    - path: "src/lib/gologin/client.ts"
      provides: "getCookies(profileId) and setCookies(profileId, jar) REST wrappers"
      exports: ["getCookies", "setCookies"]
    - path: "src/lib/gologin/adapter.ts"
      provides: "saveCookiesAndRelease wrapper that sequences save → optional idle → release"
      exports: ["saveCookiesAndRelease"]
    - path: "src/features/accounts/lib/reddit-preflight.ts"
      provides: "Discriminated-union runRedditPreflight helper"
      exports: ["runRedditPreflight"]
    - path: "src/features/accounts/lib/reddit-preflight.test.ts"
      provides: "Unit + mocked-fetch tests covering V-05 through V-09"
    - path: "src/lib/action-worker/worker.ts"
      provides: "Quarantine guard extension + preflight gate + cookies restore + saveCookiesAndRelease swap"
  key_links:
    - from: "src/lib/action-worker/worker.ts"
      to: "src/features/accounts/lib/reddit-preflight.ts"
      via: "import + Reddit-only branch after quarantine guard"
      pattern: "runRedditPreflight"
    - from: "src/lib/action-worker/worker.ts"
      to: "src/lib/gologin/adapter.ts saveCookiesAndRelease"
      via: "finally-block swap on success path"
      pattern: "saveCookiesAndRelease"
    - from: "src/lib/action-worker/worker.ts"
      to: "src/lib/gologin/client.ts setCookies"
      via: "cookies restore before connectToProfile"
      pattern: "setCookies"
---

<objective>
Ship the Reddit preflight + cookies persistence layer that wraps every worker action: cookies are saved at session end, restored at session start, and Reddit accounts are pre-checked via about.json (no proxy hop, direct fetch) BEFORE GoLogin spin-up.

Purpose: Closes BPRX-07 (cookies + idle 30-60s) and BPRX-08 (preflight before browser spin-up) and extends the Phase 14 quarantine guard to short-circuit on the two new ENUM values (`'needs_reconnect'`, `'captcha_required'`) introduced by Plan 01 — Plan 03 will set those values via the detector.

Output: 3 new/modified GoLogin layer files + 1 new preflight module + 1 worker.ts patch + colocated tests for the preflight discriminated union.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-CONTEXT.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md
@src/lib/gologin/client.ts
@src/lib/gologin/adapter.ts
@src/lib/action-worker/worker.ts

<interfaces>
<!-- Existing exports from src/lib/gologin/client.ts (PATTERNS §2 analog: getProfile at lines 155-173) -->

```ts
// existing: src/lib/gologin/client.ts
const GOLOGIN_API = "https://api.gologin.com"
function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GOLOGIN_API_TOKEN}`,
    "Content-Type": "application/json",
  }
}
export async function getProfile(profileId: string): Promise<GoLoginProfile | null> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}`, { method: "GET", headers: headers() })
  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin getProfile failed (${response.status}): ${body}`)
  }
  return (await response.json()) as GoLoginProfile
}
```

<!-- Existing exports from src/lib/gologin/adapter.ts (PATTERNS §3 analog: releaseProfile at 125-146) -->

```ts
export async function releaseProfile(connection: GoLoginConnection | undefined): Promise<void> {
  if (!connection) return
  try { await connection.browser.close() } catch (err) { console.warn("[gologin] browser.close() failed (non-fatal):", String(err)) }
  try { await stopCloudBrowser(connection.profileId) } catch (err) { console.warn("[gologin] stopCloudBrowser failed (non-fatal):", String(err)) }
}
```

<!-- Existing worker.ts insertion-points (PATTERNS §8) -->

worker.ts:78-128 — Phase 14 quarantine guard:
```ts
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  (account.cooldown_until !== null &&
    account.cooldown_until !== undefined &&
    new Date(account.cooldown_until).getTime() > Date.now())
```

worker.ts:264-276 — connectToProfile call (insertion point for cookies restore IMMEDIATELY before this).
worker.ts:709-716 — finally block with `await releaseProfile(connection)` to swap on success path.

<!-- Cookie type from RESEARCH §2 -->

```ts
type GoLoginCookie = {
  name: string
  value: string
  domain: string
  path: string
  expirationDate?: number
  hostOnly?: boolean
  httpOnly?: boolean
  secure?: boolean
  session?: boolean
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified"
}
```

<!-- about.json response shape (RESEARCH §3) -->

Healthy: 200 + `{ kind: "t2", data: { is_suspended: false, total_karma: number, ... } }`
Suspended: 200 + `{ kind: "t2", data: { is_suspended: true, name } }` (total_karma absent)
Deleted: 404
Forbidden: 403 (treated as suspended)
Rate-limited: 429 (transient)
</interfaces>

<critical_constraints>
- Plan 01 must be applied to dev branch before this plan starts (depends_on: 18-01).
- L-1 (RESEARCH §12): cookies save MUST happen BEFORE `releaseProfile` (which calls stopCloudBrowser).
- L-2 (RESEARCH §12): runtime code may now reference the new ENUM values; migration committed in Plan 01.
- L-4 (RESEARCH §12): check `is_suspended` BEFORE `total_karma < 5` (suspended payloads have undefined total_karma).
- L-5 (RESEARCH §12): the quarantine guard must include BOTH `'needs_reconnect'` AND `'captcha_required'` — forgetting one is a silent escape.
- L-8 (RESEARCH §12): `setCookies` REPLACES the entire jar; always save the full jar (no merge).
- D-07 revised (RESEARCH §1): direct fetch to about.json — NO proxy hop. The geolocation proxy is browser-only and unreachable from Node fetch.
- Memory `feedback_supabase_mocked_tests_mask_column_drift`: tests touching new columns (`last_preflight_at`, `last_preflight_status`, `cookies_jar`) MUST grep migration 00025 to confirm column names and types before mocking.
- All new external calls log with `correlationId` per CLAUDE.md observability pattern.
- `await logger.flush()` before any worker return path (CLAUDE.md §Critical Rules).
- Defensive try/catch on every external call — `saveCookiesAndRelease` and `runRedditPreflight` must NEVER throw out of the worker.
</critical_constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add getCookies + setCookies REST wrappers to GoLogin client</name>
  <read_first>
    - src/lib/gologin/client.ts (full file — confirm `headers()` helper, `GOLOGIN_API` const, `getProfile` analog at lines 155-173)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §2 (exact mirror instruction)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §2 (cookie shape, endpoints, when callable)
  </read_first>
  <files>src/lib/gologin/client.ts</files>
  <behavior>
    - Test 1: `getCookies(profileId)` returns parsed JSON array on 200
    - Test 2: `getCookies(profileId)` throws Error with `(status): body` format on non-2xx
    - Test 3: `setCookies(profileId, jar)` POSTs `JSON.stringify(jar)` and resolves on 2xx
    - Test 4: `setCookies(profileId, jar)` throws Error on non-2xx
    (V-02 / V-03 are real-API integration tests, not in this task — covered by manual `INTEGRATION=1` run)
  </behavior>
  <action>
Append to `src/lib/gologin/client.ts` (do NOT modify existing exports). Reuse module-level `headers()` and `GOLOGIN_API` constants. Mirror the `getProfile` shape exactly.

Add a `GoLoginCookie` type export (matches RESEARCH §2 shape):

```ts
export type GoLoginCookie = {
  name: string
  value: string
  domain: string
  path: string
  expirationDate?: number
  hostOnly?: boolean
  httpOnly?: boolean
  secure?: boolean
  session?: boolean
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified"
}

/**
 * Fetch the cookie jar for a GoLogin profile. Returns the raw Chromium-format
 * cookie array. Works whether the cloud browser is running or stopped (cookies
 * are persisted in profile state independently of the live session).
 *
 * Per RESEARCH §2: GET /browser/{id}/cookies. POST replaces the entire jar.
 */
export async function getCookies(profileId: string): Promise<GoLoginCookie[]> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/cookies`, {
    method: "GET",
    headers: headers(),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin getCookies failed (${response.status}): ${body}`)
  }
  return (await response.json()) as GoLoginCookie[]
}

/**
 * Replace the cookie jar for a GoLogin profile. POST replaces the full array
 * (not merge). Always send the latest complete snapshot returned by getCookies
 * — see RESEARCH L-8.
 */
export async function setCookies(profileId: string, jar: GoLoginCookie[]): Promise<void> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/cookies`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(jar),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin setCookies failed (${response.status}): ${body}`)
  }
}
```

No imports added beyond what already exists in the file. Type export is colocated.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/gologin/client.ts','utf8');const checks=[/export type GoLoginCookie/, /export async function getCookies\(profileId: string\): Promise<GoLoginCookie\[\]>/, /export async function setCookies\(profileId: string, jar: GoLoginCookie\[\]\): Promise<void>/, /\/browser\/\$\{profileId\}\/cookies/, /method: \"POST\"/, /body: JSON\.stringify\(jar\)/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/gologin/client.ts` exports `getCookies`, `setCookies`, and type `GoLoginCookie`
    - `getCookies` calls `GET ${GOLOGIN_API}/browser/${profileId}/cookies` and returns parsed JSON array
    - `setCookies` calls `POST` with `JSON.stringify(jar)` and resolves void on 2xx
    - Both throw `Error` with format `GoLogin <name> failed (status): body` on non-ok response (matches existing `getProfile` shape)
    - `pnpm typecheck` exits 0
    - No existing exports modified
  </acceptance_criteria>
  <done>Two REST wrappers exported, typecheck green, format matches `getProfile` analog.</done>
</task>

<task type="auto">
  <name>Task 2: Add saveCookiesAndRelease wrapper to GoLogin adapter</name>
  <read_first>
    - src/lib/gologin/adapter.ts (full file — confirm `releaseProfile` shape at lines 125-146, `GoLoginConnection` type, imports)
    - src/lib/gologin/client.ts (now exports `getCookies`)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §3
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §7 (idle delay, opts.idle pattern)
  </read_first>
  <files>src/lib/gologin/adapter.ts</files>
  <action>
Add a new exported function `saveCookiesAndRelease` to `src/lib/gologin/adapter.ts`. Keep `releaseProfile` exported unchanged (used for crash/error paths that should skip the idle delay).

Imports to add at top of file:
```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCookies } from "@/lib/gologin/client"
```

Add immediately after the existing `releaseProfile` function:

```ts
/**
 * Save GoLogin cookie jar to browser_profiles.cookies_jar, then optionally
 * idle 30-60s (uniform random) to defeat the fast-in/out anti-bot pattern,
 * then release the profile.
 *
 * Per RESEARCH §7 + CONTEXT D-02: idle delay only on success path
 * (opts.idle === true). Failed actions skip the idle for faster cleanup.
 *
 * Per RESEARCH L-1: cookies are GET'd BEFORE stopCloudBrowser (which
 * releaseProfile calls). Per L-8: full jar replaces remote state — no merge.
 *
 * Defensive throughout — every stage swallows + console.warn; never throws.
 */
export async function saveCookiesAndRelease(
  connection: GoLoginConnection | undefined,
  supabase: SupabaseClient,
  browserProfileId: string | undefined,
  opts?: { idle?: boolean },
): Promise<void> {
  if (!connection) return

  // Stage 1: GET cookies → write to DB. browserProfileId may be undefined if
  // resolution failed earlier — in that case, skip the save but still release.
  if (browserProfileId) {
    try {
      const jar = await getCookies(connection.profileId)
      const { error } = await supabase
        .from("browser_profiles")
        .update({ cookies_jar: jar })
        .eq("id", browserProfileId)
      if (error) {
        console.warn("[gologin] saveCookiesAndRelease: cookies_jar update failed (non-fatal):", error.message)
      }
    } catch (err) {
      console.warn(
        "[gologin] saveCookiesAndRelease: getCookies failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      )
    }
  }

  // Stage 2: optional idle 30-60s (uniform random) — only on success path.
  if (opts?.idle) {
    const ms = 30_000 + Math.floor(Math.random() * 30_000)
    await new Promise((r) => setTimeout(r, ms))
  }

  // Stage 3: delegate to existing releaseProfile (defensive try/catch internally)
  await releaseProfile(connection)
}
```

DO NOT modify the existing `releaseProfile` function — it remains for crash paths.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/gologin/adapter.ts','utf8');const checks=[/import \{ getCookies \} from \"@\/lib\/gologin\/client\"/, /import type \{ SupabaseClient \} from \"@supabase\/supabase-js\"/, /export async function saveCookiesAndRelease/, /supabase\s*\.from\(\"browser_profiles\"\)\s*\.update\(\{ cookies_jar: jar \}\)/, /opts\?\.idle/, /30_000 \+ Math\.floor\(Math\.random\(\) \* 30_000\)/, /await releaseProfile\(connection\)/, /export async function releaseProfile/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `saveCookiesAndRelease(connection, supabase, browserProfileId, opts?)` exported from adapter.ts
    - Imports `getCookies` from `@/lib/gologin/client`
    - Imports `SupabaseClient` type from `@supabase/supabase-js`
    - Calls `supabase.from("browser_profiles").update({ cookies_jar: jar }).eq("id", browserProfileId)`
    - Idle delay uses `30_000 + Math.floor(Math.random() * 30_000)` ms
    - Idle is gated on `opts?.idle === true`
    - Final stage delegates to `releaseProfile(connection)`
    - Existing `export async function releaseProfile` still present (unchanged)
    - All three stages wrapped in try/catch — function never throws
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Wrapper exported, idle delay gated by opts.idle, never throws, typecheck green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create runRedditPreflight discriminated-union helper + tests</name>
  <read_first>
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §1 (no proxy), §3 (response shape + mapping), §11 (V-05 through V-09 test types)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §4 (analog imports + safe-return shape)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md (V-05–V-09)
    - src/features/accounts/actions/account-actions.ts:121-133 (try/catch + safe-return analog)
    - supabase/migrations/00025_phase_18_cookies_preflight.sql (confirm column names: `last_preflight_at`, `last_preflight_status`)
  </read_first>
  <files>
    src/features/accounts/lib/reddit-preflight.ts
    src/features/accounts/lib/reddit-preflight.test.ts
  </files>
  <behavior>
    Test 1 (V-08): mocked-fetch — 503 twice, then succeed → retry executed once with 2s backoff, returns `{ kind: 'transient' }` after second 503
    Test 2: mocked-fetch — 200 + `{ data: { is_suspended: true } }` → returns `{ kind: 'banned', reason: 'suspended' }`
    Test 3: mocked-fetch — 200 + `{ data: { is_suspended: false, total_karma: 2 } }` → returns `{ kind: 'banned', reason: 'low_karma' }`
    Test 4: mocked-fetch — 200 + `{ data: { is_suspended: false, total_karma: 100 } }` → returns `{ kind: 'ok' }`
    Test 5: mocked-fetch — 404 → returns `{ kind: 'banned', reason: '404' }`
    Test 6: mocked-fetch — 403 → returns `{ kind: 'banned', reason: '403' }`
    Test 7 (V-09): mocked Supabase — `last_preflight_at` is 30 min ago AND `last_preflight_status='ok'` → returns `{ kind: 'ok' }` WITHOUT calling fetch (assert spy never called)
    Test 8: mocked Supabase — `last_preflight_at` is 2 hours ago → fetch IS called
    Test 9: ban result writes `last_preflight_status='banned'` to social_accounts via supabase.update
    Test 10: ok result writes `last_preflight_status='ok'` and updates `last_preflight_at`
    (V-05/V-06/V-07 real-net integration tests use `INTEGRATION=1` flag — out of this unit suite; document in test file as `it.skipIf(!process.env.INTEGRATION)`)
  </behavior>
  <action>
Create `src/features/accounts/lib/reddit-preflight.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"

const REDDIT_USER_AGENT = "repco.ai/1.0 (+https://repco.ai)"
const PREFLIGHT_CACHE_TTL_MS = 60 * 60 * 1000 // 1h per CONTEXT D-08

export type PreflightResult =
  | { kind: "ok" }
  | { kind: "banned"; reason: "suspended" | "low_karma" | "404" | "403" }
  | { kind: "transient"; error: string }

type RunArgs = {
  handle: string
  supabase: SupabaseClient
  accountId: string
}

/**
 * Reddit account preflight via about.json (no auth, no proxy hop).
 * Per RESEARCH §1: direct fetch from worker process — GoLogin's geolocation
 * proxy is browser-only and unreachable from Node fetch.
 *
 * Cache: 1h via social_accounts.last_preflight_at + last_preflight_status.
 * Cache hit on status='ok' → skip fetch entirely.
 *
 * Mapping (RESEARCH §3):
 *   200 + is_suspended:true   → banned/suspended
 *   200 + total_karma<5       → banned/low_karma  (only if !is_suspended; L-4)
 *   200 + total_karma>=5      → ok
 *   404                       → banned/404
 *   403                       → banned/403
 *   429 / 5xx / network error → transient (retry once, 2s backoff)
 */
export async function runRedditPreflight(args: RunArgs): Promise<PreflightResult> {
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
  const status = result.kind === "ok" ? "ok" : result.kind === "banned" ? "banned" : "transient"
  await supabase
    .from("social_accounts")
    .update({ last_preflight_at: new Date().toISOString(), last_preflight_status: status })
    .eq("id", accountId)

  return result
}

async function doFetchWithRetry(handle: string): Promise<PreflightResult> {
  const first = await doFetchOnce(handle)
  if (first.kind !== "transient") return first
  // Single retry with 2s backoff, ONLY on transient (D-11)
  await new Promise((r) => setTimeout(r, 2000))
  return doFetchOnce(handle)
}

async function doFetchOnce(handle: string): Promise<PreflightResult> {
  const url = `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`
  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": REDDIT_USER_AGENT, Accept: "application/json" },
    })
  } catch (err) {
    return { kind: "transient", error: err instanceof Error ? err.message : String(err) }
  }

  if (response.status === 404) return { kind: "banned", reason: "404" }
  if (response.status === 403) return { kind: "banned", reason: "403" }
  if (response.status === 429) return { kind: "transient", error: "rate_limited" }
  if (response.status >= 500) return { kind: "transient", error: `http_${response.status}` }
  if (!response.ok) return { kind: "transient", error: `http_${response.status}` }

  let payload: { data?: { is_suspended?: boolean; total_karma?: number } }
  try {
    payload = await response.json()
  } catch (err) {
    return { kind: "transient", error: "invalid_json" }
  }

  // L-4: check is_suspended FIRST (suspended payloads omit total_karma).
  if (payload?.data?.is_suspended === true) return { kind: "banned", reason: "suspended" }
  if (typeof payload?.data?.total_karma === "number" && payload.data.total_karma < 5) {
    return { kind: "banned", reason: "low_karma" }
  }
  return { kind: "ok" }
}
```

Create colocated `src/features/accounts/lib/reddit-preflight.test.ts` using vitest (config already exists per PATTERNS §13). Each behavior test mirrors the V-IDs in VALIDATION.md. Use `vi.spyOn(global, 'fetch')` and a tiny in-memory Supabase double:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runRedditPreflight } from "./reddit-preflight"

function makeSupabaseDouble(cache: { last_preflight_at: string | null; last_preflight_status: string | null } | null) {
  const updates: Array<Record<string, unknown>> = []
  return {
    updates,
    client: {
      from: (_t: string) => ({
        select: (_c: string) => ({
          eq: (_k: string, _v: string) => ({
            single: async () => ({ data: cache, error: null }),
          }),
        }),
        update: (vals: Record<string, unknown>) => {
          updates.push(vals)
          return { eq: (_k: string, _v: string) => Promise.resolve({ error: null }) }
        },
      }),
    } as any,
  }
}

describe("runRedditPreflight", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("V-09: cache hit (status='ok' within 1h) skips fetch", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }))
    const sb = makeSupabaseDouble({ last_preflight_at: new Date(Date.now() - 30 * 60_000).toISOString(), last_preflight_status: "ok" })
    const result = await runRedditPreflight({ handle: "spez", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "ok" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("expired cache → fetch IS called", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { is_suspended: false, total_karma: 100 } }), { status: 200 }))
    const sb = makeSupabaseDouble({ last_preflight_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(), last_preflight_status: "ok" })
    const result = await runRedditPreflight({ handle: "spez", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "ok" })
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(sb.updates.at(-1)).toMatchObject({ last_preflight_status: "ok" })
  })

  it("200 + is_suspended:true → banned/suspended", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { is_suspended: true } }), { status: 200 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "banned", reason: "suspended" })
    expect(sb.updates.at(-1)).toMatchObject({ last_preflight_status: "banned" })
  })

  it("200 + total_karma<5 → banned/low_karma", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { is_suspended: false, total_karma: 2 } }), { status: 200 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "banned", reason: "low_karma" })
  })

  it("200 + total_karma>=5 → ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { is_suspended: false, total_karma: 100 } }), { status: 200 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "ok" })
  })

  it("404 → banned/404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 404 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "ghost", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "banned", reason: "404" })
  })

  it("403 → banned/403", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 403 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "banned", reason: "403" })
  })

  it("V-08: 503 once retries; second 503 → transient", async () => {
    const spy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result.kind).toBe("transient")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("503 once then 200 → ok", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { is_suspended: false, total_karma: 50 } }), { status: 200 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({ handle: "x", supabase: sb.client, accountId: "abc" })
    expect(result).toEqual({ kind: "ok" })
  })
})
```

If `pnpm test` is not configured, run via `pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts`. PATTERNS §13 confirms `vitest.config.ts` exists.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/features/accounts/lib/reddit-preflight.ts','utf8');const checks=[/export type PreflightResult/, /export async function runRedditPreflight/, /https:\/\/www\.reddit\.com\/user\/\$\{encodeURIComponent\(handle\)\}\/about\.json/, /User-Agent.*repco\.ai/, /reason: \"suspended\"/, /reason: \"low_karma\"/, /reason: \"404\"/, /reason: \"403\"/, /last_preflight_at/, /last_preflight_status/, /PREFLIGHT_CACHE_TTL_MS/, /setTimeout\(r, 2000\)/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/features/accounts/lib/reddit-preflight.ts` exists and exports `runRedditPreflight` + type `PreflightResult`
    - Discriminated union has exactly 3 kinds: `ok`, `banned` (with `reason` ∈ `'suspended'|'low_karma'|'404'|'403'`), `transient` (with `error: string`)
    - URL hits `https://www.reddit.com/user/{encodeURIComponent(handle)}/about.json`
    - Sends `User-Agent: repco.ai/1.0 (+https://repco.ai)` header
    - Cache TTL constant set to 60 minutes
    - Single retry with 2000ms backoff on transient (`setTimeout(r, 2000)`)
    - `is_suspended` checked BEFORE `total_karma` (L-4)
    - Writes `last_preflight_at` (ISO) + `last_preflight_status` (`'ok'|'banned'|'transient'`) on every fresh result
    - Test file `src/features/accounts/lib/reddit-preflight.test.ts` exists with at least 9 `it(...)` blocks
    - `pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts` exits 0
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Helper + tests committed; all unit tests pass; cache + retry logic verified.</done>
</task>

<task type="auto">
  <name>Task 4: Wire worker.ts — quarantine guard extension, preflight gate, cookies restore, saveCookiesAndRelease swap</name>
  <read_first>
    - src/lib/action-worker/worker.ts (FULL file — confirm current line anchors: quarantine guard 78-128, connectToProfile around 264-276, finally block around 705-716; line numbers may have drifted — re-locate by grep)
    - src/features/accounts/lib/reddit-preflight.ts (just authored)
    - src/lib/gologin/adapter.ts (saveCookiesAndRelease just authored)
    - src/lib/gologin/client.ts (setCookies just authored)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §8 (Analogs A/B/C — exact insertion patterns)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §12 L-1, L-3, L-5
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-10, V-17, V-26
  </read_first>
  <files>src/lib/action-worker/worker.ts</files>
  <action>
Make four surgical edits to `src/lib/action-worker/worker.ts`. Do NOT add any unrelated refactors. Re-locate line anchors by grep before editing — line numbers below are approximate from RESEARCH/PATTERNS.

**Imports to add at top:**
```ts
import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"
import { saveCookiesAndRelease } from "@/lib/gologin/adapter"
import { setCookies } from "@/lib/gologin/client"
```

(`releaseProfile` import stays — used for crash paths still.)

---

**Edit 1 — Extend quarantine guard IN-list (around lines 85-91, per PATTERNS §8 Analog A + L-5):**

Replace:
```ts
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  (account.cooldown_until !== null &&
    account.cooldown_until !== undefined &&
    new Date(account.cooldown_until).getTime() > Date.now())
```

With:
```ts
// Phase 18: extend Phase 14 quarantine guard with two new ENUM values per D-04 + D-18.
// L-5: BOTH 'needs_reconnect' AND 'captcha_required' must appear; forgetting one is silent escape.
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  account.health_status === "needs_reconnect" ||
  account.health_status === "captcha_required" ||
  (account.cooldown_until !== null &&
    account.cooldown_until !== undefined &&
    new Date(account.cooldown_until).getTime() > Date.now())
```

---

**Edit 2 — Insert Reddit preflight gate AFTER the quarantine short-circuit block ends (after line ~128) and BEFORE browser-profile resolution at line ~133 (PATTERNS §8 Analog B + D-13):**

Locate the line immediately after the quarantine `if (isQuarantined) { ... return }` block and BEFORE the existing browser_profile resolution. Insert this block (uses `correlationId` and `supabase` already in scope — confirm exact variable names by reading the surrounding code):

```ts
// Phase 18 (BPRX-08, D-13): Reddit-only preflight gate.
// Runs BEFORE any GoLogin spin-up. Definitive ban signals flip health_status='banned'
// without ever calling connectToProfile. Cached 1h via social_accounts.last_preflight_*.
if (account.platform === "reddit") {
  const preflight = await runRedditPreflight({
    handle: account.handle,
    supabase,
    accountId: account.id,
  })
  if (preflight.kind === "banned") {
    await supabase
      .from("social_accounts")
      .update({ health_status: "banned" })
      .eq("id", account.id)

    runStatus = "failed"
    runError = "preflight_banned"
    await updateActionStatus(supabase, action.id, "failed", `preflight_${preflight.reason}`)
    await supabase.from("job_logs").insert({
      job_type: "action",
      status: "failed",
      user_id: account.user_id,
      finished_at: new Date().toISOString(),
      metadata: { correlation_id: correlationId, account_id: account.id, preflight_reason: preflight.reason },
    })
    await logger.flush()
    return { success: false, error: "account_quarantined" }
  }
  if (preflight.kind === "transient") {
    runStatus = "failed"
    runError = "preflight_transient"
    await updateActionStatus(supabase, action.id, "failed", `preflight_transient`)
    await logger.flush()
    return { success: false, error: "preflight_transient" }
  }
  // preflight.kind === 'ok' → fall through
}
```

Adjust variable names (`runStatus`, `runError`, `updateActionStatus`, `logger`) to match the actual worker.ts symbols — these are the established Phase 14 patterns at lines 92-127. If the surrounding code uses `serviceClient` instead of `supabase`, use that.

---

**Edit 3 — Insert cookies restore call IMMEDIATELY before `connectToProfile` (around line 265, per RESEARCH §2 + V-26):**

Locate the existing `connectToProfile(browserProfile.gologin_profile_id)` call. Insert immediately above it:

```ts
// Phase 18 (BPRX-07, RESEARCH §2): restore cookies before CDP connect.
// Skip when cookies_jar is NULL — first-session profile has nothing to restore.
if (browserProfile.cookies_jar) {
  try {
    await setCookies(browserProfile.gologin_profile_id, browserProfile.cookies_jar as GoLoginCookie[])
  } catch (err) {
    console.warn("[worker] cookies restore failed (non-fatal):", err instanceof Error ? err.message : String(err))
  }
}
```

If `GoLoginCookie` type isn't already imported in worker.ts, add: `import type { GoLoginCookie } from "@/lib/gologin/client"`.

If the existing `browserProfile` row doesn't include `cookies_jar` in its select, expand the select to include `cookies_jar` (the column was added in migration 00025).

---

**Edit 4 — Swap `releaseProfile` to `saveCookiesAndRelease` in the success-path finally block (around line 716, per PATTERNS §8 Analog C + RESEARCH §7):**

Locate the existing line:
```ts
await releaseProfile(connection)
```
inside the `finally { ... }` block.

Replace with:
```ts
// Phase 18 (BPRX-07): save cookies → optional 30-60s idle (success only) → release.
await saveCookiesAndRelease(connection, supabase, browserProfile?.id, {
  idle: runStatus === "completed",
})
```

`runStatus === "completed"` is the established success sentinel in worker.ts (Phase 9 try/catch/finally pattern from STATE.md). Confirm by reading the existing `finally` block.

---

After all edits, run `pnpm typecheck && pnpm lint`. Worker behavior change observable via dev branch hand-test (V-04, V-10, V-17, V-26 are real-DB integration; logged for Plan 03 + manual QA).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/action-worker/worker.ts','utf8');const checks=[/import \{ runRedditPreflight \} from \"@\/features\/accounts\/lib\/reddit-preflight\"/, /import \{ saveCookiesAndRelease \} from \"@\/lib\/gologin\/adapter\"/, /import \{ setCookies \} from \"@\/lib\/gologin\/client\"/, /import \{[^}]*releaseProfile[^}]*\} from \"@\/lib\/gologin\/adapter\"/, /account\.health_status === \"needs_reconnect\"/, /account\.health_status === \"captcha_required\"/, /account\.platform === \"reddit\"/, /runRedditPreflight\(\{/, /preflight\.kind === \"banned\"/, /preflight\.kind === \"transient\"/, /preflight_banned/, /if \(browserProfile\.cookies_jar\)/, /setCookies\(browserProfile\.gologin_profile_id, browserProfile\.cookies_jar/, /saveCookiesAndRelease\(connection, supabase, browserProfile\?\.id, \{/, /idle: runStatus === \"completed\"/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm typecheck && pnpm lint</automated>
  </verify>
  <acceptance_criteria>
    - 3 new imports added (runRedditPreflight, saveCookiesAndRelease, setCookies); existing `releaseProfile` import retained for crash paths
    - Quarantine guard IN-list contains BOTH `'needs_reconnect'` AND `'captcha_required'` (L-5)
    - Reddit-only preflight gate inserted after quarantine block, BEFORE browser_profile resolution / connectToProfile
    - On `preflight.kind === 'banned'`: writes `health_status='banned'`, sets `runError='preflight_banned'`, returns `{ success: false, error: 'account_quarantined' }` with no connectToProfile call (V-10)
    - On `preflight.kind === 'transient'`: returns failure without browser spin-up
    - Cookies restore call (`setCookies`) runs IMMEDIATELY before `connectToProfile`, only when `browserProfile.cookies_jar` is non-null (V-26)
    - The existing `await releaseProfile(connection)` in success-path finally swapped to `await saveCookiesAndRelease(connection, supabase, browserProfile?.id, { idle: runStatus === "completed" })`
    - `pnpm typecheck` exits 0
    - `pnpm lint` exits 0
  </acceptance_criteria>
  <done>Worker compiles, lints clean, all four insertion points contain the required code snippets.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Worker process → Reddit (about.json) | Outbound public unauthenticated HTTP; worker IP exposed |
| Worker process → GoLogin REST API | Outbound authenticated (Bearer); cookies traverse this channel |
| Worker process → Supabase (cookies_jar write) | Service-role write of session cookies; row-level access by user_id |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-18-02-01 | Information Disclosure | `cookies_jar` JSONB row contents (Reddit/LinkedIn session cookies) | mitigate | Existing RLS on `browser_profiles` (Phase 15) restricts SELECT to row-owner. Worker writes via service-role only. No client component reads cookies_jar. Verify via grep: `grep "cookies_jar" src/` shows only server/worker paths. |
| T-18-02-02 | Spoofing | Worker IP rate-limited by Reddit / Cloudflare-blocked | accept | Direct fetch from worker per RESEARCH §1 — failure mode maps to `transient`, retry once, then surface as preflight_transient. Operational risk; not security-critical. |
| T-18-02-03 | Tampering | `setCookies` REPLACES jar; mid-save crash drops cookies | mitigate | Save runs at end-of-session in success path only (idle=true gate). On failure, cookies stay as last-saved snapshot. No partial saves possible because `getCookies` always returns full jar. |
| T-18-02-04 | DoS | Reddit blocks worker IP after rate-limit hit | mitigate | 1h cache (D-08) bounds fetch volume to ≤24 calls/account/day; ≤2400/day at 100 accounts — well below Reddit's 60/min unauthenticated limit (RESEARCH §3). |
| T-18-02-05 | Information Disclosure | GoLogin Bearer token leaked in error logs | mitigate | `headers()` helper centralizes auth; error messages use `(status): body` format that does not echo the request header. Existing `getProfile` analog audited and follows this. |
| T-18-02-06 | Tampering | Account handle injection in URL | mitigate | `encodeURIComponent(handle)` applied to all about.json URLs. Reddit handles are alphanumeric+underscore — encoding is defense-in-depth. |
| T-18-02-07 | Repudiation | Preflight result not audited | mitigate | `social_accounts.last_preflight_at` + `last_preflight_status` are the audit columns (per D-08). `job_logs` row written on banned path with `preflight_reason` in metadata. |
</threat_model>

<verification>
After all four tasks pass:

1. `pnpm typecheck && pnpm lint` exits 0 from project root
2. `pnpm vitest run src/features/accounts/lib/reddit-preflight.test.ts` exits 0 (9+ tests pass)
3. Grep `src/lib/action-worker/worker.ts` confirms all four insertion points (quarantine extension, preflight gate, cookies restore, saveCookiesAndRelease swap)
4. Hand-verification (deferred to Plan 03 + final QA): trigger one Reddit action against dev branch, observe Axiom log gap of 30-60s between cookies-saved and gologin.releaseProfile (V-04)
</verification>

<success_criteria>
- BPRX-07 implementation complete (cookies save + restore + idle 30-60s on success)
- BPRX-08 implementation complete (Reddit preflight gate with 1h cache, no GoLogin spin-up on ban)
- Phase 14 quarantine guard extended to short-circuit on `'needs_reconnect'` AND `'captcha_required'`
- All unit tests green
- Worker.ts compiles and lints cleanly
- Plan 03 can build the detector + alerts + UI on top of this layer
</success_criteria>

<output>
After completion, create `.planning/phases/18-cookies-persistence-preflight-ban-detection/18-02-SUMMARY.md` recording: exact line numbers of the four worker.ts insertions (post-edit), tests added + pass count, V-IDs covered (V-08, V-09, partial V-26), V-IDs deferred to manual QA (V-04, V-05, V-06, V-07, V-10, V-17, V-26-real).
</output>
