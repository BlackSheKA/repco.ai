---
phase: 19
plan: 19-02-application-integration
type: execute
wave: 2
depends_on: [19-01-schema-migration]
files_modified:
  - src/features/billing/lib/plan-config.ts
  - src/features/billing/lib/plan-config.test.ts
  - src/features/auth/lib/normalize-email.ts
  - src/features/auth/lib/normalize-email.test.ts
  - src/features/auth/actions/auth-actions.ts
  - src/app/auth/callback/route.ts
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
autonomous: true
requirements: [PRIC-05, PRIC-14]
must_haves:
  truths:
    - "PLAN_CONFIG TS const exists at `src/features/billing/lib/plan-config.ts` with literal values { free: { grant: 250, cap: 500 }, pro: { grant: 2000, cap: 4000 } }"
    - "TS `normalizeEmail` mirrors SQL `public.normalize_email` for 6 canonical inputs (verified by Vitest)"
    - "Magic-link signup server action passes IP via `signUp({ options: { data: { ip } } })` (PRIC-14 frontend half)"
    - "OAuth `/auth/callback` captures IP from `x-forwarded-for` and writes idempotent `signup_audit` follow-up using inline service-role client (Pitfall 4 mitigation)"
    - "`startFreeTrial` symbol does NOT exist anywhere under `src/` (PRIC-05 acceptance — was never present, but is now grep-verified)"
    - "REQUIREMENTS.md PRIC-04 + PRIC-14 reworded to use `subscription_plan` / `billing_cycle` terminology (D-03)"
    - "ROADMAP.md Phase 19 success criteria reworded to match new column names (D-03)"
  artifacts:
    - path: "src/features/billing/lib/plan-config.ts"
      provides: "PLAN_CONFIG literal const + SubscriptionPlan/BillingCycle types"
      exports: ["PLAN_CONFIG", "SubscriptionPlan", "BillingCycle"]
    - path: "src/features/billing/lib/plan-config.test.ts"
      provides: "Shape stability test for PLAN_CONFIG"
    - path: "src/features/auth/lib/normalize-email.ts"
      provides: "TS mirror of SQL normalize_email"
      exports: ["normalizeEmail"]
    - path: "src/features/auth/lib/normalize-email.test.ts"
      provides: "6-case parity tests vs SQL function"
    - path: "src/features/auth/actions/auth-actions.ts"
      provides: "Extended signInWithEmail passing IP via signUp options.data"
    - path: "src/app/auth/callback/route.ts"
      provides: "OAuth callback with signup_audit IP follow-up (idempotent)"
  key_links:
    - from: "src/features/auth/actions/auth-actions.ts"
      to: "supabase.auth.signInWithOtp options.data.ip"
      via: "headers().get('x-forwarded-for') first-comma split"
      pattern: "x-forwarded-for|data:\\s*\\{\\s*ip"
    - from: "src/app/auth/callback/route.ts"
      to: "public.signup_audit UPDATE WHERE user_id=? AND ip IS NULL"
      via: "inline service-role @supabase/supabase-js client"
      pattern: "signup_audit|SUPABASE_SERVICE_ROLE_KEY"
---

<objective>
Wire the application layer to the Phase 19 schema:
1. Create the TS source-of-truth `PLAN_CONFIG` const (D-05).
2. Create TS `normalizeEmail` mirroring the SQL function (parity tested).
3. Extend the magic-link signup server action to pass client IP via `signUp` metadata.
4. Extend `/auth/callback/route.ts` to capture IP and update the trigger-inserted `signup_audit` row idempotently for OAuth signups.
5. Reword PRIC-04, PRIC-14 in REQUIREMENTS.md and Phase 19 success criteria in ROADMAP.md to use `subscription_plan` / `billing_cycle` terminology (D-03).
6. Verify (grep) `startFreeTrial` symbol does not exist anywhere in `src/` (PRIC-05 acceptance — D-08).

Purpose: Closes the application half of PRIC-14 (IP capture + audit follow-up) and the documentation half of PRIC-05 (no `startFreeTrial`) and PRIC-04/PRIC-14 (terminology rewrite).

Output: 4 new TS files, 2 modified TS files, 2 modified planning docs.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/19-free-tier-enum-signup-flow/19-CONTEXT.md
@.planning/phases/19-free-tier-enum-signup-flow/19-RESEARCH.md
@.planning/phases/19-free-tier-enum-signup-flow/19-PATTERNS.md
@.planning/phases/19-free-tier-enum-signup-flow/19-VALIDATION.md
@CLAUDE.md
@src/features/billing/lib/types.ts
@src/features/billing/lib/credit-costs.ts
@src/features/billing/lib/credit-costs.test.ts
@src/features/auth/actions/auth-actions.ts
@src/app/auth/callback/route.ts
@src/app/api/stripe/webhook/route.ts

<interfaces>
Existing patterns to mirror (verbatim style):

`src/features/billing/lib/types.ts` `as const` literal config + derived types:
```typescript
export const CREDIT_COSTS: CreditCostMap = {
  like: 0,
  follow: 0,
  public_reply: 15,
  ...
} as const
```

Current `auth-actions.ts` (uses semicolons — keep them per CLAUDE.md §3 "match existing style"):
```typescript
"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email) return { error: "Email is required" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { success: true };
}
```

Inline service-role client pattern (`src/app/api/stripe/webhook/route.ts:58-62`):
```typescript
import { createClient as createServiceClient } from "@supabase/supabase-js"
const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```
Use this verbatim in `/auth/callback` for the signup_audit UPDATE (RLS denies authenticated). Do NOT extract a shared helper this phase (CLAUDE.md §2 simplicity).

Pitfall 3 — `x-forwarded-for` is comma-separated; first hop is client. Validate via simple regex `/^[\da-fA-F:.]+$/` before passing to `inet`. Drop to null on parse failure.

Pitfall 4 — OAuth callback fires on every login, not just first signup. Update must filter `WHERE user_id = ? AND ip IS NULL` to be idempotent for repeat logins.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create PLAN_CONFIG and normalizeEmail TS modules with parity tests</name>
  <files>src/features/billing/lib/plan-config.ts, src/features/billing/lib/plan-config.test.ts, src/features/auth/lib/normalize-email.ts, src/features/auth/lib/normalize-email.test.ts</files>
  <behavior>
PLAN_CONFIG (plan-config.test.ts):
- `PLAN_CONFIG.free.grant === 250`
- `PLAN_CONFIG.free.cap === 500`
- `PLAN_CONFIG.pro.grant === 2000`
- `PLAN_CONFIG.pro.cap === 4000`
- `Object.keys(PLAN_CONFIG)` is exactly `['free','pro']`
- Type assertion: `const _check: SubscriptionPlan = 'free'` and `'pro'` both compile

normalizeEmail (normalize-email.test.ts) — 6 cases mirroring SQL public.normalize_email:
- `normalizeEmail('plain@example.com') === 'plain@example.com'`
- `normalizeEmail('UPPER@EXAMPLE.COM') === 'upper@example.com'`
- `normalizeEmail('kamil.wandtke@gmail.com') === 'kamilwandtke@gmail.com'`
- `normalizeEmail('kamil+x@gmail.com') === 'kamil@gmail.com'`
- `normalizeEmail('Kamil.Wandtke+x@Googlemail.com') === 'kamilwandtke@gmail.com'`
- `normalizeEmail('with+alias@yahoo.com') === 'with+alias@yahoo.com'` (preserved for non-gmail)
  </behavior>
  <action>
**1. `src/features/billing/lib/plan-config.ts`** (per D-05; mirror style of `types.ts:11-25`, no semicolons):

```typescript
export const PLAN_CONFIG = {
  free: { grant: 250, cap: 500 },
  pro: { grant: 2000, cap: 4000 },
} as const

export type SubscriptionPlan = keyof typeof PLAN_CONFIG
export type BillingCycle = "monthly" | "annual"
```

No JSDoc comment block needed — matches `types.ts` minimalism. Single file per construct, no default exports (project convention).

**2. `src/features/billing/lib/plan-config.test.ts`** (mirror `types.test.ts:1-20`):

```typescript
import { describe, it, expect } from "vitest"

import { PLAN_CONFIG, type SubscriptionPlan } from "./plan-config"

describe("PLAN_CONFIG (PRIC-04, PRIC-14)", () => {
  it("free plan grants 250 credits with cap 500", () => {
    expect(PLAN_CONFIG.free).toEqual({ grant: 250, cap: 500 })
  })

  it("pro plan grants 2000 credits with cap 4000", () => {
    expect(PLAN_CONFIG.pro).toEqual({ grant: 2000, cap: 4000 })
  })

  it("contains exactly 2 plans", () => {
    expect(Object.keys(PLAN_CONFIG).sort()).toEqual(["free", "pro"])
  })

  it("SubscriptionPlan type allows 'free' and 'pro'", () => {
    const free: SubscriptionPlan = "free"
    const pro: SubscriptionPlan = "pro"
    expect(free).toBe("free")
    expect(pro).toBe("pro")
  })
})
```

**3. `src/features/auth/lib/normalize-email.ts`** (mirror `credit-costs.ts` shape — single named export, JSDoc on what + parity note):

```typescript
/**
 * TypeScript mirror of public.normalize_email() SQL function.
 *
 * Lowercase the email; for gmail.com / googlemail.com domains, strip dots
 * from the local part and drop everything from `+` onward, then rewrite
 * domain to gmail.com. Used by /auth/callback to recompute duplicate_flag
 * for OAuth signups (the SQL function is the canonical source; this TS
 * impl exists because the callback runs in app code).
 *
 * Parity is enforced by normalize-email.test.ts and the
 * scripts/test-trigger-19.mjs --normalize SQL smoke check.
 */
export function normalizeEmail(email: string): string {
  const lower = email.toLowerCase()
  const [local, domain] = lower.split("@") as [string, string]
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0]!.replace(/\./g, "")}@gmail.com`
  }
  return lower
}
```

**4. `src/features/auth/lib/normalize-email.test.ts`** (mirror `credit-costs.test.ts:1-25`):

```typescript
import { describe, it, expect } from "vitest"

import { normalizeEmail } from "./normalize-email"

describe("normalizeEmail (PRIC-14)", () => {
  it("preserves plain non-gmail addresses", () => {
    expect(normalizeEmail("plain@example.com")).toBe("plain@example.com")
  })

  it("lowercases mixed-case input", () => {
    expect(normalizeEmail("UPPER@EXAMPLE.COM")).toBe("upper@example.com")
  })

  it("strips dots from gmail local part", () => {
    expect(normalizeEmail("kamil.wandtke@gmail.com")).toBe("kamilwandtke@gmail.com")
  })

  it("strips +alias from gmail local part", () => {
    expect(normalizeEmail("kamil+x@gmail.com")).toBe("kamil@gmail.com")
  })

  it("rewrites googlemail.com to gmail.com and applies dot+plus rules", () => {
    expect(normalizeEmail("Kamil.Wandtke+x@Googlemail.com")).toBe("kamilwandtke@gmail.com")
  })

  it("preserves +alias for non-gmail domains", () => {
    expect(normalizeEmail("with+alias@yahoo.com")).toBe("with+alias@yahoo.com")
  })
})
```
  </action>
  <verify>
    <automated>pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email</automated>
  </verify>
  <done>
- 4 files exist at the specified paths
- `pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email` passes all 10 tests (4 PLAN_CONFIG + 6 normalizeEmail)
- `pnpm typecheck` clean
- `pnpm lint` clean
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend signInWithEmail with IP capture + extend /auth/callback with signup_audit follow-up</name>
  <files>src/features/auth/actions/auth-actions.ts, src/app/auth/callback/route.ts</files>
  <behavior>
auth-actions.ts:
- `signInWithEmail` reads `x-forwarded-for` from `headers()`, takes first comma-separated value, validates with regex `/^[\da-fA-F:.]+$/`, passes via `options.data.ip` (undefined when invalid/missing).
- Existing return shape unchanged: `{ error?: string, success?: true }`.
- `signInWithGoogle` body unchanged (no pre-redirect hook for IP capture — handled in callback).

/auth/callback/route.ts:
- After `exchangeCodeForSession` succeeds and `data.user` is present:
  1. Parse `request.headers.get('x-forwarded-for')` first-comma value with same regex.
  2. Build inline service-role client.
  3. Compute `duplicate_flag` via SELECT EXISTS against signup_audit (matching trigger logic).
  4. UPDATE signup_audit SET ip=?, duplicate_flag=? WHERE user_id=? AND ip IS NULL.
  5. Always redirect; swallow update errors (audit-only path).
- Idempotent on re-login: filter `ip IS NULL` ensures no overwrite once filled.
  </behavior>
  <action>
**1. Modify `src/features/auth/actions/auth-actions.ts`** — keep semicolons (this file's existing style per PATTERNS.md §"Code-style note").

Add helper at top of file (after imports, before `signInWithEmail`):

```typescript
function clientIp(): string | undefined {
  const xff = headers().get("x-forwarded-for");
  if (!xff) return undefined;
  const first = xff.split(",")[0]?.trim();
  if (!first) return undefined;
  return /^[\da-fA-F:.]+$/.test(first) ? first : undefined;
}
```

Add import at top:
```typescript
import { headers } from "next/headers";
```

Modify the `signInWithOtp` call inside `signInWithEmail`:

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    data: { ip: clientIp() },
  },
});
```

Do NOT modify `signInWithGoogle` body. Do NOT extract a shared helper file (CLAUDE.md §2/§3 — surgical change only).

**2. Modify `src/app/auth/callback/route.ts`** — extend, do not rewrite. The file currently uses semicolons; preserve them.

Final shape:

```typescript
import { NextResponse } from "next/server";

import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/features/auth/lib/normalize-email";

function parseClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  if (!first) return null;
  return /^[\da-fA-F:.]+$/.test(first) ? first : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Idempotent signup_audit IP follow-up for OAuth users (Pitfall 4).
      // For magic-link users, IP is already in raw_user_meta_data -> trigger
      // captured it -> WHERE ip IS NULL filters them out, this UPDATE is a no-op.
      const ip = parseClientIp(request);
      if (ip && data.user.email) {
        try {
          const service = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          const emailNormalized = normalizeEmail(data.user.email);
          // Recompute duplicate_flag against the same (email_normalized, ip) key.
          const { data: prev } = await service
            .from("signup_audit")
            .select("user_id")
            .eq("email_normalized", emailNormalized)
            .eq("ip", ip)
            .neq("user_id", data.user.id)
            .limit(1);
          const duplicate_flag = !!prev && prev.length > 0;
          await service
            .from("signup_audit")
            .update({ ip, duplicate_flag })
            .eq("user_id", data.user.id)
            .is("ip", null);
        } catch {
          // Audit-only path (D-11): never block signin/signup on audit failure.
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

Notes:
- The two clients coexist (SSR `createClient` for session exchange, inline service-role for audit UPDATE).
- `try/catch` swallows errors per D-11 (audit is informational, not blocking).
- The UPDATE filter `eq('user_id', userId).is('ip', null)` ensures idempotency on re-login.
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm lint && grep -q "x-forwarded-for" src/features/auth/actions/auth-actions.ts && grep -q "signup_audit" src/app/auth/callback/route.ts && grep -q "is(.ip., null)" src/app/auth/callback/route.ts</automated>
  </verify>
  <done>
- `pnpm typecheck` clean
- `pnpm lint` clean
- `auth-actions.ts` contains `x-forwarded-for` parsing and `data: { ip: clientIp() }` in `signInWithOtp`
- `route.ts` contains inline service-role client + `signup_audit` update + idempotent `ip IS NULL` filter
- `signInWithGoogle` body unchanged (diff shows only signInWithEmail + new helper)
- Manual UAT step (deferred to phase verify): magic-link signup on `pnpm dev --port 3001` against dev branch produces signup_audit row with non-null IP
  </done>
</task>

<task type="auto">
  <name>Task 3: Reword REQUIREMENTS.md PRIC-04 + PRIC-14 and ROADMAP.md Phase 19 success criteria; verify no startFreeTrial symbol</name>
  <files>.planning/REQUIREMENTS.md, .planning/ROADMAP.md</files>
  <action>
**1. REQUIREMENTS.md** — find the PRIC-04 and PRIC-14 entries. Update wording to use new column names (D-03):

PRIC-04 (current text likely references `subscription_tier`):
- Replace any `subscription_tier` mention with `subscription_plan` (ENUM with values `free`, `pro`).
- Replace any `billing_period` mention in the PRIC-04 entry with `billing_cycle` (ENUM `monthly`, `annual`).
- Add explicit note: "Quarterly tier dropped per PRICING.md §11."

PRIC-14 (current text likely references generic "tier" or old column names):
- Update to reference `users.credits_balance_cap` and `users.credits_included_monthly` as denormalized per-user columns (no JOIN-based lookup).
- Mention `signup_audit` table for `(email_normalized, ip)` tracking.
- Mention `normalize_email()` Postgres function + TS mirror.

PRIC-05 — leave wording largely intact, but verify it says "no `startFreeTrial` server action exists" (D-08); if it implies one previously existed and must be deleted, reword to "PRIC-05 confirms no `startFreeTrial` flow exists in the codebase".

Use surgical edits — find the exact bullet/section and rewrite only the wording, do not reflow surrounding requirements.

**2. ROADMAP.md** — find Phase 19 section. Update success criteria to use `subscription_plan` / `billing_cycle` terminology consistent with REQUIREMENTS.md changes above. Do not change the requirement IDs (PRIC-04, PRIC-05, PRIC-14) — only the descriptive text.

**3. PRIC-05 acceptance grep verification** — run from project root:

```bash
# This MUST return zero matches (PRIC-05 acceptance per D-08)
if grep -r "startFreeTrial" src/ ; then
  echo "FAIL: startFreeTrial symbol found in src/" && exit 1
else
  echo "OK: no startFreeTrial symbol in src/"
fi
```

If any matches appear, the executor MUST stop and surface to the user — D-08 says the symbol does not exist. Any match is a phase scope violation that requires investigation before proceeding.

**4. Commit**

```
git add .planning/REQUIREMENTS.md .planning/ROADMAP.md src/features/billing/lib/plan-config.ts src/features/billing/lib/plan-config.test.ts src/features/auth/lib/normalize-email.ts src/features/auth/lib/normalize-email.test.ts src/features/auth/actions/auth-actions.ts src/app/auth/callback/route.ts
git commit -m "feat(19-02): PLAN_CONFIG, normalizeEmail, IP capture, doc terminology rewrite (PRIC-05, PRIC-14)"
```
  </action>
  <verify>
    <automated>! grep -r "startFreeTrial" src/ && grep -q "subscription_plan" .planning/REQUIREMENTS.md && grep -q "subscription_plan" .planning/ROADMAP.md && grep -q "billing_cycle" .planning/REQUIREMENTS.md && pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email && pnpm typecheck</automated>
  </verify>
  <done>
- REQUIREMENTS.md PRIC-04 mentions `subscription_plan` and `billing_cycle` (no `subscription_tier` references in the PRIC-04 entry)
- REQUIREMENTS.md PRIC-14 mentions `credits_balance_cap`, `credits_included_monthly`, `signup_audit`, `normalize_email`
- ROADMAP.md Phase 19 success criteria use `subscription_plan` / `billing_cycle` terminology
- `grep -r "startFreeTrial" src/` returns zero matches (PRIC-05 acceptance)
- One commit `feat(19-02): ...` on `development`
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Next.js server action | Untrusted form data + `x-forwarded-for` header crosses |
| Next.js server action → Supabase Auth | IP value passed via `signUp` metadata into `auth.users.raw_user_meta_data` |
| OAuth provider → /auth/callback | Untrusted code param + `x-forwarded-for` header crosses |
| /auth/callback → public.signup_audit (service-role bypass) | Service-role key crosses RLS boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-02-01 | Spoofing | Attacker forges `x-forwarded-for` header | accept | Per D-11, IP is for soft anti-abuse audit only — not authentication. Hard-reject deferred. Forged IPs still get audit row; manual SQL review can spot `email_normalized` collisions across rotated IPs. [CITED: vercel.com/docs/edge-network/headers — Vercel always overwrites the leftmost client IP in production routing] |
| T-19-02-02 | Tampering | Malformed `x-forwarded-for` causes signup 500 | mitigate | Regex `/^[\da-fA-F:.]+$/` validation in both `clientIp()` (server action) and `parseClientIp()` (route handler); fall back to undefined/null on mismatch. Pitfall 3 mitigation. |
| T-19-02-03 | Information Disclosure | Service-role key leaks to client bundle | mitigate | `SUPABASE_SERVICE_ROLE_KEY` only referenced inside `route.ts` (server-only Route Handler) and via `process.env.*!` (server-only). Next.js does not bundle non-`NEXT_PUBLIC_` env vars to the client. Inline pattern matches existing `stripe/webhook/route.ts:58-62` precedent. |
| T-19-02-04 | Denial of Service | signup_audit UPDATE failure blocks login | mitigate | `try/catch` swallows all errors in the audit path (D-11 audit-only). User always reaches their landing page even if audit write fails. |
| T-19-02-05 | Repudiation | OAuth user audit row stays `ip=NULL` if callback throws before update | accept | Trigger inserted the row with `email_normalized` already; only IP enrichment is lost. Audit table remains usable for post-hoc review by `email_normalized` alone. Pre-launch acceptable. |
| T-19-02-06 | Elevation of Privilege | Inline service-role client used outside route handler | mitigate | Pattern is local to `/auth/callback/route.ts` only; no helper extracted (CLAUDE.md §2 simplicity). Code review can grep `SUPABASE_SERVICE_ROLE_KEY` and verify it appears only in route handlers and server-side cron files. |
| T-19-02-07 | Tampering | TS `normalizeEmail` drifts from SQL `public.normalize_email` | mitigate | Vitest parity tests cover the 6 canonical inputs; the Wave 0 harness `--normalize` smoke runs the same 6 inputs against the SQL function. Drift is detected on the next CI / manual `--quick` run. |
| T-19-02-08 | Information Disclosure | Doc rewrite leaks pre-launch user count or other internal data | accept | REQUIREMENTS.md and ROADMAP.md are tracked in git but not user-facing artifacts. Wording change is purely terminological. |
</threat_model>

<verification>
After all 3 tasks complete:

```bash
# Test suite green
pnpm vitest run src/features/billing/lib/plan-config src/features/auth/lib/normalize-email

# Typecheck + lint clean
pnpm typecheck && pnpm lint

# PRIC-05 acceptance — symbol absent
! grep -r "startFreeTrial" src/

# Doc rewrite landed
grep -q "subscription_plan" .planning/REQUIREMENTS.md
grep -q "billing_cycle" .planning/REQUIREMENTS.md
grep -q "subscription_plan" .planning/ROADMAP.md

# Server action + callback wired
grep -q "x-forwarded-for" src/features/auth/actions/auth-actions.ts
grep -q "data: { ip" src/features/auth/actions/auth-actions.ts
grep -q "signup_audit" src/app/auth/callback/route.ts
grep -q "SUPABASE_SERVICE_ROLE_KEY" src/app/auth/callback/route.ts

# Service role key not leaked to client bundle (Next.js env-var rules already enforce this; sanity check)
! grep -r "SUPABASE_SERVICE_ROLE_KEY" src/components/

# Wave 0 harness still all-green post-application
node scripts/test-trigger-19.mjs --quick

# Commit landed on development
git log -1 --oneline | grep -q "19-02"
```

Manual UAT (deferred to phase-level `/gsd-verify-work`, captured in VALIDATION.md "Manual-Only Verifications"):
1. `pnpm dev --port 3001` against dev branch → magic-link signup with new email → verify `signup_audit` row has non-null `ip`.
2. Google OAuth signup → verify `signup_audit` row has non-null `ip` (callback follow-up worked).
3. Repeat magic-link signup with `kamil.wandtke+test1@gmail.com` then `kamilwandtke+test2@gmail.com` from same machine → second `signup_audit` row has `duplicate_flag=true`.
</verification>

<success_criteria>
- 4 new TS files (plan-config.ts + test, normalize-email.ts + test) exist, lint+typecheck clean, all 10 tests pass
- `auth-actions.ts` extends `signInWithEmail` to pass `data.ip` via `signInWithOtp` options; semicolon style preserved
- `/auth/callback/route.ts` updates `signup_audit` row idempotently using inline service-role client
- REQUIREMENTS.md PRIC-04 + PRIC-14 reworded to `subscription_plan` / `billing_cycle` terminology
- ROADMAP.md Phase 19 success criteria reworded to match
- `grep -r "startFreeTrial" src/` zero matches (PRIC-05 acceptance per D-08)
- Wave 0 harness `--quick` continues to pass with all 7 OK lines
- One commit `feat(19-02): ...` on `development`
- No push to remote
</success_criteria>

<output>
After completion, create `.planning/phases/19-free-tier-enum-signup-flow/19-02-SUMMARY.md` recording:
- 4 new TS files + 2 modified TS files
- Doc rewrite scope (REQUIREMENTS.md PRIC-04/PRIC-14, ROADMAP.md Phase 19)
- PRIC-05 grep verification result (zero matches)
- Wave 0 harness post-state confirmation
- Manual UAT items deferred to `/gsd-verify-work` per VALIDATION.md
</output>
