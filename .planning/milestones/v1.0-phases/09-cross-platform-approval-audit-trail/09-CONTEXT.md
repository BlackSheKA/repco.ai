# Phase 9: Cross-Platform Approval + Action Audit Trail - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Two gap closures in existing code only:

1. **APRV-01 cross-platform rendering** — `approval-card.tsx` currently hardcodes Reddit orange badge + `r/{subreddit}` label + `u/{author}` prefix regardless of `signal.platform`. LinkedIn approvals show the wrong badge and `r/null`. Fix the card to render platform-correct badge, source row, and author prefix based on `signal.platform`.
2. **OBSV-01 action audit trail** — `worker.ts` inserts `job_logs` rows using non-existent columns `details` and `correlation_id`. PostgREST silently drops unknown columns, so no action row ever lands in `job_logs`. Fix the insert to use schema-valid columns (`metadata jsonb`, FK `action_id`, `user_id`, `started_at`, `finished_at`, `duration_ms`, `error`) and broaden coverage so early failure paths also log.

**Out of scope:** building `connection_request` executor arm (Phase 10), adding new platforms beyond Reddit/LinkedIn, redesigning approval card layout, adding RLS/schema migrations, adding new job_logs columns, populating `live_stats` (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Badge + source label (approval-card.tsx)

- **Reddit badge:** unchanged — solid `#FF4500` background, white text, label `Reddit`.
- **LinkedIn badge:** solid `#0A66C2` (LinkedIn brand blue), white text, label `LinkedIn`. Mirrors Reddit's brand-color approach for instant recognition in the approval queue.
- **Source label row:**
  - Reddit: unchanged — `r/{signal.subreddit}` span (only when `subreddit` exists).
  - LinkedIn: omit the subreddit span entirely. No subreddit equivalent and no other source label is shown — cleaner than `r/null` or synthetic stand-ins.
- **Author prefix (`u/{author}` today):**
  - Reddit: unchanged — `u/{author}`.
  - LinkedIn: bare `{author}` (no prefix). Matches each platform's native display convention.
- **Switch structure:** inline platform switch local to `approval-card.tsx`. Small map of `{ badgeClass, label, authorPrefix }` keyed by `signal.platform`, applied at render time. No extraction to `components/ui/PlatformBadge` and no central `lib/platforms.ts` — smallest blast radius for a bug-fix phase; extraction can happen later if more call sites need it.
- **`aria-label` on the card:** unchanged (`DM draft for ${author}`); platform is visible in the badge.

### job_logs row shape (worker.ts)

- **FK columns set:** both `action_id` (references actions) AND `user_id` (references users). Existing RLS policy on `job_logs` reads `user_id = auth.uid()` so user-facing audit queries require `user_id`; `action_id` enables direct action→log lookup for forensics.
- **metadata JSONB contents:** include all four —
  - `correlation_id` (string) — required for Sentry/Axiom tracing.
  - `platform` (`"reddit" | "linkedin"`) — slice success rate by platform without joining.
  - `action_type` (`"dm" | "like" | "follow" | "public_reply" | "followup_dm" | "connection_request"`) — slice by type without joining.
  - `cu_steps` (integer) + `screenshot_count` (integer) — stuck-detection forensics. Set only on paths that actually invoked CU; omit for early-failure rows.
- **`status` (job_status_type):** `completed` on CU success, `failed` on CU failure OR any earlier fault. No other enum values used from this worker.
- **`error` column:** write error text to the top-level `error text` column for failed rows. Keep metadata free of error duplication. Matches existing cron pattern.
- **`duration_ms`:** wall-clock from just after `claimAction` returns successfully, to just before the `job_logs` insert runs. Includes anti-ban delay, GoLogin connect, CU execution, screenshot upload, status update. Matches the operational question "how long did this action take from our side?"
- **`started_at` / `finished_at`:** both set explicitly in code as ISO strings (`new Date(startMs).toISOString()` / `new Date(finishMs).toISOString()`). Deterministic, and `duration_ms` math lines up with the column values exactly. Do NOT rely on the `DEFAULT now()` default for `started_at` — avoids clock skew vs. code-side `Date.now()`.

### Failure logging coverage (worker.ts)

- **Early failure paths that MUST write a `job_logs` row (all `status: "failed"`):**
  - No GoLogin profile on account (current: returns early, no log)
  - Warmup gate block — `action_type` not in `allowedActions` for current warmup day
  - Target isolation block — another account already owns the prospect
  - Daily limit reached — per-account cap hit
  - GoLogin connect failure (currently logs via `updateActionStatus` but not `job_logs`)
- **Re-queue path (outside active hours):** do NOT write `job_logs`. Action is being deferred (status set back to `approved`) and will retry later; that later run will log. Logging each deferral would flood `job_logs` on off-hour accounts without adding signal, and would pollute `status: completed/failed` rate math used by OBSV-04.
- **Structural placement:** wrap the pipeline from `claimAction` onward in `try { ... } finally { ... }`. The `finally` block reads shared state (accumulated via local `let` variables mutated along the pipeline: `runStatus`, `runError`, `cuSteps`, `screenshotCount`, `platform`, `actionType`, `userId`) and performs exactly ONE `job_logs` insert per run. Refactor early `return` statements to set the shared state and break out of the `try`, not return directly. Claim failures still return before the try block (no row was claimed → no run to log).

### Claude's Discretion
- Exact local type for the shared pipeline state object (plain object vs. class vs. closure captures).
- Whether the platform switch in `approval-card.tsx` is an inline `const platformMeta = signal.platform === "linkedin" ? {...} : {...}` or a small `Record<string, {...}>` lookup.
- How to reconcile the duration math when the `finally` block runs after a thrown exception that bypassed the `startMs` assignment (defensive: initialize `startMs = Date.now()` before the `try`).
- Whether to add a `linkedin_color` CSS variable in `globals.css` or inline the hex. Inline hex is simpler for a bug-fix phase.
- Test approach (unit vs. integration vs. manual) for the `job_logs` insert — project has no test framework configured yet (per CLAUDE.md). If tests are written, placement/framework is Claude's choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/REQUIREMENTS.md` §Approval Queue — APRV-01 cross-platform display requirement
- `.planning/REQUIREMENTS.md` §Observability — OBSV-01 action execution logging requirement
- `.planning/ROADMAP.md` §"Phase 9: Cross-Platform Approval + Action Audit Trail" — goal, depends on, success criteria
- `.planning/v1.0-MILESTONE-AUDIT.md` §integration."approval-card.tsx — hardcoded Reddit badge" — audit evidence for APRV-01 gap
- `.planning/v1.0-MILESTONE-AUDIT.md` §integration."worker.ts — job_logs wrong column names" — audit evidence for OBSV-01 gap

### Existing code paths to modify
- `src/features/actions/components/approval-card.tsx` — hardcoded Reddit rendering; platform switch goes here
- `src/features/actions/lib/types.ts` §`ApprovalCardData.signal.platform` — already `string`, already consumed in realtime path
- `src/features/actions/lib/use-realtime-approvals.ts` §L37 — already maps `platform` into `ApprovalCardData`; no change needed
- `src/lib/action-worker/worker.ts` §L292-L299 — broken `job_logs` insert; also every early `return` path before it
- `src/lib/logger.ts` — correlation ID helper + Sentry/Axiom wiring (read for patterns; not modified)

### Schema
- `supabase/migrations/00002_initial_schema.sql` §"11. job_logs" — authoritative column list: `id, job_type, status, user_id, action_id, started_at, finished_at, duration_ms, error, metadata jsonb`
- `supabase/migrations/00003_rls_policies.sql` §"job_logs" — SELECT policy keys off `user_id = auth.uid()`; service_role writes

### Cron pattern to mirror
- `src/app/api/cron/zombie-recovery/route.ts` — canonical `job_logs` insert shape (started_at / finished_at / duration_ms / status / metadata.correlation_id)
- `CLAUDE.md` §"Cron Route Pattern" — the 5-step pattern; applies here to the worker's log-write discipline

### Follow-on phase pointer
- `src/features/actions/lib/TODO-phase6-connection-request.md` — LinkedIn executor arm (Phase 10 scope; NOT this phase). Phase 9 only fixes rendering of the already-created `connection_request` approval rows and ensures the attempted execution is logged even if it fails at the warmup gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `signal.platform: string` already present on `ApprovalCardData` — no type work needed to branch rendering.
- `use-realtime-approvals.ts` L37 already maps `platform` from `prospects.platform` — the data arrives at the card.
- `src/lib/logger.ts` + correlation IDs — already wired through worker's Sentry/Axiom path.
- Service role Supabase client in `worker.ts` (`createServiceClient`) — unchanged; keep insert on this client.

### Established Patterns
- Brand-color badges (Reddit `#FF4500`) — LinkedIn `#0A66C2` follows the same pattern.
- Cron `job_logs` inserts (zombie-recovery, digest, credit-burn, refresh-live-stats in Phase 8) — structured `{ job_type, status, started_at, finished_at, duration_ms, metadata: { correlation_id, ... } }`. Action runs adopt the same shape but also set `action_id` + `user_id`.
- Single-insert-per-run discipline via try/finally — new for the worker, but matches how each cron writes exactly one row per invocation.

### Integration Points
- `approval-card.tsx` is the only consumer affected for APRV-01. Intent-feed signal cards (`signal-card.tsx`) already render platform correctly (per audit note at tech_debt §02).
- `worker.ts` is the only writer affected for OBSV-01. Other `job_logs` writers (crons) are already schema-valid.
- OBSV-04 threshold alerts read from `job_logs` status distribution — fixing the worker restores the input to those alerts (currently action rows never reach the calculation).

</code_context>

<specifics>
## Specific Ideas

- LinkedIn brand blue `#0A66C2` is the publicly documented LinkedIn brand color; use the exact hex (no opacity hover variant needed — mirror existing Reddit badge's `/90` hover).
- When platform=linkedin, the card should feel "quiet where Reddit is loud" — no `r/{sub}` row, no `u/` prefix. The badge alone signals the platform.
- The `try/finally` refactor should preserve every existing `updateActionStatus(...)` call — those write to the `actions` table and are independent of `job_logs`. Don't collapse them.

</specifics>

<deferred>
## Deferred Ideas

- Reusable `<PlatformBadge />` component — only worth extracting when a third platform lands or the card pattern duplicates to prospect/feed cards.
- `cu_duration_ms` / `connect_duration_ms` as separate metadata fields — useful for perf work but not needed for the audit-trail fix.
- OBSV-04 re-calibration after the worker starts writing real data — may reveal the 80%/5% thresholds need adjustment; track separately.
- Realtime UX for re-queued "outside active hours" actions (e.g., surfacing "deferred until 8am user-local" in approval queue) — different scope.

</deferred>

---

*Phase: 09-cross-platform-approval-audit-trail*
*Context gathered: 2026-04-21*
