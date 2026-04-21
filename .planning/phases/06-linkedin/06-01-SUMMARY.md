---
phase: 06-linkedin
plan: 01
subsystem: monitoring
tags: [linkedin, apify, cron, intent-feed, canary, action-engine, connection-request]

# Dependency graph
requires:
  - phase: 02-reddit-monitoring-intent-feed
    provides: intent-signals pipeline pattern, structural matcher template, cron + job_logs scaffold
  - phase: 03-action-engine
    provides: actions table schema, approval queue, Anthropic client reuse for content drafting
provides:
  - LinkedIn post monitoring via Apify actor (4-hour cron)
  - Canary smoke test for silent-failure detection (<3 results aborts run)
  - LinkedIn structural matcher (hashtag + @mention normalization, article boost)
  - Unified intent-feed variant (blue #0A66C2 badge, professional headline, Connect CTA)
  - Staleness banner at >8h (delayed) / >12h (failed)
  - Two-step LinkedIn outreach: connection_request action_type with <=300-char Sonnet-drafted note
affects: [phase-3-action-engine, phase-5-credit-enforcement]

# Tech tracking
tech-stack:
  added: [vitest, @vitest/ui, happy-dom, @testing-library/react, @testing-library/jest-dom, @vitejs/plugin-react, apify-client]
  patterns:
    - "Canary-gated cron: run smoke-test before user queries; below-threshold aborts run + logs silent_failure=true metadata"
    - "Platform-branched server action (contactSignal -> generateConnectionNote for linkedin, generateDM for reddit)"
    - "UTM-strip URL normalization inside ingestion for robust dedup across share links"
    - "Fixture-based Apify testing (no live API in CI) with schema-drift fixture for graceful degradation"
    - "Vitest infrastructure: happy-dom env, @/ alias via vite resolve, path-mirrored test dir (__tests__)"

key-files:
  created:
    - supabase/migrations/00011_phase6_linkedin.sql
    - src/features/monitoring/lib/linkedin-adapter.ts
    - src/features/monitoring/lib/linkedin-matcher.ts
    - src/features/monitoring/lib/linkedin-ingestion-pipeline.ts
    - src/features/monitoring/lib/linkedin-canary.ts
    - src/app/api/cron/monitor-linkedin/route.ts
    - src/app/api/status/linkedin/route.ts
    - src/features/dashboard/components/staleness-banner.tsx
    - src/features/actions/lib/connection-note-generation.ts
    - src/features/actions/lib/TODO-phase6-connection-request.md
    - vitest.config.ts
    - src/features/monitoring/__fixtures__/apify-linkedin/*.json (4 fixtures)
    - 7 *.test.ts(x) files (26 total test files in suite)
  modified:
    - src/features/monitoring/lib/types.ts
    - src/features/dashboard/lib/types.ts
    - src/features/dashboard/components/signal-card.tsx
    - src/features/dashboard/components/filter-bar.tsx
    - src/features/dashboard/components/signal-feed.tsx
    - src/features/actions/actions/create-actions.ts
    - vercel.json
    - package.json

key-decisions:
  - "Migration renumbered 00008 -> 00011 because 00008-00010 already existed on disk (same rename pattern Phase 5 P01 used)"
  - "Migration applied to dev Supabase branch dvmfeswlhlbgzqhtoytl via Management API (prod NOT touched)"
  - "connection-note-generation.ts is a NEW Sonnet prompt (not a branch in dm-generation.ts) because LinkedIn has different constraints (<=300 chars, professional tone, no CTA) and no QC pipeline is reused"
  - "LinkedIn two-step flow skips auto-approved like/follow engage actions (connection request IS the primary engage) — only connection_request row is created"
  - "Phase 3 executor stub implemented as TODO-phase6-connection-request.md instead of case-arm because execute-action.ts does not yet exist in the codebase"
  - "Intent-feed integration uses existing signal-feed.tsx (plan referenced intent-feed.tsx which does not exist — signal-feed.tsx is the actual feed component)"
  - "StalenessBanner polls /api/status/linkedin every 5 min (not Realtime) — acceptable UX cost; avoids Realtime channel sprawl"
  - "LinkedIn intent_signals bypass classifier pending-flag path initially (ingestion sets classification_status='pending'); shared classifyPendingSignals picks them up post-ingestion like Reddit"

patterns-established:
  - "LinkedIn-specific ingestion mirrors Reddit pipeline contract (runIngestionForUser -> {signalCount, skippedCount}) for cron-loop reuse"
  - "Apify adapter lazy-inits client to avoid hoisted env-var checks; explicit APIFY_API_TOKEN error message"
  - "Canary pattern returns discriminated union ({ok, reason}) so cron can distinguish empty/below_threshold/adapter_error"
  - "Staleness banner self-returns null when healthy (component mounts unconditionally) — keeps parent markup flat"

requirements-completed: [MNTR-02]

# Metrics
duration: 45min
completed: 2026-04-21
---

# Phase 6 Plan 1: LinkedIn Monitoring + Intent Feed Integration Summary

**End-to-end LinkedIn monitoring via Apify (4h cron with canary gate + silent-failure detection) feeding the unified intent feed with #0A66C2 badge, professional headline, and a two-step Connect CTA that queues a connection_request action with a <=300-char Sonnet-drafted note.**

## Performance

- **Duration:** ~45 min (across 11 atomic commits)
- **Tasks:** 11 (Wave 0 + Waves 1a/1b/1c + Waves 2a/2b/2c + Waves 3a/3b/3c + Wave 4)
- **Files created:** 20 source + test + fixture files
- **Files modified:** 8
- **Migration:** 00011_phase6_linkedin.sql (applied to dev Supabase branch)

## Accomplishments

- LinkedIn posts land in the unified intent feed within 4h of posting (Vercel cron `0 */4 * * *`), each tagged with the #0A66C2 LinkedIn badge, author headline, and apify_run_id for audit.
- Silent-failure detection: canary query (`"hiring"` keyword, min 3 results) runs before any user queries; on failure, Sentry alert fires with fingerprint `linkedin_canary_failure` and the run aborts without polluting user feeds.
- LinkedIn-specific structural matcher normalizes hashtags (`#AI` -> `ai`), parses `@competitor` mentions, and boosts intent_strength for article posts referencing competitors.
- 48h freshness gate + `post_url` unique constraint prevents stale/duplicate signals.
- "Connect" CTA on LinkedIn signals creates a `connection_request` action (new enum value) with a Sonnet-drafted <=300-char connection note, marks signal as `actioned`, and skips the auto-approved like/follow engage pair (LinkedIn is single-step to approval).
- Dashboard staleness banner appears above filter bar when the last LinkedIn cron success was >8h ago (delayed copy) or >12h ago (failed copy) with `role="status" aria-live="polite"`.
- Filter bar LinkedIn option unlocked (Tooltip wrapper + disabled prop removed).
- Vitest infrastructure bootstrapped: 26 test files, 145 tests passing, happy-dom env, `@/` alias resolved.

## Task Commits

1. **Wave 0 — Vitest + Apify fixtures** — `3e033e2` (chore)
2. **Wave 1a — Migration 00011 schema** — `3c28bad` (feat)
3. **Wave 1b — Apify adapter + types** — `c597d7c` (feat)
4. **Wave 1c — LinkedIn matcher** — `6bc02d1` (feat)
5. **Wave 2a — Canary smoke test** — `0d886c3` (feat)
6. **Wave 2b — Ingestion pipeline** — `21bb931` (feat)
7. **Wave 2c — Cron + status endpoint + vercel.json** — `c5b807d` (feat)
8. **Wave 3a — Signal-card LinkedIn variant** — `19b0cd9` (feat)
9. **Wave 3b — Filter-bar LinkedIn enable** — `023bab3` (feat)
10. **Wave 3c — Staleness banner + integration** — `4b4dee0` (feat)
11. **Wave 4 — Connect CTA wiring (connection_request)** — `eb98346` (feat)

**Plan metadata:** pending final `docs(06-01)` commit covering this SUMMARY + STATE + ROADMAP.

## Files Created/Modified

### Database
- `supabase/migrations/00011_phase6_linkedin.sql` — LinkedIn columns on `intent_signals` (author_headline, author_company, post_type, apify_run_id) + `action_type` enum extension (`connection_request`). Applied to dev Supabase branch `dvmfeswlhlbgzqhtoytl` via Management API.

### Monitoring pipeline
- `src/features/monitoring/lib/linkedin-adapter.ts` — Apify client wrapper with lazy init + explicit APIFY_API_TOKEN error
- `src/features/monitoring/lib/linkedin-matcher.ts` — Hashtag/mention-aware structural matcher
- `src/features/monitoring/lib/linkedin-ingestion-pipeline.ts` — UTM-stripping dedup + 48h freshness + signal upsert with `ignoreDuplicates`
- `src/features/monitoring/lib/linkedin-canary.ts` — Smoke test returning discriminated union (ok/below_threshold/empty/adapter_error)
- `src/features/monitoring/lib/types.ts` — Added `LinkedInPost` + `LinkedInSearchResult` interfaces

### API routes
- `src/app/api/cron/monitor-linkedin/route.ts` — 4-hour cron with canary gate, Sentry fingerprint on failure, 300s maxDuration, job_logs row per run
- `src/app/api/status/linkedin/route.ts` — Auth-gated endpoint returning `{lastSuccessAt, hoursAgo}` from job_logs

### UI
- `src/features/dashboard/lib/types.ts` — Added `author_headline`, `author_company`, `post_type`, `apify_run_id` to `IntentSignal`
- `src/features/dashboard/components/signal-card.tsx` — Platform-branched badge + author row + CTA labels ("Connect"/"View on LinkedIn")
- `src/features/dashboard/components/filter-bar.tsx` — Removed Tooltip wrapper + disabled prop from LinkedIn SelectItem
- `src/features/dashboard/components/staleness-banner.tsx` — Client component polling `/api/status/linkedin` every 5 min; amber warning at >8h/12h thresholds
- `src/features/dashboard/components/signal-feed.tsx` — Mounts `<StalenessBanner />` above filter bar

### Action engine
- `src/features/actions/lib/connection-note-generation.ts` — Sonnet 4.6 prompt for <=300-char professional connection notes with em-dash stripping
- `src/features/actions/actions/create-actions.ts` — Branch on `signal.platform === "linkedin"`: inserts `action_type: 'connection_request'`, `status: 'pending_approval'`, skips like/follow engage actions
- `src/features/actions/lib/TODO-phase6-connection-request.md` — Phase 3 executor integration TODO (execute-action.ts switch case deferred to Phase 3 Haiku CU harness)

### Config / infra
- `vitest.config.ts` — happy-dom env, `@/` alias, React plugin
- `vercel.json` — Added `/api/cron/monitor-linkedin` at `0 */4 * * *`
- `package.json` — Added `vitest`, `apify-client`, testing-library peers, `test` + `test:watch` scripts

### Fixtures (test-only)
- `src/features/monitoring/__fixtures__/apify-linkedin/success.json` (5 posts)
- `.../canary-success.json` (10 posts)
- `.../canary-empty.json` (0 posts)
- `.../schema-drift.json` (2 posts with null headline/postType)

### Tests (7 new files, 26 total, 145 passing)
- `linkedin-adapter.test.ts`
- `linkedin-matcher.test.ts`
- `linkedin-canary.test.ts`
- `linkedin-ingestion.test.ts`
- `monitor-linkedin/route.test.ts`
- `staleness-banner.test.tsx`
- (plus all pre-existing Reddit/dashboard/sequences/billing tests still green)

## Decisions Made

See `key-decisions` frontmatter above. Notable:

1. **Migration 00011 instead of plan-specified 00008** — 00008/00009/00010 already existed from prior phases. Renumbered following the same pattern Phase 5 P01 used (plan said 00007, became 00010).
2. **Migration applied to dev only** — Per CLAUDE.md critical rule; prod migration is a manual operator task post-review.
3. **connection-note-generation.ts as standalone file** — The dm-generation.ts QC pipeline (URL/price/post-reference rules) doesn't apply to connection notes (which MUST reference the post and have no hard CTA). Separate file with its own <=300-char validator is cleaner than a mega-branch.
4. **TODO.md instead of case arm** — The plan allowed either; since `execute-action.ts` doesn't exist yet (Phase 3 ships the CU harness), the TODO file is the correct integration point.
5. **StalenessBanner mounts in `signal-feed.tsx` not `intent-feed.tsx`** — The plan's interface block referenced `intent-feed.tsx` but the actual codebase feed component is `signal-feed.tsx`. Integrated into the actual file; key-links semantic intent preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration number collision (00008 -> 00011)**
- **Found during:** Wave 1a
- **Issue:** Plan specified `00008_phase6_linkedin.sql` but migrations 00008/00009/00010 already exist on disk from prior phases.
- **Fix:** Renumbered to `00011_phase6_linkedin.sql`; added header comment explaining the rename. Applied to dev Supabase branch via Management API.
- **Files modified:** `supabase/migrations/00011_phase6_linkedin.sql` (new path)
- **Verification:** `ls supabase/migrations/` shows 00011 at end of sequence; `\d intent_signals` on dev branch confirms 4 new columns + `connection_request` enum value.
- **Committed in:** `3c28bad`

**2. [Rule 3 - Blocking] Banner integration path (`intent-feed.tsx` -> `signal-feed.tsx`)**
- **Found during:** Wave 3c
- **Issue:** Plan's key_links and task action reference `src/features/dashboard/components/intent-feed.tsx` which does not exist in the codebase. The actual feed component is `signal-feed.tsx`.
- **Fix:** Imported `StalenessBanner` into `signal-feed.tsx` instead; behavior identical.
- **Files modified:** `src/features/dashboard/components/signal-feed.tsx`
- **Verification:** Grep `StalenessBanner` in `signal-feed.tsx` returns 2 hits (import + JSX); staleness-banner.test.tsx passes.
- **Committed in:** `4b4dee0`

---

**Total deviations:** 2 auto-fixed (2 blocking).
**Impact on plan:** Both deviations are naming/numbering mismatches between the plan and the actual codebase state at execution time — no scope change, no architectural shift.

## Issues Encountered

None — all tasks executed in order, all verifications passed first try, no retry cycles needed on pre-commit hooks.

## Test Results

- **Full suite:** 26 test files, 145 tests, all passing (duration 8.83s)
- **Typecheck:** `pnpm typecheck` exits 0 (clean output)
- **LinkedIn-specific tests:** 5 files (adapter, matcher, canary, ingestion, cron route) + staleness-banner = ~35 new tests, all passing

## Deferred Items (RESEARCH §7 dependency isolation)

The following are explicit out-of-scope for Phase 6 P01:

1. **Connection acceptance detection cron** — Polls LinkedIn inbox to transition `prospects.pipeline_status` from `connected_pending` -> `connected` once the invitation is accepted. Depends on Phase 3 Haiku computer-use harness stabilizing first. Tracked in `TODO-phase6-connection-request.md`.
2. **LinkedIn credit enforcement** — Phase 5 owns the `get_action_credit_cost` SQL function; adding `connection_request: 20 credits` per BILL-06 is a Phase 5 (or Phase 6 follow-up) task. Phase 6 P01 is credit-neutral.
3. **LinkedIn account onboarding wizard** — Connecting a LinkedIn account (OAuth + cookies + GoLogin profile provisioning) flows through Phase 5's onboarding wizard. Phase 6 P01 assumes the account already exists in `social_accounts`.
4. **Phase 3 executor case-arm** — `case "connection_request"` in `execute-action.ts` does not exist because the file itself ships in Phase 3. TODO-phase6-connection-request.md documents the exact integration steps.

## User Setup Required

**External service required.** User must:

1. Create an Apify account and generate an API token with Actor-run + Dataset-read scopes.
2. Set env vars: `APIFY_API_TOKEN`, `APIFY_ACTOR_ID` (default: `apimaestro~linkedin-post-search-scraper`).
3. Set `CRON_SECRET` for the monitor-linkedin cron auth (same shared secret as monitor-reddit).

See PLAN.md `user_setup:` frontmatter for full details. User-setup file generation is deferred — will be incorporated into the phase-level USER-SETUP.md if one is generated later.

## Next Phase Readiness

**Phase 6 Plan 1 is the only plan in Phase 6.** With this SUMMARY, Phase 6 is functionally complete for the MNTR-02 requirement.

Follow-up candidates (own phases/plans, NOT blockers):

- Phase 3 executor `case "connection_request"` arm (once Haiku CU harness proves stable on Reddit DMs)
- LinkedIn credit enforcement in `get_action_credit_cost` (Phase 5 or a Phase 6 P02)
- Connection acceptance detection cron (new plan after Phase 3 CU stabilizes)
- LinkedIn onboarding wizard (Phase 5 extension)

No blockers for subsequent phases.

## Self-Check: PASSED

Verified:

- All 11 task commits land on `main` (git log --grep="06-01" returns 11 results).
- `supabase/migrations/00011_phase6_linkedin.sql` exists with `ALTER TABLE intent_signals` + `connection_request` enum.
- `src/features/monitoring/lib/linkedin-adapter.ts`, `linkedin-matcher.ts`, `linkedin-canary.ts`, `linkedin-ingestion-pipeline.ts` all exist.
- `src/app/api/cron/monitor-linkedin/route.ts` + `src/app/api/status/linkedin/route.ts` exist.
- `src/features/dashboard/components/staleness-banner.tsx` exists and is imported by `signal-feed.tsx`.
- `src/features/actions/lib/connection-note-generation.ts` + `TODO-phase6-connection-request.md` exist.
- `src/features/actions/actions/create-actions.ts` contains `'connection_request'` and `signal.platform === "linkedin"` branch.
- `vercel.json` contains `/api/cron/monitor-linkedin` at `0 */4 * * *`.
- `pnpm vitest run` exits 0 with 145/145 passing across 26 files.
- `pnpm typecheck` exits 0.
- No modifications to `supabase/migrations/00006_phase3_action_engine.sql` or `get_action_credit_cost` SQL function (credit-neutral per Phase 5 boundary).

---
*Phase: 06-linkedin*
*Completed: 2026-04-21*
