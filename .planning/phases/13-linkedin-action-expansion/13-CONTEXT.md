# Phase 13 — LinkedIn Action Expansion: CONTEXT

**Milestone:** v1.1 — LinkedIn Action Expansion
**Requirements:** LNKD-01, LNKD-02, LNKD-03, LNKD-04, LNKD-05, LNKD-06
**Depends on:** Phase 10 (connection_request executor + GoLogin infra), Phase 4 (follow-up cron + check-replies)
**Gathered:** 2026-04-23
**Status:** Ready for planning

## Context

Phase 10 proved that LinkedIn's anti-bot gate (`isTrusted:false` rejection of CDP-dispatched clicks on the Connect button) can be bypassed by navigating directly to the action's underlying URL. `linkedin-connect-executor.ts` works today against live targets via `/preload/custom-invite/?vanityName=X`.

The same pattern must now scale to Message / Follow / React / Comment so that:
- LinkedIn prospects who accept a Connect invite have a working DM follow-up path (today: zero-touch after Pending state)
- The day 3/7/14 followup cron can route LinkedIn prospects to an executor that works (today: worker would break — no `dm` arm for LinkedIn)
- The approval queue stops filling with unsendable actions against structurally-blocked targets (Creator mode, weekly invite cap, company pages) — LNKD-06

Without this phase, v1.1 ships with a half-done LinkedIn loop: Connect works, but every downstream outreach step is unimplemented. Pre-screening is the bet that reducing `no_connect_available`-style failures pays back the profile-visit cost.

## Phase Boundary

### In scope

- Four new executors following the `linkedin-connect-executor.ts` template (deterministic DOM, direct-URL navigation where possible, Playwright locators for in-page interaction):
  - **LinkedIn DM** (1st-degree only) — `/messaging/thread/new/?recipient={slug}` or profile Message button
  - **LinkedIn Follow** — profile-level Follow, Premium-gated fallback detection
  - **LinkedIn React (Like)** — post URN-based reaction
  - **LinkedIn Comment** — post URN + 1250-char text paste
- Worker dispatch by `account.platform` — existing `dm`/`follow`/`like`/`public_reply` branches fan out to reddit-* or linkedin-* executor
- Claude Sonnet 4.6 comment generation (mirrors existing DM generation pipeline) with QC rules (≤1250 chars, no links, adds value, no pitch)
- `followup_dm` cron routes LinkedIn prospects through the new LinkedIn DM executor without any cron changes (worker dispatches)
- Pre-screening cron (`/api/cron/linkedin-prescreen`) — hourly batch visits `/in/{slug}` for `pipeline_status='new'` LinkedIn prospects, detects unreachable states, sets `pipeline_status='unreachable'` + reason
- Typed `failure_mode` taxonomy for the new actions, written into `job_logs.metadata` (same pattern as Phase 10)
- Daily limits + warmup gates for the four new action types
- Migration: new limit columns on `social_accounts`, counters on `action_counts`

### Out of scope (defer)

- New enum values — `action_type` enum stays at `like/follow/public_reply/dm/followup_dm/connection_request`
- InMail / Premium fallback for non-1st-degree DMs — fail with `not_connected`, user re-approves as `connection_request`
- Auto-swap of action_type (e.g. DM → connection_request) — violates approval contract
- Second-degree DM detection inside pre-screen (out-of-scope signal; caught at execution)
- Retry on failure — single attempt per approval (Phase 10 policy)
- Autopilot comment posting without approval
- Weekly per-account cap tracking (daily is the only throttle; revisit if LinkedIn rate-limits fire in prod)
- A/B testing comment variants

## Implementation Decisions

### Enum strategy — overload + dispatch by `account.platform`

- `action_type` enum unchanged. No migration on the enum.
- `worker.ts` dispatch: the existing `if (action.action_type === "dm" || "followup_dm")` branch adds an inner `if (account.platform === "linkedin") → linkedin-dm-executor; else → reddit-dm-executor`. Same pattern for `like`, `follow`, `public_reply` (Reddit) vs `public_reply` on LinkedIn (= Comment).
- `public_reply` semantically covers **Reddit public reply** AND **LinkedIn comment**. Document this equivalence in the executor file headers so the verifier/auditor doesn't flag it. Reasoning: both are public, in-thread, post-attached text. Comment-specific UX copy (e.g. character limits) lives in the approval card, gated by `account.platform`.
- `CREDIT_COSTS` in `src/features/billing/lib/types.ts` unchanged — existing keys cover all four:
  - `dm` covers LinkedIn DM (30 credits)
  - `public_reply` covers LinkedIn Comment (15 credits)
  - `like` (0), `follow` (0) already covered
- Follow-up DM routing: cron keeps creating `followup_dm` rows platform-agnostically; worker dispatches by platform.

### Pre-screening cron — dedicated hourly job

- **Endpoint:** `src/app/api/cron/linkedin-prescreen/route.ts` — Bearer + `CRON_SECRET`, service-role Supabase client, correlation ID + `logger.flush()` — same pattern as `zombie-recovery`.
- **Schedule:** hourly in `vercel.json`.
- **Batch size:** up to 50 prospects per run. Claim rows via UPDATE … RETURNING on `pipeline_status='new' AND platform='linkedin'` WHERE last_prescreen_attempt_at IS NULL OR (now() - last_prescreen_attempt_at) > interval '7 days'.
- **Execution host:** pick any healthy LinkedIn account from the user's `social_accounts` with a warmed-up GoLogin profile; open Playwright/CDP session; iterate prospects via `page.goto('/in/{slug}')` and inspect DOM.
- **DOM signals to detect (in priority order):**
  - `security_checkpoint` (URL contains `/checkpoint/`) → abort the whole prescreen run, flag account health, stop
  - 404 or "This profile is unavailable" → `pipeline_status='unreachable'`, reason `profile_unreachable`
  - Creator-mode banner ("Follow" prominent, no Connect button) → `unreachable`, `creator_mode_no_connect`
  - Message-only sidebar (already 1st-degree) → `pipeline_status='connected'`, reason `already_connected`
  - "No invitations remaining this week" banner on account → flag account, pause further prescreen for this account until cooldown
  - Default (Connect button visible) → leave `pipeline_status='new'`, set `last_prescreen_attempt_at=now()`
- **Schema additions (migration 00017):**
  - `prospects.last_prescreen_attempt_at TIMESTAMPTZ` (nullable)
  - `prospects.unreachable_reason TEXT` (nullable; populated when `pipeline_status='unreachable'`)
  - Extend `pipeline_status_type` enum with `'unreachable'` value (check current enum first — may already exist)
- **Not in scope here:** the pre-screen does NOT attempt to infer 2nd-degree vs 3rd-degree, does NOT send any action, and does NOT consume daily limits.

### Comment text generation — Sonnet per-signal with approval

- Extend `src/lib/action-worker/actions/generate-dm.ts` pattern (or add `generate-comment.ts` alongside) — Claude Sonnet 4.6.
- Inputs: post excerpt (stored in `intent_signals.content`), product profile, prospect handle/display name.
- QC rules: 2-3 sentences, ≤1250 chars, no URLs, no explicit pitch (adds value to the thread), grounded in the post.
- Output: `action.content` pre-populated; action enters approval queue with inline edit.
- Executor pastes `action.content` into comment textbox, clicks Post, verifies comment DOM appears.
- `ActionCreditType` key for costing: `public_reply` (existing, 15 credits).

### Approval queue behavior

- **Approval-gated:** `dm` (both platforms), `followup_dm` (both), `public_reply` (both — Reddit reply AND LinkedIn comment)
- **Auto-execute post-warmup:** `like`, `follow` (both platforms), `connection_request` (already decided in Phase 10 as approval-gated — unchanged)
- Approval card is platform-aware via `account.platform` — copy, character-counter, and action labels adapt (e.g. "Post Comment" vs "Post Reply"). Phase 9 already laid the groundwork.

### Daily limits — separate columns per action

- **Migration 00017 (same as prescreen migration):** add to `social_accounts`:
  - `daily_dm_limit INT DEFAULT 8`
  - `daily_follow_limit INT DEFAULT 15`
  - `daily_like_limit INT DEFAULT 25`
  - `daily_comment_limit INT DEFAULT 10` (for `public_reply` on LinkedIn; Reddit may already have a similar column — verify and reuse if so)
- **`action_counts`** — add matching counter columns OR (cleaner) refactor to a single `(action_type, count)` row-per-type. Planner decides based on current schema shape.
- **`checkAndIncrementLimit` in `src/lib/action-worker/limits.ts`** — extend switch to map action_type → limit column name. Signature stays the same; implementation reads the right column per action.
- Platform-aware defaults: Reddit accounts get the Reddit defaults already in place; LinkedIn defaults live on LinkedIn-inserted `social_accounts` rows. If columns are shared, default values apply on the new rows only.

### Warmup gates

- Extend `src/features/accounts/lib/types.ts` `WarmupState.allowedActions` generation (function near line 74). LinkedIn progression:
  - Day 1: `browse`
  - Day 2-3: `browse, like, follow`
  - Day 4-6: `browse, like, follow, public_reply` (= comment), `connection_request`
  - Day 7+: everything above + `dm`, `followup_dm`
- Update `warmup.test.ts` assertions accordingly. Reddit progression unchanged.

### Non-1st-degree DM handling

- LinkedIn DM executor first navigates to `/in/{slug}`, checks for Message button presence.
- If Message button absent → `failure_mode='not_connected'`, action fails, `prospect.pipeline_status` unchanged.
- User sees failure in approval queue; user's path forward is to approve a `connection_request` for that prospect. No auto-swap.
- No InMail / Premium fallback in this phase.

### Failure-mode taxonomy (written into `job_logs.metadata.failure_mode`)

- **linkedin-dm:** `not_connected`, `message_disabled` (Open Profile declined us), `session_expired`, `security_checkpoint`, `weekly_limit_reached` (DM-level), `dialog_never_opened`
- **linkedin-follow:** `follow_premium_gated`, `profile_unreachable`, `session_expired`, `already_following`
- **linkedin-like:** `post_unreachable`, `post_deleted`, `session_expired`, `react_button_missing`
- **linkedin-comment:** `comment_disabled`, `post_unreachable`, `char_limit_exceeded`, `session_expired`, `comment_post_failed`
- **linkedin-prescreen:** `security_checkpoint`, `creator_mode_no_connect`, `profile_unreachable`, `already_connected`
- Health transitions: `security_checkpoint` and `session_expired` → account `health_status='warning'` + NTFY-03 email. `weekly_limit_reached` → `cooldown_until = now() + 24h`, no health change.

## Claude's Discretion (planner/researcher to decide)

- **URL-hack patterns for each action** (research-phase question):
  - DM: is `/messaging/thread/new/?recipient={slug}` reliable as an opener? Does it require the Message button click? Planner + researcher investigate.
  - Follow: does profile `/in/{slug}` Follow button respond to CDP clicks (it may — the anti-bot gate was specific to the Connect flow), or is a URL hack needed?
  - Like / Comment: LinkedIn post URLs take the form `/posts/{authorSlug}_{activityUrn}` or `/feed/update/urn:li:activity:{id}`. Is there a deep-link to the reactions menu or comment box? If not, DOM locators on the post page likely work (only Connect was uniquely gated).
  - If any action truly doesn't work via DOM, fall back to the layered strategy from Phase 10 (land on profile/post page first, then hack URL).
- Whether `action_counts` refactors to a normalized `(user_id, account_id, action_type, day, count)` row-per-type model or stays as wide columns.
- Whether Sonnet comment generation reuses `generate-dm.ts` infra (shared prompt builder) or is a standalone module.
- Migration numbering — next sequential after `00016`.
- `intent_signals.url` / `intent_signals.external_id` population for LinkedIn posts — planner verifies Phase 6 ingests post URNs usable for Like/Comment; if missing, adds a backfill or flags as a dependency.

## Critical files to inspect during planning

- `src/lib/action-worker/actions/linkedin-connect-executor.ts` — template for all four new executors
- `src/lib/action-worker/worker.ts` — dispatch point; add `account.platform` branching
- `src/features/accounts/lib/types.ts` — warmup `allowedActions` (line ~74)
- `src/features/billing/lib/types.ts` — `ActionCreditType` (no changes expected)
- `src/lib/action-worker/limits.ts` — `checkAndIncrementLimit`
- `src/lib/action-worker/expiry.ts` — ensure new action types aren't excluded from expiry by accident
- `supabase/migrations/00014_phase10_linkedin_limits_and_credits.sql` — template for new migration
- `src/app/api/cron/zombie-recovery/route.ts` — cron handler template for prescreen route
- Reddit DM executor + generate-dm module (planner locates during research) — reference for linkedin-dm-executor shape + comment generator

## Verification (end-to-end)

1. **Typecheck + full suite:** `pnpm typecheck && pnpm test` — existing 290 tests stay green; new unit tests per executor cover happy path + each `failure_mode` branch.
2. **Migration:** applied on dev branch `dvmfeswlhlbgzqhtoytl` first; RLS policies re-verified; live_stats + action_counts still queryable.
3. **Live E2E against real LinkedIn targets** (via a warmed LinkedIn account):
   - Send a DM to a confirmed 1st-degree test account → `status=completed`, prospect → `contacted`
   - Attempt DM to a non-1st-degree → `status=failed`, `failure_mode='not_connected'`
   - Follow a public profile → `status=completed`
   - Like a known post URL → `status=completed`, reaction visible in UI
   - Post a comment on a test post → `status=completed`, comment appears
4. **Followup cron:** backdate a prior LinkedIn DM 3 days; trigger cron; observe `followup_dm` row created, approved, and executed via linkedin-dm-executor without any Reddit regressions.
5. **Pre-screen cron:** seed 3 LinkedIn prospects (a normal profile, a Creator-mode profile, an invalid slug) with `pipeline_status='new'`; trigger `/api/cron/linkedin-prescreen`; confirm they land in `new`, `unreachable` (creator_mode), and `unreachable` (profile_unreachable) respectively.
6. **Telemetry:** query `job_logs` by `metadata->>'failure_mode'` and confirm every new failure mode surfaces with correct correlation ID.
7. **UAT per memory feedback:** run `/gsd:verify-work` autonomously; only pause on true blockers.

## Next steps

1. Approve this CONTEXT
2. Run `/gsd:plan-phase 13` — researcher investigates LinkedIn DM/Follow/Like/Comment URL endpoints and DOM structure; planner produces 5 PLAN files per roadmap (13-01 DM, 13-02 Follow, 13-03 Like+Comment, 13-04 Followup DM wiring, 13-05 Prescreen cron)
3. Run `/gsd:execute-phase 13` — wave-based execution
