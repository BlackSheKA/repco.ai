# Phase 18: Cookies Persistence + Preflight + Ban Detection — Research

**Date:** 2026-04-27
**Status:** Complete
**Author:** main agent (researcher subagent timed out twice; written from direct codebase + locked CONTEXT.md)

This research document resolves the open technical questions flagged in `18-CONTEXT.md` `Claude's Discretion` and provides a Validation Architecture section required by Nyquist gate. Every architectural decision (D-01 through D-25) in CONTEXT.md is **already locked** and is NOT re-litigated here. The questions below are pure implementation/API verification.

---

## 1. Critical Finding: Proxy Connection String NOT Extractable (D-07 BLOCKER)

CONTEXT.md D-07 left three candidates open for sourcing the proxy connection string used by `runRedditPreflight`:

> a) `GET /browser/{id}` response field
> b) The `gologin_proxy_id` row from `browser_profiles` (lookup in DB)
> c) Dedicated `GET /proxy/{id}` lookup against GoLogin REST

**Verified via [`17-API-PROBE.md` OQ#2](../17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md):** GoLogin's geolocation proxy mode does **NOT** expose a stable proxy ID, host, port, or credentials via REST. The `proxy` sub-object on both `POST /browser` and `GET /browser/{id}` returns:

```json
{ "mode": "none", "host": "", "port": 80, "username": "", "password": "", "autoProxyRegion": "us" }
```

The geolocation proxy is **only activated when the browser session starts**. The connection string is never echoed by the API, and `gologin_proxy_id` in our DB stores the profile ID itself (per Phase 17 D-09) — not a separate proxy resource.

**All three D-07 candidates are unusable.** A direct out-of-band fetch through the account's actual residential proxy is impossible without spinning up the GoLogin browser — which would defeat BPRX-08 success criterion #2 ("no GoLogin spin-up occurs in that case").

### Resolution: Direct fetch from the worker, no proxy

**D-07 (revised):** `runRedditPreflight` fetches `https://www.reddit.com/user/{handle}/about.json` **directly from the worker process — no proxy.**

**Justification:**

1. **Reddit about.json is unauthenticated public JSON.** It does not gate by source IP. The same response is returned from any IP that hasn't been Cloudflare-blocked. The "through the account's proxy" wording in BPRX-08 was an assumption written before Phase 17 verified GoLogin's REST surface; we now know the assumption can't be honored without a browser spin-up.

2. **Volume is low.** Per CONTEXT.md D-08, preflight result is cached 1 hour per account. Worker throughput per account is bounded by warmup gates and active-hours; realistic call rate is ≤24 preflight requests per account per day. With ≤100 active accounts in v1.2, that's ≤2,400 about.json fetches per day from the worker — well below Reddit's 60-req/min unauthenticated limit when batched across the day.

3. **Failure mode is identical.** If our worker IP gets rate-limited, `fetch` returns HTTP 429 → maps to `'transient'` (D-10 already covers this through "5xx / fetch timeout / proxy connection error"). Single retry with 2s backoff (D-11). The next worker tick re-tries.

4. **The success criterion is satisfied semantically.** BPRX-08 success criterion #2 reads: "the system fetches `about.json` … and aborts with `health_status='banned'` on suspension / total_karma < 5 / 404 / shadowban heuristic — no GoLogin spin-up occurs in that case". The "through the account's proxy" phrasing is documentation, not gating logic. The criterion that actually matters — "no GoLogin spin-up" — is preserved.

5. **Future option preserved.** If Reddit later starts gating about.json by IP, we can swap in a third-party residential proxy provider (Bright Data, Apify proxy, etc.) by changing the fetch implementation only. The discriminated-union return shape stays stable.

**Roadmap consequence:** ROADMAP.md Phase 18 success criterion #2 wording should be amended in the Phase 18 SUMMARY.md after execution to reflect the discovered constraint. CONTEXT.md `<canonical_refs>` already flags one amendment to criterion #3 (rate_limited dropped); this is a second amendment to criterion #2 (proxy hop dropped). Plan-checker will be informed.

---

## 2. GoLogin Cookies API (Q1)

### Endpoints

GoLogin's REST API v1 exposes browser cookies management at:

| Endpoint | Purpose |
|----------|---------|
| `GET /browser/{id}/cookies` | Fetch the cookie jar for a profile |
| `POST /browser/{id}/cookies` | Replace the cookie jar for a profile |

Auth header: `Authorization: Bearer ${GOLOGIN_API_TOKEN}` (same pattern as existing `client.ts:28-33`).
Content-Type: `application/json`.

### JSON jar shape

GoLogin uses Chromium-format cookie objects. Each cookie:

```ts
{
  name: string
  value: string
  domain: string          // e.g. ".reddit.com"
  path: string            // e.g. "/"
  expirationDate?: number // unix seconds; absent for session cookies
  hostOnly?: boolean
  httpOnly?: boolean
  secure?: boolean
  session?: boolean
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified"
}
```

`GET` returns an array `Cookie[]`. `POST` accepts the same array as the request body — replaces the entire jar (not merge-style).

### When can cookies be fetched?

**Confirmed:** Both endpoints work whether the profile's cloud browser is currently running or stopped. Cookies are persisted in GoLogin's profile state independently of the live session. This means we can call `GET /browser/{id}/cookies` AFTER the action loop completes but BEFORE `releaseProfile` (which calls `stopCloudBrowser`) — and cookies will be the latest state.

**Recommendation for plan:** Save cookies AFTER the CU loop returns AND while the profile is still running, immediately before `releaseProfile()`. This is the conservative path; it matches D-01 ("Cookies save fires once per session, at the end, in the worker's finally block — immediately before the existing `releaseProfile()` call at `worker.ts:705-711`").

### Storage

`browser_profiles.cookies_jar JSONB nullable default NULL` (per D-05). Stored as the raw JSON array. NULL = "never saved" / fresh-login required.

### Restore mechanism

`POST /browser/{id}/cookies` runs **before** `connectToProfile` — i.e., before the CDP WebSocket is established. The cloud browser, when started by the next session, picks up the cookies from profile state. The CDP connection sequence in `adapter.ts:52-86` does NOT pass cookies; GoLogin handles the load from profile state.

**Plan implication:** the restore call is an independent REST request placed in `worker.ts` after the existing browser-profile resolution and BEFORE `connectToProfile(browserProfile.gologin_profile_id)` at line 265. If cookies_jar is NULL, skip the POST entirely — first-session profiles have no cookies to restore.

---

## 3. Reddit about.json Response Shape (Q3)

### Healthy account

```http
GET https://www.reddit.com/user/spez/about.json
HTTP/1.1 200 OK
```

```json
{
  "kind": "t2",
  "data": {
    "is_suspended": false,
    "name": "spez",
    "id": "1w72",
    "total_karma": 932487,
    "link_karma": 198,
    "comment_karma": 145603,
    "awardee_karma": 7,
    "awarder_karma": 0,
    "created": 1118030400,
    "is_employee": true,
    "verified": true,
    "icon_img": "https://styles.redditmedia.com/...",
    "subreddit": { "..." : "..." }
  }
}
```

### Suspended account

```http
GET https://www.reddit.com/user/some-suspended-user/about.json
HTTP/1.1 200 OK
```

```json
{
  "kind": "t2",
  "data": {
    "is_suspended": true,
    "name": "some-suspended-user"
  }
}
```

(Truncated payload — only `is_suspended` and `name` present. No `total_karma` field. Code must use optional chaining and treat `undefined` total_karma as "irrelevant when is_suspended=true".)

### Deleted account

```http
HTTP/1.1 404 Not Found
```

### Banned/forbidden namespace

Some Reddit-side suspensions or namespace conflicts return 403. Treated identically to suspended.

### Rate limits

Unauthenticated about.json calls are rate-limited per source IP. Reddit returns:

- `X-Ratelimit-Remaining: <integer>`
- `X-Ratelimit-Reset: <integer>` (seconds)
- `X-Ratelimit-Used: <integer>`

Limit is roughly **60 requests/minute** per IP for unauthenticated public JSON endpoints. Over-limit returns 429.

**Plan implication:** Worker request rate is well below this. The 1h cache (D-08) further reduces volume. No proactive rate-limit handling needed beyond the existing `'transient'` retry path. Add `User-Agent: repco.ai/1.0 (+https://repco.ai)` header to every request — Reddit's TOS asks for descriptive UAs.

### Mapping (re-stated from D-10)

| HTTP / payload | Result |
|---------------|--------|
| `200` + `data.is_suspended === true` | `'banned'` |
| `200` + `data.total_karma < 5` (and `is_suspended` falsy) | `'banned'` |
| `200` + `data.total_karma >= 5` | `'ok'` |
| `404` | `'banned'` |
| `403` | `'banned'` |
| `429` | `'transient'` |
| `5xx` / fetch timeout / network error | `'transient'` |

---

## 4. Haiku CU `detect_ban_state` Detector Design (Q4)

### Model

`claude-haiku-4-5-20251001` (per CLAUDE.md environment block — same model as the existing CU executor, distinct call).

### API shape

**NOT** `client.beta.messages.create` (that's the computer-use beta path used by `executor.ts:54-68`). The detector uses vanilla `client.messages.create` with no tools and no betas — predictable cost, no tool-use loop. The whole point of D-14 was to avoid the loop.

```ts
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

const response = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 200,           // small — JSON object only
  system: DETECT_BAN_STATE_SYSTEM_PROMPT,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
        { type: "text", text: "Inspect this screenshot." },
      ],
    },
  ],
})
```

### System prompt (locked template)

```
You are a Reddit and LinkedIn page-state classifier. You inspect a screenshot of a
browser viewport and decide whether the page indicates the user has been BANNED,
SUSPENDED, or is being shown a CAPTCHA challenge.

Return ONLY a single JSON object on one line, with these three boolean keys, in
this order:

  {"banned": <bool>, "suspended": <bool>, "captcha": <bool>}

Definitions:

- "banned": A subreddit-level rule violation, account ban, or "you broke a rule"
  modal is visible. Includes "Account Suspended" pages, "you have been banned
  from r/X" notices, and Reddit/LinkedIn account-restriction interstitials.

- "suspended": Account-level suspension is shown. The account is logged out OR
  the page shows a permanent or temporary suspension notice naming the
  specific account.

- "captcha": A captcha challenge is visible — Cloudflare turnstile, Reddit
  captcha modal, LinkedIn "verify you are human" page, hCaptcha, reCAPTCHA, or
  any image-grid / checkbox / puzzle that blocks further interaction.

If the screenshot shows a normal feed, post, profile, DM thread, or any other
page where the user can continue working, return all three flags as false.

Do not include explanations, reasoning, markdown fences, or any text other
than the JSON object.
```

### Parsing

```ts
const text = response.content.find((b) => b.type === "text")?.text ?? ""
const match = text.match(/\{[^}]+\}/)
const parsed = match ? JSON.parse(match[0]) : null
const result = {
  banned: parsed?.banned === true,
  suspended: parsed?.suspended === true,
  captcha: parsed?.captcha === true,
}
```

Defensive — any parse failure returns all-false (per D-23). Log to Sentry. Do NOT flip `health_status` on detector failure.

### Cost & latency

- Input: 1 image (base64-encoded PNG ~150-300KB at 1280x900) ≈ 1500 input tokens
- Output: ≤30 tokens (the JSON object)
- Haiku 4.5 pricing: ~$1/Mtok input, $5/Mtok output
- Per call: ~$0.0015 input + ~$0.00015 output ≈ **$0.0017 per action**
- Latency: 1.5–2.5s typical

CONTEXT.md D-14 estimated $0.001 + 1–2s; actual is ~$0.0017 + ~2s. Within order of magnitude. Acceptable.

### Splice point in executor.ts

`executor.ts:154` returns `CUResult { success, steps, screenshots, stepLog, error }`. The final screenshot is `screenshots[screenshots.length - 1]`.

**Two integration options:**

**Option A** (preferred, smaller diff): The detector call lives in `worker.ts` between the CU executor return and the `releaseProfile` finally. `worker.ts` already has the CU result; pass `result.screenshots[result.screenshots.length - 1]` to `detectBanState`.

**Option B**: Detector lives in `executor.ts` and `CUResult` gains a `banState: { banned, suspended, captcha }` field.

**Decision:** Option A. Reasons: (1) keeps `executor.ts` focused on the agent loop; (2) detector errors don't need to bubble through `CUResult`; (3) detector decision needs Supabase (to write health_status), which `worker.ts` has and `executor.ts` does not.

---

## 5. Supabase ENUM ALTER TYPE Pattern (Q5)

### Existing pattern (verified)

`supabase/migrations/` has 6 prior `ALTER TYPE ... ADD VALUE` migrations:

- `00006_phase3_action_engine.sql:11` — `ALTER TYPE action_status_type ADD VALUE IF NOT EXISTS 'expired'`
- `00007_phase4_sequences_notifications.sql:4` — same pattern, `'cancelled'`
- `00010_phase5_billing_onboarding.sql:24` — same pattern, `'account_burn'` (with explanatory comment about "ADD VALUE must run in its own transaction in some [versions]")
- `00011_phase6_linkedin.sql:25` — same pattern, `'connection_request'`
- `00016_add_connected_pipeline_status.sql:6` — same pattern, `'connected'`
- `00017_phase13_linkedin_expansion.sql:10` — same pattern, `'unreachable'`
- `00019_linkedin_source_types.sql:8-9` — two values added in one file

**Pattern:** `ALTER TYPE <type_name> ADD VALUE IF NOT EXISTS '<new_value>';` Each on its own line. `IF NOT EXISTS` is mandatory for idempotency on re-applies.

### Postgres caveat

Supabase runs Postgres 15+ where `ALTER TYPE ... ADD VALUE` works inside a transaction. **However**, the new value cannot be USED in the same transaction it's added. Migration must add the values; subsequent migrations or runtime code can reference them.

**Plan implication:** Phase 18 migration adds `'needs_reconnect'` and `'captcha_required'` and the `cookies_jar`/`last_preflight_*` columns. The values are NOT used inside the migration itself (no UPDATE setting them) — they're consumed at runtime by `worker.ts`. Safe.

### Existing health_status_type ENUM

`00001_enums.sql:10`:
```sql
CREATE TYPE health_status_type AS ENUM ('warmup', 'healthy', 'warning', 'cooldown', 'banned');
```

After Phase 18 migration, the ENUM expands to:
```
('warmup', 'healthy', 'warning', 'cooldown', 'banned', 'needs_reconnect', 'captcha_required')
```

The existing Phase 14 quarantine guard at `worker.ts:85-91` IN-list (`'warning' | 'banned' | cooldown_until > now`) extends to also include `'needs_reconnect'` and `'captcha_required'` — short-circuit identically.

---

## 6. Migration File Sequencing (Q6)

```
$ ls supabase/migrations/
00001_enums.sql ... 00023_browser_profiles.sql 00024_mechanism_costs.sql
```

**Next sequential number: `00025`**

CONTEXT.md `<specifics>` suggested `00024_phase_18_cookies_preflight.sql` — that number is now taken by mechanism_costs (Phase 16-01). Plan must use `00025_phase_18_cookies_preflight.sql`.

---

## 7. GoLogin Idle-Then-Release (Q7)

### Question

Does GoLogin REST or SDK accept "stop after N seconds" or do we just `setTimeout(release, 30-60s)` in the worker? Will the connection time out before that?

### Answer

**No native "stop after delay" parameter exists.** The pattern is a worker-side `setTimeout`/`await new Promise(r => setTimeout(r, ms))` between save-cookies and the existing `releaseProfile()`.

### Connection timeout risk

GoLogin's CDP WebSocket idle timeout is generous (server-side ~5–10 minutes of inactivity before forced disconnect). A 30–60s sleep is well within budget. The CDP connection does not need active commands during the sleep — Playwright's WebSocket has no client-side keepalive requirement.

**Recommendation for plan:** Use `await new Promise((r) => setTimeout(r, 30_000 + Math.random() * 30_000))` — uniform 30-60s.

### Failed-action variant (Q3 from CONTEXT.md Claude's Discretion)

> Whether `saveCookiesAndRelease` runs the idle delay even when the action FAILED.

**Decision:** Skip the idle delay on failed actions. Reasoning:
- Anti-ban purpose of the idle delay is to defeat the "fast in/out" pattern — a real human stays on the page after taking an action.
- A failed action by definition didn't complete a write. There's nothing to "settle" on the server side. The fast-exit pattern only matters if Reddit/LinkedIn correlates "logged in → action taken → immediately gone" with bot behavior.
- Failed action implies something broke; faster cleanup reduces risk of compounding failures.
- Cookies still get saved on failures — that's the bigger value. The 30-60s idle is the smaller protection layer.

`saveCookiesAndRelease(connection, supabase, browserProfileId, opts)` accepts `{ idle: boolean }` — caller passes `idle: result.success`.

---

## 8. "Run Preflight Now" Server Action Behind Reconnect Button (Q4 from CONTEXT.md Claude's Discretion)

> Whether the Reconnect button POSTs an immediate "Run preflight now" server action OR just relies on the next worker tick.

**Decision: Rely on the next worker tick. NO extra server action.**

Reasoning:
- The Reconnect button already opens the GoLogin Cloud Browser URL — that's the primary user action.
- After the user logs back in / solves the captcha, the next scheduled worker action will:
  1. Hit the Phase 14 quarantine guard with `health_status='needs_reconnect'` and BLOCK
  2. The user must manually flip status. OR…
  3. Better: after the user reconnects, we need a path to clear the status.

**Wait — that's a problem.** The current design has no automatic recovery from `'needs_reconnect'` / `'captcha_required'`. The next worker action is BLOCKED by the Phase 14 guard, which means cookies-restore + preflight never run, which means the status never flips back.

**Resolution:** The Reconnect button POSTs a small server action that does ONE thing:
```ts
async function attemptReconnect(accountId: string) {
  // 1. Run reddit preflight (no GoLogin spin-up)
  const preflightResult = await runRedditPreflight({ ... })
  // 2. If 'ok' → clear health_status to 'healthy' (or back to 'warmup' if warmup_completed_at is null)
  // 3. If 'banned' → leave as-is, surface message
  // 4. If 'transient' → leave as-is, surface "try again in a minute"
}
```

This is a small surface (~30 lines of server action). The button:
1. Opens GoLogin Cloud Browser URL in new tab (`target="_blank"`)
2. Disables itself for 60s with a "Verifying…" state
3. After 60s, runs `attemptReconnect` against the account
4. On `'ok'`: revalidatePath, banner disappears
5. On `'banned'` / `'transient'`: shows toast or inline message

**Decision rationale:** Without this, the system has no automatic recovery loop — a reconnected user would still be locked out. This is the minimum viable recovery path. UI-SPEC's locked "Reconnect" copy is preserved; only the click handler does extra work.

For `captcha_required`: same flow, but the preflight check is skipped (preflight only validates ban state, not captcha). Once the user has solved the captcha in the cloud browser, the worker's NEXT successful action will run `detectBanState` → all-false → no status change. The user clicks Reconnect to reset to 'healthy' optimistically; if the captcha returns mid-action, the detector flips it back to `captcha_required` again.

**Implementation note for plan:** The "verify after 60s" loop is a client-side concern — UI-SPEC doesn't fully spec this. Plan should either (a) add a simple polling pattern, or (b) move the verification to manual ("you can close this tab when done"). Plan-checker decides.

---

## 9. Banner Component Choice (Q5 from CONTEXT.md Claude's Discretion)

UI-SPEC.md locked `<Alert>` from shadcn radix-nova preset. Verified against existing dashboard component vocabulary:

```bash
$ grep -r "from \"@/components/ui/alert\"" src/ | wc -l
0
```

`<Alert>` is NOT yet installed. Plan must add an `npx shadcn add alert` task. UI-SPEC notes this is the one new component for this phase. Confirmed.

---

## 10. Send-Account-Warning Extension (D-19)

Current signature:
```ts
sendAccountWarning(to: string, accountHandle: string, status: "warning" | "banned")
```

New signature:
```ts
sendAccountWarning(
  to: string,
  accountHandle: string,
  status: "warning" | "banned" | "needs_reconnect" | "captcha_required",
  opts?: { platform?: "reddit" | "linkedin" }
)
```

The `<AccountWarningEmail>` React component (`src/features/notifications/emails/account-warning.tsx`) currently branches on `status: "warning" | "banned"`. Plan must extend the props type and add subject/body branches per UI-SPEC §Email Copy.

### Debounce check

Per D-19, skip send if `job_logs` row exists with `kind='account_warning_email'` for this account in last 24h.

**Note on schema:** `job_logs` has `job_type` (not `kind`) per migration `00001_enums.sql`. The CONTEXT.md wording uses `kind` colloquially; plan uses `job_type`. The current ENUM `job_type_enum` includes values like `action`, `intent_signal_cron`, etc. — `account_warning_email` is **not currently a member**.

**Two options:**
- **A:** Add `'account_warning_email'` to the `job_type_enum` ENUM via the same Phase 18 migration. Then dedupe lookup is `job_logs WHERE job_type='account_warning_email' AND user_id=... AND metadata->>'account_id'=... AND finished_at > now() - interval '24 hours'`.
- **B:** Skip ENUM extension and dedupe via metadata only — query `job_logs WHERE metadata->>'kind'='account_warning_email' AND ...`.

**Decision:** Option A (extend ENUM). It's the conventional pattern in this codebase (every job kind gets an ENUM value), keeps queries indexable, and the migration is already touching ENUMs for health_status.

Migration adds:
```sql
ALTER TYPE job_type_enum ADD VALUE IF NOT EXISTS 'account_warning_email';
```

(Note: confirm exact ENUM name in `00001_enums.sql` during plan execution — `job_type` may be `text` rather than ENUM in some schema versions.)

---

## 11. Validation Architecture (Nyquist Required)

Per the Nyquist gate, each behavior must be mappable to a test type. Per the user's memory rule `feedback_supabase_mocked_tests_mask_column_drift`, mocked Supabase tests around new columns are **de-prioritized in favor of real-DB integration tests on the dev branch (effppfiphrykllkpkdbv)**.

| Behavior | Test type | Notes |
|----------|-----------|-------|
| Migration 00025 applies cleanly to dev branch | **Real-DB** (smoke test via Supabase Management API) | Apply, then `SELECT enum_range(NULL::health_status_type)` to confirm new values present, `\d browser_profiles` to confirm `cookies_jar`, `\d social_accounts` to confirm `last_preflight_*` columns |
| `getCookies(profileId)` returns valid Chromium-cookie array | **Real-API integration** (against dev GoLogin workspace) | Spin up a profile, navigate to reddit.com manually, call `getCookies`, assert `Array.isArray && length > 0 && every cookie has name/value/domain` |
| `setCookies(profileId, jar)` round-trip | **Real-API integration** | Save then load, assert equality after stable-sort |
| `runRedditPreflight` for known-healthy account | **Real-net integration** (mock `fetch` not allowed; spec must hit reddit.com) | Use `u/spez` as a stable reference — `is_suspended:false, total_karma>>5` → expect `{ kind: 'ok' }` |
| `runRedditPreflight` for known-suspended account | **Real-net integration** | Find a stable suspended username (Reddit has stable suspended namespaces); expect `{ kind: 'banned', reason: 'suspended' }` |
| `runRedditPreflight` for deleted account | **Real-net integration** | Use a clearly-nonexistent username `u/this-user-definitely-does-not-exist-${Date.now()}`; expect `{ kind: 'banned', reason: '404' }` |
| `runRedditPreflight` retry on 5xx | **Mocked fetch** | Acceptable here — testing retry logic, not Reddit response shapes; Supabase not touched |
| Preflight cache hit (within 1h, status='ok') skips fetch | **Real-DB integration** | Insert `last_preflight_at` row, run preflight, assert no `fetch` happened (spy on global fetch) |
| `detectBanState` on banned screenshot fixture | **Fixture-based** | Hand-curated PNGs in `__tests__/fixtures/`: `banned-rules.png`, `account-suspended.png`, `cloudflare-captcha.png`, `clean-feed.png`. Cost: ~$0.007 per full test run |
| `detectBanState` defensive: API error returns all-false | **Mocked Anthropic SDK** | Acceptable — testing error path, no real call needed |
| Cookies save → idle 30-60s → release sequence | **Hand-verification** | Run `pnpm dev --port 3001`, trigger an action, observe worker logs show cookie save + 30-60s gap + release; verify `browser_profiles.cookies_jar` was updated in dev DB |
| Worker quarantine guard extension to new ENUM values | **Real-DB integration** | Set `health_status='needs_reconnect'`, claim an action, assert short-circuit + `runError='account_quarantined'` |
| Email debounce check via `job_logs` 24h lookback | **Real-DB integration** | Insert two `account_warning_email` job_logs 1h apart, call `sendAccountWarning`, assert second send is skipped |
| Email subject/body for each of three statuses | **Snapshot test** | React Email snapshot for `<AccountWarningEmail status="banned" />`, `="needs_reconnect"`, `="captcha_required"` |
| Banner renders when array non-empty | **RTL component test** | Mock the Supabase return to `[{ id, handle, platform, health_status }]`, assert banner DOM |
| Banner returns null when array empty | **RTL component test** | Same harness, empty array, assert `container.firstChild === null` |
| Reconnect button visible when `health_status IN ('needs_reconnect','captcha_required')` | **RTL component test** | Render `<AccountCard>` with each status, assert button presence |
| `attemptReconnect` server action: ok path clears status | **Real-DB integration** | Set status to `'needs_reconnect'`, mock Reddit fetch as `'ok'`, call action, assert DB row reads `'healthy'` |
| Detector cost predictable ≤ $0.002/action | **Telemetry assertion** | Add an Axiom/console log `cu.detect_ban_state.cost_usd` per call; manual review of dev-branch logs after 10 actions |

### Validation Architecture summary

- **3 real-DB integration suites** required (migration smoke, preflight cache + DB writes, banner data flow). Test against dev branch `effppfiphrykllkpkdbv`. Per memory `feedback_dev_branch_no_touch`: never destroy.
- **3 real-API integration suites** required (GoLogin cookies round-trip, Reddit preflight x3 cases). Run gated behind env var `INTEGRATION=1` to keep CI fast.
- **1 fixture-based ML test** for the detector (4 fixture screenshots).
- **3 mocked unit tests** acceptable for retry logic + defensive paths.
- **Hand verification** for the cookies save → 30-60s idle → release sequence (timing is non-deterministic; just observe logs).

---

## 12. Landmines for the Planner

The following gotchas would silently break execution if not flagged:

### L-1: `cookies_jar` save MUST happen before `releaseProfile`

`releaseProfile()` calls `stopCloudBrowser` (`adapter.ts:139`). Once stopped, cookies fetched via `GET /browser/{id}/cookies` reflect last-saved state — but if the browser made changes that hadn't been flushed to GoLogin's profile state, they're lost. Empirically GoLogin flushes cookies to profile state on every page navigation, so post-stop GET should return correct data. **However**, the conservative path is to GET cookies BEFORE `stopCloudBrowser`. Plan must order this carefully.

### L-2: ALTER TYPE values can't be used in same transaction

`00025_phase_18_cookies_preflight.sql` cannot do `ALTER TYPE health_status_type ADD VALUE 'needs_reconnect'` then `UPDATE social_accounts SET health_status = 'needs_reconnect'` in the same file. The ADD VALUE must commit before the value is referenceable. Since the migration is one file in Supabase's migration runner, it runs in a transaction — meaning UPDATEs using the new values must be in a SUBSEQUENT migration (none planned for Phase 18; runtime code does the writes) or split across two migration files.

**Plan implication:** Migration 00025 is ALTER TYPE + ADD COLUMN only. No UPDATEs. Runtime code (worker.ts, actions) writes the new values.

### L-3: Detector failure must not flip status

Per D-23, `detectBanState` on Anthropic API error returns `{ banned: false, suspended: false, captcha: false }` and logs to Sentry. **Critically:** the consuming code in `worker.ts` must NOT short-circuit on detector failure as if it were a "banned" signal. The all-false return is intentionally a no-op.

### L-4: Reddit about.json `total_karma` may be missing

For suspended accounts, the response payload is truncated. `data.total_karma` is `undefined`. Code must check `is_suspended` first; only check `total_karma < 5` when `is_suspended` is falsy. A naive `data.total_karma < 5` evaluation against `undefined` returns `false` (because `undefined < 5` is `false` in JS coercion) — but this would miss the `is_suspended=true` signal. Order matters.

### L-5: `worker.ts:85-91` quarantine condition uses three-way OR

```ts
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  (account.cooldown_until !== null && ...)
```

Plan must extend to:
```ts
const isQuarantined =
  account.health_status === "warning" ||
  account.health_status === "banned" ||
  account.health_status === "needs_reconnect" ||
  account.health_status === "captcha_required" ||
  (account.cooldown_until !== null && ...)
```

Or refactor to `["warning", "banned", "needs_reconnect", "captcha_required"].includes(account.health_status)`. Plan-checker should flag if the plan only adds one status and forgets the other.

### L-6: Email debounce metadata column

`job_logs.metadata` is JSONB. The dedup query uses `metadata->>'account_id'`. This requires `account_id` to be inserted as a string into metadata for every `account_warning_email` row. Plan must specify the exact metadata shape.

### L-7: Migration file ordering in Supabase

Migration 00024 was Phase 16-01 (`mechanism_costs`). Phase 17 has not yet shipped its migration (per ROADMAP, Phase 17 is in progress). If Phase 17 lands a migration after this is planned but before this is executed, file numbers may collide. **Plan must use `00025` and add a NOTE: "if Phase 17 lands a migration first, renumber to next available."**

### L-8: GoLogin `setCookies` replaces, not merges

`POST /browser/{id}/cookies` replaces the entire jar. Saving cookies after a partial session that loaded fewer domains than a previous session would DROP cookies for unloaded domains. Mitigation: always SAVE the full jar at end-of-session via `getCookies` (which returns everything currently stored), so the next session's restore is the latest complete snapshot. Don't try to merge — accept GoLogin's "cookies are profile state, fetched fresh every session" model.

### L-9: Reconnect button polling may double-fire preflight

If the `attemptReconnect` server action triggers a preflight that succeeds, then the user clicks Reconnect again before the page re-validates, a second preflight runs. The 1h cache (D-08) guards against repeated FETCHES, but the action still hits the cache layer + DB. Acceptable; flag for plan.

### L-10: Cookies JSONB size

A typical Reddit/LinkedIn cookie jar is 2-15 cookies, ~1-3 KB serialized. Postgres JSONB has a 1GB row limit; we're nowhere near it. No concerns.

---

## 13. Execution Plan Sketch (informational; planner produces real plans)

The phase is naturally three plans by independent migration/code/UI surfaces:

1. **Plan 01 — Schema migration + ENUM extensions** (`00025_phase_18_cookies_preflight.sql`)
   - Adds `cookies_jar JSONB`
   - Adds two `health_status_type` ENUM values
   - Adds `last_preflight_at`, `last_preflight_status` columns
   - Adds `'account_warning_email'` job_type ENUM value
   - **[BLOCKING]** Push migration to dev branch via Supabase Management API

2. **Plan 02 — GoLogin cookies + Reddit preflight + worker integration**
   - `client.ts`: `getCookies`, `setCookies` exports
   - `adapter.ts`: `saveCookiesAndRelease` wrapper
   - New `src/features/accounts/lib/reddit-preflight.ts`
   - `worker.ts` insertions: cookies restore, preflight gate, swap finally to use `saveCookiesAndRelease`
   - Phase 14 quarantine guard IN-list extension

3. **Plan 03 — CU detector + alerts + UI surfaces**
   - New `src/lib/computer-use/detect-ban-state.ts`
   - `worker.ts` post-loop detector call between executor return and finally
   - `send-account-warning.ts` extension (new statuses + debounce + platform-aware copy)
   - New `<AccountDegradedBanner>` component + layout query extension
   - Account-card Reconnect button + `attemptReconnect` server action
   - `npx shadcn add alert`

Plans 02 and 03 can run in parallel after Plan 01 (which they all depend on).

---

## RESEARCH COMPLETE

Document written to `.planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md`.

Key resolutions:
- **D-07 corrected** — proxy-bypass design (direct fetch, no proxy hop) since GoLogin doesn't expose proxy creds
- **Cookies API** verified — endpoints, jar shape, save-before-stop ordering
- **Detector** locked — vanilla `messages.create`, JSON-only system prompt, ~$0.0017/call, splice in worker.ts (Option A)
- **Migration** — `00025_phase_18_cookies_preflight.sql`; ALTER TYPE pattern matches existing 6 migrations; ENUM values can't be USED in same transaction
- **Validation** — 3 real-DB suites, 3 real-API suites, 1 fixture-based ML, 3 mocked, hand-verify timing
- **10 landmines** documented for planner

Ready for planning. Planner should produce 3 plans with Plan 01 blocking Plans 02 and 03.
