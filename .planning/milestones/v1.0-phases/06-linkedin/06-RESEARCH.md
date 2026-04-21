---
phase: 6
slug: linkedin
kind: research
gathered: 2026-04-20
---

# Phase 6: LinkedIn — Research

**Phase goal:** Monitor LinkedIn every 4h via Apify; surface signals in the unified intent feed; route actioned signals through the existing GoLogin + Haiku CU action engine using a two-step connect-then-DM flow.

CONTEXT.md already locks the architecture (Apify + 4h cron, canary smoke test, adapter pattern, two-step outreach, professional headline in cards, enable disabled LinkedIn filter). This document fills the gaps: concrete Apify actor, API integration shape, schema diffs, matcher specifics, dependency isolation, and a Nyquist-ready validation architecture.

---

## 1. Apify Actor Recommendation

### Primary candidates on Apify Store

| Actor | Model | Typical price | Notes |
|-------|-------|---------------|-------|
| `apimaestro/linkedin-post-search-scraper` | Pay-per-result | ~$0.002–$0.005 / post | Keyword + filter support; returns post URL, author, headline, content, reactions; actively maintained by a high-volume publisher |
| `harvestapi/linkedin-post-search` | Pay-per-result | similar | Similar shape; widely referenced in community forums |
| `curious_coder/linkedin-post-search-scraper` | Pay-per-run | lower entry cost | Run-based pricing; cheaper for large batches but higher variance |
| `bebity/linkedin-premium-actor` | Pay-per-result | higher | Premium data (connections, profile depth); overkill for post search |

### Recommendation
**Primary:** `apimaestro/linkedin-post-search-scraper` — pay-per-result is predictable, the vendor is a dedicated Apify actor publisher with multiple LinkedIn actors, and its input schema (searchQuery, filters, maxItems) maps cleanly onto per-keyword runs.
**Fallback:** `harvestapi/linkedin-post-search` — swap via `APIFY_ACTOR_ID` env var. Interfaces are close enough that the adapter only needs a mapping-function swap.

### Rationale
- Pay-per-result protects against the Apify failure mode where a run burns compute with no data returned.
- Both vendors are on Apify's "verified"/high-trust tier (confirm during integration).
- The adapter boundary (`linkedin-adapter.ts`) hides which actor is in use from the ingestion pipeline, so swapping is a config-only change.

### Risk to call out
Apify public actors can change schema or price without notice. Mitigations:
- Normalize at the adapter layer (never store raw Apify output in `intent_signals`).
- Pin actor version via Apify's `build` parameter where possible.
- Canary smoke test (§4) catches silent schema drift too, not just LinkedIn-side failures.

---

## 2. Apify API Integration Shape

### SDK choice
Use `apify-client` npm package (official). On Vercel serverless:
- Per-invocation instantiation (like existing Supabase admin client).
- No long-lived connections to leak.
- Token from `APIFY_API_TOKEN` env var.

### Run lifecycle
Two modes supported by Apify:
1. **Sync run-and-get (`actor.call(...)`)** — blocks until run completes; returns dataset items directly. Timeout configurable (Apify default 300s).
2. **Async start-and-poll** — `actor.start(...)` → poll `run.get()` → fetch dataset when `status === 'SUCCEEDED'`.

### Recommendation: sync mode with a hard cap
- Use `actor.call({ input, timeoutSecs: 120, memoryMbytes: 1024 })`.
- Vercel Pro cron max duration is 300s; monitor-reddit already sets `maxDuration = 60`. For Apify, bump to `maxDuration = 300` on the LinkedIn route.
- If Apify reports `RUNNING` past 120s, abort and treat as failure.

### Result retrieval
```ts
const run = await client.actor(ACTOR_ID).call({ input, timeoutSecs: 120 })
const { items } = await client.dataset(run.defaultDatasetId).listItems()
```

### Error shapes to handle
- Network/timeout → retry (see retry policy, §4).
- `run.status === 'FAILED'` → treat as failure, log `run.id` + `statusMessage`.
- `items.length === 0` AND canary was in the query batch → silent failure (§4).
- Rate limit (429) → exponential backoff; Apify rarely rate-limits single users.

### Per-user execution strategy
Mirror `monitor-reddit/route.ts` loop:
1. For each active user with `signal_type = 'linkedin_keyword'`.
2. Call actor once per keyword (or batch into a single actor call with keyword list if the actor supports it — `apimaestro/linkedin-post-search-scraper` accepts `searchQueries: string[]`, which is much cheaper).
3. Normalize → dedup → freshness filter → upsert into `intent_signals`.
4. Classify pending signals via the shared `classifyPendingSignals` (unchanged).

---

## 3. Data Shape & Schema Changes

### Apify `apimaestro/linkedin-post-search-scraper` output (representative)
```jsonc
{
  "url": "https://www.linkedin.com/posts/jane-smith_ai-activity-...",
  "text": "We're hiring a senior backend engineer …",
  "postedAt": "2026-04-20T08:12:00.000Z",
  "reactions": 42,
  "comments": 7,
  "author": {
    "name": "Jane Smith",
    "headline": "VP Engineering at Acme",
    "company": "Acme Corp",
    "profileUrl": "https://www.linkedin.com/in/jane-smith/",
    "urn": "urn:li:person:abc123"
  },
  "postType": "post", // or "article"
  "contentLanguage": "en"
}
```

### Mapping to `intent_signals`

| intent_signals column | Apify source |
|-----------------------|--------------|
| `platform` | literal `'linkedin'` |
| `post_url` | `url` (normalized, strip `?utm_*` query params) |
| `post_content` | `text` (truncate 500 chars, same as Reddit) |
| `author_handle` | `author.name` (full name, no `u/` prefix) |
| `author_profile_url` | `author.profileUrl` |
| `detected_at` | `postedAt` |
| `subreddit` | NULL (LinkedIn has no subreddit equivalent) |
| `intent_type`, `intent_strength`, `classification_status` | NULL / `'pending'` (classifier fills these) |
| `is_public` | `true` (dashboard `/live` page visibility) |

### Required schema additions
Add migration `00008_phase6_linkedin.sql`:

```sql
-- =============================================================================
-- Migration: 00008_phase6_linkedin.sql
-- Purpose: Extend intent_signals for LinkedIn-specific fields
-- Depends on: 00005_phase2_extensions.sql
-- =============================================================================

ALTER TABLE intent_signals
  ADD COLUMN author_headline text,
  ADD COLUMN author_company text,
  ADD COLUMN post_type text, -- 'post' | 'article' | NULL
  ADD COLUMN apify_run_id text;

COMMENT ON COLUMN intent_signals.author_headline IS 'Professional headline (LinkedIn only; e.g., "VP Engineering at Acme")';
COMMENT ON COLUMN intent_signals.author_company IS 'Author company (LinkedIn only)';
COMMENT ON COLUMN intent_signals.post_type IS 'LinkedIn post type: post or article. NULL for Reddit.';
COMMENT ON COLUMN intent_signals.apify_run_id IS 'Apify run ID for correlation/auditing (LinkedIn only).';
```

No new indexes — existing `(user_id, status)` and `(detected_at DESC)` indexes serve LinkedIn queries as-is.

### Dashboard type extension
`src/features/dashboard/lib/types.ts` (or wherever `IntentSignal` is defined): add optional `author_headline: string | null`, `author_company: string | null`, `post_type: "post" | "article" | null`. Existing Reddit rows have these NULL, which UI handles by hiding the headline row.

### `monitoring_signals` / `signal_source_type`
`signal_source_type` already includes `'linkedin_keyword'` (00001_enums.sql line 37). No enum change needed. Users register LinkedIn keywords via the same monitoring settings page with a platform toggle.

---

## 4. Canary Smoke Test

### Purpose
Apify actors can return `status = SUCCEEDED` with zero items on a variety of silent failures: LinkedIn UI change, actor regression, auth/cookie drift, rate-limiting by LinkedIn. Zero results for a real user's keywords is common and expected; zero results for a universal term is not.

### Canary design
- Hard-coded keyword: `"hiring"` (chosen because the "hiring" hashtag/term is continuously active on LinkedIn in all English-speaking regions; fallback: `"new role"`).
- Run per cron cycle (single extra actor call, not per user).
- Threshold: if the canary call returns `< 3` items, treat the run as a silent failure. (Zero is the hard signal; `< 3` adds a margin for intermittent regressions.)
- Canary cost: ~1 cent per run at pay-per-result actors ⇒ ~$2/month at every-4h cadence.

### Placement in pipeline
1. Cron starts.
2. **First operation:** canary actor call.
3. If canary passes → iterate user keyword runs.
4. If canary fails → skip user runs entirely (don't waste credits), mark job as failed, fire retry/alert.

### Retry + alert flow
- Attempt 1 fails → wait 5 min → retry canary.
- Attempt 2 fails → wait 5 min → retry canary.
- Attempt 3 fails → mark `job_logs` row `status = 'failed'`, metadata `{ silent_failure: true, canary_count: N }`, fire Sentry event with fingerprint `'linkedin_canary_failure'` (dedupes bursts), set a flag used by the staleness banner.

### Staleness banner trigger
UI-SPEC.md §Staleness Banner defines thresholds (>8h stale, >12h failed). Trigger source: `job_logs` row with `job_type = 'monitor'` and `metadata.cron = 'monitor-linkedin'`, filter to most recent `completed` row. Read by a server action or a lightweight `/api/status/linkedin` endpoint surfaced to the dashboard banner.

---

## 5. LinkedIn Matcher Differences

### What stays the same as Reddit
- Claude Sonnet classifier (`sonnet-classifier.ts`) is reused verbatim for ambiguous signals.
- `intent_type`, `intent_strength`, `reasoning`, `suggested_angle` schema.
- The "structural matcher handles 80-90%, Sonnet handles 10-20%" split.

### What differs (new `linkedin-matcher.ts`)
1. **Hashtag normalization**: `#AI`, `#ai`, `#Ai` all normalize to `ai` and match a keyword `ai`. Reddit has no meaningful hashtag convention.
2. **@mention parsing**: `@acme` in post text matches `acme` competitor list. (Reddit does not use `@` mentions.)
3. **Article vs post detection**: LinkedIn long-form articles (`postType === 'article'`) get a bonus to `intent_strength` when they mention a competitor by name — articles indicate higher investment and stronger intent signals.
4. **Post length sensitivity**: LinkedIn posts are typically 200–1500 chars; very short (< 50 chars) posts are usually engagement-farming — flag `ambiguous: true` to force Sonnet review rather than structural match.
5. **No subreddit dimension**: keyword match space is global, not scoped. No equivalent of `searchAll(subreddits, query)` loop — just keyword-per-user actor runs.

### Interface parity
`linkedin-matcher.ts` exports a `match(post: LinkedInPost, config: MonitoringConfig): MatchResult` function returning the same `MatchResult` shape used by `structural-matcher.ts`. The classification pipeline is agnostic to which matcher ran.

---

## 6. Connection Acceptance Detection

### Approach
Connection acceptance is the trigger for queuing the DM draft after the connection request is sent. CONTEXT.md locks the two-step flow but leaves the detection cadence/mechanism to research.

### Recommendation
- **Cadence:** every 6h per active LinkedIn account (aligns with anti-ban pacing).
- **Mechanism:** piggyback on the existing reply-detection pattern (Phase 4). The `check-replies` cron becomes platform-aware and, for LinkedIn accounts, checks the "My Network" / pending-connections view rather than the inbox.
- **Haiku CU action**: "Open My Network → scroll pending invitations → compare against actions with `status='completed'` AND `action_type='connection_request'` where `completed_at < now() - 1h` → emit a list of accepted `prospect_id`s".
- **On acceptance detected**: create a queued `action` row with `action_type='dm'`, `status='pending_approval'`, populated from `suggested_angle` via Claude Sonnet (reuse existing DM generation code path).

### Schema additions for two-step flow
Introduce new action_type value via migration:
```sql
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'connection_request';
```
No change to `action_status_type` — existing `pending_approval → approved → executing → completed` flow is reused.

### Credit-cost mapping
Per CONTEXT.md and Phase 5 decisions: `connection_request` costs 20 credits (same as a DM per existing `get_action_credit_cost` function). Update the SQL function in a later phase-5-billing migration to include `connection_request` in the 20-credit bucket. **For Phase 6, connection requests are unlimited/free if Phase 5 hasn't shipped** — see §7 dependency isolation.

---

## 7. Dependency Isolation (Phase 5 / Phase 3 gaps)

Phase 6 nominally depends on Phase 5 (Billing + Onboarding, not started) and Phase 3 (Action Engine, 3/6 plans complete). Scope Phase 6 to what is actually achievable on the current codebase.

### What Phase 6 MUST own (no external deps)
- Apify adapter + client wrapper.
- Schema migration (`00008_phase6_linkedin.sql`).
- LinkedIn matcher (`linkedin-matcher.ts`).
- Ingestion pipeline fork (`linkedin-ingestion-pipeline.ts`) or extended `ingestion-pipeline.ts` — **recommend a separate file** to keep the Reddit ingestion path stable.
- Cron route `src/app/api/cron/monitor-linkedin/route.ts`.
- Canary smoke test + retry/alert logic.
- Signal card LinkedIn variant + filter-bar enablement (UI-SPEC defines).
- Staleness banner component.
- Job logs integration + Sentry fingerprint.
- Unit + integration tests.

### What Phase 6 DEFERS / STUBS (Phase 3 / Phase 5 gaps)
1. **Connection request execution via Haiku CU** — requires Phase 3's GoLogin + Haiku CU execution pipeline. If Phase 3's `execute-action.ts` does not yet support a `connection_request` action_type at integration time, Phase 6 creates the queued action row and stops there. The approval queue UI shows it; execution is a Phase 3 follow-up. **Add a plan task: "Add `connection_request` action_type handling to Phase 3 execution pipeline (or confirm it already handles new types generically)."**
2. **Credit charging for LinkedIn monitoring + connect actions** — Phase 5 owns credit deduction. Phase 6 instruments credit events (emit to `credit_transactions` table) but does not enforce limits. Limits become live when Phase 5 wires the middleware.
3. **Onboarding wizard for LinkedIn account connection** — Phase 5. Phase 6 assumes a LinkedIn `social_accounts` row exists (manual insert during dev, or surface via existing accounts page if ready).
4. **Connection acceptance detection cron** — introduce as a Phase 6 plan task, but gate Haiku CU inbox navigation behind a feature flag if Phase 3 hasn't shipped the CU harness. Fallback: scheduled stub that logs "not implemented" until Phase 3 ships.

### Explicit assumptions to record in plans
- Assumption 1: Phase 3 execution pipeline will handle `connection_request` without code change OR Phase 6 adds the handler as part of its scope.
- Assumption 2: LinkedIn social account onboarding will be added in Phase 5; Phase 6 ships with manual setup.
- Assumption 3: Credit enforcement is advisory in Phase 6.

### Recommendation: one plan file (per ROADMAP)
Roadmap lists a single `06-01` plan. Keep it. Structure as waves:
- **Wave 1**: schema migration + Apify adapter + matcher (parallel, no dep).
- **Wave 2**: ingestion pipeline + canary + cron route (depends on Wave 1).
- **Wave 3**: UI changes (signal card variant, filter-bar enablement, staleness banner) + tests.
- **Wave 4**: connection acceptance detection scaffold + Phase 3 integration stub.

---

## 8. Validation Architecture

### Test pyramid

| Layer | Coverage |
|-------|----------|
| Unit | Apify client mock, `linkedin-matcher` (hashtag normalization, @mention, article detection), canary threshold logic, URL normalization for dedup |
| Integration | Full ingestion pipeline with fixture Apify response → assert signals upserted; canary failure → assert job logged as failed, no user runs attempted; dedup across two runs with overlapping posts |
| E2E | Cron endpoint invoked with stubbed Apify client → signal appears in `/dashboard` via existing Supabase Realtime; filter-bar LinkedIn filter → only LinkedIn signals visible |

### Critical invariants to validate

1. **Canary zero → no user runs** — if canary returns zero items, user keyword actor calls MUST NOT execute (saves money, avoids propagating silent failures).
2. **Canary failure → alert fired exactly once per sustained outage** — Sentry fingerprint `linkedin_canary_failure` dedupes.
3. **LinkedIn signal in feed has correct badge** — `#0A66C2` LinkedIn badge (not Reddit orange) rendered when `platform === 'linkedin'`.
4. **Dedup by post_url** — re-running the cron within 4h on the same post_url MUST NOT create a duplicate row (UNIQUE constraint + `onConflict: 'post_url', ignoreDuplicates: true`).
5. **Freshness cutoff** — posts older than 48h filtered out (same threshold as Reddit for MVP; revisit if 4h polling produces too-few signals).
6. **Apify run_id captured** — every signal row has non-null `apify_run_id` for auditing.
7. **job_logs row per run** — every cron invocation writes exactly one `job_logs` row with `cron: 'monitor-linkedin'`.
8. **Hashtag normalization** — `#AI` in post matches keyword `ai` (case + hash-prefix insensitive).
9. **Two-step approval row** — actioning a LinkedIn signal creates an `actions` row with `action_type='connection_request'` (not `'dm'`).

### Test data strategy

- Apify response fixtures under `src/features/monitoring/__fixtures__/apify-linkedin/`:
  - `success.json` — 5 sample posts with various shapes (article + post, with/without headline).
  - `canary-success.json` — 10 hiring-related posts.
  - `canary-empty.json` — empty dataset (for silent-failure tests).
  - `schema-drift.json` — missing `author.headline` (test graceful degradation).
- Canary keyword: `"hiring"` (documented constant `LINKEDIN_CANARY_KEYWORD`).
- Mock the `apify-client` module at the adapter boundary — do not hit live Apify in CI.

### Validation script for checker
For Nyquist Dimension 8, plans must include:
- A mock Apify adapter that replays fixture files.
- Tests for each invariant above as a discrete `describe`/`it` block.
- A `pnpm test:phase6` script (or `vitest run src/features/monitoring` filter) that runs the suite.

---

## Open questions / UNKNOWNS (for checker to flag if blocking)

- **Exact Apify actor schema fields** — the schema in §3 is representative, derived from public Apify store descriptions at time of writing; confirm actual field names on first real actor call and adjust adapter mapping. Low risk because normalization happens in the adapter.
- **Apify actor pricing at repco's volume** — needs real numbers once 10–50 users are live. Monitor `apify_run_id` + Apify usage dashboard.
- **LinkedIn inbox navigation feasibility for connection acceptance** — depends on Phase 3 Haiku CU harness maturity. May require Phase 3 work before this ships end-to-end.
- **Freshness cutoff at 48h** — Phase 2 decision; Phase 6 inherits it. Revisit after 2 weeks of live data if signal volume is low.

---

## RESEARCH COMPLETE
