# Phase 10: LinkedIn Outreach Execution - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver end-to-end LinkedIn Connect execution for a repco user: connect a LinkedIn account via GoLogin Cloud, approve a drafted `connection_request`, and have the worker drive the request through Playwright + Haiku Computer Use until LinkedIn's "Pending" state confirms the invitation was sent.

**In scope:**

- Close ONBR-05 — LinkedIn account connection via existing 3-step `ConnectionFlow` with minor platform-aware copy changes.
- Close Phase 6 tech debt around LinkedIn type safety — extend `ActionType` TS union, `ActionCreditType` + `CREDIT_COSTS`, `WarmupState.allowedActions` with `connection_request`.
- Build the worker executor arm for `connection_request` (navigation, Connect/More dropdown discovery, 300-char note paste, send, "Pending"-state verification).
- Wire warmup gate, daily limit counter (new column), credit cost, prospect pipeline update, and LinkedIn-specific failure handling.
- Inherit Phase 9 deliverables — platform-correct approval card rendering and schema-valid `job_logs` writes.

**Out of scope:**

- Connection **acceptance** detection (pending → accepted transition). Separate cron/poller; defer to a future phase.
- Post-acceptance DM auto-generation (LinkedIn DM sequence equivalent of Reddit DM flow).
- Retries on failure. Single attempt per approval; user re-approves if they want to retry.
- A/B testing note variants; autopilot mode (no approval).
- Apify-sourced `profile_url` reliability audit — assume Phase 6 already stores a usable URL; handle null-fallback only.
- New `sent` action_status_type enum value — `completed` is reused.
- Weekly per-account invitation cap tracking — daily cap (20) is the only throttle this phase adds.

</domain>

<decisions>
## Implementation Decisions

### Warmup + daily limits + credits

- **Warmup gate — `connection_request` allowed from day 4+** (same threshold as Reddit `like`/`follow`). Days 1–3 for LinkedIn = browse only (feed/profile viewing via Haiku). LinkedIn has no "like/follow" ceremony to fill those intermediate days, so day-4 onwards is the primary-action gate. Extend `WarmupState.allowedActions` union type to include `connection_request`; return it in the day-4+ bucket. Reddit accounts (platform=reddit) never see `connection_request` as allowed — `allowedActions` is gated off the account platform OR it's added only to day-4 bucket and safe because only LinkedIn actions of that type are ever created for LinkedIn accounts. Planner chooses the cleanest gating shape.
- **Daily limit — new `daily_connection_limit integer DEFAULT 20` column** on `social_accounts` (migration). Add a corresponding `connection_count` counter on `action_counts` and track via `checkAndIncrementLimit`. Cap of 20/day stays well below LinkedIn's ~100-pending-invites soft cap even over a rolling week; randomized delays (Phase 3 `ABAN-03`) spread them.
- **Credit cost — 20 credits per BILL-06.** Extend `ActionCreditType` union to include `connection_request`. Add `connection_request: 20` to `CREDIT_COSTS`. Also extend `get_action_credit_cost` SQL helper (migration) so server-side credit math agrees with TS constant.
- **Weekly cap — deferred.** Daily cap is the only throttle. Add rolling 7-day tracking only if we observe LinkedIn rate-limit failures in production. Tracked in `<deferred>`.

### Worker executor (CU + navigation)

- **Navigation — direct `page.goto(prospect.profile_url)`** is the primary path. Falls back to search-by-handle only if `profile_url` is null. Requires `prospects.profile_url` to be populated during Phase 6 ingestion (verify in plan; seed during creation if gap found).
- **Handle format — LinkedIn profile slug** (e.g., `john-doe-abc123`, the last path segment of `/in/{slug}`). Stored in `prospects.handle`. Parsed from `profile_url` if not already in that shape at ingestion time. Reply matching (and normalize-at-compare-boundary per Phase 7 pattern) uses this slug directly — no `u/`-style prefix for LinkedIn.
- **Connect button — two-step instructions in the CU prompt:** "Find the Connect button. If visible directly on the profile header, click it. If not visible, click the 'More' dropdown and select Connect from the menu." Handles both A/B placements within the 15-step budget.
- **"Add a note" — always use this path.** CU prompt: "After the Connect dialog opens, click 'Add a note'. Paste this exact note (≤300 chars): {{drafted_content}}. Click Send." Personalization is the whole point of LinkedIn outreach; the "Send without note" fallback is NOT used (even if a newer LinkedIn UI variant offers it, the prompt still instructs Add-a-note first).
- **Already-connected detection — abort `failed` with error `already_connected`.** CU prompt includes: "If you see a 'Message' button where 'Connect' would be, the user is already a 1st-degree connection. Stop and report 'already_connected'." Worker sets `action.status='failed'`, `error='already_connected'`, AND sets `prospect.pipeline_status='connected'` (they ARE connected, just not by us this run).
- **Success verification — wait for "Pending" button state** (or modal dismiss + "Invitation sent" toast). CU prompt: "After Send, verify the button changed to 'Pending' OR a confirmation toast appeared. That screenshot is the proof." Last captured screenshot is uploaded as the verification artifact via existing `uploadScreenshot`.
- **Prompt file location — `src/lib/computer-use/actions/linkedin-connect.ts`** exporting `getLinkedInConnectPrompt(profileSlug, note, displayName?)`. Mirrors `reddit-dm.ts` pattern. Worker executor `case "connection_request"` arm imports from here.

### Action + prospect status after success

- **Action status — `completed`** (NOT a new `sent` enum value). Keep the existing `action_status_type` enum unchanged; no migration. Treat the roadmap's "pending_approval → sent" phrasing in success criterion #6 as shorthand for the current `completed` semantics. Document this equivalence clearly in the phase so the verifier doesn't flag it.
- **Prospect pipeline_status — `contacted`** after successful send. Reuses Reddit DM semantics ("we reached out"). No new `connected_pending` enum value. When LinkedIn acceptance detection lands later, it will transition the same row from `contacted` → `replied` (or a new enum value at that time).
- **Prospect pipeline_status — `connected`** when `already_connected` is detected during execution. Exception: acknowledges the actual relationship even though the request didn't fire.
- **Acceptance detection — out of scope.** Phase 10 ends at "request sent (Pending state observed)". Future phase builds the poller. Captured in `<deferred>`.
- **Post-acceptance DM — out of scope.** The LinkedIn DM sequence (first DM after they accept) is a separate phase; Phase 10 does not define that contract.

### LinkedIn account connect UX (existing `connection-flow.tsx`)

- **Reuse the existing 3-step `ConnectionFlow` component** for LinkedIn — same structure, same `startAccountBrowser`/`verifyAccountSession` server actions (both already platform-agnostic).
- **Platform-aware copy**: the hardcoded `"Checking Reddit login status"` at `connection-flow.tsx:215` becomes `Checking ${platformLabel} login status` where `platformLabel` derives from `account.platform`. No other copy changes required for parity.
- **2FA/security-verification guidance** — add a single sentence to step-1 copy: "If LinkedIn asks for 2FA or email verification, complete it in the remote browser." Non-LinkedIn-specific enough that it can live behind a platform-conditional block or be shown generically.
- **Session verification trust** — same user-asserted pattern as Reddit (no CDP inspection). `session_verified_at` gets set; first real action (this phase's `connection_request`) naturally exposes a broken login via CU failure detection, which will transition account health to `warning`.

### LinkedIn-specific failure handling

- **Failure modes the worker explicitly detects and tags in `error`:**
  - `security_checkpoint` — LinkedIn risk-score verification page. CU detects from screenshot (URL `linkedin.com/checkpoint/...` or specific headline). Sets account `health_status='warning'` + sends NTFY-03 email.
  - `session_expired` — Redirect to `/login` mid-navigation. Sets account `health_status='warning'` + sends NTFY-03 email.
  - `weekly_limit_reached` — "You've reached the weekly invitation limit" banner. Sets account `cooldown_until = now() + 24h` (does NOT transition health to warning — this is expected LinkedIn throttling, not an account issue).
  - `profile_unreachable` — `profile_url` 404 or "This profile is unavailable". No health change; action fails; prospect is flagged for manual review.
  - `already_connected` — Message button present where Connect would be. No health change; action fails; prospect pipeline transitions to `connected`.
- **Retry policy — no automatic retry.** Single attempt per approval. Failed rows visible to user in approval queue failure state; user re-approves to retry (creates a fresh action row, subject to daily cap + warmup gate).
- **Error surface in `action.error` column** (Phase 9 pattern) + mirror the failure reason in `job_logs.error`. Include the failure reason enum value in `job_logs.metadata.failure_mode` for ops slicing.

### Claude's Discretion

- Whether `daily_connection_limit` + `connection_count` fit into the existing `checkAndIncrementLimit` helper signature cleanly or need a small refactor.
- Exact migration numbering (next sequential after current latest) and whether the enum + column additions go in one migration or split.
- How strictly the CU prompt encodes the "More dropdown" path — prompt wording tuning may need a round of manual testing.
- The specific wording of LinkedIn-specific prompt text in `ConnectionFlow` (platform-aware copy) — small UX polish decisions that don't affect behavior.
- Whether to share `ACCOUNT_LOGIN_URLS` as a cross-file constant or leave it in `account-actions.ts` only.
- Playwright viewport/timeouts specific to LinkedIn (Reddit defaults likely work; planner verifies during implementation).
- Noise-injection strategy for LinkedIn (ABAN-04) — reuse Reddit noise prompts or introduce LinkedIn-specific ones (feed scroll, profile views). Default = reuse existing pattern; add LinkedIn variants only if initial runs look robotic.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/REQUIREMENTS.md` §Onboarding — ONBR-05 LinkedIn GoLogin connection
- `.planning/REQUIREMENTS.md` §Action Engine — ACTN-01, ACTN-05 (auto-approved engage + executor pipeline)
- `.planning/REQUIREMENTS.md` §Monitoring — MNTR-02 LinkedIn monitoring context (already complete)
- `.planning/REQUIREMENTS.md` §Billing BILL-06 — LinkedIn connect credit cost (20)
- `.planning/REQUIREMENTS.md` §Anti-Ban ABAN-01…ABAN-07 — account-level rules this phase inherits
- `.planning/REQUIREMENTS.md` §Account Management ACCT-01…ACCT-04 — connect flow + health state
- `.planning/REQUIREMENTS.md` §Notifications NTFY-03 — account warning email path (used by security_checkpoint/session_expired)
- `.planning/ROADMAP.md` §"Phase 10: LinkedIn Outreach Execution" — goal, depends on (Phase 6 + Phase 9), 6 success criteria
- `.planning/v1.0-MILESTONE-AUDIT.md` §requirements.ONBR-05 + §integration."connection_request — executor arm missing" — audit evidence

### Existing code this phase modifies
- `src/features/actions/lib/types.ts` §`ActionType` union — add `connection_request`
- `src/features/billing/lib/types.ts` §`ActionCreditType` + `CREDIT_COSTS` — add `connection_request: 20`
- `src/features/accounts/lib/types.ts` §`WarmupState.allowedActions` + `getWarmupState()` — permit `connection_request` at day 4+
- `src/features/accounts/components/connection-flow.tsx` L215 — platform-aware "Checking … login status" copy; optional 2FA sentence in step 1
- `src/lib/action-worker/worker.ts` — add `case "connection_request"` arm; LinkedIn failure-mode detection; pipeline_status update; LinkedIn-aware warmup gate (platform inferred from account); invoke new prompt
- `src/features/actions/lib/TODO-phase6-connection-request.md` — remove (scope closed) or mark complete

### New files to create
- `src/lib/computer-use/actions/linkedin-connect.ts` — `getLinkedInConnectPrompt(profileSlug, note, displayName?)`
- New migration — `daily_connection_limit` column on `social_accounts`; `connection_count` on `action_counts`; extend `get_action_credit_cost` SQL helper for `connection_request`

### Existing code to read (NOT modify)
- `src/features/accounts/actions/account-actions.ts` — `connectAccount`, `startAccountBrowser`, `stopAccountBrowser`, `verifyAccountSession` (already multi-platform)
- `src/lib/gologin/client.ts` + `src/lib/gologin/adapter.ts` — profile create + CDP connect; reused for LinkedIn unchanged
- `src/lib/computer-use/executor.ts` — Haiku CU loop; reused (15-step cap, stuck detection)
- `src/lib/computer-use/actions/reddit-dm.ts` — pattern reference for the new LinkedIn prompt
- `src/features/actions/lib/connection-note-generation.ts` — already produces ≤300 char notes; used as `drafted_content` source
- `src/features/actions/actions/create-actions.ts` L45, L141 — already branches on platform and inserts `connection_request` rows
- `supabase/migrations/00011_phase6_linkedin.sql` — source of the enum value; do not re-add
- `src/lib/action-worker/claim.ts`, `target-isolation.ts`, `limits.ts`, `delays.ts`, `noise.ts` — existing anti-ban helpers; inherit unchanged (limits helper may need a small signature tweak for the new counter)

### Cross-phase patterns
- Phase 9 `09-CONTEXT.md` — platform-aware approval card + `job_logs` insert shape (Phase 10 inherits both)
- Phase 4/7 handle-normalization pattern (`src/features/sequences/lib/reply-matching.ts` once normalized) — for future LinkedIn reply matching; Phase 10 only needs to STORE slugs consistently

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConnectionFlow` 3-step component is already platform-agnostic except one copy line.
- `connectAccount(platform, handle)` already creates per-platform GoLogin profiles with platform-specific login URL.
- `startAccountBrowser`/`stopAccountBrowser`/`verifyAccountSession` work unchanged for LinkedIn.
- `getWarmupState`, `checkAndIncrementLimit`, `checkAndAssignTarget`, `randomDelay`/`sleep`, `isWithinActiveHours`, `shouldInjectNoise`/`generateNoiseActions`, `connectToProfile`/`disconnectProfile`, `executeCUAction`, `uploadScreenshot` — all compose as-is.
- `generateConnectionNote` (Phase 6) already produces ≤300 char notes → written to `action.drafted_content` → pasted in the Add-a-note step.
- `create-actions.ts` already routes LinkedIn signals to `connection_request` rows (no auto-approve engage like Reddit — confirmed).
- Platform-aware approval card (Phase 9) renders `connection_request` rows correctly in the approval queue.

### Established Patterns
- Prompt-per-action: `reddit-dm.ts`, `reddit-engage.ts` (like/follow) → new `linkedin-connect.ts` follows the same shape.
- `updateActionStatus(supabase, actionId, status, error)` writes to `actions` table; stays separate from `job_logs` insert (Phase 9 pattern).
- Prospect pipeline_status transitions on action outcome in the worker (DM→contacted, like/follow→engaged).
- LinkedIn-specific failures → `health_status='warning'` + NTFY-03 email (mirrors Reddit ban warning) vs. `cooldown_until` for expected-throttling cases.

### Integration Points
- Worker warmup gate: `warmup.allowedActions.includes(action.action_type as ...)` — currently cast-typed to Reddit actions only. Extend union (required) or change the cast (required either way).
- Credit deduction: `getActionCreditCost(action.action_type as ActionCreditType)` — cast currently excludes `connection_request`; updating the TS type closes the type gap AND the credit math simultaneously.
- Platform inference: `account.platform` ('reddit'|'linkedin') already on `SocialAccount`; use this rather than inferring from action_type for the executor-arm branch + warmup gate.
- `action_counts` table: adding a counter column requires migration + index review; `checkAndIncrementLimit` internal SQL likely has Reddit-column hardcoding to generalize.
- Onboarding checklist (Phase 5): surfaces "connect LinkedIn" card when no LinkedIn account exists — already platform-aware per account list logic.

</code_context>

<specifics>
## Specific Ideas

- "LinkedIn Connect with a note is the only flow that works — the 'Send without note' variant has far worse acceptance rates."
- The approval card user experience for LinkedIn should feel the same as Reddit — the user doesn't care about the mechanism, just that repco sent a relevant message. Platform badge + note preview + approve = done.
- LinkedIn's "More → Connect" A/B test is real and has been rolling for 18+ months; the prompt MUST handle both placements.
- `profile_url` from Apify scraping in Phase 6 is the source of truth for navigation — do not rebuild from handle unless missing.

</specifics>

<deferred>
## Deferred Ideas

- **Connection acceptance detection cron** (poll My Network or inbox for new 1st-degree connections) — transitions `contacted` → `replied` or introduces `connected`/`accepted` enum value. Its own phase.
- **Post-acceptance LinkedIn DM sequence** — first DM after acceptance, analogous to Reddit DM. Separate phase.
- **Weekly per-account invitation cap tracking** (LinkedIn's ~100-pending soft cap) — add only if daily cap + random distribution proves insufficient.
- **Auto-retry on transient failure modes** (session_expired, checkpoint after resolution) — add if manual re-approval friction becomes a UX complaint.
- **LinkedIn-specific behavioral noise prompts** (feed scroll, profile views) — current reuse of Reddit noise is fine until CU runs look robotic.
- **Removing the `TODO-phase6-connection-request.md` placeholder file** — delete or mark complete when Phase 10 ships; tracked here so it's not forgotten.
- **LinkedIn onboarding-first flow** — users who sign up to do LinkedIn outreach instead of Reddit; out of scope for this phase but worth noting for onboarding UX work.

</deferred>

---

*Phase: 10-linkedin-outreach-execution*
*Context gathered: 2026-04-21*
