# Phase 13 — LinkedIn Action Expansion: Research

**Researched:** 2026-04-23
**Scope:** Pointer file for the planner. CONTEXT.md already locks decisions; this document resolves the "Claude's Discretion" research questions and indexes the code deltas.
**Confidence:** MEDIUM — schema/worker findings are HIGH (read from code). LinkedIn URL-hack patterns per action are unverified hypotheses; executors must probe at runtime.

## 1. Summary

- The Reddit path is **not** a parallel-shaped executor — it runs through Claude Haiku CU via `executeCUAction(page, prompt)`. Only `linkedin-connect-executor.ts` is a native Playwright executor today. All four new LinkedIn executors must mirror the **linkedin-connect shape**, not look for a "reddit-dm-executor.ts" (it does not exist; `reddit-dm.ts` is only a prompt builder).
- `action_counts` is a **wide** table (`dm_count, engage_count, reply_count, connection_count`) keyed by `(account_id, date)`. Limits live in `social_accounts.daily_*_limit` columns and all dispatch logic lives in one PL/pgSQL function `check_and_increment_limit`. Adding LinkedIn counters = extend both, same pattern as migration 00014.
- `pipeline_status_type` enum currently has `detected, engaged, contacted, replied, converted, rejected, connected`. **It does NOT yet contain `unreachable`** — migration 00017 must `ALTER TYPE ... ADD VALUE 'unreachable'`.
- Next migration number is **00017**. Latest applied is `00016_add_connected_pipeline_status.sql`.
- `intent_signals.post_url` exists and is `UNIQUE NOT NULL`. **There is no `external_id` or post-URN column** — LinkedIn Like/Comment executors must derive the post URN from the URL or the planner must add a column in 00017 if needed for reliable targeting.

## 2. URL-Hack Patterns Per Action

All patterns below are **unverified hypotheses** derived from LinkedIn's observed SPA routing in Phase 10. Each executor must probe during implementation and fall back to the layered pattern from `linkedin-connect-executor.ts` (land on profile/post page first, then DOM-interact) if the deep-link path fails.

### LinkedIn DM (1st-degree)

- **Primary hypothesis:** `https://www.linkedin.com/messaging/thread/new/?recipient={slug}` opens a fresh compose pane. Alternative: navigate to `/in/{slug}` and click the `Message` button (non-Connect DOM — CDP clicks likely work since anti-bot gate was Connect-specific).
- **Pre-flight:** navigate to `/in/{slug}` first to detect 1st-degree (Message button present) vs non-1st-degree (no Message button → `failure_mode='not_connected'`).
- **Selectors to probe:**
  - `button[aria-label*='Message']` (profile) — opener
  - `div[contenteditable='true'][aria-label*='message']` / `.msg-form__contenteditable` — body
  - `button[type='submit'][class*='msg-form__send-button']` or `button:has-text('Send')` within the msg overlay
- **Success signal:** the composed message appears in the thread as the most recent bubble; URL becomes `/messaging/thread/{conversationUrn}/`.
- **Failure signals:** `session_expired` (`/login|/authwall`), `message_disabled` (Message button greyed or opens "This member has limited who can message them" banner), `dialog_never_opened` (compose pane never mounts), `security_checkpoint` (`/checkpoint/`), `weekly_limit_reached` (banner text), `send_button_missing`.
- **Status:** unverified — executor must probe.

### LinkedIn Follow

- **Primary hypothesis:** no URL hack needed. Navigate to `/in/{slug}` and click the Follow button directly — the anti-bot gate in Phase 10 was narrowly observed on the Connect CTA, not on Follow. CDP clicks likely succeed.
- **Pre-flight:** on some profiles Follow is the primary CTA (Creator mode); on others it sits in the overflow `...` menu. Detect both paths.
- **Selectors to probe:**
  - Primary: `main button[aria-label^='Follow']:not([aria-pressed='true'])`
  - Overflow: `button[aria-label='More actions']` → menu → `button:has-text('Follow')`
  - Premium-gated variant: Follow button with a lock/Premium badge → `failure_mode='follow_premium_gated'`
- **Success signal:** button label flips to `Following` / `aria-pressed='true'`.
- **Failure signals:** `follow_premium_gated`, `profile_unreachable`, `session_expired`, `already_following` (already `aria-pressed='true'` on arrival — mark success+noop).
- **Status:** unverified — Connect gate was specific; Follow likely works via DOM.

### LinkedIn React (Like)

- **Primary hypothesis:** DOM-only, no URL hack. `intent_signals.post_url` holds a URL of the form `https://www.linkedin.com/posts/{authorSlug}_{activityUrn}` or `/feed/update/urn:li:activity:{id}`. Navigate directly, then click the React button.
- **URN extraction:** `/activity-(\d+)/` or `urn:li:activity:(\d+)` regex on `post_url`. Stored URL format is NOT guaranteed to contain the URN cleanly — planner should confirm Phase 6 ingestion shape on a sample row during planning.
- **Selectors to probe:**
  - `button.react-button__trigger`, `button[aria-label='React Like']`, or `button:has-text('Like')` scoped to the main post article (NOT any comment or reshare).
  - Scope selector to `main [data-id*='urn:li:activity']` to avoid liking the wrong post on feed-variant layouts.
- **Success signal:** button flips to `aria-pressed='true'` and label changes to `Liked` / reaction icon fills.
- **Failure signals:** `post_unreachable` (404, "This post is no longer available"), `post_deleted`, `session_expired`, `react_button_missing` (post exists but Like CTA absent — unusual, author may have disabled reactions).
- **Status:** unverified — selector scoping is the main risk.

### LinkedIn Comment

- **Primary hypothesis:** DOM-only, same page as Like. Navigate to `post_url`, click the Comment CTA (opens commentbox inline, does not navigate), type into contenteditable, click Post.
- **Selectors to probe:**
  - Opener: `button[aria-label='Comment']` on main post (same scoping risk as Like).
  - Input: `div.ql-editor[contenteditable='true']` inside the comment-composer for the main article.
  - Submit: `button.comments-comment-box__submit-button` or `button:has-text('Post')` within the composer.
- **Fill strategy:** contenteditable — use `page.locator(...).fill()` or `page.evaluate` to set innerText then dispatch `input`. Must verify LinkedIn's Quill editor accepts programmatic input (it may need keyboard events). Plan should include a `page.keyboard.type` fallback.
- **Success signal:** composer clears; the new comment appears as the top/bottom entry in the comment list with the posting account's handle.
- **Failure signals:** `comment_disabled` (author disabled comments — no Comment button), `post_unreachable`, `char_limit_exceeded` (>1250 chars reached executor — generator QC should prevent but defend), `comment_post_failed` (submit clicked, comment never appears in DOM), `session_expired`.
- **Status:** unverified — Quill paste semantics are the main unknown.

## 3. Reference Implementations

Exact shapes to copy:

- **Executor template:** `src/lib/action-worker/actions/linkedin-connect-executor.ts`
  - `extractLinkedInSlug(profileUrlOrSlug)` — regex helper, lines 37–42. Reuse verbatim.
  - `sendLinkedInConnection(page, profileUrl, note)` — full shape lines 51–196. Named-export `sendLinkedInDM`, `followLinkedInProfile`, `likeLinkedInPost`, `commentLinkedInPost` using the same pattern: pre-check (already-done), primary path, post-verify via DOM re-read.
  - Return shape: `{ success, failureMode?, reasoning? }` typed union.
- **Comment / DM text generator:** `src/features/actions/lib/dm-generation.ts`
  - `generateDM` uses `claude-sonnet-4-6` with a SYSTEM_PROMPT + `runQualityControl` (line 1–60 shown; file continues). Mirror this for `generateComment`: same structure, different SYSTEM_PROMPT (2–3 sentences, ≤1250 chars, adds value to thread, no pitch), same `stripDashes` post-process.
  - QC harness lives in `src/features/actions/lib/quality-control.ts` (referenced at line 2). Reuse.
- **Worker dispatch:** `src/lib/action-worker/worker.ts`
  - Reddit DM / Like / Follow go through the Haiku CU path at **lines 267–293** (prompt builder) then **line 331–336** (`executeCUAction`).
  - LinkedIn connection_request branch (the shape to mirror for all four new LinkedIn actions) is **lines 308–329**.
  - LinkedIn-specific post-failure health/cooldown handling: **lines 443–483**. Extend this block for the new failure modes (`security_checkpoint`, `session_expired`, `weekly_limit_reached`, `message_disabled`, etc.).
- **Reddit CU prompt builders (NOT executors):** `src/lib/computer-use/actions/reddit-dm.ts`, `reddit-engage.ts`. Only useful as a structural reference for where prompts originate; LinkedIn deterministic executors replace this layer entirely for the LinkedIn platform.

## 4. Schema Landscape

- **`action_counts` shape:** WIDE (`account_id, date, dm_count, engage_count, reply_count, connection_count`). Composite PK `(account_id, date)`. See `00002_initial_schema.sql:172–179` + `00014_phase10_linkedin_limits_and_credits.sql:20–24`.
  - **Recommendation for planner:** stay wide. The normalized `(action_type, count)` refactor is a bigger change than the phase warrants and would require rewriting `check_and_increment_limit`. Extend the wide table with `follow_count` and `like_count` columns (or reuse `engage_count` for both — Reddit already lumps them there per migration 00014's `IF p_action_type IN ('like', 'follow') THEN v_column := 'engage_count'`).
  - **Decision deferred to planner:** does LinkedIn need separate `follow_count` and `like_count` columns (different daily limits per CONTEXT) or can both share `engage_count`? CONTEXT requires `daily_follow_limit=15` and `daily_like_limit=25` — separate limits → **separate counter columns required**.
  - DM is already shared between `dm` and `followup_dm` at the counter level — no change needed.
- **`pipeline_status_type` enum:** values today = `detected, engaged, contacted, replied, converted, rejected, connected`. **`unreachable` is NOT present** — 00017 must `ALTER TYPE public.pipeline_status_type ADD VALUE IF NOT EXISTS 'unreachable'`.
- **`intent_signals`:** has `post_url TEXT UNIQUE NOT NULL`, `post_content`, `author_handle`, `author_profile_url`. No `external_id`, no `post_urn` column. Planner should inspect a LinkedIn row on dev branch to confirm the stored `post_url` format; if URN is not reliably recoverable via regex, 00017 should add `intent_signals.external_id TEXT` (nullable) + backfill for existing LinkedIn rows.
- **Next migration number: `00017`.**

## 5. Worker Dispatch Delta

File: `src/lib/action-worker/worker.ts`.

Key existing branches and where LinkedIn sub-branches plug in:

| Current branch | Line | Delta |
|---|---|---|
| Navigation gate (LinkedIn connection_request navigates to profile; else Reddit) | 212–247 | Extend `if (account.platform === "linkedin")` to cover all action types — navigate to profile slug for DM/Follow, to `post_url` for Like/Comment. Reddit branch (line 243) unchanged. |
| Prompt builder (Reddit CU only) | 258–293 | Add `else if (account.platform === "linkedin")` guard BEFORE the Reddit builders so no Haiku prompt is constructed for LinkedIn actions. |
| Executor dispatch — the one `if (action.action_type === "connection_request")` branch at **lines 308–329** | 308–336 | Refactor to `if (account.platform === "linkedin")` with an inner switch on `action.action_type`: `dm|followup_dm` → `sendLinkedInDM`, `follow` → `followLinkedInProfile`, `like` → `likeLinkedInPost`, `public_reply` → `commentLinkedInPost`, `connection_request` → existing `sendLinkedInConnection`. Reddit (else branch at line 330) keeps `executeCUAction`. |
| Post-success pipeline_status update | 414–432 | No delta needed — existing logic (`dm → contacted`, `like|follow → engaged`, `connection_request → contacted`) covers new LinkedIn actions correctly. Planner should confirm LinkedIn comment (`public_reply`) → should it be `engaged`? Currently falls through to no update. Add branch if desired. |
| LinkedIn failure-mode → health/cooldown | 443–483 | Extend to cover new failure modes: `security_checkpoint` and `session_expired` already trip health_status=warning (good). Add `message_disabled` as a prospect-level no-op (same as profile_unreachable). `weekly_limit_reached` cooldown logic keeps. |
| Warmup allowlist type cast | 125–131 | The type assertion `as "dm" | "like" | "follow" | "public_reply" | "connection_request"` is a structural item — no delta, but the warmup function must actually return these for LinkedIn (see §6). |
| `job_logs` metadata `failure_mode` guard | 514–517 | Currently only records `failure_mode` for `connection_request`. Broaden to `runPlatform === "linkedin" && runError` so all LinkedIn failure modes land in the taxonomy. |

## 6. Warmup `allowedActions` Delta

File: `src/features/accounts/lib/types.ts`, function `getWarmupState(warmupDay, completedAt)` lines 67–85.

Current behavior is platform-agnostic. The function signature does not receive `platform` — the planner must decide whether to:
- **Option A (minimal):** change nothing; the current progression happens to cover all five actions by day 8, so LinkedIn gets everything eventually. BUT the intermediate gates (Reddit schedule) do not match the CONTEXT spec for LinkedIn (LinkedIn wants `like/follow` on day 2–3, public_reply on day 4–6, dm on day 7+).
- **Option B (recommended):** add a `platform: "reddit" | "linkedin"` parameter. Default to Reddit schedule for back-compat. Plug a LinkedIn branch:

```ts
// LinkedIn progression (per CONTEXT.md)
// Day 1:     browse
// Day 2-3:   browse, like, follow
// Day 4-6:   browse, like, follow, public_reply, connection_request
// Day 7+:    all above + dm, followup_dm  (completed)
```

Caller update needed: `src/lib/action-worker/worker.ts:119–122` currently calls `getWarmupState(account.warmup_day, account.warmup_completed_at)` — add `account.platform` as third arg.

`warmup.test.ts` assertions must be extended with LinkedIn cases. (File location not verified in research budget; planner locates.)

## 7. Cron Pattern (Prescreen Route)

Required elements, derived from `src/app/api/cron/zombie-recovery/route.ts`:

- `export const runtime = "nodejs"` + `export const maxDuration = 30` (bump to 300 for prescreen since Playwright is slow — verify Vercel Pro limits; current `zombie-recovery` has 30).
- Bearer auth: `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` → 401 (line 10–13).
- `correlationId = logger.createCorrelationId()` at top (line 15).
- Service-role Supabase client via `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (lines 24–27) — bypasses RLS.
- All logs include `correlationId` (lines 18–21, 73–77, 109–114, 126–132).
- Final `job_logs` insert with `job_type: "monitor"`, status, duration, metadata (lines 85–96). Planner should use a new `metadata.cron: "linkedin-prescreen"` key.
- `await logger.flush()` **before every return** — success (line 116), error (line 133). This is non-negotiable per CLAUDE.md.
- Return NextResponse.json with machine-readable summary (line 118–123).

Additional for prescreen (per CONTEXT):
- Batch claim via `UPDATE … RETURNING` on prospects with `pipeline_status='new' AND platform='linkedin' AND (last_prescreen_attempt_at IS NULL OR (now() - last_prescreen_attempt_at) > interval '7 days')` LIMIT 50.
- GoLogin session acquisition for one warmed LinkedIn account (healthy + `gologin_profile_id` set).
- Abort-on-checkpoint: if any prospect visit hits `/checkpoint/`, set account `health_status='warning'`, break the loop, flush, return.

## 8. Landmines

1. **Anti-bot gate scope is unverified.** Phase 10 proved the gate applies to the Connect button. We are ASSUMING it does not apply to Message, Follow, Like, Comment buttons. If any of these also ignore CDP clicks, that executor needs its own URL-hack equivalent — and some (Like/Comment) may have no equivalent, forcing Playwright `page.evaluate` synthetic dispatch or accepting the failure. Planner should schedule the 4 executors as **independent tasks** so a single surprise doesn't block the others.
2. **`await logger.flush()` is missing on a return path = silent telemetry loss.** Worker file does NOT call `logger.flush()` at all today (verify in Phase 10 code? — worker uses `logger.info/warn` but relies on Vercel's background flush). The new prescreen cron MUST call it.
3. **RLS:** every new column on `social_accounts`, `action_counts`, `prospects` inherits existing RLS. Adding columns ALTERs don't break RLS but new tables (none planned) would need explicit policies. `unreachable_reason` and `last_prescreen_attempt_at` on `prospects` — double-check that user-scoped read policies cover them (they should, since they apply to the whole row).
4. **Enum strategy: overload of `public_reply`.** CONTEXT decides `public_reply` = Reddit reply AND LinkedIn comment. Future readers will find this confusing. Decision is locked; executor file headers must explicitly document the equivalence (verifier/auditor will flag otherwise).
5. **Single-attempt policy.** Phase 10 established no retry on failure. Preserve for Phase 13 — do NOT add retry loops inside executors. `failure_mode` is the contract; user re-approves if they want another attempt.
6. **CREDIT_COSTS keys reused.** `public_reply=15` covers LinkedIn comment. If a user debates this price later, the key namespace is shared — any change affects Reddit. Planner should add a code-comment in `src/features/billing/lib/types.ts` noting the dual meaning.
7. **Viewport setup.** `linkedin-connect-executor.ts:64` sets 1280x900. All new LinkedIn executors MUST do the same or selectors scoped to specific breakpoints will miss. The function wraps in try/catch — keep that pattern (page may be already sized).
8. **Post URL → URN extraction is fragile.** LinkedIn post URLs come in multiple shapes. If Phase 6 ingestion doesn't guarantee `urn:li:activity:(\d+)` is present, Like/Comment executors cannot always target the right post. Planner MUST inspect a sample row on dev branch before finalizing the Like/Comment plan.
9. **Warmup `getWarmupState` callers are plural.** Adding a `platform` parameter requires every caller to update — worker, tests, any UI components showing warmup state. Grep for `getWarmupState` during planning.
10. **`intent_signals.post_url` is `UNIQUE NOT NULL`.** If Phase 13 ever needs to represent two actions against the same post (e.g. Like + Comment), they share one `intent_signals` row but live as two distinct `actions` rows. This is already the model — just re-state in the plan so executors don't accidentally mutate the signal row.

## 9. Validation Architecture

Per CONTEXT.md failure-mode taxonomy and the repo's `pnpm test` + live-E2E verification strategy.

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest (inferred from existing `*.test.ts` in `src/features/actions/lib/__tests__/`) — planner verifies |
| Quick run | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Full suite | `pnpm typecheck && pnpm test` (existing 290 tests stay green per CONTEXT) |

### Executor failure-mode → validation mapping

| Failure mode | Executor | How it's triggered | How it's validated |
|---|---|---|---|
| `not_connected` | linkedin-dm | Message button absent on profile | Unit test: mock `page.locator(...).isVisible() = false`; assert result shape. E2E: DM a non-1st-degree test account. |
| `message_disabled` | linkedin-dm | Message composer never accepts input or banner present | Unit test on branch; E2E: target with "limited who can message" setting. |
| `session_expired` | all | `/login` or `/authwall` in URL | Unit: mock `page.url()` → `/login`. Applies to all four executors — share a helper. |
| `security_checkpoint` | all + prescreen | `/checkpoint/` in URL | Unit; prescreen integration: abort-on-first, assert account `health_status` flipped. |
| `weekly_limit_reached` | linkedin-dm, linkedin-connect (existing) | Banner regex | Unit test on body text fixture. |
| `dialog_never_opened` | linkedin-dm | Compose pane never mounts after open click | Unit: mock `isVisible({timeout})` false. |
| `follow_premium_gated` | linkedin-follow | Follow CTA has lock/Premium badge | Unit on DOM fixture; manual E2E flag. |
| `already_following` | linkedin-follow | `aria-pressed='true'` on arrival | Unit. |
| `post_unreachable` | like, comment | 404 or "no longer available" | Unit on body fixture; E2E: delete a test post, attempt Like. |
| `post_deleted` | like | Distinct 404 / "removed" copy | Unit. |
| `react_button_missing` | like | Post loads, no React CTA in DOM | Unit. |
| `comment_disabled` | comment | Comment CTA absent / "Comments off" | Unit. |
| `char_limit_exceeded` | comment | Content > 1250 chars reaches executor | Unit (defense-in-depth; generator QC should prevent). |
| `comment_post_failed` | comment | Submit clicked, comment never appears in list | Unit + E2E (the most fragile branch — depends on post-verify DOM read). |
| `profile_unreachable` | all | Profile navigation throws or 404 | Unit + E2E on invalid slug. |
| `creator_mode_no_connect` | prescreen | Follow prominent, no Connect button in DOM | Unit on fixture; E2E on known creator profile. |
| `already_connected` | prescreen | Message sidebar present | Unit; E2E on a 1st-degree test prospect. |

### Per-wave sampling

- **Per task commit:** `pnpm typecheck && pnpm test`
- **Per wave merge:** full suite + one live E2E against the designated LinkedIn test account
- **Phase gate:** CONTEXT §Verification checklist — all 7 steps green, including live DM/Follow/Like/Comment + followup cron + prescreen cron.

### Wave 0 gaps

- [ ] Confirm Vitest is the framework (grep `package.json` "test" script during planning).
- [ ] Create fixtures directory for LinkedIn DOM snippets used by executor unit tests (`src/lib/action-worker/actions/__tests__/fixtures/linkedin-*.html`) — mock DOM strings for each failure-mode branch.
- [ ] `warmup.test.ts` update (location TBD by planner) if Option B (`platform` param) is chosen.
- [ ] Generate-comment unit test + quality-control cases (mirror `dm-generation.test.ts`).
- [ ] Live test account (1st-degree connection to the LinkedIn account being used) must be arranged before phase gate.

## 10. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `/messaging/thread/new/?recipient={slug}` opens a working compose pane | §2 DM | DM executor falls back to profile Message-button click; if that also fails, re-scope to Phase 10's layered hack |
| A2 | Follow / Like / Comment CTAs accept CDP clicks | §2 | Same fallback — may require per-action URL hack; no known alternative for Like/Comment |
| A3 | `intent_signals.post_url` reliably contains `urn:li:activity:\d+` for LinkedIn rows | §4 | Like/Comment can't target; migration 00017 must add `external_id` column + backfill |
| A4 | Vitest is the test framework | §9 | Unit test plans need re-shaping for Jest |
| A5 | Phase 10 anti-bot gate is Connect-button-specific (no broader CDP filter) | §2, §8 | All four executors need URL-hack equivalents; Like/Comment may be unimplementable without manual user intervention |
| A6 | `warmup.test.ts` exists and tests `getWarmupState` | §9 Wave 0 | Plan must include creating the test file |

## 11. Open Questions for Planner

1. **Separate vs shared counter columns** on `action_counts` for LinkedIn `like` and `follow` (CONTEXT wants different daily limits → likely separate). Confirm during migration task.
2. **`public_reply` → `engaged` pipeline_status?** Worker currently doesn't update prospect status on `public_reply`. LinkedIn comment should probably → `engaged`. Verify intent with plan.
3. **Prescreen rate.** CONTEXT says hourly, batch 50. At 50/hour one warmed account visits 1200 profiles/day — comfortably under browse limits but still a lot of Playwright runs. Planner confirms Vercel cron frequency + maxDuration.
4. **Migration split.** CONTEXT says one migration 00017. It'd contain: enum add, 2 prospect columns, 2+ social_account columns, 2+ action_count columns, RPC update. That's a fat migration — acceptable but worth a final sanity check.
5. **Does `getWarmupState` take a `platform` parameter** (Option B §6)? Planner to decide and update all callers.

## Sources

- `c:\Users\kamil\Code\repco.ai\.planning\phases\13-linkedin-action-expansion\13-CONTEXT.md` — phase brief (all locked decisions)
- `c:\Users\kamil\Code\repco.ai\.planning\REQUIREMENTS.md:150–158` — LNKD-01 through LNKD-06
- `c:\Users\kamil\Code\repco.ai\src\lib\action-worker\actions\linkedin-connect-executor.ts:1–196` — executor template
- `c:\Users\kamil\Code\repco.ai\src\lib\action-worker\worker.ts:1–538` — dispatch wiring
- `c:\Users\kamil\Code\repco.ai\src\features\accounts\lib\types.ts:50–85` — warmup state
- `c:\Users\kamil\Code\repco.ai\src\lib\action-worker\limits.ts:1–36` — limit check
- `c:\Users\kamil\Code\repco.ai\src\app\api\cron\zombie-recovery\route.ts:1–140` — cron template
- `c:\Users\kamil\Code\repco.ai\supabase\migrations\00014_phase10_linkedin_limits_and_credits.sql:1–104` — migration template + RPC
- `c:\Users\kamil\Code\repco.ai\supabase\migrations\00001_enums.sql:25` — pipeline_status_type definition
- `c:\Users\kamil\Code\repco.ai\supabase\migrations\00016_add_connected_pipeline_status.sql` — latest migration (next is 00017)
- `c:\Users\kamil\Code\repco.ai\supabase\migrations\00002_initial_schema.sql:101–119, 170–179` — intent_signals and action_counts shapes
- `c:\Users\kamil\Code\repco.ai\src\features\actions\lib\dm-generation.ts:1–60` — Sonnet generation pattern for comment mirror
