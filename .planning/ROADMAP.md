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
- [ ] **Phase 17: Residential Proxy + GoLogin Profile Allocator** — country-matched residential GeoProxy, fingerprint patch, country↔TZ/locale mapping, auto-reuse algorithm
- [ ] **Phase 18: Cookies Persistence + Preflight + Ban Detection** — cookies_jar save/restore, Reddit `about.json` preflight, Haiku CU post-action ban detector
- [ ] **Phase 19: Free Tier ENUM + Signup Flow** — `subscription_tier='free'`, `handle_new_user` rewrite (250 cr, no trial), email+IP anti-abuse
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
**Goal**: When a user adds an account, the system allocates a country-matched residential proxy + a fingerprint-patched GoLogin profile (or reuses a compatible existing profile). The shared `mode: "gologin"` proxy pool is never touched again.
**Depends on**: Phase 15 (browser_profiles schema must exist)
**Requirements**: BPRX-03, BPRX-04, BPRX-05, BPRX-06
**Success Criteria** (what must be TRUE):
  1. New profile creation allocates a residential GeoProxy via GoLogin REST matching the requested `country_code`; the existing 8 floppydata residential proxies are consumed before any new purchase
  2. Every newly-created GoLogin profile has its fingerprints patched via `patch_profile_fingerprints` immediately after creation
  3. A documented country→{timezone, locale, UA} mapping for at least US/GB/DE/PL/FR/CA/AU is enforced and stored on `browser_profiles` (no drift between fields)
  4. `connectAccount(userId, platform)` reuses an existing same-country browser_profile of the same user when no platform conflict exists; only allocates a new proxy + profile when no compatible match is available
  5. A user can connect a Reddit account and a LinkedIn account and observe both land on the same `browser_profile_id` row when geographies match
**Plans**: 2 plans
  - [ ] 17-01-foundation-PLAN.md — Country map module + GoLogin REST wrappers (createProfileV2, patchProfileFingerprints) + API-shape probe (Wave 1, BPRX-04, BPRX-05)
  - [ ] 17-02-allocator-PLAN.md — Allocator orchestrator + connectAccount refactor + UI copy + legacy createProfile removal (Wave 2, BPRX-03, BPRX-06)
**UI hint**: yes

### Phase 18: Cookies Persistence + Preflight + Ban Detection
**Goal**: Sessions reuse cookies instead of re-logging-in every time, banned/suspended Reddit accounts are detected before any browser spin-up, and any rule/captcha/suspension modal that appears mid-action immediately quarantines the account.
**Depends on**: Phase 15 (browser_profiles schema), Phase 17 (profiles must be allocated before cookies have a column to land in)
**Requirements**: BPRX-07, BPRX-08, BPRX-09
**Success Criteria** (what must be TRUE):
  1. After every session, the worker writes the GoLogin browser cookie jar to `browser_profiles.cookies_jar JSONB`; the next session restores them before navigating, and the browser idles 30–60s before shutdown
  2. Before a Reddit action runs, the system fetches `https://www.reddit.com/user/{username}/about.json` through the account's proxy and aborts with `health_status='banned'` on suspension / total_karma < 5 / 404 / shadowban heuristic — no GoLogin spin-up occurs in that case
  3. After every action, a Haiku CU `detect_ban_state` pass inspects the screenshot for "rule broken" / captcha / "account suspended" / rate-limit modals; any positive flips `health_status='banned'`, halts further actions for that account, and dispatches a user alert
  4. A user whose Reddit account was banned externally sees the system quarantine it on the next attempted action without ever opening the GoLogin browser
**Plans**: TBD

### Phase 19: Free Tier ENUM + Signup Flow
**Goal**: New users land on a `free` subscription tier with 250 credits and no trial countdown. The signup path also blocks abusive duplicate-account creation by tracking email + IP combinations.
**Depends on**: Phase 16 (mechanism_costs must exist before tier semantics meaningfully apply, and `users.credits_balance_cap` / `credits_included_monthly` are defined here)
**Requirements**: PRIC-04, PRIC-05, PRIC-14
**Success Criteria** (what must be TRUE):
  1. `subscription_tier` ENUM contains `free` alongside the existing `monthly` / `quarterly` / `annual` values
  2. A new signup atomically receives `subscription_tier='free'` + 250 cr balance + a `credit_transactions` audit row, with no `trial_ends_at` set; the `startFreeTrial` server action no longer exists
  3. `users.credits_balance_cap` and `users.credits_included_monthly` columns are populated correctly per tier on signup and on subscription change
  4. A second signup from the same email + IP combination is rejected (or flagged in an audit log) by the `handle_new_user` trigger
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
  4. The `monthly-credit-grant` cron runs `0 0 1 * *` UTC and applies `balance = min(balance + monthly_grant, balance_cap)` per active subscription tier (Free 500, Monthly 4k, Quarterly 6k, Annual 8k caps)
  5. Stripe products in the live account match: Free $0/0/250cr, Monthly $49/2000cr, Quarterly $35/m / 3000cr, Annual $25/m / 4000cr; credit packs Starter 500/$29, Growth 1500/$59, Scale 5000/$149, Agency 15000/$399; old test prices archived; webhook updates `credits_included_monthly` per subscription event
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
| 17. Residential Proxy + GoLogin Profile Allocator | v1.2 | 0/0 | Not started | - |
| 18. Cookies Persistence + Preflight + Ban Detection | v1.2 | 0/0 | Not started | - |
| 19. Free Tier ENUM + Signup Flow | v1.2 | 0/0 | Not started | - |
| 20. Pre-Launch User Wipe | v1.2 | 0/0 | Not started | - |
| 21. Free Tier Enforcement + Monthly Grant + Stripe Refresh | v1.2 | 0/0 | Not started | - |
| 22. Signals UI Redesign + Free Tier Copy | v1.2 | 0/0 | Not started | - |
