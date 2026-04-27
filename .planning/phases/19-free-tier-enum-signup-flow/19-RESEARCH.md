# Phase 19: Free Tier ENUM + Signup Flow — Research

**Researched:** 2026-04-27
**Domain:** Postgres ENUMs + auth trigger + Next.js 16 server actions (Supabase Auth)
**Confidence:** HIGH

## Summary

Phase 19 is a backend/schema-only phase covering PRIC-04, PRIC-05, PRIC-14. It introduces two new ENUMs (`subscription_plan`, `billing_cycle`), four new `users` columns or column-overrides (`subscription_plan`, `billing_cycle`, `credits_balance_cap`, `credits_included_monthly`), a rewritten `handle_new_user` trigger that grants 250 cr on free signup with no trial, and a new `signup_audit` table that captures `(email_normalized, ip)` per signup for anti-abuse review. No new UI is added (UI-SPEC is a passthrough).

Two surprises worth flagging upfront:
1. The "old" `subscription_tier` ENUM that ROADMAP/PRIC-04/CONTEXT-D-01 talk about **does not exist** in the database. The actually-existing legacy ENUM is `billing_period_type` (`monthly`/`quarterly`/`annual`) used by `users.billing_period`. The phase therefore drops nothing in the DB — it only adds new ENUMs/columns; legacy `billing_period_type` and `billing_period` column are owned by Phase 21 cleanup. [VERIFIED: grep of all migrations 00001–00024]
2. `users.credits_included_monthly` already exists from `00002_initial_schema.sql` with `DEFAULT 500`. The new migration must `ALTER COLUMN ... SET DEFAULT 250` and backfill, not `ADD COLUMN`. [VERIFIED: 00002_initial_schema.sql:18]

**Primary recommendation:** Single migration `00025_phase19_free_tier_signup.sql` ordered as: (1) new ENUMs → (2) `users` column adds + default change → (3) backfill UPDATE → (4) `normalize_email()` SQL function → (5) `signup_audit` table + RLS → (6) `CREATE OR REPLACE FUNCTION handle_new_user` body replacement. Trigger DDL itself is unchanged (already wired in 00004).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** New ENUM `subscription_plan` with values `free`, `pro`. Replaces the never-implemented `subscription_tier` ENUM that ROADMAP/REQ wording referenced.
- **D-02:** New ENUM `billing_cycle` with values `monthly`, `annual`. `users.billing_cycle` is nullable for `free`, NOT NULL for `pro`. Quarterly tier is deliberately dropped (PRICING.md §11 commits to 2 Stripe prices only).
- **D-03:** REQUIREMENTS.md PRIC-04 and PRIC-14 are rewritten in this phase to use the new column names; ROADMAP Phase 19 success-criteria wording also updated.
- **D-04:** `users.credits_included_monthly` and `users.credits_balance_cap` are new NOT NULL columns populated by trigger / Stripe webhook. No JOIN-based lookup table.
- **D-05:** Source of truth for plan defaults is a TS const `PLAN_CONFIG` in `src/features/billing/lib/plan-config.ts`: `{ free: { grant: 250, cap: 500 }, pro: { grant: 2000, cap: 4000 } }`. Trigger uses literal 250/500.
- **D-06:** Migration backfills all existing test users to `subscription_plan='free'`, `billing_cycle=NULL`, `credits_balance_cap=500`, `credits_included_monthly=250`.
- **D-07:** `handle_new_user` is replaced (NOT amended). Single transaction (atomic): user row + 250 credits + `credit_transactions` audit row of type `monthly_grant`, amount 250, description `Free tier signup grant`. `trial_ends_at=NULL`.
- **D-08:** No `startFreeTrial` server action exists in current codebase — verified absent.
- **D-09:** Client IP reaches the trigger via `auth.users.raw_user_meta_data->>'ip'`. Frontend signup server action reads `x-forwarded-for` and passes as `data.ip` in `supabase.auth.signUp({ options: { data: { ip } } })`. For Google OAuth, `/auth/callback` handler captures IP and writes follow-up `signup_audit` row.
- **D-10:** New table `signup_audit (id, user_id, email_normalized, ip inet, duplicate_flag, created_at)` with RLS. Trigger inserts one row per signup. Email normalization: lowercase + strip Gmail dots and `+` aliases.
- **D-11:** On duplicate `(email_normalized, ip)` hit: signup proceeds normally (250 cr granted), audit row is inserted with `duplicate_flag=true`. No hard reject pre-launch.
- **D-12:** Phase 19 keeps `trial_ends_at`, `subscription_active`, `billing_period` columns in place (nullable). New trigger sets `trial_ends_at=NULL`, `subscription_active=false`, `billing_period=NULL`. Cron + UI consumers NOT refactored in this phase.
- **D-13:** Phase 21 owns refactor + drop of legacy columns and Stripe webhook.

### Claude's Discretion
- Migration filename + statement ordering inside the migration.
- Email normalization: standalone Postgres function `public.normalize_email(text)` invoked by trigger and by any TS code needing the same key.
- RLS policy on `signup_audit`: service role only; users cannot read their own audit row.

### Deferred Ideas (OUT OF SCOPE)
- Refactor cron + billing UI to read `subscription_plan` → Phase 21.
- Drop legacy columns (`trial_ends_at`, `subscription_active`, `billing_period`) → Phase 21.
- Stripe webhook 2-price refactor → Phase 21.
- Free tier hard caps enforcement (1 account, 2 mechanisms, ≥4h cadence, 0 outbound) → Phase 21.
- Browser fingerprint anti-abuse → v1.3.
- Hard-reject duplicate email+IP → post-launch revisit.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRIC-04 | New ENUMs `subscription_plan` (`free`\|`pro`) + `billing_cycle` (`monthly`\|`annual`); `users.subscription_plan` (default `free`), `users.billing_cycle` (nullable for free, NOT NULL for pro). | Stack §"ENUM creation pattern", Migration sequence §"Recommended ordering", Pitfall §"NOT NULL conditional". `subscription_tier` does not exist as a DB ENUM today — wording in PRIC-04 is doc-level only. [VERIFIED: grep all migrations] |
| PRIC-05 | `handle_new_user` trigger updated — new signups get `subscription_plan='free'` + 250 cr balance + audit row in `credit_transactions` (no `trial_ends_at`); `startFreeTrial` server action deleted. | Code Examples §"handle_new_user rewrite", verified `startFreeTrial` is already absent (D-08), trigger DDL unchanged, only function body. [VERIFIED: 00015_auto_trial.sql, 00004_auth_trigger.sql] |
| PRIC-14 | Anti-abuse: `users.email + ip_address` combination uniquely tracked in `handle_new_user` with audit log row; `users.credits_balance_cap` and `users.credits_included_monthly` set per tier on signup. | Code Examples §"signup_audit table", §"normalize_email function", §"server action IP capture". `credits_included_monthly` already exists with default 500 — must `SET DEFAULT 250` not `ADD COLUMN`. [VERIFIED: 00002_initial_schema.sql:18] |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| New ENUMs + column adds | Database | — | Pure schema. |
| User row creation on signup | Database (trigger) | — | Already DB-owned via `on_auth_user_created` (00004); body change only. |
| Atomic credits grant + audit row | Database (trigger) | — | Must be in same transaction as user INSERT to preserve double-entry invariant. |
| Email normalization | Database (SQL function) | TS helper (mirrors logic) | Trigger needs it; TS code may also need to compute it for lookups (D-09 callback). Single source of truth = SQL function; TS reimplementation kept separately and unit-tested for parity. |
| IP capture on password/magic-link signup | Frontend Server (server action) | — | `headers()` only available server-side; passes IP via `signUp({ options: { data: { ip } } })` to `auth.users.raw_user_meta_data`. |
| IP capture on OAuth signup | Frontend Server (`/auth/callback` route handler) | Database (signup_audit upsert) | OAuth flow doesn't go through our pre-signup server action; callback is the first server-side touchpoint with both `headers()` and the just-created `auth.user.id`. |
| Plan defaults source of truth | App layer (TS const) | Database (literal in trigger) | TS const `PLAN_CONFIG` for app code; trigger duplicates the literal because trigger has no app-layer access. Drift is mitigated by single migration owning both at write time. |

## Standard Stack

This phase introduces **no new dependencies**. All work uses primitives already in the project.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | (existing) | Server-side `auth.signUp` with options.data | Project standard, already used in auth-actions.ts. [VERIFIED: src/features/auth/actions/auth-actions.ts] |
| @supabase/ssr | (existing) | `createClient()` server helper | Already imported by `/auth/callback/route.ts`. [VERIFIED] |
| Postgres `inet` type | native | IPv4+IPv6 IP storage | Native Postgres type, indexable, validated at insert. [CITED: postgresql.org/docs/current/datatype-net-types.html] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `inet` column | `text` | `text` is simpler but loses IPv6 normalization, no validation, no efficient index. **Reject** per D-09/CONTEXT specifics: `inet` is the native standard. |
| SQL function for email normalization | TS-only normalization | TS-only would mean the trigger can't compute the duplicate flag. **Reject.** Need both — SQL canonical, TS helper for `/auth/callback` lookup. |
| Hard-reject duplicate signup (raise exception in trigger) | Audit-only insert with `duplicate_flag=true` | Hard-reject = false-positives on shared-IP families/offices pre-launch. **Reject** per D-11. |

## Architecture Patterns

### System Architecture Diagram

```
                                 ┌──────────────────────────────────┐
  Email/Magic-link ─────►        │  Next.js server action            │
  signInWithEmail()              │  signInWithEmail / signUpWithEmail│
                                 │   - read x-forwarded-for          │
                                 │   - signUp({options:{data:{ip}}}) │
                                 └────────────┬─────────────────────┘
                                              │
                              auth.users INSERT (raw_user_meta_data has ip)
                                              │
                                              ▼
                                 ┌──────────────────────────────────┐
                                 │  on_auth_user_created trigger    │
                                 │  → handle_new_user()             │
                                 │    1. INSERT public.users        │
                                 │       (subscription_plan='free', │
                                 │        credits_balance=250,      │
                                 │        cap=500, included=250,    │
                                 │        trial_ends_at=NULL)       │
                                 │    2. INSERT credit_transactions │
                                 │       (monthly_grant, +250,      │
                                 │        'Free tier signup grant') │
                                 │    3. INSERT signup_audit        │
                                 │       (email_normalized, ip,     │
                                 │        duplicate_flag)           │
                                 └──────────────────────────────────┘

  Google OAuth ──────►   /auth/callback (route handler)
                          │
                          1. exchangeCodeForSession(code)
                          2. (NEW) read x-forwarded-for
                          3. (NEW) UPSERT signup_audit row for new user_id
                             — only if signup_audit row missing for that user
                                  (trigger may have inserted with ip=NULL)
                          4. redirect("/")
```

### Recommended File/Migration Structure

```
supabase/migrations/
└── 00025_phase19_free_tier_signup.sql   # everything in one file (atomic)

src/features/billing/lib/
└── plan-config.ts                       # PLAN_CONFIG TS const (D-05)

src/features/auth/lib/
└── normalize-email.ts                   # TS mirror of normalize_email() SQL fn

src/features/auth/actions/
└── auth-actions.ts                      # extend signInWithEmail + new signUp action with ip
                                          # (signInWithGoogle has no pre-signup hook → IP captured in /auth/callback)

src/app/auth/callback/
└── route.ts                             # extend with signup_audit upsert for OAuth
```

### Pattern 1: ENUM creation in a non-00001 migration
**What:** New ENUMs added in this phase's migration (not retrofitted into 00001).
**When:** Established pattern from 00010 (`credit_type` ALTER), 00024 (`mechanism_kind_enum` CREATE).
**Example:**
```sql
-- Source: supabase/migrations/00024_mechanism_costs.sql:8 [VERIFIED]
CREATE TYPE subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE billing_cycle    AS ENUM ('monthly', 'annual');
```

### Pattern 2: Conditional NOT NULL via CHECK constraint
**What:** `billing_cycle` must be nullable for `free`, NOT NULL for `pro` (D-02). Cannot express directly with `NOT NULL` — use `CHECK`.
**When:** Whenever a column's nullability depends on another column.
**Example:**
```sql
ALTER TABLE users
  ADD COLUMN subscription_plan subscription_plan NOT NULL DEFAULT 'free',
  ADD COLUMN billing_cycle     billing_cycle,                       -- nullable
  ADD COLUMN credits_balance_cap integer NOT NULL DEFAULT 500,
  ADD CONSTRAINT users_billing_cycle_required_for_pro
    CHECK (subscription_plan = 'free' OR billing_cycle IS NOT NULL);
-- credits_included_monthly already exists (00002:18) — only update default:
ALTER TABLE users ALTER COLUMN credits_included_monthly SET DEFAULT 250;
```

### Pattern 3: `CREATE OR REPLACE FUNCTION` for trigger body
**What:** Replace function body without dropping/recreating trigger.
**When:** Trigger DDL is in a different migration (00004) and we want to keep wiring intact.
**Example:**
```sql
-- Source: supabase/migrations/00015_auto_trial.sql:17 [VERIFIED]
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (
    id, email,
    subscription_plan, billing_cycle,
    credits_balance, credits_balance_cap, credits_included_monthly,
    trial_ends_at, subscription_active, billing_period,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    'free', NULL,
    250, 500, 250,
    NULL, false, NULL,
    NOW(), NOW()
  );

  INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
  VALUES (NEW.id, 'monthly_grant', 250, 'Free tier signup grant', NOW());

  INSERT INTO public.signup_audit (user_id, email_normalized, ip, duplicate_flag, created_at)
  SELECT
    NEW.id,
    public.normalize_email(NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet,
    EXISTS (
      SELECT 1 FROM public.signup_audit prev
      WHERE prev.email_normalized = public.normalize_email(NEW.email)
        AND prev.ip = NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet
        AND prev.user_id <> NEW.id
    ),
    NOW();

  RETURN NEW;
END;
$$;
```

### Pattern 4: Service-role-only RLS
**What:** Table that only the trigger / service role writes; no end-user reads.
**When:** Audit / abuse-detection tables (signup_audit fits exactly).
**Example:**
```sql
ALTER TABLE signup_audit ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies for authenticated/anon → all reads/writes denied
-- service_role bypasses RLS by default. Trigger runs SECURITY DEFINER so it bypasses too.
```
This is the inverse of the `mechanism_costs` pattern (which exposes SELECT to authenticated). [VERIFIED: 00024_mechanism_costs.sql:23-28]

### Pattern 5: Email normalization as IMMUTABLE SQL function
**What:** Pure function with no I/O — Postgres can index expressions on it later.
**Example:**
```sql
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN split_part(lower(p_email), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '')
           || '@gmail.com'
    ELSE lower(p_email)
  END;
$$;
```
- `LANGUAGE sql` (not plpgsql) — simpler, inlinable, no PL overhead.
- `IMMUTABLE` not `STABLE` — output depends only on input, no DB reads.
- `PARALLEL SAFE` — usable in parallel queries.
- Always normalizes Gmail/Googlemail to `@gmail.com` so `kamil.wandtke+x@googlemail.com` and `kamilwandtke@gmail.com` collide.

### Anti-Patterns to Avoid
- **Dropping `signal_source_type` or `billing_period_type` in this phase.** Phase 16 (signal_source_type) and Phase 21 (billing_period_type) own their drops. Don't widen scope.
- **Dropping `subscription_tier` ENUM.** It does not exist. Adding a `DROP TYPE IF EXISTS subscription_tier` is a footgun: silently no-op today, but if someone names something `subscription_tier` later it'd disappear.
- **Modifying `on_auth_user_created` trigger DDL.** Already correctly wired in 00004. Only the function body changes.
- **Storing `ip` as text.** Use `inet` for native validation + IPv6 + index efficiency.
- **Hard-rejecting duplicate signups via `RAISE EXCEPTION`.** D-11 explicitly requires audit-only.
- **Splitting the migration into multiple files.** All 6 steps must apply atomically — partial application leaves trigger writing into nonexistent columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IP storage | text + regex validation | Postgres `inet` | Native type, validates at insert, supports IPv6 + CIDR ops, free index. |
| Email normalization | Imperative loop in plpgsql | `LANGUAGE sql IMMUTABLE` function | Inlinable, simpler, used by Postgres planner. |
| Atomic credit grant | Two separate INSERTs without transaction | Trigger body (already in single statement-level transaction) | Triggers fire inside the wrapping transaction by default. |
| Duplicate detection | Raise exception then catch in app | EXISTS subquery + boolean flag | D-11 wants audit, not block. Subquery is cheap with `(email_normalized, ip)` index. |
| `x-forwarded-for` parsing | DIY split + take-first | Next.js `headers().get('x-forwarded-for')`, take first hop | Vercel sets `x-forwarded-for: <client>, <vercel-edge>`; first comma-separated value is client. [CITED: vercel.com/docs/edge-network/headers] |

**Key insight:** This entire phase is gluing well-tested Postgres + Supabase + Next.js primitives. There is no "engine" to build.

## Runtime State Inventory

This phase is additive-only at the schema layer; the only runtime state at risk is the existing `auth.users` row that the trigger writes when a new user signs up.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `public.users` rows (test data) — `credits_included_monthly` defaults to 500 from 00002. Backfill UPDATE per D-06 sets `subscription_plan='free'`, `credits_balance_cap=500`, `credits_included_monthly=250`. Phase 20 wipes all anyway. | One-time `UPDATE public.users SET ...` inside the migration. |
| Live service config | None — no Stripe products / Vercel cron schedules touched in Phase 19 (cron consumers stay on legacy fields per D-12). | None. |
| OS-registered state | None — pure DB + app code change. | None. |
| Secrets / env vars | None — no new env vars introduced. `SUPABASE_SERVICE_ROLE_KEY` continues to be used by trigger via SECURITY DEFINER (not an env). | None. |
| Build artifacts | None — no new packages, no new compiled artifacts. | None. |

## Common Pitfalls

### Pitfall 1: `credits_included_monthly` already exists
**What goes wrong:** Migration says `ADD COLUMN credits_included_monthly integer NOT NULL DEFAULT 250` → fails with "column already exists".
**Why:** 00002_initial_schema.sql:18 already defined `credits_included_monthly integer DEFAULT 500`. [VERIFIED]
**How to avoid:** Use `ALTER COLUMN credits_included_monthly SET DEFAULT 250` and a backfill UPDATE for existing rows. Do not include it in the `ADD COLUMN` list.
**Warning sign:** Migration error 42701 (`duplicate_column`).

### Pitfall 2: `billing_cycle` NOT NULL conflict on existing rows
**What goes wrong:** `ADD COLUMN billing_cycle billing_cycle NOT NULL` blows up because existing rows have no value.
**How to avoid:** Add as nullable. Enforce conditional NOT NULL via CHECK constraint that allows NULL when `subscription_plan='free'`. (See Pattern 2.)

### Pitfall 3: `x-forwarded-for` is a list
**What goes wrong:** `headers().get('x-forwarded-for')` on Vercel returns `203.0.113.1, 76.76.21.21`. Storing the whole string into `inet` fails with 22P02 (`invalid_text_representation`).
**How to avoid:** Split on comma, trim, take index 0. Validate with a tiny regex before passing through. Drop to `null` (audit will record empty IP) if unparseable rather than failing signup.
**Warning sign:** signup 500s with PG error 22P02.

### Pitfall 4: OAuth has no pre-signup server action hook
**What goes wrong:** `signInWithGoogle()` redirects to Google → Google redirects to `/auth/callback` → trigger fires with no `ip` in `raw_user_meta_data`. Audit row inserts with `ip=NULL`, `duplicate_flag=false` always.
**How to avoid:** In `/auth/callback/route.ts`, after `exchangeCodeForSession` succeeds and we have `user.id`, capture IP from `request.headers.get('x-forwarded-for')` and `UPDATE signup_audit SET ip = $1, duplicate_flag = (recompute) WHERE user_id = $2 AND ip IS NULL`. Trigger inserts the row; callback completes it. Idempotent if user already had a non-null ip (e.g., re-login).
**Warning sign:** All `signup_audit.ip IS NULL` for OAuth users.

### Pitfall 5: `raw_user_meta_data` is JSONB, may be NULL
**What goes wrong:** `NEW.raw_user_meta_data->>'ip'` is `text | null`. `'foo'::inet` succeeds with text-cast quirks; `NULL::inet` is fine; empty string `''::inet` errors.
**How to avoid:** `NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet` — coerce empty to NULL first.

### Pitfall 6: Trigger silently breaks if any cron reads the new column types
**What goes wrong:** Cron `/api/cron/credit-burn` reads `subscription_active, trial_ends_at` (verified active in code). It does NOT read `subscription_plan`. Phase 19 leaves both old fields populated by trigger (`subscription_active=false`, `trial_ends_at=NULL`) so cron continues to filter "no active subs, no trial" — every new free user is excluded from burn. That's correct: Phase 21 will switch the filter to `subscription_plan='free'`.
**How to avoid:** Verify in pre-merge smoke that `credit-burn` and `digest` crons still iterate the expected user set after Phase 19 ships (zero-effect on free-tier users is the desired behavior).

### Pitfall 7: SECURITY DEFINER + search_path
**What goes wrong:** Trigger runs as the function owner (postgres). Without `SET search_path = ''` an attacker controlling `public` could shadow `users` or `credit_transactions` with their own table.
**How to avoid:** Keep `SECURITY DEFINER SET search_path = ''` (already in 00015) and fully qualify every reference: `public.users`, `public.credit_transactions`, `public.signup_audit`, `public.normalize_email(...)`. [CITED: supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions]

## Code Examples

### signup_audit table + RLS
```sql
CREATE TABLE public.signup_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  ip               inet,
  duplicate_flag   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_audit_email_ip
  ON public.signup_audit (email_normalized, ip);

ALTER TABLE public.signup_audit ENABLE ROW LEVEL SECURITY;
-- intentionally NO policies → all client roles denied; service_role bypasses RLS;
-- trigger runs SECURITY DEFINER so writes succeed.
```

### Server action with IP capture (extends existing auth-actions.ts)
```typescript
// Source: extending src/features/auth/actions/auth-actions.ts [VERIFIED current shape]
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"

function clientIp(): string | null {
  const xff = headers().get("x-forwarded-for")
  if (!xff) return null
  const first = xff.split(",")[0]?.trim()
  return first && /^[\da-fA-F:.]+$/.test(first) ? first : null
}

export async function signUpWithEmail(formData: FormData) {
  const email = formData.get("email") as string
  if (!email) return { error: "Email is required" }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      data: { ip: clientIp() ?? undefined },
    },
  })
  if (error) return { error: error.message }
  return { success: true }
}
```
Note: magic-link is the only password-less email flow today (`signInWithOtp`). Same handler covers signup and signin — Supabase auto-creates the user on first OTP exchange. Pass `data.ip` so it lands in `auth.users.raw_user_meta_data` when the user is created.

### `/auth/callback` IP capture for OAuth
```typescript
// Source: extending src/app/auth/callback/route.ts [VERIFIED current shape]
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeEmail } from "@/features/auth/lib/normalize-email"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.user) {
      const xff = request.headers.get("x-forwarded-for")
      const ip = xff?.split(",")[0]?.trim() ?? null
      // Update the audit row that the trigger inserted (with ip NULL for OAuth)
      // Service-role client required since signup_audit denies authenticated reads.
      const service = createServiceClient() // existing helper pattern
      await service
        .from("signup_audit")
        .update({
          ip,
          duplicate_flag: ip
            ? await detectDuplicate(service, normalizeEmail(data.user.email!), ip)
            : false,
        })
        .eq("user_id", data.user.id)
        .is("ip", null)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```

### `PLAN_CONFIG` TS module (D-05)
```typescript
// src/features/billing/lib/plan-config.ts
export const PLAN_CONFIG = {
  free: { grant: 250, cap: 500 },
  pro:  { grant: 2000, cap: 4000 },
} as const

export type SubscriptionPlan = keyof typeof PLAN_CONFIG
export type BillingCycle = "monthly" | "annual"
```
No other module imports a similar pattern today (verified via glob of `src/features/billing/lib/`); the closest analog is `CREDIT_COSTS` in `types.ts` consumed by `credit-costs.ts`. PLAN_CONFIG follows the same shape: literal const + derived type.

### TS mirror of `normalize_email`
```typescript
// src/features/auth/lib/normalize-email.ts
export function normalizeEmail(email: string): string {
  const lower = email.toLowerCase()
  const [local, domain] = lower.split("@") as [string, string]
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0]!.replace(/\./g, "")}@gmail.com`
  }
  return lower
}
```
Unit tests must exercise: plain → unchanged; uppercase → lowercased; gmail dots → stripped; gmail `+alias` → stripped; googlemail.com → rewritten to gmail.com; non-gmail `+alias` → preserved.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-day trial via `trial_ends_at + INTERVAL '3 days'` (00015) | Free tier with 250 cr, no trial countdown (Phase 19) | this phase | New users get monitoring-only experience; no expiry pressure. |
| 4-value `billing_period_type` (monthly/quarterly/annual) | 2-value `billing_cycle` (monthly/annual) | Phase 19 + 21 | Quarterly Stripe price archived (Phase 21). |
| Plan implied by `subscription_active` boolean | Plan explicit via `subscription_plan` ENUM | this phase | Future code reads `users.subscription_plan` directly; legacy boolean kept until Phase 21 refactor. |

**Deprecated/outdated (NOT touched in this phase, removed in Phase 21):**
- `users.trial_ends_at` — no longer set on signup, kept readable for legacy cron.
- `users.subscription_active` — Stripe webhook still flips it; cron still reads it.
- `users.billing_period` (`billing_period_type` ENUM) — superseded by `billing_cycle` but webhook + UI not refactored yet.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel `x-forwarded-for` first-comma value is the client IP | Pitfall 3 + Code Examples | If a custom CDN/proxy is added in front of Vercel (none today, none planned in Phase 19/20), parsing logic underflags actual client IP. Audit-only mode means signup still succeeds. [CITED: vercel.com/docs/edge-network/headers] |
| A2 | `LANGUAGE sql IMMUTABLE` is safe for Gmail-aware normalization | Pattern 5 | If gmail.com or googlemail.com domain rules change, function output for old data becomes stale. Marking IMMUTABLE means Postgres may cache results in expression indexes; for our use (no expression index on the function — we index the columns directly) this is moot. |
| A3 | `auth.users.raw_user_meta_data` is writable from `signUp({options:{data}})` and visible in trigger as JSONB | Code Examples | If Supabase Auth ever moves the field, `NEW.raw_user_meta_data->>'ip'` returns NULL silently and audit logs `ip=NULL`. Verified via Supabase docs that `options.data` populates `raw_user_meta_data`. [CITED: supabase.com/docs/reference/javascript/auth-signup#parameters — `options.data`] |

## Open Questions

1. **Does `signInWithOtp` count as signup or login from the trigger's perspective?**
   - What we know: First OTP for a new email creates `auth.users` row → trigger fires once. Subsequent OTPs for existing email do not re-fire the trigger. [CITED: supabase.com/docs/reference/javascript/auth-signinwithotp]
   - Recommendation: Confirm in dev branch by submitting same email twice — only one `signup_audit` row should exist. Document as success criterion.

2. **Should the OAuth callback `UPDATE` be idempotent when the user re-logs in months later?**
   - What we know: The OAuth callback fires on every login, not just first signup. Our update sets `WHERE user_id = ? AND ip IS NULL` — once filled, never overwritten.
   - Recommendation: Filter is correct; nothing to fix. Add inline comment in callback explaining the intent.

3. **What happens to the existing `users.credits_balance DEFAULT 500`?**
   - What we know: 00002:17 sets default 500. New trigger overrides explicitly with 250 (D-07). Backfill UPDATE per D-06 sets existing rows to 250 too.
   - Recommendation: Also `ALTER COLUMN credits_balance SET DEFAULT 250` for any future direct INSERT (defensive — current code only inserts via trigger).

## Environment Availability

Skipped — phase is pure schema + app-code change. No new external tools/services. Existing Supabase dev branch (`effppfiphrykllkpkdbv`) and prod (`cmkifdwjunojgigrqwnr`) Postgres ≥15, already in use. Migration applies via Supabase Management API (project standard, see `reference_supabase_management_api` memory).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard, used in `src/features/billing/lib/*.test.ts`) |
| Config file | `vitest.config.ts` (existing, project root) |
| Quick run command | `pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email` |
| Full suite command | `pnpm vitest run` |
| Migration smoke | curl Supabase Management API SQL endpoint (recipe in `reference_supabase_management_api`); shell wrapper in `scripts/db-smoke.sh` if it exists, else inline |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRIC-04 | New ENUMs `subscription_plan`/`billing_cycle` exist with correct values | migration smoke (SQL) | `psql -c "SELECT unnest(enum_range(NULL::subscription_plan));"` returns `{free,pro}` | ❌ Wave 0 |
| PRIC-04 | `users.subscription_plan` defaults to 'free', `billing_cycle` is nullable | migration smoke | `\d users` shows `DEFAULT 'free'` and no NOT NULL on billing_cycle | ❌ Wave 0 |
| PRIC-04 | CHECK constraint blocks `pro` with NULL billing_cycle | migration unit test (SQL) | `INSERT INTO users (...subscription_plan='pro', billing_cycle=NULL...)` errors with 23514 | ❌ Wave 0 |
| PRIC-05 | New signup atomically inserts user + 250cr + ledger row | trigger integration test | `INSERT INTO auth.users (...) RETURNING id;` then assert `users.credits_balance=250` AND `credit_transactions` row with type=`monthly_grant` amount=250 description=`Free tier signup grant` | ❌ Wave 0 |
| PRIC-05 | `trial_ends_at IS NULL` after signup | trigger integration test | After auth.users INSERT, assert `users.trial_ends_at IS NULL` | ❌ Wave 0 |
| PRIC-05 | `startFreeTrial` server action does not exist | grep test | `grep -r "startFreeTrial" src/` returns 0 matches | ❌ Wave 0 |
| PRIC-14 | `signup_audit` row inserted on every signup | trigger integration test | After auth.users INSERT, exactly 1 row in signup_audit with matching user_id | ❌ Wave 0 |
| PRIC-14 | Duplicate `(email_normalized, ip)` flips `duplicate_flag=true` on second signup | trigger integration test | Two auth.users INSERTs with same ip + dot-variant gmail addresses → 2nd row has duplicate_flag=true | ❌ Wave 0 |
| PRIC-14 | `normalize_email('Kamil.Wandtke+x@Googlemail.com') = 'kamilwandtke@gmail.com'` | SQL unit test | `SELECT normalize_email(...)` matches expected | ❌ Wave 0 |
| PRIC-14 | TS `normalizeEmail` matches SQL output for 6 input cases | Vitest unit | `pnpm vitest run src/features/auth/lib/normalize-email` | ❌ Wave 0 |
| PRIC-14 | `users.credits_balance_cap=500`, `credits_included_monthly=250` after free signup | trigger integration test | post-signup SELECT | ❌ Wave 0 |
| PRIC-14 | Server action passes IP via `signUp({options:{data:{ip}}})` | Vitest unit + manual UAT | mock `headers()` returns `x-forwarded-for: 1.2.3.4`, assert supabase mock called with `data.ip='1.2.3.4'` | ❌ Wave 0 |
| PRIC-14 | OAuth callback updates signup_audit.ip after exchangeCodeForSession | Vitest unit | mock supabase + headers, assert update query fired | ❌ Wave 0 |
| PRIC-14 | RLS denies authenticated SELECT on signup_audit | RLS smoke (SQL) | as `authenticated` role: `SELECT * FROM signup_audit` returns 0 rows or PERMISSION DENIED | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email`
- **Per wave merge:** `pnpm vitest run` (full suite) + migration smoke against dev branch via Management API
- **Phase gate:** Full suite green + manual UAT signup (magic link + Google OAuth) on `pnpm dev --port 3001` against dev Supabase, verifying `signup_audit` rows look correct with both `ip` populated.

### Wave 0 Gaps
- [ ] `src/features/billing/lib/plan-config.test.ts` — covers PLAN_CONFIG shape stability
- [ ] `src/features/auth/lib/normalize-email.ts` + `normalize-email.test.ts` — TS mirror + 6-case parity tests
- [ ] `src/features/auth/actions/auth-actions.test.ts` — mock-based test that signup passes IP through (extend if exists, create if not)
- [ ] `src/app/auth/callback/route.test.ts` — mock-based test for signup_audit update on OAuth callback
- [ ] Trigger integration test harness — applies migration on dev branch, INSERTs into `auth.users`, asserts trigger side effects via service-role client. Project lacks one today; recommend creating `scripts/test-trigger-19.mjs` (one-shot Node script using `@supabase/supabase-js` with service role) rather than adopting a heavier framework. Pattern: 00015's `trial_backfill.test` (if it exists) — verified to NOT exist; use Plan 12's pattern (00012 trigger work tests) as analog.
- [ ] Migration smoke: extend any existing `scripts/db-smoke.*` or add a one-shot `scripts/smoke-19.mjs` that runs the 4 PRIC-04 enum/column smokes via Management API.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (touches signup flow) | Supabase Auth (existing); no password handling added |
| V3 Session Management | no | not modified |
| V4 Access Control | yes (signup_audit RLS) | RLS deny-by-default; service_role bypass |
| V5 Input Validation | yes (IP, email) | `inet` type validates IP at insert; `normalize_email` is total over text inputs; Zod at TS server action boundary for the `email` field (existing pattern) |
| V6 Cryptography | no | no new crypto; trigger relies on existing SECURITY DEFINER pattern |

### Known Threat Patterns for Postgres trigger + Supabase Auth + Next.js server action

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `search_path` injection on SECURITY DEFINER function | Elevation of Privilege | `SET search_path = ''` + fully qualified references (`public.users`, `public.normalize_email`, etc.) [CITED: supabase.com/docs/guides/database/postgres/row-level-security] |
| IP spoofing via crafted `x-forwarded-for` | Spoofing | Trust only Vercel's first-hop value; document that IP is for soft anti-abuse audit only, not authentication. Hard-reject deferred per D-11 means spoofing is low-impact today. |
| Audit table info leak (PII via email_normalized + ip) | Information Disclosure | Service-role-only RLS (no SELECT policy for authenticated). User cannot enumerate other accounts via their own audit row. |
| Trigger DoS via repeated signup attempts | DoS | Supabase Auth's built-in rate limit on `signInWithOtp` + Google OAuth rate limit. Trigger work is bounded O(1) plus an EXISTS subquery on `(email_normalized, ip)` index. |
| Supabase service role key exposure in callback | Spoofing/EoP | Service client must remain server-only (`createServiceClient` already inline-only per CLAUDE.md). Verify the callback route imports the server-only helper, not a client-side variant. |
| Email enumeration via duplicate detection timing | Information Disclosure | Audit row insertion is unconditional regardless of duplicate; signup always succeeds with same latency. No timing oracle exposed. |

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/00001_enums.sql` — verified existing ENUMs (`billing_period_type`, `signal_source_type`, `credit_type`, etc.); `subscription_tier` ENUM does NOT exist.
- `supabase/migrations/00002_initial_schema.sql:10-21` — verified `users` table shape, including pre-existing `credits_included_monthly DEFAULT 500`.
- `supabase/migrations/00004_auth_trigger.sql` — `on_auth_user_created` trigger DDL, unchanged in this phase.
- `supabase/migrations/00010_phase5_billing_onboarding.sql` — `credit_transactions`, `deduct_credits`, `add_credits` RPC patterns.
- `supabase/migrations/00015_auto_trial.sql` — exact `CREATE OR REPLACE FUNCTION handle_new_user()` shape with SECURITY DEFINER + atomic insert; the body this phase replaces.
- `supabase/migrations/00024_mechanism_costs.sql:8,23-28` — recent precedent for new ENUM in non-00001 migration + RLS pattern.
- `src/features/auth/actions/auth-actions.ts` — verified current signin shape (`signInWithOtp`, `signInWithOAuth`).
- `src/app/auth/callback/route.ts` — verified current OAuth callback shape.
- `src/app/api/cron/credit-burn/route.ts:59-64` + `src/app/api/cron/digest/route.ts:46-59` — confirmed legacy `subscription_active`/`trial_ends_at` consumers (Phase 21 refactor scope).
- `src/app/api/stripe/webhook/route.ts` — confirmed Stripe webhook reads `billing_period`/`subscription_active` (Phase 21 refactor scope).

### Secondary (MEDIUM confidence)
- Postgres `inet` type docs — postgresql.org/docs/current/datatype-net-types.html
- Vercel `x-forwarded-for` header semantics — vercel.com/docs/edge-network/headers
- Supabase `signUp({options:{data}})` propagating to `raw_user_meta_data` — supabase.com/docs/reference/javascript/auth-signup
- Supabase RLS + SECURITY DEFINER guidance — supabase.com/docs/guides/database/postgres/row-level-security

### Tertiary (LOW confidence)
- None for this phase; all critical claims verified directly against the repo or official docs.

## Project Constraints (from CLAUDE.md)

- **Sequential migrations** — `00025_phase19_free_tier_signup.sql` is next.
- **RLS on every new table** — `signup_audit` enables RLS with no policies (service-role-only writes via trigger).
- **`TIMESTAMPTZ DEFAULT now()`** — applied to `signup_audit.created_at`.
- **UUID PKs** — `signup_audit.id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
- **Service role client server-side only** — `/auth/callback` extension uses existing inline service-role helper pattern.
- **Validate user input at API boundaries with Zod** — extend `signInWithEmail` server action validation to also accept the IP-passing path; IP itself is captured via `headers()`, not user-provided.
- **No `any`** — `PLAN_CONFIG` typed via `as const`, derived types exported.
- **`await logger.flush()` before returning from API routes** — `/auth/callback` extension must add this if logging is added (currently no Axiom logging in callback; recommend leaving as-is to stay minimal).
- **Default working branch: `development`; never auto-merge to main** — phase work lands on `development`, manually deployed via `/deploy-to-test` flow.
- **NEVER destroy dev branch `effppfiphrykllkpkdbv`** — apply migration via Management API; never recreate the branch.
- **Naming: kebab-case files** — `plan-config.ts`, `normalize-email.ts`.
- **DB: snake_case** — `signup_audit`, `email_normalized`, `duplicate_flag`, `credits_balance_cap`.
- **Commits: `<type>(<scope>): <subject>`** — scope for this phase: `19`.

## Metadata

**Confidence breakdown:**
- Schema migration shape: HIGH — every claim verified against existing migration files in repo.
- Trigger rewrite: HIGH — direct extension of 00015 pattern, replacement function body only.
- IP capture (server action + callback): HIGH for the server action path (existing code shape verified); MEDIUM for the callback path (logic is straightforward but the service-role helper name was not opened — planner should grep for it before assuming `createServiceClient`).
- Email normalization: HIGH — pure SQL + TS, no external dependencies.
- Validation Architecture: MEDIUM — project does not yet have a trigger-integration harness; planner should create one in Wave 0.

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (30 days — Postgres + Supabase + Next.js are stable; only auth.signUp metadata semantics could shift, low probability)
