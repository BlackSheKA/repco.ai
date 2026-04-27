# Phase 19: Free Tier ENUM + Signup Flow — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 7 (1 migration, 4 TS source files, 2 test files)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/00025_phase19_free_tier_signup.sql` | migration (multi-step: ENUMs + ALTERs + trigger + table + RLS) | schema-DDL | `supabase/migrations/00024_mechanism_costs.sql` (ENUM + table + RLS in one file) and `supabase/migrations/00015_auto_trial.sql` (CREATE OR REPLACE handle_new_user) | exact (combined) |
| `src/features/billing/lib/plan-config.ts` | utility (config const) | static-lookup | `src/features/billing/lib/types.ts` (CREDIT_COSTS / ACCOUNT_COSTS const + derived types) | exact |
| `src/features/billing/lib/plan-config.test.ts` | test (const shape) | static-lookup | `src/features/billing/lib/types.test.ts` and `credit-costs.test.ts` | exact |
| `src/features/auth/lib/normalize-email.ts` | utility (pure transform) | transform | `src/features/billing/lib/credit-costs.ts` (pure lookup helper) | role-match |
| `src/features/auth/lib/normalize-email.test.ts` | test (pure fn) | transform | `src/features/billing/lib/credit-costs.test.ts` | exact |
| `src/features/auth/actions/auth-actions.ts` (modified) | server action | request-response | self — extend existing `signInWithEmail` / `signInWithGoogle` | exact (in-place extend) |
| `src/app/auth/callback/route.ts` (modified) | route handler | request-response + admin DB write | `src/app/api/stripe/webhook/route.ts` (service-role inline client + admin write) | role-match |

## Pattern Assignments

### `supabase/migrations/00025_phase19_free_tier_signup.sql` (migration)

**Analogs:** `00024_mechanism_costs.sql` (ENUM + RLS + insert pattern), `00015_auto_trial.sql` (`CREATE OR REPLACE FUNCTION handle_new_user` + atomic insert + backfill UPDATE).

**ENUM creation pattern** (from `00024_mechanism_costs.sql:8`):
```sql
CREATE TYPE mechanism_kind_enum AS ENUM ('signal', 'outbound');
```
Apply as:
```sql
CREATE TYPE subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE billing_cycle    AS ENUM ('monthly', 'annual');
```

**Table + RLS-deny-all pattern** (adapt from `00024_mechanism_costs.sql:11-28` — but invert the SELECT policy — Phase 19 wants service-role-only, no client SELECT):
```sql
-- 00024 reference (authenticated SELECT — DO NOT copy this policy line for signup_audit):
ALTER TABLE mechanism_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mechanism_costs_select_authenticated"
  ON mechanism_costs FOR SELECT
  TO authenticated
  USING (true);
```
For `signup_audit`: enable RLS, omit all policies (deny-all for client roles; SECURITY DEFINER trigger and `service_role` bypass).

**Trigger body replacement** (from `00015_auto_trial.sql:17-47`) — copy header verbatim, replace body:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, trial_ends_at, credits_balance, created_at, updated_at)
  VALUES ( NEW.id, NEW.email, NOW() + INTERVAL '3 days', 500, NOW(), NOW() );

  INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
  VALUES ( NEW.id, 'monthly_grant', 500, 'Free trial credits', NOW() );

  RETURN NEW;
END;
$$;
```
Notes from analog to preserve in new body:
- Keep `SECURITY DEFINER SET search_path = ''` line verbatim (Pitfall 7 mitigation).
- Fully qualify `public.users`, `public.credit_transactions`, `public.signup_audit`, `public.normalize_email(...)`.
- Two-step atomic write (user row → credit_transactions) is the existing double-entry invariant — extend with third step (signup_audit row).

**Backfill UPDATE pattern** (from `00015_auto_trial.sql:55-61`):
```sql
UPDATE public.users
SET
  trial_ends_at = NOW() + INTERVAL '3 days',
  credits_balance = GREATEST(credits_balance, 500),
  updated_at = NOW()
WHERE trial_ends_at IS NULL
  AND subscription_active = false;
```
Apply for D-06 backfill (subscription_plan='free', credits_balance_cap=500, credits_included_monthly=250).

**ALTER COLUMN default change** — no exact analog in repo for `SET DEFAULT` only; planner uses standard Postgres `ALTER COLUMN credits_included_monthly SET DEFAULT 250` per RESEARCH.md Pitfall 1.

---

### `src/features/billing/lib/plan-config.ts` (utility, config const)

**Analog:** `src/features/billing/lib/types.ts:11-28`

**Imports/exports pattern** (lines 1-28):
```typescript
export type ActionCreditType =
  | "like"
  | "follow"
  | "public_reply"
  | "dm"
  | "followup_dm"
  | "connection_request"

export type CreditCostMap = Record<ActionCreditType, number>

export const CREDIT_COSTS: CreditCostMap = {
  like: 0,
  follow: 0,
  public_reply: 15,
  dm: 30,
  followup_dm: 20,
  connection_request: 20,
} as const

export type AccountPlatform = "reddit" | "linkedin"

export const ACCOUNT_COSTS: Record<AccountPlatform, number> = {
  reddit: 3,
  linkedin: 5,
} as const
```

**Apply as PLAN_CONFIG**: literal const + `as const` + derived `keyof typeof` types, single export per construct, no default export (project convention).

---

### `src/features/billing/lib/plan-config.test.ts` (test, const shape)

**Analog:** `src/features/billing/lib/types.test.ts:1-35`, `credit-costs.test.ts:1-25`

**Pattern** (from `types.test.ts:1-20`):
```typescript
import { describe, it, expect } from "vitest"

import { CREDIT_COSTS, CREDIT_PACKS, PRICING_PLANS } from "./types"

describe("PRICING_PLANS (BILL-02)", () => {
  it("contains exactly 3 subscription plans", () => {
    expect(PRICING_PLANS).toHaveLength(3)
  })

  it("monthly plan is priced at $49/month", () => {
    const monthly = PRICING_PLANS.find((p) => p.period === "monthly")
    expect(monthly).toBeDefined()
    expect(monthly!.pricePerMonth).toBe(49)
    expect(monthly!.totalPrice).toBe(49)
  })
})
```
Tag tests with the requirement ID (e.g. `describe("PLAN_CONFIG (PRIC-04, PRIC-14)", ...)`) — convention from `types.test.ts`.

---

### `src/features/auth/lib/normalize-email.ts` (utility, pure transform)

**Analog:** `src/features/billing/lib/credit-costs.ts` (pure 1-fn helper, no side effects, no imports of supabase).

**Reference shape** (lines 1-10):
```typescript
import { CREDIT_COSTS, type ActionCreditType } from "./types"

/**
 * Look up the credit cost for a given action type.
 * Returns 0 for free actions (like, follow) and positive values for
 * billable actions (public_reply, dm, followup_dm).
 */
export function getActionCreditCost(actionType: ActionCreditType): number {
  return CREDIT_COSTS[actionType]
}
```

**Apply as `normalizeEmail`**: single named export, JSDoc on what + when used (mirror SQL `public.normalize_email`), no class wrapper.

---

### `src/features/auth/lib/normalize-email.test.ts` (test, pure fn)

**Analog:** `src/features/billing/lib/credit-costs.test.ts:1-25`

**Pattern**:
```typescript
import { describe, it, expect } from "vitest"

import { getActionCreditCost } from "./credit-costs"

describe("getActionCreditCost", () => {
  it("returns 0 for like", () => {
    expect(getActionCreditCost("like")).toBe(0)
  })
  it("returns 15 for public_reply", () => {
    expect(getActionCreditCost("public_reply")).toBe(15)
  })
})
```
Cover the 6 cases from RESEARCH.md §"TS mirror of normalize_email": plain, uppercase, gmail dots, gmail `+alias`, googlemail.com → gmail.com, non-gmail `+alias` preserved.

---

### `src/features/auth/actions/auth-actions.ts` (server action, modified in place)

**Analog:** itself — current shape (lines 1-49):
```typescript
"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
```

**Extension pattern (D-09):**
- Add a private `clientIp()` helper using `headers()` from `next/headers` — see RESEARCH.md Code Examples §"Server action with IP capture".
- Pass `data: { ip: clientIp() ?? undefined }` inside `options` of the existing `signInWithOtp` call. Do not change return shape, do not add new exports unless `signUpWithEmail` is required separately (per RESEARCH.md note: `signInWithOtp` covers signup auto-create on first call).
- Match existing style verbatim: semicolons (file uses them; rest of codebase doesn't — keep this file's style for surgical change per CLAUDE.md §3).
- `signInWithGoogle` cannot capture IP pre-redirect (no first-party request to read headers from at the post-redirect side); IP for OAuth flows lands in the callback route. Leave `signInWithGoogle` body unchanged.

---

### `src/app/auth/callback/route.ts` (route handler, modified in place)

**Analog 1 (current shape — extend in place):** `src/app/auth/callback/route.ts:1-20`
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

**Analog 2 (service-role inline client for admin DB write):** `src/app/api/stripe/webhook/route.ts:58-62`
```typescript
// Service role client (bypasses RLS for admin writes)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```
Apply this exact import + construction pattern in `/auth/callback` (use `createClient` from `@supabase/supabase-js`, not the `@/lib/supabase/server` SSR helper) for the `signup_audit` UPDATE because RLS denies authenticated reads/writes per D-10. Keep the SSR `createClient` for the existing `exchangeCodeForSession` call — the two clients coexist, one per purpose.

**Extension shape (D-09):**
1. After `exchangeCodeForSession` succeeds and `data.user` is present, parse `request.headers.get("x-forwarded-for")` first-comma value (Pitfall 3).
2. Build inline service-role client (analog 2 above).
3. `UPDATE signup_audit SET ip = $1, duplicate_flag = $2 WHERE user_id = $3 AND ip IS NULL` (idempotent on re-login).
4. Recompute `duplicate_flag` via SELECT EXISTS pattern matching the trigger logic.
5. Always redirect; do not block on UPDATE error (audit-only path per D-11).

---

## Shared Patterns

### Service-role client for admin-bypass DB writes
**Source:** `src/app/api/stripe/webhook/route.ts:58-62`
**Apply to:** `/auth/callback` route extension only (other new files do not touch service-role-only tables).
```typescript
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```
Inline construction (no shared helper exists today — confirmed via grep of `createServiceClient` returning zero hits in `@/lib`). Match webhook style verbatim; do not extract a helper in this phase (CLAUDE.md §2 simplicity).

### Atomic trigger pattern (user row + ledger row in same function body)
**Source:** `supabase/migrations/00015_auto_trial.sql:22-46`
**Apply to:** new `handle_new_user` body in 00025. Extend with third INSERT into `signup_audit`. Stay inside the implicit transaction — do not add `BEGIN`/`COMMIT`.

### `as const` literal-config + derived types
**Source:** `src/features/billing/lib/types.ts:11-25`
**Apply to:** `plan-config.ts`. No factory functions, no JSON, no env-driven values for free/pro grants/caps (D-05 is literal-only).

### Vitest unit-test shape
**Source:** `src/features/billing/lib/credit-costs.test.ts`, `types.test.ts`
**Apply to:** `plan-config.test.ts`, `normalize-email.test.ts`. Imports: `import { describe, it, expect } from "vitest"`. No setup files needed.

### Migration file structure (header comment + numbered parts)
**Source:** `supabase/migrations/00015_auto_trial.sql:1-9` and `00024_mechanism_costs.sql:1-7`
**Apply to:** 00025. Header banner with Migration / Purpose / Depends on / Closes lines, then numbered sections (`-- 1. ENUMs`, `-- 2. Column adds`, …) — both analogs share this convention.

### Code-style note (semicolons in `auth-actions.ts`)
The existing `auth-actions.ts` uses semicolons whereas the rest of the TS codebase (`types.ts`, `credit-costs.ts`, `mechanism-costs.ts`, webhook route) does not. Per CLAUDE.md §3 "match existing style", keep semicolons in this one file when extending it; new files (`plan-config.ts`, `normalize-email.ts`) should follow the project default (no semicolons).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 19 files have at least a role-match analog in the existing repo. Trigger-integration test harness mentioned in RESEARCH.md §"Wave 0 Gaps" is non-existent today; planner may treat creation of `scripts/smoke-19.mjs` / `scripts/test-trigger-19.mjs` as a from-scratch task following the Supabase Management API recipe (memory: `reference_supabase_management_api`) rather than a code-pattern analog. |

## Metadata

**Analog search scope:** `supabase/migrations/`, `src/features/billing/lib/`, `src/features/auth/`, `src/app/auth/callback/`, `src/app/api/stripe/webhook/`
**Files scanned:** 11
**Pattern extraction date:** 2026-04-27
