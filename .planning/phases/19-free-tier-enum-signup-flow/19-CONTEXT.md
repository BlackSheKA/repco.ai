# Phase 19: Free Tier ENUM + Signup Flow — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

New users land on a `free` plan with 250 credits and no trial countdown. The `handle_new_user` trigger atomically writes user row + free credits + audit transaction; a parallel anti-abuse audit captures email + IP combinations. Phase 19 introduces the new plan/cycle schema and per-plan credit columns, but defers cleanup of legacy trial fields and refactor of cron/UI consumers to Phase 21.

Maps requirements: PRIC-04, PRIC-05, PRIC-14.

</domain>

<decisions>
## Implementation Decisions

### Tier schema model (PRICING.md two-axis)

- **D-01:** New ENUM `subscription_plan` with values `free`, `pro`. Replaces the never-implemented `subscription_tier` ENUM that ROADMAP/REQ wording referenced.
- **D-02:** New ENUM `billing_cycle` with values `monthly`, `annual`. `users.billing_cycle` is nullable for `free` plan, NOT NULL for `pro`. Quarterly tier is deliberately dropped (PRICING.md §11 commits to 2 Stripe prices only).
- **D-03:** REQUIREMENTS.md PRIC-04 and PRIC-14 are rewritten in this phase to use the new column names (`subscription_plan`, `billing_cycle`) so traceability stays accurate. ROADMAP Phase 19 success-criteria wording is updated too.

### Per-plan credit columns

- **D-04:** `users.credits_included_monthly` and `users.credits_balance_cap` are new NOT NULL columns populated by trigger / Stripe webhook. No JOIN-based lookup table — values live denormalized on the user row per PRIC-14.
- **D-05:** Source of truth for plan defaults is a TS const `PLAN_CONFIG` in `src/features/billing/lib/plan-config.ts`: `{ free: { grant: 250, cap: 500 }, pro: { grant: 2000, cap: 4000 } }`. Stripe webhook handler and any UI tier displays import from this const. The DB trigger uses the literal values 250/500 (free defaults) since it has no application-layer access.
- **D-06:** Migration backfills all existing test users to `subscription_plan='free'`, `billing_cycle=NULL`, `credits_balance_cap=500`, `credits_included_monthly=250`. Test data only — Phase 20 wipes them anyway.

### Signup trigger rewrite

- **D-07:** `handle_new_user` is replaced (NOT amended) to insert: user row with `subscription_plan='free'`, `credits_balance=250`, `credits_balance_cap=500`, `credits_included_monthly=250`, `trial_ends_at=NULL`. Followed by `credit_transactions` audit row of type `monthly_grant`, amount 250, description `Free tier signup grant`. Single transaction (atomic).
- **D-08:** No `startFreeTrial` server action exists in current codebase — codebase already matches PRIC-05 wording. Phase 19 documents this absence and verifies no equivalent code (no trial-activation flow under a different name) needs deletion.

### Anti-abuse: email + IP capture

- **D-09:** Client IP reaches the trigger via `auth.users.raw_user_meta_data->>'ip'`. Frontend signup server action reads `x-forwarded-for` from Next.js `headers()` and passes it as `data.ip` in the `supabase.auth.signUp({ options: { data: { ip } } })` call. For Google OAuth signup (no pre-signup server action), the `/auth/callback` handler captures IP from request headers and writes a follow-up `signup_audit` row keyed on the just-created `auth.users.id`.
- **D-10:** New table `signup_audit (id uuid pk, user_id uuid fk, email_normalized text, ip inet, duplicate_flag boolean, created_at timestamptz)` with RLS. Trigger inserts one row per signup. `email_normalized` lowercases + strips Gmail dots and `+` aliases (so `kamil.wandtke+x@gmail.com` and `kamilwandtke@gmail.com` collide).
- **D-11:** On duplicate `(email_normalized, ip)` hit: signup proceeds normally (250 cr granted), audit row is inserted with `duplicate_flag=true`. Manual review via SQL on the audit table. No hard reject — protects legitimate shared-IP users (office WiFi, family network) pre-launch. Reasoning: false-positive cost > false-negative cost while we have zero real users.

### Legacy field cleanup scope

- **D-12:** Phase 19 keeps `trial_ends_at`, `subscription_active`, `billing_period` columns in place (nullable). The new trigger sets `trial_ends_at=NULL`, `subscription_active=false`, `billing_period=NULL`. Existing consumers (`/api/cron/credit-burn`, `/api/cron/digest`, `/billing` page, Stripe webhook) are NOT refactored in this phase — they continue to read legacy fields and behave as today.
- **D-13:** Phase 21 owns: refactoring the 4 callsites to read `subscription_plan='pro'`, dropping legacy columns, rewriting Stripe webhook for the new 2-price model. Phase 19 only adds; Phase 21 removes.

### Claude's Discretion

- Migration filename + ordering inside the migration (recommend ENUM creation → user column adds → backfill UPDATE → trigger replace → signup_audit table → RLS policies).
- Email normalization helper: standalone Postgres function `public.normalize_email(text)` invoked by trigger and by any TS code that needs the same key.
- RLS policy on `signup_audit` (suggest: service role only; users cannot read their own audit row to avoid signal leakage).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pricing & free tier model
- `.planning/PRICING.md` §2 — Free + Pro plan table with grants and caps (250/500, 2000/4000)
- `.planning/PRICING.md` §3 — Free tier scope (1 account, 2 mechanisms, ≥4h cadence, 0 outbound)
- `.planning/PRICING.md` §11 Faza B — DB schema target (subscription_plan, billing_cycle ENUMs)
- `.planning/PRICING.md` §3 Anti-abuse — "1 free tier per email + IP, sprawdzane w handle_new_user trigger"

### Roadmap & requirements
- `.planning/ROADMAP.md` Phase 19 success criteria — must reword to match `subscription_plan` (D-03)
- `.planning/REQUIREMENTS.md` PRIC-04, PRIC-05, PRIC-14 — rewrite in this phase (D-03)

### Existing schema being replaced/extended
- `supabase/migrations/00015_auto_trial.sql` — current `handle_new_user` body that this phase replaces
- `supabase/migrations/00010_phase5_billing_onboarding.sql` — defines legacy `trial_ends_at`, `subscription_active`, `credits_balance`, `credit_transactions`
- `supabase/migrations/00004_auth_trigger.sql` — `on_auth_user_created` trigger wiring (function body changes only)

### Cross-phase coordination
- Phase 16 — `mechanism_costs.free_tier_allowed` flag (already locked); Phase 19 doesn't touch it
- Phase 20 — wipes `auth.users`; Phase 19's backfill of legacy users is therefore safe
- Phase 21 — refactors legacy field consumers + Stripe products; Phase 19 leaves that work for it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `supabase/migrations/00015_auto_trial.sql` — exact pattern for `CREATE OR REPLACE FUNCTION handle_new_user()` with `SECURITY DEFINER SET search_path = ''` and atomic user + credit_transactions insert. New trigger body follows the same shape.
- `src/features/billing/` — already houses billing logic; add `lib/plan-config.ts` here.
- `lib/supabase/middleware.ts` — Next.js `headers()` access pattern for the IP capture work.

### Established patterns
- Sequential migration numbering (`00001_` … `00024_mechanism_costs.sql`); next migration is `00025_`.
- ENUMs centralized in `00001_enums.sql`. New ENUMs (`subscription_plan`, `billing_cycle`) added in this phase's migration, not retrofitted into 00001.
- Atomic write pattern: user row + credit_transactions row in one trigger body (see 00015).
- RLS on every new table — `signup_audit` follows suit.

### Integration points
- Trigger fires on `auth.users` INSERT (wired in 00004) — body is the only thing changing.
- Frontend signup server action(s) under `src/features/auth/` (or `src/app/(auth)/`) — must pass `{ ip }` in `signUp` options.
- `/auth/callback/route.ts` — must capture IP for OAuth signups and upsert `signup_audit`.
- Stripe webhook (`src/app/api/stripe/webhook/route.ts`) — Phase 19 does NOT modify this; Phase 21 will switch it to read `PLAN_CONFIG`.

</code_context>

<specifics>
## Specific Ideas

- Email normalization rule (D-10): lowercase, then if domain ∈ {gmail.com, googlemail.com}, strip dots from local part and drop everything from `+` onward. Other domains: lowercase only. Mirrors Gmail's actual delivery behavior.
- IP column type is `inet` (Postgres native), not `text` — gives free index efficiency and IPv6 support without code changes.
- `credit_transactions` description for free signup: `Free tier signup grant` (consistent with the existing "Free trial credits" wording style from 00015).

</specifics>

<deferred>
## Deferred Ideas

- **Refactor cron + billing UI to read `subscription_plan`** → Phase 21 (PRIC-06..10). Phase 19 leaves legacy `subscription_active`/`trial_ends_at` reads working as-is.
- **Drop legacy columns** (`trial_ends_at`, `subscription_active`, `billing_period`) → Phase 21 after consumers refactored.
- **Stripe webhook 2-price refactor** → Phase 21 (PRIC-09).
- **Free tier hard caps enforcement** (1 account, 2 mechanisms, ≥4h cadence, 0 outbound) → Phase 21 (PRIC-06, PRIC-07).
- **Browser fingerprint anti-abuse** (PRICING.md §3 mentions gologin metadata fingerprint) → not in PRIC-14; deferred as v1.3 idea.
- **Hard-reject duplicate email+IP** → revisit post-launch if abuse is observed (currently audit-only per D-11).

</deferred>

---

*Phase: 19-free-tier-enum-signup-flow*
*Context gathered: 2026-04-27*
