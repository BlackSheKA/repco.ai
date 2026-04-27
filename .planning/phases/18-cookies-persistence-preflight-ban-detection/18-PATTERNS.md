# Phase 18 — Pattern Map

**Date:** 2026-04-27
**Phase:** 18 - Cookies Persistence + Preflight + Ban Detection
**Files classified:** 13 (7 NEW, 6 MODIFIED)
**Analogs found:** 12 / 13 (1 has no in-repo analog: shadcn `<Alert>` is new)

---

## File Classification

| File | Role | Data Flow | Closest Analog | Match |
|------|------|-----------|----------------|-------|
| `supabase/migrations/00025_phase_18_cookies_preflight.sql` | schema migration (ENUM + cols) | DDL | `00023_browser_profiles.sql` (cols/RLS) + `00017_phase13_linkedin_expansion.sql` (ALTER TYPE) | exact-split |
| `src/lib/gologin/client.ts` (modify, add `getCookies`/`setCookies`) | REST wrapper | request-response | `src/lib/gologin/client.ts:80-92` (`deleteProfile`), `:155-173` (`getProfile`) | exact (same file) |
| `src/lib/gologin/adapter.ts` (modify, add `saveCookiesAndRelease`) | defensive cleanup wrapper | sequence + I/O | `src/lib/gologin/adapter.ts:125-146` (`releaseProfile`) | exact (same file) |
| `src/features/accounts/lib/reddit-preflight.ts` | discriminated-union helper, fetch + DB cache | request-response | `src/lib/gologin/client.ts:155-173` (fetch-with-status-mapping) + `src/features/accounts/actions/account-actions.ts:121-133` (try/catch + safe return) | role-match |
| `src/lib/computer-use/detect-ban-state.ts` | Anthropic single-shot wrapper, JSON-only | request-response | `src/lib/computer-use/executor.ts:1-68` (Anthropic SDK init + image content block) | role-match |
| `src/components/account-degraded-banner.tsx` | server component, conditional render | read-only DB | `src/app/(app)/layout.tsx:1-76` (server component + supabase query) + `src/features/accounts/components/health-badge.tsx` (status→style map) | role-match (no Alert in repo) |
| `src/features/accounts/server/attempt-reconnect.ts` | server action | request-response + DB write | `src/features/accounts/actions/account-actions.ts:90-159` (`startAccountBrowser`) | exact |
| `src/lib/action-worker/worker.ts` (modify x4) | orchestrator insertions | event-driven | self (same file: `:78-128` quarantine guard, `:264-276` connect, `:709-716` finally) | exact (same file) |
| `src/features/notifications/lib/send-account-warning.ts` (modify) | email dispatch | request-response | self (`:1-19`) — extend signature | exact (same file) |
| `src/features/notifications/emails/account-warning.tsx` (modify) | React Email template | render | self (`:39-167`) — branch on status | exact (same file) |
| `src/app/(app)/layout.tsx:32` (modify) | extend IN-list | DB read | self | exact |
| `src/features/accounts/components/account-card.tsx` (modify) | client component, button | UI | self (`:158-178` LogIn button) | exact |
| `__tests__/fixtures/*.png`, `vitest.config.ts`, setup | test infra | n/a | `vitest.config.ts` (already exists, lines 1-16) | exact |

---

## Pattern Assignments

### 1. Migration `00025_phase_18_cookies_preflight.sql`

**Analog A — ALTER TYPE pattern** — `supabase/migrations/00017_phase13_linkedin_expansion.sql:7-10`:
```sql
-- 1. Extend pipeline_status_type with 'unreachable' (per LNKD-06)
--    ALTER TYPE ADD VALUE must run in its own transaction; Supabase migration
--    runner commits each file separately so subsequent DDL sees the new value.
ALTER TYPE public.pipeline_status_type ADD VALUE IF NOT EXISTS 'unreachable';
```

**Analog B — ADD COLUMN with COMMENT pattern** — `00017_phase13_linkedin_expansion.sql:12-20`:
```sql
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS last_prescreen_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS unreachable_reason text;

COMMENT ON COLUMN public.prospects.last_prescreen_attempt_at IS
  'Last time linkedin-prescreen cron visited this prospect profile.';
```

**Analog C — JSONB nullable column** — `00023_browser_profiles.sql` shows table-create style; for ADD COLUMN JSONB use `ADD COLUMN IF NOT EXISTS cookies_jar JSONB DEFAULT NULL`.

**Apply:** Phase 18 migration mirrors A for `health_status_type` (`'needs_reconnect'`, `'captcha_required'`) and `job_type_enum` (`'account_warning_email'`); mirrors B for `social_accounts.last_preflight_at`/`last_preflight_status` + `browser_profiles.cookies_jar`. Per RESEARCH landmine L-2: NO `UPDATE` statements in same migration.

---

### 2. `src/lib/gologin/client.ts` — `getCookies`/`setCookies`

**Analog** — `src/lib/gologin/client.ts:155-173` (`getProfile`):
```ts
export async function getProfile(profileId: string): Promise<GoLoginProfile | null> {
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}`, {
    method: "GET",
    headers: headers(),
  })
  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin getProfile failed (${response.status}): ${body}`)
  }
  return (await response.json()) as GoLoginProfile
}
```

**Apply:** mirror exactly. `getCookies(profileId)` → `GET /browser/{id}/cookies` → returns `Cookie[]`; `setCookies(profileId, jar)` → `POST /browser/{id}/cookies` with `body: JSON.stringify(jar)`. Reuse module-level `headers()` and `GOLOGIN_API` constants. Throw on `!response.ok` with same `${name} failed (${status}): ${body}` message format.

---

### 3. `src/lib/gologin/adapter.ts` — `saveCookiesAndRelease`

**Analog** — `src/lib/gologin/adapter.ts:125-146` (`releaseProfile`):
```ts
export async function releaseProfile(connection: GoLoginConnection | undefined): Promise<void> {
  if (!connection) return
  try {
    await connection.browser.close()
  } catch (err) {
    console.warn("[gologin] browser.close() failed (non-fatal):",
      err instanceof Error ? err.message : String(err))
  }
  try {
    await stopCloudBrowser(connection.profileId)
  } catch (err) {
    console.warn("[gologin] stopCloudBrowser failed (non-fatal):", ...)
  }
}
```

**Apply:** new `saveCookiesAndRelease(connection, supabase, browserProfileId, opts?: { idle: boolean })`:
- Stage 1: `try { jar = await getCookies(connection.profileId) ; supabase.update(...) } catch warn`
- Stage 2: `if (opts?.idle) await new Promise(r => setTimeout(r, 30_000 + Math.random()*30_000))`
- Stage 3: `await releaseProfile(connection)` (delegate)
- Each try/catch swallows + console.warn; never throws.

---

### 4. `src/features/accounts/lib/reddit-preflight.ts` (NEW)

**Analog A — fetch + status discrimination** — `src/lib/gologin/client.ts:155-173` (above).

**Analog B — try/catch + safe-return shape** — `src/features/accounts/actions/account-actions.ts:121-133`:
```ts
try {
  const session = await startCloudBrowser(browserProfile.gologin_profile_id)
  return { success: true, url: session.remoteOrbitaUrl, ... }
} catch (err) {
  return { success: false, error: err instanceof Error ? err.message : String(err) }
}
```

**Analog C — Supabase passed in as param** — `src/lib/action-worker/worker.ts:73-77`.

**Apply:** export `runRedditPreflight({ handle, supabase, accountId })` returning `{ kind: 'ok' } | { kind: 'banned', reason: 'suspended'|'low_karma'|'404'|'403' } | { kind: 'transient', error }`. Direct fetch to `https://www.reddit.com/user/${handle}/about.json` with `User-Agent: repco.ai/1.0 (+https://repco.ai)` (per RESEARCH §3). Map per RESEARCH §3 table. Single 2s-backoff retry on transient. Cache check at top: `select last_preflight_at, last_preflight_status where last_preflight_at > now() - interval '1 hour'`; on hit + `'ok'` → return `{kind:'ok'}` skipping fetch. On result, write `update social_accounts set last_preflight_at=now(), last_preflight_status=...`.

---

### 5. `src/lib/computer-use/detect-ban-state.ts` (NEW)

**Analog** — `src/lib/computer-use/executor.ts:8, 22, 33-48`:
```ts
import Anthropic from "@anthropic-ai/sdk"
const client = new Anthropic()
const messages: Anthropic.Messages.MessageParam[] = [
  {
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: initialScreenshot } },
      { type: "text", text: prompt },
    ],
  },
]
```

**Apply:** `detectBanState(screenshotBase64): Promise<{banned, suspended, captcha}>`. **Difference from analog:** uses `client.messages.create` (NOT `client.beta.messages.create`), no `tools`, no `betas`, `max_tokens: 200`, `system: DETECT_BAN_STATE_SYSTEM_PROMPT` (locked in RESEARCH §4), single message. Parse with `text.match(/\{[^}]+\}/)` → `JSON.parse`. On any error (Anthropic API, parse, missing block): `logger.error(...)` + return `{banned:false, suspended:false, captcha:false}` (per L-3).

---

### 6. `src/components/account-degraded-banner.tsx` (NEW server component)

**Analog A — server-side data fetch** — `src/app/(app)/layout.tsx:21-32`.
**Analog B — status→style map** — `src/features/accounts/components/health-badge.tsx:6-40`.

**Apply:** Server component takes `accounts: DegradedAccount[]` as prop (parent in `(app)/layout.tsx` does the query — extend the existing `.in("health_status", [...])` to include `'needs_reconnect'`, `'captcha_required'`). Returns `null` when `accounts.length === 0`. Severity computed: any `'banned'` → `<Alert variant="destructive">`, else `<Alert>` (default). Run `npx shadcn add alert` first. Per row: platform icon + handle + `<HealthBadge>` (extended) + reason copy + `<Button asChild><a target="_blank">Reconnect/View</a></Button>` per UI-SPEC table.

---

### 7. `src/features/accounts/server/attempt-reconnect.ts` (NEW)

**Analog** — `src/features/accounts/actions/account-actions.ts:90-134` (`startAccountBrowser`):
```ts
"use server"
export async function startAccountBrowser(accountId: string): Promise<{
  success: boolean; url?: string; error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }
  const { data: account } = await supabase
    .from("social_accounts").select("...").eq("id", accountId).eq("user_id", user.id).single()
  try { ... } catch (err) { return { success: false, error: ... } }
}
```

**Apply:** `"use server"`. `attemptReconnect(accountId)`: auth-check → load account (RLS via user-client) → call `runRedditPreflight({ handle: account.handle, supabase, accountId })` → on `'ok'` update `health_status` to `'healthy'` (or `'warmup'` if `warmup_completed_at IS NULL`), `revalidatePath("/accounts")`, return `{success:true}`. On `'banned'` leave row, return `{success:false, error: 'still_banned'}`. On `'transient'` return `{success:false, error: 'try_again'}`. Place in `src/features/accounts/server/` (new dir) OR colocate in existing `actions/account-actions.ts` — both match codebase. Planner picks.

---

### 8. `src/lib/action-worker/worker.ts` — three insertions

**Analog A — quarantine guard IN-list** — `worker.ts:85-91`:
```ts
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  (account.cooldown_until !== null &&
    account.cooldown_until !== undefined &&
    new Date(account.cooldown_until).getTime() > Date.now())
```
**Apply:** add two `||` clauses for `'needs_reconnect'` and `'captcha_required'`. Per L-5: do NOT forget either.

**Analog B — short-circuit job_logs insert** — `worker.ts:92-127` (entire short-circuit). The Reddit-preflight gate inserts AFTER this block, BEFORE step 3 (`browserProfile` resolution at line 133). Mirror the same shape: set `runError = 'preflight_banned'`, `await updateActionStatus(...)`, write `job_logs`, `await logger.flush()`, return.

**Analog C — finally block release** — `worker.ts:709-716`:
```ts
} finally {
  await releaseProfile(connection)
  // ... job_logs insert
}
```
**Apply:** swap to `await saveCookiesAndRelease(connection, supabase, browserProfile?.id, { idle: runStatus === "completed" })`. Keep `releaseProfile` import for crash paths.

**Analog D — post-CU detector splice point** — between `result = await executeCUAction(...)` (around line 600s) and line 704 `return { success: result.success, ... }`. Pass `result.screenshots[result.screenshots.length - 1]` to `detectBanState`. On `banned||suspended` → update `health_status='banned'` + call `sendAccountWarning(..., 'banned')`. On `captcha` → `health_status='captcha_required'` + `sendAccountWarning(..., 'captcha_required')`.

---

### 9. `src/features/notifications/lib/send-account-warning.ts` (modify)

**Current** (`:5-18`):
```ts
export async function sendAccountWarning(
  to: string, accountHandle: string, status: "warning" | "banned",
) { ... }
```

**Apply:**
- Extend `status` union to `"warning" | "banned" | "needs_reconnect" | "captcha_required"`.
- Add `opts?: { platform?: "reddit" | "linkedin"; supabase?: SupabaseClient; userId?: string; accountId?: string }`.
- Subject lines branch per UI-SPEC §Email Copy.
- Debounce: if `supabase + accountId` provided, query `job_logs WHERE job_type='account_warning_email' AND metadata->>'account_id'=$1 AND finished_at > now() - interval '24 hours'` — if row found, return early.
- After successful Resend send, insert `job_logs` row with `job_type:'account_warning_email'`, `metadata:{ account_id, status }`, `finished_at: now()`. Schema mirrors `worker.ts:102-117`.

---

### 10. `src/features/notifications/emails/account-warning.tsx` (modify)

**Apply:** extend `AccountWarningEmailProps.status` to 4-value union; add `platform?: "reddit"|"linkedin"`. Replace ternaries with a `STATUS_COPY: Record<Status, {bg, fg, label, body, subject}>` map. Bodies per UI-SPEC §Email Copy table.

---

### 11. `src/app/(app)/layout.tsx:32` (modify)

**Current:**
```ts
.in("health_status", ["warning", "cooldown", "banned"]),
```
**Apply:** change to `.in("health_status", ["warning", "cooldown", "banned", "needs_reconnect", "captcha_required"])`. Also: switch from `count`-only to `select("id, handle, platform, health_status")` so the banner can render rows; pass `degradedAccounts` array down to render `<AccountDegradedBanner accounts={degradedAccounts} />` above `{children}` per UI-SPEC §Component Inventory.

---

### 12. `src/features/accounts/components/account-card.tsx` (modify)

**Analog — existing button** (`:158-178`):
```tsx
<Button type="button" variant="ghost" size="sm" className="h-7"
  onClick={() => onReconnect(account.id, account.browser_profile_id, account.platform)}
  aria-label={verified ? `Re-login...` : `Log in...`}>
  <LogIn className="mr-1 h-3.5 w-3.5" />
  {verified ? "Re-login" : "Log in"}
</Button>
```

**Apply:** add a sibling `<Button>` rendered conditionally on `account.health_status === "needs_reconnect" || account.health_status === "captcha_required"`. Label "Reconnect", trailing Phosphor `ArrowSquareOut` icon (per UI-SPEC §Account-card extension), `variant="default"` (primary), wires into the new `attemptReconnect` server action per RESEARCH §8 decision.

Also extend `health-badge.tsx` HEALTH_STYLES map with two new entries (blue `#3B82F6`, violet `#8B5CF6`) per UI-SPEC §Color table.

---

### 13. `vitest.config.ts` + fixtures

**Existing config** (`vitest.config.ts:1-16`) covers `src/**/*.test.ts`. Per-file convention is colocation (`reddit-preflight.test.ts` next to `reddit-preflight.ts`). For fixture-based detector tests: add `__tests__/fixtures/banned-rules.png`, `account-suspended.png`, `cloudflare-captcha.png`, `clean-feed.png` (4 PNGs hand-curated). Possibly extend `include` to also pick up `__tests__/**/*.test.ts`. `vitest.setup.ts` already exists.

**Note:** vitest IS already installed (CLAUDE.md says "no test framework configured" but `vitest.config.ts` exists — RESEARCH §11 Wave 0 row "install vitest" is already satisfied).

---

## Shared Patterns

### Defensive try/catch — never throw from cleanup
**Source:** `src/lib/gologin/adapter.ts:128-145` (releaseProfile)
**Apply to:** `saveCookiesAndRelease`, `detectBanState`, `runRedditPreflight` (transient path), email-debounce queries.

### Supabase client passed in (not imported)
**Source:** `src/lib/action-worker/worker.ts:44, 73-77` + `src/features/accounts/actions/account-actions.ts:28`
**Apply to:** `runRedditPreflight`, `saveCookiesAndRelease`, `attemptReconnect`. Worker uses service-role; server actions use SSR client. Both share the helper.

### Service role client construction
**Source:** `src/lib/action-worker/worker.ts:37-42` (`createServiceClient()`)
**Apply to:** any new code path called from worker context.

### `await logger.flush()` before returning from handlers
**Source:** `src/lib/action-worker/worker.ts:125` and CLAUDE.md §Critical Rules
**Apply to:** `attemptReconnect` server action's terminal returns.

### Status→style record map
**Source:** `src/features/accounts/components/health-badge.tsx:6-40`
**Apply to:** banner row rendering, email status branching, badge extension.

### `revalidatePath("/accounts")` after server-action mutation
**Source:** `src/features/accounts/actions/account-actions.ts:64, 86, 228, 258`
**Apply to:** `attemptReconnect` on `'ok'` result.

---

## No Analog Found

| File | Reason |
|------|--------|
| `<Alert>` in `account-degraded-banner.tsx` | Component is NEW to the codebase. Plan must run `npx shadcn add alert` before component lands. UI-SPEC §Component Inventory confirms. |
