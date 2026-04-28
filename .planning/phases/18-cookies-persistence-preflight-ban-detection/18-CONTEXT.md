# Phase 18: Cookies Persistence + Preflight + Ban Detection - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Three anti-ban capabilities ship together in this phase:

1. **Cookies persistence (BPRX-07)** — every worker session that ends with `releaseProfile()` first saves the GoLogin browser cookie jar to `browser_profiles.cookies_jar JSONB` via `GET /browser/{id}/cookies`, idles 30–60s (random), then releases. The next session restores via `POST /browser/{id}/cookies` before navigating.
2. **Pre-action preflight (BPRX-08)** — Reddit-only gate that runs immediately after the existing Phase 14 quarantine check at `worker.ts:78` and BEFORE any `connectToProfile()` call. Direct fetch via the account's residential proxy to `https://www.reddit.com/user/{handle}/about.json`; definitive ban signals flip `health_status='banned'` and abort with no GoLogin spin-up.
3. **Post-action ban detection (BPRX-09)** — after every CU action (success or failure), one Haiku CU `detect_ban_state` pass against the final screenshot. Returns `{ banned, suspended, captcha }`; `banned`/`suspended` flip to `'banned'`, `captcha` flips to a new `'captcha_required'` status (user must intervene in the cloud browser).

A consequence of (1): we never store user login credentials, so a logged-out session can't auto-recover. A new `'needs_reconnect'` health_status surfaces this as a Reconnect button + dashboard banner; the user re-logs into the existing GoLogin Cloud Browser URL.

In scope:
- Migration `00024_phase_18_cookies_preflight.sql` (or next sequential): adds `cookies_jar JSONB nullable default NULL` on `browser_profiles`; adds two new `health_status` ENUM values: `'needs_reconnect'` and `'captcha_required'`; adds `last_preflight_at TIMESTAMPTZ` and `last_preflight_status TEXT` on `social_accounts` (preflight cache).
- New `src/lib/gologin/client.ts` exports: `getCookies(profileId)`, `setCookies(profileId, jar)`.
- `src/lib/gologin/adapter.ts` — new `releaseProfileWithCookies(connection, supabase, browserProfileId)` that sequences: GET cookies → write to DB → random 30–60s sleep → existing `releaseProfile()`. Existing `releaseProfile()` stays for crash/error paths that shouldn't pay the idle cost.
- `src/lib/action-worker/worker.ts` — three insertions: (a) restore cookies after `connectToProfile`, (b) Reddit preflight gate after the quarantine guard at line 78, (c) post-action `detect_ban_state` pass before the existing `releaseProfile` finally. Reddit-only branch on (b); platform-agnostic on (c).
- New `src/features/accounts/lib/reddit-preflight.ts` — direct fetch through proxy, parses `{ kind: "t2", data: { is_suspended, total_karma } }`, returns a discriminated union mapping HTTP status + payload → `'banned' | 'transient' | 'ok'`. Single retry with 2s backoff on transient (5xx/timeout/proxy-error).
- New `src/lib/computer-use/detect-ban-state.ts` — wraps a single Haiku call against the final screenshot using the post-action JSON-only prompt (no tools, no agent loop). Returns `{ banned, suspended, captcha }`.
- `src/features/notifications/lib/send-account-warning.ts` — extend to handle three status reasons (`banned`, `needs_reconnect`, `captcha_required`) with different subject/body copy. Debounce: skip if a `job_logs` row of `kind='account_warning_email'` for this account exists within the last 24h.
- New `src/components/account-degraded-banner.tsx` (server component) — query in `src/app/(app)/layout.tsx` extends the existing line 32 fetch (already loads `health_status IN ('warning','cooldown','banned')`) to also include `'needs_reconnect'` and `'captcha_required'`. Banner shows above main content when array non-empty; lists each account with a Reconnect/View action button.
- Account-card UI: new "Reconnect" button visible when `health_status IN ('needs_reconnect','captcha_required')`. Opens the existing GoLogin Cloud Browser URL in a new tab. No new screens.

Out of scope (other phases or backlog):
- LinkedIn preflight (no public `about.json` equivalent — needs DOM/authwall-based probe; deferred).
- Shadowban detection (requires authenticated whoami, contradicts BPRX-08 'no auth'; deferred).
- Periodic UA rotation, real warmup activity, account-creation hygiene (anti-ban kosmetyka backlog, ANTI-BAN doc Faza 3 + Faza 5).
- Free-tier signup gating, monthly grant, pricing UI (Phase 19+).
- `auth.users` wipe (Phase 20).
- New toast notification surface (banner pattern is sufficient; toast deferred).
- Auto-pausing `monitoring_signals` when an account flips banned (existing worker quarantine guard already short-circuits action execution; signals are independent crons and don't need pausing).
- Confidence-thresholded CU detection (LLM confidence values are poorly calibrated; deferred unless false-positives surface in production).

</domain>

<decisions>
## Implementation Decisions

### Cookies lifecycle (BPRX-07)

- **D-01:** Cookies save fires once per session, at the end, in the worker's finally block — immediately before the existing `releaseProfile()` call at `worker.ts:705-711`. One `GET /browser/{id}/cookies` REST call per action. Mid-action saves rejected as overcomplicated for current scale.
- **D-02:** After save-cookies completes, sleep a uniform-random 30–60s, THEN call `releaseProfile()`. Matches ANTI-BAN doc Faza 2 wording; defeats the "fast in/out" pattern. Worker is async/background, so the added latency is acceptable.
- **D-03:** No credentials are stored in this system. CU cannot auto-login. If a session lands logged out (cookies expired, Reddit/LinkedIn signed the user out), the action aborts and the user must reconnect manually via the existing GoLogin Cloud Browser URL.
- **D-04:** New `health_status='needs_reconnect'` ENUM value handles the logged-out abort path. The existing Phase 14 quarantine guard at `worker.ts:78-125` is extended to short-circuit on `'needs_reconnect'` exactly like `'banned'`/`'warning'`. Account-card UI shows a Reconnect button (same cloud-browser URL the connect flow already produces) and the dashboard banner aggregates the count.
- **D-05:** Migration adds `cookies_jar JSONB nullable default NULL` to `browser_profiles`. NULL = "never saved" (fresh-login path required, which itself routes to `'needs_reconnect'` until cookies are populated). No `cookies_updated_at` timestamp — staleness inferred from worker behavior, added later if needed. Per Phase 15 D-01 ("no forward-looking columns").

### Preflight scope, transport & cache (BPRX-08)

- **D-06:** Reddit-only in this phase. BPRX-08 wording is Reddit-specific (about.json). LinkedIn needs a DOM/authwall-based probe (different mechanism); explicitly deferred.
- **D-07:** Direct `fetch` to `https://www.reddit.com/user/{handle}/about.json` through the account's residential proxy (HTTPS proxy auth header). No GoLogin browser, no cookies. ~500ms per call. Proxy connection string sourced from `browser_profiles.gologin_proxy_id` resolved via the GoLogin REST `/browser/{id}` endpoint OR the proxy creds GoLogin returned at allocation time (plan-phase verifies the API shape and locks the source).
- **D-08:** Preflight result cached for 1 hour per account using two new columns on `social_accounts`: `last_preflight_at TIMESTAMPTZ` and `last_preflight_status TEXT`. Worker checks `last_preflight_at > now() - interval '1 hour'`; if cached and `status = 'ok'` → skip the fetch. Cached `status = 'banned'` would have already flipped `health_status` and the Phase 14 guard would have blocked action — so cache hits on banned never happen at the preflight step.
- **D-09:** Shadowban detection is **dropped** from this phase. BPRX-08 says "no auth" but shadowban requires authenticated whoami (compare username in own profile vs in r/all listings). The three remaining signals (`is_suspended`, `total_karma < 5`, HTTP 404) satisfy the success criterion "health flips before browser spins up". Shadowban is partially covered by Area 4's CU detector noticing absent posts during a real action; full shadowban detection deferred.

### Preflight failure taxonomy (BPRX-08)

- **D-10:** HTTP-status-based mapping in `reddit-preflight.ts`:
  - `200` + `data.is_suspended === true` → `'banned'`
  - `200` + `data.total_karma < 5` → `'banned'` (karma-too-low folded into banned for simplicity — see D-12)
  - `404` (account deleted) → `'banned'`
  - `403` (suspended response) → `'banned'`
  - `5xx` / `fetch timeout` / proxy connection error → `'transient'` (no status flip; action aborts with retry-eligible failure code; the next scheduled action re-tries the preflight)
- **D-11:** Single retry with 2s backoff ONLY on transient failures (5xx/timeout/proxy-error). Definitive signals (is_suspended/404/403/karma<5) flip immediately with no retry — Reddit doesn't flap these.
- **D-12:** All four definitive signals map to a single `health_status='banned'`. Single semantic state, single alert path, single Phase 14 guard branch. The semantic distinction between "actually banned" and "too fresh for DM" exists in the logs but not in user-facing copy at this phase. Tri-state (banned/warmup/warning) considered and rejected — operationally identical for the user (reconnect or wait), so simpler code wins.
- **D-13:** Preflight gate sits in `worker.ts` immediately after the Phase 14 quarantine guard (after line 78, before `connectToProfile`). Reddit-only branch (`account.platform === 'reddit'`). On status flip: write to DB + return `{ success: false, error: 'account_quarantined' }` matching the existing failure shape. **No `connectToProfile` call** is made — directly satisfies BPRX-08 success criterion #2.

### Haiku CU detect_ban_state (BPRX-09)

- **D-14:** Detector runs on every action (success or failure), once, against the final screenshot. NOT registered as a tool inside the executor's CU loop — that would change Haiku's planning behavior and produce unpredictable per-action cost. Implementation: post-loop call to a thin wrapper at `src/lib/computer-use/detect-ban-state.ts` that constructs a single Haiku message with the screenshot + JSON-only response prompt, no tools, no agent loop. ~$0.001 + ~1–2s per action. Predictable.
- **D-15:** Detector schema returns `{ banned: boolean, suspended: boolean, captcha: boolean }`. The `rate_limited` flag from ANTI-BAN doc Faza 4 is **dropped** — uncertain whether Reddit/LinkedIn surface explicit rate-limit modals at all; add back when proven necessary.
- **D-16:** Detector → status mapping (differentiated, NOT all-to-banned):
  - `banned: true` OR `suspended: true` → `health_status='banned'` + email + banner.
  - `captcha: true` → `health_status='captcha_required'` (NEW ENUM value) + email + banner. User must open the cloud browser and solve the captcha manually. Distinct from `'needs_reconnect'` because the underlying issue and copy differ ("solve a captcha" vs "log back in"), even though the action button (open cloud browser) is the same.
  - All-false → no status change. Action result stands.
- **D-17:** Detector cost is paid even on successful actions — rejected the "only on failure" optimization because some bans surface AFTER a nominally successful action (post submitted but immediately removed; DM sent but account suspended). The +$0.001/action cost is acceptable.

### Quarantine semantics & alerts (BPRX-09)

- **D-18:** When `health_status` flips to `'banned'` / `'needs_reconnect'` / `'captcha_required'`: only the row update happens. The Phase 14 quarantine guard at `worker.ts:78` is extended to include the two new ENUM values (block their actions exactly like `'banned'`). `monitoring_signals` are NOT paused — they're independent crons and don't depend on outbound accounts. If/when signals get account-affinity (future), revisit.
- **D-19:** Alerts dispatched via the existing `src/features/notifications/lib/send-account-warning.ts` helper. Subject/body branches by reason: `'banned'`, `'needs_reconnect'`, `'captcha_required'`. Email debounced — skip send if a `job_logs` row with `kind='account_warning_email'` and a matching account_id exists within the last 24h. Prevents inbox spam when a degraded account has multiple queued actions per day.
- **D-20:** New top-of-dashboard banner (`src/components/account-degraded-banner.tsx`, server component). Query extends the existing fetch in `src/app/(app)/layout.tsx:32` to include `'needs_reconnect'` and `'captcha_required'` in the IN-list. Banner is purely query-driven — visible whenever the array is non-empty, disappears when the user reconnects (via existing `revalidatePath`). No "dismissed" state needed because the banner is the actionable surface itself. Lists each degraded account with status + a Reconnect/View action.
- **D-21:** Account-card "Reconnect" button visible when `health_status IN ('needs_reconnect','captcha_required')`. Same destination URL as the initial connect flow — opens GoLogin Cloud Browser in a new tab. After the user logs in / solves the captcha, the next worker run saves fresh cookies; if the user wants the status cleared immediately (without waiting for a worker tick), the button can also POST a server action that runs preflight on the spot — plan-phase decides if that's worth the extra surface area.

### Code layout

- **D-22:** New module `src/features/accounts/lib/reddit-preflight.ts` — exports `runRedditPreflight({ handle, proxyUrl, supabase, accountId })` returning a discriminated union `{ kind: 'ok' } | { kind: 'banned', reason } | { kind: 'transient', error }`. Pure; doesn't touch worker state. Caller (worker.ts) decides what to do with the result.
- **D-23:** New module `src/lib/computer-use/detect-ban-state.ts` — exports `detectBanState(screenshotBase64)` returning `{ banned, suspended, captcha }`. Single Haiku call, JSON response, no tools, no loop. Defensive: on Anthropic API error, return all-false + log to Sentry (don't flip status on detector failure).
- **D-24:** `src/lib/gologin/adapter.ts` gains `saveCookiesAndRelease(connection, supabase, browserProfileId)` that wraps: `getCookies` → DB write → random 30–60s sleep → existing `releaseProfile`. The existing `releaseProfile` stays exported for error/crash paths that want fast cleanup without paying the idle cost.
- **D-25:** Tests: hand-verify via `pnpm dev --port 3001` against dev Supabase branch + dev GoLogin workspace. Per the `feedback_supabase_mocked_tests_mask_column_drift` memory rule, mocked tests around the new `cookies_jar` / `last_preflight_*` columns are de-prioritized. Real-DB integration tests for preflight (mock the proxy fetch, use real Supabase dev branch) ARE in scope. Detector tests use fixture screenshots (banned/captcha/clean PNGs in `__tests__/fixtures/`).

### Claude's Discretion

- Exact wording of the Haiku detector prompt (the JSON-only system prompt + screenshot description). Plan-phase iterates on this until fixture screenshots return correct verdicts.
- Banner copy and exact shadcn component (`<Alert>` vs `<Card>` vs custom) — match existing dashboard component vocabulary.
- Whether to expose an explicit "Run preflight now" server action behind the Reconnect button (D-21) or just rely on the next worker tick to clear the status.
- Source-of-truth for the proxy connection string in `runRedditPreflight` — `GET /browser/{id}` response field, the `gologin_proxy_id` row, or a dedicated `GET /proxy/{id}` lookup (D-07). Plan-phase verifies API shape and locks the source.
- Whether `saveCookiesAndRelease` runs the idle delay even when the action FAILED. Argument for: still avoids fast-exit pattern. Argument against: failed action implies something broke; faster cleanup. Plan-phase decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (binding)

- `.planning/ANTI-BAN-ARCHITECTURE.md` §"Faza 2 — Persystencja cookies & sesji" lines 227–236 — cookie save/restore flow, idle 30–60s rationale, file targets including the migration name suggestion.
- `.planning/ANTI-BAN-ARCHITECTURE.md` §"Faza 4 — Detekcja banów / captcha / shadowbanów (pre + post action)" lines 253–266 — preflight signals, post-action CU detector wording, file targets.
- `.planning/ANTI-BAN-ARCHITECTURE.md` §"Verification" lines 295+ — end-to-end smoke test for fresh-account survival; informs UAT.

### Requirements (locked)

- `.planning/REQUIREMENTS.md` BPRX-07 (line 347) — cookies persistence + idle 30–60s
- `.planning/REQUIREMENTS.md` BPRX-08 (line 348) — Reddit about.json preflight, no auth, no GoLogin spin-up on ban
- `.planning/REQUIREMENTS.md` BPRX-09 (line 349) — Haiku CU `detect_ban_state` post-action detector + alert
- `.planning/ROADMAP.md` "Phase 18: Cookies Persistence + Preflight + Ban Detection" lines 89–98 — 4 success criteria. **Note:** criterion #3 wording amended per D-15 (rate_limited dropped from detector schema) and D-16 (captcha → `'captcha_required'` not `'banned'`).

### Prior phase decisions (binding)

- `.planning/phases/15-browser-profile-schema-foundation/15-CONTEXT.md` D-01 — `cookies_jar` reserved for THIS phase's migration; "no forward-looking columns" rule respected.
- `.planning/phases/15-browser-profile-schema-foundation/15-CONTEXT.md` D-08 — `getBrowserProfileForAccount` helper exists; cookies restore reads through it.
- `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md` D-14 — allocator owns profile creation; this phase only reads `browser_profiles`.
- `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md` D-06 — `gologin_proxy_id` source-of-truth still being verified by Phase 17 plan; D-07 here depends on that resolution for the proxy connection string lookup.
- Phase 14 — quarantine guard at `worker.ts:78-125` (already blocks `warning` / `banned` / `cooldown`); this phase extends the IN-list to include `'needs_reconnect'` and `'captcha_required'`.

### Project context

- `.planning/PROJECT.md` "Current Milestone: v1.2" — Track 1 (Anti-Ban) framing
- `CLAUDE.md` §Database — sequential migration naming; next number after the current latest (likely `00024_` if Phase 17 took `00023_`).
- `CLAUDE.md` §Environments — dev branch `effppfiphrykllkpkdbv` first; never destructive SQL on prod.
- `CLAUDE.md` §Critical Rules — `await logger.flush()` before returning from API/cron routes; service role server-side only; screenshots in `screenshots/`.
- Memory `feedback_supabase_mocked_tests_mask_column_drift` — grep migrations for every referenced column; mocked Supabase tests can mask 42703 errors.
- Memory `feedback_linkedin_executor_session_gap` — DM/Follow/prescreen silently misattribute logged-out state as target failure; preflight + cookies + `needs_reconnect` directly addresses this for Reddit; LinkedIn equivalent is deferred but the pattern (authwall URL + landmark preflight) belongs to a future phase.
- Memory `feedback_no_proxy_ux_complexity` — UI shows status badge + action button; never exposes "proxy" / "profile" / "fingerprint" terminology.
- Memory `feedback_credit_ui_no_burn_math` — N/A this phase (no pricing surfaces here), but banner copy must not allude to credit-burn-while-degraded math.

### Existing code (refactor + read targets — confirmed via grep)

- `src/lib/gologin/client.ts:41-73` — pattern reference for new `getCookies` / `setCookies` REST wrappers.
- `src/lib/gologin/adapter.ts:125-146` — `releaseProfile` to be wrapped by new `saveCookiesAndRelease`.
- `src/lib/action-worker/worker.ts:78-125` — Phase 14 quarantine guard; extend IN-list to include `'needs_reconnect'` + `'captcha_required'`. Insertion point for preflight gate.
- `src/lib/action-worker/worker.ts:705-711` — finally block where `releaseProfile` runs; swap for `saveCookiesAndRelease` on the success/normal path.
- `src/lib/computer-use/executor.ts` — final-screenshot handoff point for the post-action `detect_ban_state` call.
- `src/features/notifications/lib/send-account-warning.ts` — existing helper to extend with three reason branches.
- `src/app/(app)/layout.tsx:32` — existing `health_status IN (...)` query; extend list and pass results to new banner component.
- `src/features/accounts/components/account-card.tsx` — Reconnect button wiring.
- Phase 15 migration `supabase/migrations/00023_browser_profiles.sql` — schema reference for `health_status` ENUM (the ALTER TYPE ... ADD VALUE statements need to know the existing values).

### Excluded refs (deliberately not loaded)

- `.planning/PRICING.md`, `.planning/SIGNAL-DETECTION-MECHANISMS.md`, `.planning/OUTBOUND-COMMUNICATION-MECHANISMS.md` — Track 2 territory, irrelevant here.
- ANTI-BAN doc §Faza 3 (warmup), §Faza 5 (kosmetyka) — deferred backlog.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 14 quarantine guard** (`worker.ts:78-125`) — already short-circuits actions when `health_status` is degraded; this phase only needs to extend the IN-list and the failure shape stays identical (`{ success: false, error: 'account_quarantined' }`).
- **`releaseProfile` defensive shape** (`adapter.ts:125-146`) — try/catch swallows all errors, never throws from finally. New `saveCookiesAndRelease` follows the same shape so a cookie-save failure never breaks the worker.
- **`send-account-warning.ts`** in `src/features/notifications/lib/` — Resend dispatch already exists for Phase 14 warnings; extend with three new reason branches rather than building a new alert path.
- **`getBrowserProfileForAccount`** at `src/features/browser-profiles/lib/get-browser-profile.ts` (Phase 15 D-08) — cookies restore reads through this helper to get the `cookies_jar` column.
- **Existing `health_status IN (...)` query** at `src/app/(app)/layout.tsx:32` — banner data source already loaded on every authenticated page; just extend the IN-list.
- **`job_logs` table** — used for cron audit trail; reuse for the email-debounce check (`kind='account_warning_email'` + account_id + recent timestamp).

### Established Patterns

- **Server actions return `{ success, ... }` or `{ error }`** — `runRedditPreflight` returns a discriminated union but the worker translates to the existing shape.
- **Supabase client passed in, not imported** (Phase 15 D-08, Phase 17 D-14) — `runRedditPreflight` and `saveCookiesAndRelease` accept supabase as a parameter so server actions and crons share the code.
- **Sentry breadcrumb + Axiom structured log on every external call** (worker.ts pattern) — new GoLogin REST wrappers, the about.json fetch, and the Haiku detector call all log with correlationId.
- **Defensive try/catch around external APIs** — all new external calls (Reddit fetch, GoLogin getCookies/setCookies, Haiku detector) follow the existing "log to Sentry, return safe default, don't crash the worker" pattern.

### Integration Points

- `worker.ts` is the only writer of action results AND the chokepoint for cookies + preflight + detector. Three insertions all happen inside `executeAction`.
- `executor.ts` is the chokepoint for the post-action detector — receives the final screenshot from the CU loop and calls `detectBanState` before returning.
- `app/(app)/layout.tsx` is loaded on every authenticated page → banner is universally visible without per-page wiring.
- No new cron routes. Preflight runs inside the existing action worker; banner is server-component-rendered on layout load.

</code_context>

<specifics>
## Specific Ideas

- New file: `src/features/accounts/lib/reddit-preflight.ts` — exports `runRedditPreflight({ handle, proxyUrl, supabase, accountId })`.
- New file: `src/lib/computer-use/detect-ban-state.ts` — exports `detectBanState(screenshotBase64)` returning `{ banned, suspended, captcha }`.
- New file: `src/components/account-degraded-banner.tsx` — server component, dismissible-free, rendered conditionally in `app/(app)/layout.tsx`.
- New `client.ts` exports: `getCookies(profileId)`, `setCookies(profileId, jar)`.
- New `adapter.ts` export: `saveCookiesAndRelease(connection, supabase, browserProfileId)` — wraps existing `releaseProfile`.
- Migration: single file `00024_phase_18_cookies_preflight.sql` (or next sequential) bundling: `cookies_jar` column, two new ENUM values, two `last_preflight_*` columns. Reduces migration churn.
- `health_status` ENUM after this phase: `'warmup' | 'healthy' | 'warning' | 'cooldown' | 'banned' | 'needs_reconnect' | 'captcha_required'`. Phase 14 guard's IN-list extends to include the two new values.
- Email subject lines (rough): "Your Reddit account u/{handle} was suspended", "Reconnect needed for u/{handle}", "Captcha blocking u/{handle} — quick fix needed".
- Commit message scope: `feat(18): cookies persistence + reddit preflight + ban detection`.
- Default detector model: `claude-haiku-4-5-20251001` (current Haiku per CLAUDE.md environment block).

</specifics>

<deferred>
## Deferred Ideas

- **LinkedIn preflight** (DOM/authwall + landmark detection per `feedback_linkedin_executor_session_gap` memory) — separate phase. Same pattern but different probe; would also drive a `linkedin_needs_reconnect` flow that mirrors Reddit's.
- **Shadowban detection** — needs authenticated whoami session; defer to a phase allowed to spend a logged-in browser session OR rely on Area 4 CU detector spotting in-action shadowban signals (posts not appearing).
- **Rate-limit detector flag** — restored only if Reddit/LinkedIn are observed surfacing explicit rate-limit modals in production screenshots.
- **Confidence-thresholded detector** — LLM confidence scores are poorly calibrated; add only if false-positives become a measurable problem.
- **Toast notifications surface** — banner is sufficient for this phase; toast deferred to a UI-focused phase that adds the notification surface.
- **Auto-pausing monitoring_signals on banned account** — current signals are independent crons with no account-affinity; revisit when/if signals get routed through specific accounts.
- **`cookies_updated_at` audit column** — staleness inferred from worker behavior; add only if a cookie-rotation policy lands.
- **"Run preflight now" server action behind the Reconnect button** — Claude's Discretion in plan-phase; adds a manual recovery surface but may not be worth the extra UI.
- **Real-time subscription to dashboard banner** (Supabase realtime) — currently banner refreshes on `revalidatePath`; live updates only matter if the user is staring at the dashboard during a worker tick.
- **`detect_ban_state` as a tool inside the executor CU loop** — explicitly rejected (D-14) because it changes Haiku planning behavior unpredictably. Revisit if the post-loop pass misses bans that mid-action detection would catch.

</deferred>

---

*Phase: 18-cookies-persistence-preflight-ban-detection*
*Context gathered: 2026-04-27*
