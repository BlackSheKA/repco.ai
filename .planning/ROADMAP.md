# Roadmap: repco.ai

## Milestones

- ✅ **v1.0 Foundation** — Phases 1–12 (shipped 2026-04-21)
- ✅ **v1.1 LinkedIn Action Expansion** — Phases 13–14 (shipped 2026-04-27)
- 🚧 **v1.2 Survival + Foundation** — Phases 15–22 (in progress, started 2026-04-27)

## Phases

<details>
<summary>✅ v1.0 Foundation (Phases 1–12) — SHIPPED 2026-04-21</summary>

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

- [x] Phase 1: Foundation
- [x] Phase 2: Reddit Monitoring + Intent Feed (completed 2026-04-17)
- [x] Phase 3: Action Engine
- [x] Phase 4: Sequences + Reply Detection
- [x] Phase 5: Billing + Onboarding + Growth
- [x] Phase 6: LinkedIn (completed 2026-04-21)
- [x] Phase 7: Reply Detection Fix (GAP)
- [x] Phase 8: Public Stats + Duplicate Digest (GAP) (completed 2026-04-21)
- [x] Phase 9: Cross-Platform Approval + Audit Trail (GAP) (completed 2026-04-21)
- [x] Phase 10: LinkedIn Outreach Execution (GAP) (completed 2026-04-21)
- [x] Phase 11: Nyquist Validation Compliance (GAP) (completed 2026-04-21)
- [x] Phase 12: Trial Auto-Activation + Expiry (GAP) (completed 2026-04-21)

</details>

<details>
<summary>✅ v1.1 LinkedIn Action Expansion (Phases 13–14) — SHIPPED 2026-04-27</summary>

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

- [x] Phase 13: LinkedIn Action Expansion (5/5 plans, completed 2026-04-23) — DM, Follow, Like+Comment, followup_dm, prescreen
- [x] Phase 14: LinkedIn Account Quarantine Enforcement (1/1 plan, completed 2026-04-25) — gap closure: worker guard + claim_action RPC join

</details>

### 🚧 v1.2 — Survival + Foundation (In Progress)

- [x] **Phase 15: Browser Profile Schema Foundation** — `browser_profiles` table + `social_accounts` rewrite (1 profile = N accounts max 1/platform)
 (completed 2026-04-27)
- [ ] **Phase 16: Mechanism Cost Engine Schema** — `mechanism_costs` table seeded with 32 signal + 28 outbound rows; `monitoring_signals` schema rewrite; DB-driven burn engine
- [~] **Phase 17: Residential Proxy + GoLogin Profile Allocator** — _ABANDONED 2026-04-27, pivoted to Browserbase (see Phase 17.5). GoLogin parallel-launch quota and per-slot pricing don't fit our SaaS scale. Lessons preserved in `.planning/research/browserbase-vs-gologin.md`._
- [ ] **Phase 17.5: Browser Profile Allocator (Browserbase)** — Replaces Phase 17. Persistent context per account + per-session residential proxy with country geo-targeting via Browserbase. Drops BPRX-04 fingerprint patch (auto-handled by Browserbase). Iframe-embeddable live view replaces external viewer.
- [ ] **Phase 17.6: Sticky Residential Proxy IP per Browser Profile** — Same `browser_profile` always sees the same exit IP across sessions (3rd-party residential proxy with sticky session id) instead of BB's pool that rotates per session. Eliminates "same user, different IP every time" → ban risk. New `browser_profiles.proxy_session_id` + provider creds (Bright Data / IPRoyal / Oxylabs); BB session uses `proxies:[{type:"external", server, username:`customer-XXX-session-${profile_session_id}`, password}]`.
- [ ] **Phase 17.7: Reddit Executors Pivot from Computer Use to Stagehand** — Replace the screenshot-loop Computer Use pipeline for Reddit DM/Engage with deterministic Playwright + Stagehand `act()` (same architecture as 5 LinkedIn executors landed in 17.5-03). Drops per-action Haiku CU cost (~10× cheaper, 3-5× faster, deterministic). Trust boundary preserved (T-17.5-02 — message text never crosses into LLM args, only `keyboard.type`). Full description below.
- [ ] **Phase 18: Cookies Persistence + Preflight + Ban Detection** — cookies_jar save/restore, Reddit `about.json` preflight, Haiku CU post-action ban detector
- [ ] **Phase 19: Free + Pro Plan ENUMs + Signup Flow** — create `subscription_plan` (`free`|`pro`) + `billing_cycle` (`monthly`|`annual`); `handle_new_user` rewrite (250 cr free signup, no trial); `(email_normalized, ip)` anti-abuse via `signup_audit`
- [ ] **Phase 20: Pre-Launch User Wipe** — destructive `auth.users` reset behind explicit confirmation gate; cascading FK cleanup
- [ ] **Phase 21: Free Tier Enforcement + Monthly Grant + Stripe Refresh** — hard caps (1 account / 2 mechanisms / ≥4h / 0 outbound), mechanism whitelist, monthly-credit-grant cron, Stripe products refreshed, top-up pack lockdown
- [ ] **Phase 22: Signals UI Redesign + Free Tier Copy** — 27 mechanism cards with toggle/config/locked badges, no burn math anywhere, `/pricing` Free column + signup CTA refresh

## Phase Details

### Phase 15: Browser Profile Schema Foundation
**Goal**: A new schema layer exists where one residential proxy maps to one GoLogin profile, which in turn owns multiple social accounts (max one per platform). All existing code reads accounts through this new layer.
**Depends on**: Nothing (first v1.2 phase, schema foundation)
**Requirements**: BPRX-01, BPRX-02
**Success Criteria** (what must be TRUE):
  1. A `browser_profiles` table exists with `(user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name, created_at)` and RLS enabled
  2. `social_accounts` references `browser_profile_id` (FK) and a unique `(browser_profile_id, platform)` constraint prevents two same-platform accounts on one profile
  3. Legacy `social_accounts.gologin_profile_id` and `social_accounts.proxy_id` columns are removed (or deprecated and unread by code)
  4. `worker.ts` and account server actions read GoLogin profile/proxy via JOIN through `browser_profiles` — no direct legacy column reads remain
**Plans**: 2 plans
  - [x] 15-01-PLAN.md — Schema migration + helper module + types (Wave 1, BPRX-01)
  - [x] 15-02-PLAN.md — Refactor 9 reader sites + tests (Wave 2, BPRX-02)

### Phase 16: Mechanism Cost Engine Schema
**Goal**: A single source-of-truth cost table drives every monitoring/outbound credit calculation. The legacy `MONITORING_COSTS` constants are gone; `monitoring_signals` is restructured around mechanism IDs and per-mechanism config.
**Depends on**: Nothing (parallelizable with Phase 15 — independent schema track)
**Requirements**: PRIC-01, PRIC-02, PRIC-03
**Success Criteria** (what must be TRUE):
  1. `mechanism_costs` table exists and is seeded with all 32 signal + 28 outbound rows matching `PRICING.md` §5/§6 (`mechanism_id` PK, `cr_per_scan`/`cr_per_action`, `mechanism_kind`, `premium`, `requires_gologin`, `free_tier_allowed`)
  2. `monitoring_signals` has `frequency` (interval, default 6h), `mechanism_id` (FK), and `config jsonb`; legacy `signal_type` ENUM column dropped
  3. Server-side credit-burn engine computes `daily_burn = cr_per_scan × scans_per_day(cadence) × num_sources` from DB lookup via cached `getMechanismCost()` helper
  4. `MONITORING_COSTS` constants in `src/features/billing/lib/credit-burn.ts` are removed; no other module references them
**Plans**: TBD

### Phase 17: Residential Proxy + GoLogin Profile Allocator
**Status**: ABANDONED 2026-04-27 — pivoted to Phase 17.5 (Browserbase).
**Why**: GoLogin Professional plan caps `maxParallelCloudLaunches` at 1; counter got stuck after profile-delete-mid-session, blocking all UAT. Per-slot + per-cloud-hour pricing doesn't scale to SaaS-style provisioning (50 users → ~$300+/mo Enterprise plan + slot quota fights). Browserbase: 25 concurrent on $20/mo Developer plan, persistent contexts native, iframe-embeddable live view, official MCP server.
**Lessons learned**: see `.planning/research/browserbase-vs-gologin.md`.
**Disposition of artifacts**:
  - `country-map.ts` (BPRX-05) — keep as-is (Browserbase uses identical ISO country codes)
  - `client.ts` GoLogin wrappers — to be deleted in Phase 17.5
  - `allocator.ts` GoLogin orchestrator — to be rewritten in Phase 17.5 (algorithm preserved, vendor calls swapped)
  - `connectAccount` refactor + UI copy — preserved as-is (no GoLogin coupling at that layer)
  - 17-01-SUMMARY.md, 17-02-SUMMARY.md — kept as historical record
**Plans**:
  - [x] 17-01-foundation-PLAN.md — completed; country-map preserved, REST wrappers superseded by Phase 17.5
  - [~] 17-02-allocator-PLAN.md — paused at human-verify checkpoint; allocator code superseded by Phase 17.5

### Phase 17.5: Browser Profile Allocator (Browserbase)
**Goal**: When a user adds an account, the system creates a Browserbase persistent context for that account and starts sessions with a country-matched residential proxy on demand. Cross-platform reuse rule (D-02) preserved — same user + same country + no platform conflict reuses the existing context. Live view URL is iframe-embeddable so login happens inside our app.
**Depends on**: Phase 15 (browser_profiles schema), Phase 17 (country-map.ts retained from 17-01)
**Requirements**: BPRX-03, BPRX-05, BPRX-06 (BPRX-04 dropped — Browserbase auto-randomizes fingerprint per session, no manual patch needed)
**Success Criteria** (what must be TRUE):
  1. `browser_profiles` schema migrated: `gologin_profile_id` + `gologin_proxy_id` columns dropped, `browserbase_context_id` (UNIQUE NOT NULL) added; existing test rows wiped (`project_users_are_test_data`)
  2. New account allocation: `POST /v1/contexts` creates a persistent context, INSERT `browser_profiles` row with `browserbase_context_id`, INSERT `social_accounts` row, return success — does NOT auto-start a cloud session (BPRX-03 proxy attaches at session-start, not at context-create)
  3. `startAccountBrowser(accountId)` creates a Browserbase session with `proxies:[{type:"browserbase", geolocation:{country: <profile.country>}}]` and `browserSettings.context.{id, persist:true}`, returns `connectUrl` + iframe-embeddable `debuggerFullscreenUrl` from `GET /v1/sessions/{id}/debug`
  4. Reuse rule (D-02 from Phase 17 CONTEXT) preserved: cross-platform same-user same-country accounts share a single `browser_profiles` row; same-platform second account creates a new context
  5. Phase 13 LinkedIn executors (DM/Connect/Follow/Like/Comment/Prescreen) and Phase 4 P04 Reddit inbox CU connect to Browserbase via `chromium.connectOverCDP(connectUrl)` instead of GoLogin — selectors and action logic unchanged
  6. All `mode: "gologin"` references and `gologin_*` env vars removed from `src/`; `.env.local` and Vercel env have `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` set
**Plans**: 4 plans
  - [ ] 17.5-01-schema-migration-PLAN.md — migration 00025_browserbase_columns.sql (TRUNCATE CASCADE + drop gologin_*, add browserbase_context_id), apply to dev branch
  - [ ] 17.5-02-client-allocator-connectflow-PLAN.md — Browserbase client.ts + allocator rewrite (D-02 + D-10 preserved) + account-actions refit + ConnectionFlow iframe per UI-SPEC
  - [ ] 17.5-03-executor-refit-stagehand-PLAN.md — worker.ts session swap + 5 LinkedIn executors via Stagehand + Reddit CU CDP swap + delete src/lib/gologin/
  - [ ] 17.5-04-uat-and-cleanup-PLAN.md — 6 UAT scenarios + Stagehand smoke run + Vercel env cleanup + Phase 17 SUMMARY supersede annotations
**UI hint**: yes (iframe live-view replaces external viewer)

### Phase 17.6: Sticky Residential Proxy IP per Browser Profile
**Status**: Backlog — surfaced during Phase 17.5 UAT (2026-04-28).
**Why**: Phase 17.5 wires `proxies:[{type:"browserbase", geolocation:{country}}]`. Browserbase's built-in residential pool **rotates the exit IP per session**. That breaks the anti-ban architecture invariant from `project_anti_ban_architecture` ("1 konto = 1 sticky proxy IP"): every login flow / action burst on the same Reddit/LinkedIn account exits from a different residential IP, which Reddit/LinkedIn fingerprint as "user travelling" → flag → captcha → ban.
**Goal**: A given `browser_profile` always egresses from the same residential IP across all sessions for the lifetime of the profile (within provider's session-id TTL — 10–30 min reusable, longer with rebind). Achieved by switching from BB's pool to an external residential provider with sticky-session credentials, keyed on `browser_profile.id`.
**Depends on**: Phase 17.5 (browser_profiles schema with `browserbase_context_id` already lives; this phase adds sibling proxy-binding columns)
**Requirements**: BPRX-10 (NEW — sticky exit IP per profile), BPRX-11 (NEW — proxy provider credential rotation/lifecycle)
**Success Criteria** (what must be TRUE):
  1. `browser_profiles` has `proxy_session_id` (UNIQUE NOT NULL — derived from `browser_profile.id` or random UUID at create time) and `proxy_provider` (`brightdata`|`iproyal`|`oxylabs` ENUM) columns; migration backfills existing rows
  2. `createSession` in `src/lib/browserbase/client.ts` accepts `proxy: { type: "external", server, username, password }` and BB forwards traffic through the external proxy; per-profile credentials assembled by `assembleProxyCredentials(profile)` helper that injects sticky session id into the username string per provider's docs (e.g. `customer-X-session-${id}` for Bright Data)
  3. `BROWSERBASE_PROXY_PROVIDER`, `BROWSERBASE_PROXY_USER`, `BROWSERBASE_PROXY_PASS` env vars added to `.env.example` + Vercel; one provider configured for prod (decision deferred to phase planning — research doc compares Bright Data vs IPRoyal vs Oxylabs on price, country coverage, sticky TTL)
  4. UAT: two consecutive sessions for the same `browser_profile` egress from the SAME IP (verified via `https://api.ipify.org` from inside the BB session) — but two profiles get different IPs
  5. UAT: deleting a profile (`deleteAccount` refcount-zero path) releases the provider sticky session id (or lets it TTL — provider-dependent; documented in SUMMARY)
**Plans**: TBD during phase planning. Sketch: 17.6-01 schema + provider research, 17.6-02 client refit + allocator hookup, 17.6-03 UAT against live providers.
**UI hint**: no (transparent infrastructure change)

### Phase 17.7: Reddit Executors Pivot from Computer Use to Stagehand
**Status**: Backlog — surfaced during Phase 17.5 UAT (2026-04-28).
**Why**: Phase 17.5-03 swapped LinkedIn executors (5 actions: DM, Connect, Follow, Like, Comment) to **deterministic Playwright + Stagehand** running on Browserbase sessions, but kept Reddit executors (DM, Engage/comment) on the **Anthropic Computer Use loop** they inherited from Phase 4 P04 / Phase 11–12. The CU loop:
  - Takes a screenshot of the current page
  - Sends it + a hand-written prompt (`reddit-dm.ts`, `reddit-engage.ts`) to Haiku
  - Haiku returns a tool call ("click @ x,y" / "type X")
  - Playwright executes; loop until prompt completes or error
  
  This costs an LLM call per action step (~5–10 calls per DM), is slow (~30–60s per DM end-to-end), and drifts when Reddit's UI shifts (the prompt encodes positional reasoning that breaks on layout changes). LinkedIn — running Stagehand `act()` — is ~10× cheaper and 3–5× faster on the same workload.

**Goal**: Reddit executors run on the same architecture as LinkedIn — deterministic Playwright clicks/typing where DOM is stable, Stagehand `act()` only for the high-churn surfaces. The Computer Use loop is removed from the action path entirely (CU stays only as the post-action ban-state classifier from Phase 18-03 — that's a one-shot screenshot classifier, not a loop). Result: cheaper, faster, more reliable, and the trust boundary T-17.5-02 (user-supplied message text never crosses into LLM arguments — only `keyboard.type`) extends to Reddit.

**Depends on**: 
  - Phase 17.5 (worker.ts already creates Browserbase sessions and instantiates Stagehand for LinkedIn — the same `stagehand` handle plumbs through to Reddit executors).
  - Phase 18-03 (Haiku ban detector — keep as-is; this phase doesn't touch the post-action classifier).

**Requirements**: BPRX-12 (NEW — Reddit executors deterministic, no per-step LLM), BPRX-13 (NEW — same trust boundary T-17.5-02 applied: prospect message text typed via `keyboard.type`, never inlined into `act()` args).

**Success Criteria** (what must be TRUE):
  1. `src/lib/computer-use/actions/reddit-dm.ts` and `reddit-engage.ts` (currently prompt strings) are **deleted** in favour of `src/lib/action-worker/actions/reddit-dm-executor.ts` and `reddit-engage-executor.ts` mirroring the shape of `linkedin-dm-executor.ts` (returns `{ success, failureMode, reasoning }`).
  2. `src/lib/action-worker/worker.ts` dispatches Reddit `dm` and `engage` actions to the new deterministic executors; `executeCUAction(page, prompt)` is **NOT** called from the action path. (`executeCUAction` itself stays in the codebase only if used by ban-detector or other non-action callers — otherwise it's removed too.)
  3. Reddit DM executor flow:
     - `await page.goto("https://www.reddit.com/")` (already authenticated via persistent context)
     - `await page.act("click the chat icon in the top navigation")` → opens chat panel
     - `await page.act("click the new message button")` → opens compose
     - `await page.act("type ${recipientHandle} into the recipient field")` → recipient only — handle is server-trusted
     - **`await page.keyboard.type(message, { delay: 30 })`** in the message body — deterministic, T-17.5-02 (message bytes never sent to LLM)
     - `await page.act("click send")` → fire-and-forget
     - Verify with `stagehand.extract("did the message-sent confirmation appear?")` → boolean → on false return `failureMode: "send_button_missing"`
  4. Reddit Engage (top-level comment + reply) executor uses the same shape: navigate to post URL → `page.act("click the reply button")` → `page.keyboard.type(commentText)` → `page.act("click submit")`.
  5. Failure-mode taxonomy parity with LinkedIn: `dialog_never_opened`, `recipient_not_found`, `weekly_limit_reached`, `account_suspended`, `captcha_required`, `unknown` — surfaced in `job_logs.metadata.failure_mode` and consumed by Phase 18 ban-detector + Phase 14 quarantine.
  6. Cost regression test: dry-run a Reddit DM through both old (CU) and new (Stagehand) paths against a recorded fixture session; assert new path issues 0 Haiku calls (or only 1 — the post-action ban detector, which is the existing Phase 18 contract). Old path's per-step Haiku calls are gone.
  7. UAT: send a real DM and a real comment from a warmup-skipped Reddit account end-to-end; both succeed; `mechanism_costs` burn matches the deterministic-action row (no surprise CU cost).
  8. Memory rule `project_linkedin_cu_improvements` (LinkedIn DOM-hybrid + pre-screening backlog) gets a sibling note for Reddit captured during this phase if any failure-modes don't yield to Stagehand `act()` and need DOM hooks.

**Plans**: TBD during phase planning. Sketch:
  - 17.7-01-reddit-dm-executor-PLAN.md — deterministic `reddit-dm-executor.ts`, vitest with mocked page+stagehand, integration test against a fixture session
  - 17.7-02-reddit-engage-executor-PLAN.md — same shape for top-level comment + reply
  - 17.7-03-worker-rewire-PLAN.md — worker.ts dispatch swap + delete of `src/lib/computer-use/actions/reddit-*.ts` + cleanup of `executeCUAction` import sites if no other callers remain
  - 17.7-04-uat-PLAN.md — end-to-end DM + comment UAT against a real warmed account, cost regression assertion, ban-detector parity check

**Trade-offs / risks to capture in CONTEXT during planning**:
  - Stagehand `act()` is more brittle on Reddit than LinkedIn because Reddit's chat UI is a React-heavy iframe-within-iframe in places; some failure modes may require DOM-aware fallback (Memory rule `feedback_supabase_mocked_tests_mask_column_drift` analogue: if Stagehand silently no-ops we won't catch it without explicit post-action assertions).
  - Reddit's "new message" UX changed twice in the last 12 months — recipe cache should be invalidated per-Stagehand-version, not held forever.
  - Verification step (`stagehand.extract`) DOES count as 1 LLM call per action — still ~10× cheaper than current CU loop, but not free. Document the cost row in `mechanism_costs` so burn engine reflects it.

**UI hint**: no (action-engine change, no user-visible surface)

### Phase 18: Cookies Persistence + Preflight + Ban Detection
**Goal**: Sessions reuse cookies instead of re-logging-in every time, banned/suspended Reddit accounts are detected before any browser spin-up, and any rule/captcha/suspension modal that appears mid-action immediately quarantines the account.
**Depends on**: Phase 15 (browser_profiles schema), Phase 17.5 (Browserbase contexts allocated; persistent context auto-saves cookies, simplifying BPRX-07 substantially)
**Requirements**: BPRX-07, BPRX-08, BPRX-09
**Success Criteria** (what must be TRUE):
  1. After every session, the worker writes the GoLogin browser cookie jar to `browser_profiles.cookies_jar JSONB`; the next session restores them before navigating, and the browser idles 30–60s before shutdown
  2. Before a Reddit action runs, the system fetches `https://www.reddit.com/user/{username}/about.json` through the account's proxy and aborts with `health_status='banned'` on suspension / total_karma < 5 / 404 / shadowban heuristic — no GoLogin spin-up occurs in that case
  3. After every action, a Haiku CU `detect_ban_state` pass inspects the screenshot for "rule broken" / captcha / "account suspended" / rate-limit modals; any positive flips `health_status='banned'`, halts further actions for that account, and dispatches a user alert
  4. A user whose Reddit account was banned externally sees the system quarantine it on the next attempted action without ever opening the GoLogin browser
**Plans**: 4 plans
  - [ ] 18-01-schema-migration-PLAN.md — Migration 00025 (cookies_jar + last_preflight_* + ENUM extensions) + dev-branch apply (Wave 1, BPRX-07, BPRX-08)
  - [ ] 18-02-cookies-preflight-worker-PLAN.md — GoLogin cookies API + reddit-preflight + worker insertions (Wave 2, BPRX-07, BPRX-08)
  - [ ] 18-03-detector-alerts-ui-PLAN.md — Haiku detect-ban-state + worker post-CU splice + email alert (Wave 3, BPRX-07, BPRX-09)
  - [ ] 18-04-ui-banner-reconnect-PLAN.md — shadcn Alert + HealthBadge tints + dashboard banner + account-card Reconnect button + attemptReconnect server action (Wave 3, BPRX-09)

### Phase 19: Free Tier ENUM + Signup Flow
**Goal**: New users land on a `free` subscription tier with 250 credits and no trial countdown. The signup path also blocks abusive duplicate-account creation by tracking email + IP combinations.
**Depends on**: Phase 16 (mechanism_costs must exist before tier semantics meaningfully apply, and `users.credits_balance_cap` / `credits_included_monthly` are defined here)
**Requirements**: PRIC-04, PRIC-05, PRIC-14
**Success Criteria** (what must be TRUE):
  1. New ENUMs created: `subscription_plan` (`free`|`pro`) and `billing_cycle` (`monthly`|`annual`). Quarterly tier dropped per PRICING.md §11. No `subscription_tier` ENUM exists in the live schema (never created); legacy `billing_period` column kept in place — Phase 21 owns the drop.
  2. `users.subscription_plan` (NOT NULL DEFAULT `'free'`), `users.billing_cycle` (nullable; CHECK enforces NOT NULL when `subscription_plan='pro'`)
  3. A new signup atomically receives `subscription_plan='free'` + 250 cr balance + a `credit_transactions` ledger row + a `signup_audit` row, with no `trial_ends_at` set. Confirmed no `startFreeTrial` server action exists in the codebase.
  4. `users.credits_balance_cap` and `users.credits_included_monthly` columns are populated correctly per plan on signup and on subscription change (Free: 500 cap / 250 grant, Pro: 4 000 cap / 2 000 grant)
  5. A second signup from the same `(email_normalized, ip)` combination is flagged via `signup_audit.duplicate_flag = true` (audit-only — no hard reject; `public.normalize_email()` handles Gmail dot+plus normalization, mirrored by `src/features/auth/lib/normalize-email.ts`)
**Plans**: TBD

### Phase 20: Pre-Launch User Wipe
**Goal**: All existing test data in `auth.users` is destroyed in a single, explicit, audited operation so the new schema (browser_profiles, mechanism_costs, free tier) goes live with a clean slate before Stripe products are refreshed.
**Depends on**: Phase 15 (browser_profiles schema in place), Phase 16 (mechanism_costs schema in place), Phase 19 (free-tier signup path ready to receive the next generation of users post-wipe)
**Requirements**: BPRX-10
**Success Criteria** (what must be TRUE):
  1. The wipe is gated behind an explicit confirmation prompt that requires typing a confirmation token before any DELETE runs (no silent execution path)
  2. After the wipe, `auth.users` is empty and all dependent rows (`public.users`, `social_accounts`, `browser_profiles`, `monitoring_signals`, `prospects`, `actions`, `action_counts`, `credit_transactions`, `job_logs` for those users) are gone via cascading FKs
  3. The next user that signs up afterward lands on the new free-tier path (Phase 19) without any leftover legacy data conflicting
  4. The wipe is auditable — its commit message records the row counts deleted and the schema version at the time of execution
**Plans**: TBD

### Phase 21: Free Tier Enforcement + Monthly Grant + Stripe Refresh
**Goal**: The free tier becomes a real, hard-bounded product: caps + mechanism whitelist + paywall modals + monthly credit grants + clean Stripe products that match the new contract. Top-up packs are gated to paid users only.
**Depends on**: Phase 16 (mechanism_costs.free_tier_allowed flag), Phase 19 (free tier ENUM + balance_cap columns), Phase 20 (Stripe refresh runs against a clean user table — no orphan test customers)
**Requirements**: PRIC-06, PRIC-07, PRIC-08, PRIC-09, PRIC-10
**Success Criteria** (what must be TRUE):
  1. A free-tier user cannot exceed 1 social account, 2 active mechanisms, or cadence shorter than 4h; UI controls below 4h are disabled, and the limits are enforced server-side
  2. A free-tier user attempting any DM, public reply, LinkedIn connection, comment, or post sees a paywall modal "Upgrade to start outreach" and the action is not created
  3. The `/signals` configuration only allows free-tier users to select R1, R3, R4, L1, L7, T1, T2; gologin-required mechanisms (R7, R8, L6, L10, L11, T3) and heavy mechanisms (L2-L5, T4) display a locked-with-Upgrade badge
  4. The `monthly-credit-grant` cron runs `0 0 1 * *` UTC and applies `balance = min(balance + monthly_grant, balance_cap)` per active plan (Free cap 500, Pro cap 4 000)
  5. Stripe products in the live account match: 2 subscription prices (`STRIPE_PRICE_PRO_MONTHLY` = $49/m / 2 000 cr; `STRIPE_PRICE_PRO_ANNUAL` = $468/yr ≈ $39/m effective / 2 000 cr / save 20%); credit packs unchanged (Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399); old test prices archived; webhook matches Stripe price ID → `(subscription_plan, billing_cycle)` and updates `credits_included_monthly` + `credits_balance_cap`
  6. A free-tier user attempting to buy a top-up credit pack is blocked in both checkout server action and the pricing page UI, with a forced-upgrade prompt
**Plans**: TBD
**UI hint**: yes

### Phase 22: Signals UI Redesign + Free Tier Copy
**Goal**: The `/signals` page becomes the new control surface — 27 mechanism cards instead of 5 signal types, with per-mechanism config and clear locked-state messaging. Burn math disappears from the entire app, and the public/landing copy reflects the free-tier contract.
**Depends on**: Phase 16 (27 mechanism rows seeded), Phase 21 (free tier enforcement + paywall behavior must exist for UI to reflect it)
**Requirements**: PRIC-11, PRIC-12, PRIC-13
**Success Criteria** (what must be TRUE):
  1. `/signals` renders 27 mechanism cards, each with its own toggle, configuration form, **static unit-cost label** ("1 credit per scan, per source"), upgrade badge for locked mechanisms, and a status footer showing `last_scan_at` + `signals_24h`
  2. No page in the app (dashboard, signals, billing, account, anywhere) displays `cr/day`, `cr/month`, a live burn ticker, "wystarczy na X dni", or any daily-burn breakdown — only the credit balance and per-action unit costs are shown
  3. `/pricing` includes a Free column (250 cr/m, 1 account, monitor only) alongside the paid tiers; landing/dashboard CTAs read "Sign up free" and route into the free-tier path; "Start free trial" copy is gone
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 6/6 | Complete | 2026-04-21 |
| 2. Reddit Monitoring + Intent Feed | v1.0 | 4/4 | Complete | 2026-04-17 |
| 3. Action Engine | v1.0 | 10/10 | Complete | 2026-04-21 |
| 4. Sequences + Reply Detection | v1.0 | 5/5 | Complete | 2026-04-21 |
| 5. Billing + Onboarding + Growth | v1.0 | 7/7 | Complete | 2026-04-21 |
| 6. LinkedIn | v1.0 | 1/1 | Complete | 2026-04-21 |
| 7. Reply Detection Fix (GAP) | v1.0 | 1/1 | Complete | 2026-04-21 |
| 8. Public Stats + Duplicate Digest (GAP) | v1.0 | 4/4 | Complete | 2026-04-21 |
| 9. Cross-Platform Approval + Audit Trail (GAP) | v1.0 | 2/2 | Complete | 2026-04-21 |
| 10. LinkedIn Outreach Execution (GAP) | v1.0 | 4/4 | Complete | 2026-04-21 |
| 11. Nyquist Validation Compliance (GAP) | v1.0 | 0/0 | Complete | 2026-04-21 |
| 12. Trial Auto-Activation + Expiry (GAP) | v1.0 | 3/3 | Complete | 2026-04-21 |
| 13. LinkedIn Action Expansion | v1.1 | 5/5 | Complete | 2026-04-23 |
| 14. LinkedIn Account Quarantine Enforcement (GAP) | v1.1 | 1/1 | Complete | 2026-04-25 |
| 15. Browser Profile Schema Foundation | v1.2 | 3/3 | Complete    | 2026-04-27 |
| 16. Mechanism Cost Engine Schema | v1.2 | 0/0 | Not started | - |
| 17. Residential Proxy + GoLogin Profile Allocator | v1.2 | 1/2 | Abandoned | 2026-04-27 |
| 17.5. Browser Profile Allocator (Browserbase) | v1.2 | 0/4 | Planned     | |
| 18. Cookies Persistence + Preflight + Ban Detection | v1.2 | 0/0 | Not started | - |
| 19. Free Tier ENUM + Signup Flow | v1.2 | 0/0 | Not started | - |
| 20. Pre-Launch User Wipe | v1.2 | 0/0 | Not started | - |
| 21. Free Tier Enforcement + Monthly Grant + Stripe Refresh | v1.2 | 0/0 | Not started | - |
| 22. Signals UI Redesign + Free Tier Copy | v1.2 | 0/0 | Not started | - |
