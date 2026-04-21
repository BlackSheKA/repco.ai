# Phase 12: Trial Auto-Activation + Expiry Reconciliation - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Two tech-debt closures bundled into one phase:

1. **BILL-01 auto-activation** — New signups automatically receive a 3-day free trial (`trial_ends_at` + 500 credits) without visiting `/billing`. Existing users with `trial_ends_at = NULL` get a fresh trial from the deploy date. The manual "Start Trial" CTA and its server action are removed.
2. **ACTN-10 reconciliation** — Specification updated to match code (12h DM expiry). Code behavior unchanged. Boundary test added.

Not in scope: changing trial duration, changing expiry value, adding new billing UI, adding onboarding flows. Existing Phase 5 infrastructure (credit-burn cron, trial badge) is reused as-is.

</domain>

<decisions>
## Implementation Decisions

### Trial activation mechanism
- Extend the existing `handle_new_user()` DB trigger (migration `00004_auth_trigger.sql`) so the trigger also sets `trial_ends_at = NOW() + INTERVAL '3 days'` and `credits_balance = 500` atomically with the user row insert.
- Deliver as a new migration (e.g., `00012_auto_trial.sql`) using `CREATE OR REPLACE FUNCTION public.handle_new_user()` — do not edit `00004` in place.
- Also insert a `credit_transactions` row inside the trigger: `type='monthly_grant'`, `amount=500`, `description='Free trial credits'` — matches existing `startFreeTrial` behavior so the ledger stays consistent.
- Trial duration: **3 days** (unchanged — matches BILL-01 spec).
- No defensive middleware fallback. Trust the trigger's atomicity; if the trigger fails, user creation fails — that surfaces the problem immediately rather than hiding it.

### Backfill of existing users
- Same migration runs a one-time UPDATE: for every user where `trial_ends_at IS NULL AND subscription_active = false`, set `trial_ends_at = NOW() + INTERVAL '3 days'` and `credits_balance = GREATEST(credits_balance, 500)`.
- Skip users with `subscription_active = true` (they already get credits via subscription grants; avoid double-dipping).
- Insert matching `credit_transactions` rows for each backfilled user with `description='Trial backfill'` so the audit trail is preserved.
- Atomic delivery: trigger update + backfill UPDATE + transaction INSERTs all in the same migration file. Reproducible against dev branch before prod.

### ACTN-10 expiry reconciliation
- Code wins: update `REQUIREMENTS.md` ACTN-10 text from "4h" to "12h". No code changes to `create-actions.ts` or `expiry.ts`.
- Only touch `REQUIREMENTS.md`. Do NOT extract to a shared constant, do NOT add a PROJECT.md Key Decisions row (both scoped out to keep blast radius minimal).
- Update `.planning/v1.0-MILESTONE-AUDIT.md` to mark ACTN-10 (row 238) and BILL-01 (row 239) as closed by Phase 12.
- Add a boundary assertion in `src/lib/action-worker/__tests__/expiry.test.ts` that actions at `created_at = now - 11:59h` do NOT expire and actions at `created_at = now - 12:01h` DO expire. Locks the 12h contract so future drift is caught in CI.

### Billing UI cleanup
- Remove the "Start Trial" CTA and `canStartTrial` derivation from `src/app/(app)/billing/page.tsx`.
- Remove the corresponding UI branch in `src/features/billing/components/billing-page-client.tsx`.
- Delete the `startFreeTrial` server action from `src/features/billing/actions/checkout.ts` (no callers once the button is gone; avoids code rot).
- Keep the existing `trialActive` badge at `billing/page.tsx:91` as-is — it already renders correctly whenever `trial_ends_at > now` and just fires for every new user once auto-activation ships.

### Claude's Discretion
- Migration file number (next available — likely `00012` but verify at plan time).
- Exact phrasing of the `credit_transactions.description` field (current text `'Free trial credits'` / `'Trial backfill'` is a suggestion).
- Test structure for the 12h boundary assertion (table-driven vs two `it()` blocks).
- Whether to remove the `canStartTrial` prop type from `billing-page-client.tsx` or leave it unused.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & audit
- `.planning/REQUIREMENTS.md` §Billing BILL-01 and §Action Engine ACTN-10 — the two requirements this phase closes; ACTN-10 text is edited here.
- `.planning/v1.0-MILESTONE-AUDIT.md` lines 108, 116, 238, 239 — the audit rows documenting both gaps; this phase closes them.
- `.planning/ROADMAP.md` §Phase 12 — goal + 3 success criteria.

### Existing code touched
- `supabase/migrations/00004_auth_trigger.sql` — current `handle_new_user()` trigger; new migration replaces this function (do not edit 00004 itself).
- `src/features/billing/actions/checkout.ts` §`startFreeTrial` (lines 86–145) — reference implementation for trial logic; the function itself is deleted in this phase.
- `src/app/api/cron/credit-burn/route.ts` lines 54–73 — credit-burn cron already filters `subscription_active OR trial_ends_at > now`; no change needed, just verify it picks up auto-activated trials.
- `src/features/actions/actions/create-actions.ts` line 146 — 12h expiry literal; no change, but referenced by the spec update.
- `src/lib/action-worker/expiry.ts` line 13 — 12h expiry literal; no change; boundary test added.
- `src/app/(app)/billing/page.tsx` lines 60–74, 110–121, 138 — `trial_ends_at` read + `canStartTrial` derivation + button wiring; CTA branch deleted.
- `src/features/billing/components/billing-page-client.tsx` — contains the CTA wiring referenced above.

### Phase 5 prior context (for trial semantics)
- `.planning/phases/05-billing-onboarding-growth/05-CONTEXT.md` — BILL-01 original decisions and trial/credit semantics.
- `.planning/phases/05-billing-onboarding-growth/05-VERIFICATION.md` — noted the "trial-start UI button deferred" gap this phase fulfils.

### Phase 3 prior context (for expiry history)
- `.planning/phases/03-action-engine/03-09-PLAN.md` and `03-09-SUMMARY.md` — decision to use 12h expiry, internally consistent across `create-actions.ts` and `expiry.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handle_new_user()` trigger (`00004_auth_trigger.sql`): single insertion point for per-user provisioning; extending it keeps trial activation atomic with user row creation.
- `startFreeTrial` server action (`checkout.ts:86`): reference for the exact mutation shape — users UPDATE + credit_transactions INSERT. Logic translated into PL/pgSQL for the trigger.
- Credit-burn cron (`credit-burn/route.ts`): already treats `trial_ends_at > now` as eligibility — zero work needed once trials are populated.
- `trialActive` / `trialExpired` badges on `/billing`: already gated on `trial_ends_at` vs now; continue to work without changes.
- `expiry.test.ts` at `src/lib/action-worker/__tests__/`: existing Vitest suite for action expiry — add the 12h boundary assertion here.

### Established Patterns
- Supabase migrations use sequential numeric prefixes (`00001`–`00011` exist today). Phase 12 adds the next (likely `00012`).
- PL/pgSQL trigger functions use `SECURITY DEFINER SET search_path = ''` (see `00004`); new version preserves this.
- Credit changes are double-entry: `users.credits_balance` + `credit_transactions` row together. Never mutate one without the other.
- Migrations on the `cmkifdwjunojgigrqwnr` prod project are applied via Supabase Management API using `SUPABASE_ACCESS_TOKEN` (see CLAUDE.md) — expect the same delivery path for `00012`.

### Integration Points
- New migration `00012_auto_trial.sql` replaces the body of `handle_new_user()` and runs the backfill UPDATE + INSERTs.
- `REQUIREMENTS.md` edit: change ACTN-10 text (also update traceability table status if applicable).
- `v1.0-MILESTONE-AUDIT.md` edit: mark rows 108/116/238/239 as closed with Phase 12 reference.
- Test file edit: `src/lib/action-worker/__tests__/expiry.test.ts`.
- Deletions: the `startFreeTrial` function in `checkout.ts` and the CTA branch in `billing/page.tsx` + `billing-page-client.tsx`.

</code_context>

<specifics>
## Specific Ideas

- User wants the "most bulletproof" path for trial activation — DB trigger chosen because it is impossible to skip, doesn't depend on Next.js middleware or callback reliability, and ties the grant to the auth.users insert itself.
- Backfill policy leans generous: prior audit showed most existing signups lack `trial_ends_at`, so granting a fresh 3-day trial from deploy date is preferred over retroactive-from-signup (which would give most users an already-expired trial) or doing nothing.
- ACTN-10 pragmatic reconciliation: code behavior has been production for phases and works; the spec is the artifact that drifted. Update the spec, not the code.
- Deliberate minimalism on the 12h reconciliation — no shared constant, no new doc entries, no PROJECT.md log. Keep the blast radius to `REQUIREMENTS.md`, the audit, and one test.

</specifics>

<deferred>
## Deferred Ideas

- Shared `DM_EXPIRY_MS` constant across `create-actions.ts` and `expiry.ts` — nice-to-have but out of scope for this phase.
- Admin tool for manually starting or extending trials (the deleted `startFreeTrial` could be reinstated behind an admin route later) — backlog only, not a future phase.
- Notification/email when a user's trial is about to expire or has just expired — separate notifications work, belongs with Phase 4/5 notifications if/when prioritised.
- Configurable trial duration per user segment (e.g., 7-day trials for referred users) — V2 consideration.
- Extracting trial semantics into a shared library consumed by both the trigger and a hypothetical admin tool — premature abstraction until a second caller exists.

</deferred>

---

*Phase: 12-trial-auto-activation-expiry*
*Context gathered: 2026-04-21*
