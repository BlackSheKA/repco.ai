---
phase: 18
plan: 04
type: execute
wave: 3
depends_on:
  - 18-01
  - 18-02
files_modified:
  - src/components/ui/alert.tsx
  - src/features/accounts/components/health-badge.tsx
  - src/components/account-degraded-banner.tsx
  - src/components/account-degraded-banner.test.tsx
  - src/app/(app)/layout.tsx
  - src/features/accounts/server/attempt-reconnect.ts
  - src/features/accounts/server/attempt-reconnect.test.ts
  - src/features/accounts/components/account-card.tsx
autonomous: true
requirements:
  - BPRX-09
must_haves:
  truths:
    - "shadcn Alert primitive installed at src/components/ui/alert.tsx"
    - "HealthBadge HEALTH_STYLES extended with 'needs_reconnect' (#3B82F6) and 'captcha_required' (#8B5CF6)"
    - "Top-of-dashboard banner renders in (app)/layout.tsx whenever any account has health_status IN (warning,cooldown,banned,needs_reconnect,captcha_required)"
    - "Banner uses shadcn Alert with destructive variant when ANY row is 'banned'; default variant otherwise"
    - "Account-card shows Reconnect button when health_status IN (needs_reconnect,captcha_required)"
    - "attemptReconnect server action runs runRedditPreflight; on 'ok' clears health_status to 'healthy' (or 'warmup' if warmup not yet completed)"
  artifacts:
    - path: "src/components/account-degraded-banner.tsx"
      provides: "Server component: renders shadcn Alert per degraded account; null when empty"
    - path: "src/features/accounts/server/attempt-reconnect.ts"
      provides: "Server action: runs preflight + clears status on ok"
      exports: ["attemptReconnect"]
    - path: "src/components/ui/alert.tsx"
      provides: "shadcn Alert primitive (added via npx shadcn add alert)"
  key_links:
    - from: "src/app/(app)/layout.tsx"
      to: "<AccountDegradedBanner>"
      via: "extended IN-list query passes degraded array prop"
      pattern: "AccountDegradedBanner"
    - from: "src/features/accounts/components/account-card.tsx"
      to: "attemptReconnect server action"
      via: "Reconnect button onClick"
      pattern: "attemptReconnect"
    - from: "attemptReconnect"
      to: "runRedditPreflight (Plan 02 output)"
      via: "shared helper from src/features/accounts/lib/reddit-preflight.ts"
      pattern: "runRedditPreflight"
---

<objective>
Land the user-facing recovery surface for the three new account-degraded states (`banned`, `needs_reconnect`, `captcha_required`): shadcn Alert primitive + HealthBadge tints, top-of-dashboard banner that lists every degraded account, account-card Reconnect button, and the `attemptReconnect` server action that automatically clears `health_status` when preflight verifies the account is clean.

Purpose: ships the recovery loop required to make Plan 02's `'needs_reconnect'` and Plan 03's `'captcha_required'` actionable. Without this plan the worker quarantine guard locks accounts and the user has no in-app path to clear them (RESEARCH §8).

Output: 1 shadcn primitive + HealthBadge map extension + 1 new banner server component + (app)/layout.tsx query extension + account-card Reconnect button + attemptReconnect server action + colocated tests.

Splits Phase 18's UI surface off from Plan 03 (per plan-checker scope-sanity blocker — Plan 03 was 8 tasks, exceeds 5-task threshold).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-CONTEXT.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md
@src/features/accounts/components/account-card.tsx
@src/features/accounts/components/health-badge.tsx
@src/app/(app)/layout.tsx

<interfaces>
<!-- runRedditPreflight from Plan 02 (PATTERNS §4) -->

```ts
// src/features/accounts/lib/reddit-preflight.ts (Plan 02 output)
export async function runRedditPreflight(args: {
  handle: string
  supabase: SupabaseClient
  accountId: string
}): Promise<
  | { kind: "ok" }
  | { kind: "banned"; reason: "suspended" | "low_karma" | "404" | "403" }
  | { kind: "transient"; error: string }
>
```

<!-- Existing layout.tsx query (PATTERNS §11) -->

```ts
// src/app/(app)/layout.tsx:32 (current)
.in("health_status", ["warning", "cooldown", "banned"])
// note: currently selects count via {count:'exact', head:true} — must be changed to row fetch
```

<!-- Existing health-badge HEALTH_STYLES map (PATTERNS §12 + UI-SPEC §Color) -->

The map is a `Record<HealthStatus, { label, bg, fg, border }>` keyed by status. Add two entries:
- `needs_reconnect`: blue `#3B82F6` (bg `rgba(59,130,246,0.15)`, border `rgba(59,130,246,0.3)`), label `"Needs reconnect"`
- `captcha_required`: violet `#8B5CF6` (bg `rgba(139,92,246,0.15)`, border `rgba(139,92,246,0.3)`), label `"Captcha needed"`

<!-- Existing account-card LogIn button analog (PATTERNS §12) -->

```tsx
// account-card.tsx:158-178 — pattern reference
<Button type="button" variant="ghost" size="sm" className="h-7"
  onClick={() => onReconnect(account.id, account.browser_profile_id, account.platform)}
  aria-label={verified ? `Re-login...` : `Log in...`}>
  <LogIn className="mr-1 h-3.5 w-3.5" />
  {verified ? "Re-login" : "Log in"}
</Button>
```

New Reconnect button is a SIBLING; uses `variant="default"` (primary) and Phosphor `ArrowSquareOut` icon (UI-SPEC §Account-card).

<!-- attemptReconnect analog (PATTERNS §7) -->

```ts
// src/features/accounts/actions/account-actions.ts:90-134 — analog
"use server"
export async function startAccountBrowser(accountId: string): Promise<{success, url?, error?}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }
  const { data: account } = await supabase.from("social_accounts")
    .select("...").eq("id", accountId).eq("user_id", user.id).single()
  // ...
}
```
</interfaces>

<critical_constraints>
- Plan 01 must be applied (depends_on: 18-01) — provides the `'needs_reconnect'` and `'captcha_required'` ENUM values referenced throughout.
- Plan 02 must be applied (depends_on: 18-02) — Plan 02 ships `runRedditPreflight` which `attemptReconnect` calls.
- This plan does NOT touch `src/lib/action-worker/worker.ts` (Plan 03 owns that). No file overlap with Plan 03 — Plans 03 and 04 can run in parallel within Wave 3.
- UI-SPEC §Color: status tints are inline RGBA (matching existing HEALTH_STYLES pattern at health-badge.tsx:6-40), NOT new CSS variables.
- Memory `feedback_no_proxy_ux_complexity`: never expose "proxy" / "profile" / "fingerprint" in UI copy.
- Memory `feedback_landing_copy_style`: sentence case, no eyebrow pills, no exclamation marks.
- Memory `feedback_credit_ui_no_burn_math`: banner copy must NOT mention burn rate or "X days remaining".
- `await logger.flush()` before any return path in attemptReconnect (CLAUDE.md §Critical Rules) — server action.
- Path `(app)` layout file: in tools/grep, brackets must be escaped — actual filesystem path is literally `src/app/(app)/layout.tsx`.
</critical_constraints>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add shadcn Alert primitive + extend HealthBadge with two new entries</name>
  <read_first>
    - src/features/accounts/components/health-badge.tsx (lines 6-40 — HEALTH_STYLES map shape)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md §Color (exact tints + labels)
    - components.json (preset: radix-nova; iconLibrary: phosphor)
  </read_first>
  <files>
    src/components/ui/alert.tsx
    src/features/accounts/components/health-badge.tsx
  </files>
  <action>
**Step A** — Run `npx shadcn@latest add alert` to install the official shadcn Alert primitive into `src/components/ui/alert.tsx`. Confirm it's added (file should exist after the command completes; the radix-nova preset is already configured in components.json).

If `npx shadcn@latest add alert` is non-interactive in CI, the alternative is to manually create `src/components/ui/alert.tsx` matching the radix-nova `alert` template. Prefer the CLI add — it ensures preset alignment.

**Step B** — Extend `HEALTH_STYLES` in `src/features/accounts/components/health-badge.tsx`. Add two new entries to the existing map (mirror the inline-RGBA shape at lines 6-40):

```ts
needs_reconnect: {
  label: "Needs reconnect",
  bg: "rgba(59, 130, 246, 0.15)",
  border: "rgba(59, 130, 246, 0.3)",
  fg: "#3B82F6",
},
captcha_required: {
  label: "Captcha needed",
  bg: "rgba(139, 92, 246, 0.15)",
  border: "rgba(139, 92, 246, 0.3)",
  fg: "#8B5CF6",
},
```

If `HEALTH_STYLES` is typed as `Record<HealthStatus, ...>`, also expand the `HealthStatus` union type to include `'needs_reconnect' | 'captcha_required'`. Aria-label pattern stays `Health status: {status}` per UI-SPEC §Accessibility.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');if(!fs.existsSync('src/components/ui/alert.tsx')){console.error('alert.tsx missing');process.exit(1);}const h=fs.readFileSync('src/features/accounts/components/health-badge.tsx','utf8');const checks=[/needs_reconnect:\s*\{/, /captcha_required:\s*\{/, /\"Needs reconnect\"/, /\"Captcha needed\"/, /59,\s*130,\s*246/, /139,\s*92,\s*246/];const missing=checks.filter(r=>!r.test(h));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - File `src/components/ui/alert.tsx` exists (shadcn primitive)
    - `health-badge.tsx` HEALTH_STYLES map contains entries for both `needs_reconnect` and `captcha_required`
    - Labels are exactly `"Needs reconnect"` and `"Captcha needed"` (UI-SPEC sentence case)
    - Tints are exact RGBA values from UI-SPEC §Color
    - `HealthStatus` union (or equivalent) accepts both new values
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Alert primitive installed; HealthBadge map extended; types compile.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build AccountDegradedBanner server component + extend (app)/layout.tsx query</name>
  <read_first>
    - src/app/(app)/layout.tsx (full file — line ~32 query, where to render banner above {children})
    - src/features/accounts/components/health-badge.tsx (post-Task-1 — HealthBadge accepts new statuses)
    - src/components/ui/alert.tsx (post-Task-1 — installed)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md §Banner + §Component Inventory
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §6
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-20, V-21, V-22
  </read_first>
  <files>
    src/components/account-degraded-banner.tsx
    src/components/account-degraded-banner.test.tsx
    src/app/(app)/layout.tsx
  </files>
  <behavior>
    - V-20: 1 row passed → banner renders 1 row with handle + badge + button
    - V-21: empty array → component returns null (assert `container.firstChild === null`)
    - V-22: any row with `health_status='banned'` → variant="destructive" applied to outer Alert
    - 2+ rows → heading reads "Some accounts need attention"; 1 row → "1 account needs attention"
  </behavior>
  <action>
**File A — `src/components/account-degraded-banner.tsx` (NEW server component):**

```tsx
import * as React from "react"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { HealthBadge } from "@/features/accounts/components/health-badge"
import { Warning, WarningOctagon, ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"

export type DegradedAccount = {
  id: string
  handle: string
  platform: "reddit" | "linkedin"
  health_status: "warning" | "cooldown" | "banned" | "needs_reconnect" | "captcha_required"
}

const REASON_COPY: Record<DegradedAccount["health_status"], string> = {
  banned: "Account suspended on the platform.",
  warning: "Recent failures — slowing down.",
  cooldown: "Cooling down after a failure.",
  needs_reconnect: "Logged out — please sign back in.",
  captcha_required: "Captcha is blocking actions.",
}

const BUTTON_LABEL: Record<DegradedAccount["health_status"], string> = {
  banned: "View",
  warning: "View",
  cooldown: "View",
  needs_reconnect: "Reconnect",
  captcha_required: "Reconnect",
}

export function AccountDegradedBanner({ accounts }: { accounts: DegradedAccount[] }) {
  if (accounts.length === 0) return null

  const hasBanned = accounts.some((a) => a.health_status === "banned")
  const variant = hasBanned ? "destructive" : "default"
  const heading =
    accounts.length === 1 ? "1 account needs attention" : "Some accounts need attention"
  const Icon = hasBanned ? WarningOctagon : Warning

  return (
    <Alert variant={variant} className="mb-6">
      <Icon className="h-4 w-4" />
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">These accounts are paused until you fix them:</p>
        <ul className="space-y-2">
          {accounts.map((a) => {
            const handleDisplay = a.platform === "reddit" ? `u/${a.handle}` : a.handle
            return (
              <li key={a.id} className="flex items-center gap-2">
                <span className="text-sm font-medium">{handleDisplay}</span>
                <HealthBadge status={a.health_status} />
                <span className="text-sm text-muted-foreground">{REASON_COPY[a.health_status]}</span>
                <Button asChild variant="default" size="sm" className="ml-auto">
                  <Link href={`/accounts#${a.id}`} aria-label={`${BUTTON_LABEL[a.health_status]} ${handleDisplay}`}>
                    {BUTTON_LABEL[a.health_status]}
                    <ArrowSquareOut className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
```

**File B — extend `src/app/(app)/layout.tsx:32`:**

The current query at line 32 reads (per PATTERNS §11):
```ts
.in("health_status", ["warning", "cooldown", "banned"])
```
with `count` only. Extend to:

1. Replace IN-list with: `.in("health_status", ["warning", "cooldown", "banned", "needs_reconnect", "captcha_required"])`
2. Switch from `count`-only to row fetch: `.select("id, handle, platform, health_status")`
3. Pass result array to `<AccountDegradedBanner accounts={degradedAccounts ?? []} />` rendered ABOVE `{children}` inside the layout's `<main>`.
4. Wrap the Supabase call in try/catch; on error, render banner with empty array (per UI-SPEC §Error state — "errors mask, never block").

Add import at top of layout.tsx:
```ts
import { AccountDegradedBanner } from "@/components/account-degraded-banner"
```

Sentry breadcrumb on query error per CLAUDE.md observability pattern.

**File C — colocated test `src/components/account-degraded-banner.test.tsx`:**

```tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { AccountDegradedBanner } from "./account-degraded-banner"

describe("AccountDegradedBanner", () => {
  it("V-21: returns null when array empty", () => {
    const { container } = render(<AccountDegradedBanner accounts={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("V-20: renders one row per degraded account", () => {
    const { getByText, getAllByRole } = render(
      <AccountDegradedBanner
        accounts={[
          { id: "a1", handle: "alice", platform: "reddit", health_status: "needs_reconnect" },
          { id: "a2", handle: "bob", platform: "reddit", health_status: "captcha_required" },
        ]}
      />,
    )
    expect(getByText("u/alice")).toBeTruthy()
    expect(getByText("u/bob")).toBeTruthy()
    expect(getAllByRole("link")).toHaveLength(2)
  })

  it("V-22: variant destructive when any row is banned", () => {
    const { container } = render(
      <AccountDegradedBanner
        accounts={[
          { id: "a1", handle: "alice", platform: "reddit", health_status: "banned" },
        ]}
      />,
    )
    // shadcn Alert applies variant via class — assert presence of destructive class or data-variant
    const alert = container.querySelector("[role='alert']")
    expect(alert?.className).toMatch(/destructive/)
  })

  it("singular vs plural heading", () => {
    const { getByText, rerender } = render(
      <AccountDegradedBanner accounts={[{ id: "a1", handle: "x", platform: "reddit", health_status: "warning" }]} />,
    )
    expect(getByText("1 account needs attention")).toBeTruthy()
    rerender(
      <AccountDegradedBanner
        accounts={[
          { id: "a1", handle: "x", platform: "reddit", health_status: "warning" },
          { id: "a2", handle: "y", platform: "reddit", health_status: "warning" },
        ]}
      />,
    )
    expect(getByText("Some accounts need attention")).toBeTruthy()
  })
})
```
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const b=fs.readFileSync('src/components/account-degraded-banner.tsx','utf8');const l=fs.readFileSync('src/app/(app)/layout.tsx','utf8');const checksB=[/export function AccountDegradedBanner/, /if \(accounts\.length === 0\) return null/, /hasBanned \? \"destructive\" : \"default\"/, /Some accounts need attention/, /1 account needs attention/, /These accounts are paused until you fix them/, /BUTTON_LABEL/, /REASON_COPY/];const checksL=[/AccountDegradedBanner/, /\"warning\", \"cooldown\", \"banned\", \"needs_reconnect\", \"captcha_required\"/, /select\(\"id, handle, platform, health_status\"\)/];const missing=[...checksB.filter(r=>!r.test(b)).map(r=>'B:'+r),...checksL.filter(r=>!r.test(l)).map(r=>'L:'+r)];if(missing.length){console.error('MISSING',missing);process.exit(1);}console.log('OK');" && pnpm vitest run src/components/account-degraded-banner.test.tsx && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `src/components/account-degraded-banner.tsx` exports `AccountDegradedBanner` server component + `DegradedAccount` type
    - Returns `null` when `accounts.length === 0`
    - Uses shadcn `<Alert>` with variant `"destructive"` iff any row has `health_status === "banned"`
    - Heading: "1 account needs attention" for length=1, "Some accounts need attention" otherwise (UI-SPEC sentence case)
    - REASON_COPY map matches UI-SPEC §Per-row status copy verbatim
    - Reconnect/View button labels per UI-SPEC §Per-row status copy
    - `src/app/(app)/layout.tsx` query IN-list contains all 5 statuses (added 2 new ones)
    - Layout switched from count-only to row fetch (`select("id, handle, platform, health_status")`)
    - Banner rendered above `{children}` in the `<main>` content area
    - 4+ test cases in `account-degraded-banner.test.tsx` covering V-20, V-21, V-22, singular/plural
    - `pnpm vitest run src/components/account-degraded-banner.test.tsx` exits 0
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Banner ships; layout extended; component tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add Reconnect button on AccountCard + attemptReconnect server action + tests</name>
  <read_first>
    - src/features/accounts/components/account-card.tsx (lines 158-178 — LogIn button analog)
    - src/features/accounts/actions/account-actions.ts (lines 90-159 — startAccountBrowser analog)
    - src/features/accounts/lib/reddit-preflight.ts (Plan 02 output)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §7, §12
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §8 (attemptReconnect resolution)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md §Account-card extension
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-23, V-24, V-25
  </read_first>
  <files>
    src/features/accounts/server/attempt-reconnect.ts
    src/features/accounts/server/attempt-reconnect.test.ts
    src/features/accounts/components/account-card.tsx
  </files>
  <behavior>
    - V-24: status `'needs_reconnect'`, runRedditPreflight returns `{kind:'ok'}` → updates `health_status='healthy'` (or `'warmup'` if `warmup_completed_at IS NULL`), returns `{success:true}`
    - V-25: status `'needs_reconnect'`, preflight returns `{kind:'banned',reason:'suspended'}` → leaves DB row unchanged, returns `{success:false, error:'still_banned'}`
    - preflight `{kind:'transient'}` → leaves row, returns `{success:false, error:'try_again'}`
    - Auth check: no user → returns `{success:false, error:'Not authenticated'}` (no DB read)
    - Account not found / not owned by user → returns `{success:false, error:'Account not found'}`
    - V-23: AccountCard renders Reconnect button iff `health_status IN ('needs_reconnect','captcha_required')`
  </behavior>
  <action>
**File A — `src/features/accounts/server/attempt-reconnect.ts` (NEW server action):**

```ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"

export async function attemptReconnect(
  accountId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const { data: account, error: accountError } = await supabase
    .from("social_accounts")
    .select("id, handle, platform, health_status, warmup_completed_at")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .single()
  if (accountError || !account) return { success: false, error: "Account not found" }

  // Reddit-only for this phase (per CONTEXT D-06). LinkedIn parity deferred.
  if (account.platform !== "reddit") {
    return { success: false, error: "platform_unsupported" }
  }

  const result = await runRedditPreflight({
    handle: account.handle,
    supabase,
    accountId: account.id,
  })

  if (result.kind === "banned") {
    return { success: false, error: "still_banned" }
  }
  if (result.kind === "transient") {
    return { success: false, error: "try_again" }
  }

  // result.kind === 'ok' — clear health_status. If warmup not yet completed, return to 'warmup'; else 'healthy'.
  const nextStatus = account.warmup_completed_at == null ? "warmup" : "healthy"
  const { error: updateError } = await supabase
    .from("social_accounts")
    .update({ health_status: nextStatus })
    .eq("id", account.id)
    .eq("user_id", user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  revalidatePath("/accounts")
  revalidatePath("/")
  return { success: true }
}
```

**File B — `src/features/accounts/server/attempt-reconnect.test.ts`:**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock supabase server client + runRedditPreflight
const supabaseDouble: any = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
const updates: Array<Record<string, unknown>> = []

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseDouble,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/features/accounts/lib/reddit-preflight", () => ({
  runRedditPreflight: vi.fn(),
}))

import { attemptReconnect } from "./attempt-reconnect"
import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"

function setupAccountFetch(account: any) {
  supabaseDouble.from.mockImplementation((_t: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: account, error: null }),
        }),
      }),
    }),
    update: (vals: Record<string, unknown>) => {
      updates.push(vals)
      return { eq: () => ({ eq: async () => ({ error: null }) }) }
    },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
})

describe("attemptReconnect", () => {
  it("returns Not authenticated when no user", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: null } })
    const r = await attemptReconnect("abc")
    expect(r).toEqual({ success: false, error: "Not authenticated" })
  })

  it("V-24: ok preflight clears status to 'healthy' when warmup completed", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    setupAccountFetch({ id: "a1", handle: "alice", platform: "reddit", health_status: "needs_reconnect", warmup_completed_at: new Date().toISOString() })
    ;(runRedditPreflight as any).mockResolvedValue({ kind: "ok" })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: true })
    expect(updates.at(-1)).toEqual({ health_status: "healthy" })
  })

  it("ok preflight returns to 'warmup' when warmup_completed_at is null", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    setupAccountFetch({ id: "a1", handle: "x", platform: "reddit", health_status: "needs_reconnect", warmup_completed_at: null })
    ;(runRedditPreflight as any).mockResolvedValue({ kind: "ok" })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: true })
    expect(updates.at(-1)).toEqual({ health_status: "warmup" })
  })

  it("V-25: banned preflight leaves row, returns still_banned", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    setupAccountFetch({ id: "a1", handle: "x", platform: "reddit", health_status: "needs_reconnect", warmup_completed_at: null })
    ;(runRedditPreflight as any).mockResolvedValue({ kind: "banned", reason: "suspended" })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "still_banned" })
    expect(updates.length).toBe(0)
  })

  it("transient preflight returns try_again", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    setupAccountFetch({ id: "a1", handle: "x", platform: "reddit", health_status: "needs_reconnect", warmup_completed_at: null })
    ;(runRedditPreflight as any).mockResolvedValue({ kind: "transient", error: "rate_limited" })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "try_again" })
  })

  it("LinkedIn account returns platform_unsupported", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } } })
    setupAccountFetch({ id: "a1", handle: "x", platform: "linkedin", health_status: "needs_reconnect", warmup_completed_at: null })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "platform_unsupported" })
  })
})
```

**File C — extend `src/features/accounts/components/account-card.tsx`:**

Add a sibling Reconnect button next to the existing LogIn button (lines 158-178). Visible only when `account.health_status === "needs_reconnect" || account.health_status === "captcha_required"`. Calls `attemptReconnect` server action via the standard React 19 server-action pattern (`onClick` calls a wrapper that invokes the action and surfaces toast on error).

Imports to add:
```tsx
import { ArrowSquareOut } from "@phosphor-icons/react"
import { attemptReconnect } from "@/features/accounts/server/attempt-reconnect"
import { toast } from "sonner"
```

Inside the component (next to the existing LogIn button), add a conditional Reconnect button:

```tsx
{(account.health_status === "needs_reconnect" || account.health_status === "captcha_required") && (
  <Button
    type="button"
    variant="default"
    size="sm"
    className="h-7"
    onClick={async () => {
      // Open cloud browser in new tab first (UI-SPEC primary action)
      if (account.cloud_browser_url) {
        window.open(account.cloud_browser_url, "_blank", "noopener,noreferrer")
      }
      // Then attempt reconnect via preflight
      const result = await attemptReconnect(account.id)
      if (result.success) {
        toast.success("Account reconnected")
      } else if (result.error === "still_banned") {
        toast.error("Account still banned — connect a different account")
      } else if (result.error === "try_again") {
        toast.warning("Couldn't verify — try again in a minute")
      } else {
        toast.error(result.error ?? "Reconnect failed")
      }
    }}
    aria-label={`Reconnect ${account.handle}`}
  >
    Reconnect
    <ArrowSquareOut className="ml-1 h-3.5 w-3.5" />
  </Button>
)}
```

Adjust `account.cloud_browser_url` to whatever field carries the GoLogin Cloud Browser URL on the existing AccountCard's `account` prop (read the file to confirm — could be `gologin_cloud_browser_url`, `browser_profile?.cloud_browser_url`, etc.). Per UI-SPEC §Interaction States: button is never disabled; if no URL, button is hidden — wrap with an additional `&& account.cloud_browser_url` guard if the URL field is optional.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const a=fs.readFileSync('src/features/accounts/server/attempt-reconnect.ts','utf8');const c=fs.readFileSync('src/features/accounts/components/account-card.tsx','utf8');const checksA=[/\"use server\"/, /export async function attemptReconnect/, /runRedditPreflight/, /result\.kind === \"banned\"/, /\"still_banned\"/, /\"try_again\"/, /warmup_completed_at == null \? \"warmup\" : \"healthy\"/, /revalidatePath\(\"\/accounts\"\)/];const checksC=[/attemptReconnect/, /needs_reconnect.*captcha_required|captcha_required.*needs_reconnect/, /Reconnect/, /ArrowSquareOut/];const missing=[...checksA.filter(r=>!r.test(a)).map(r=>'A:'+r),...checksC.filter(r=>!r.test(c)).map(r=>'C:'+r)];if(missing.length){console.error('MISSING',missing);process.exit(1);}console.log('OK');" && pnpm vitest run src/features/accounts/server/attempt-reconnect.test.ts && pnpm typecheck && pnpm lint</automated>
  </verify>
  <acceptance_criteria>
    - `src/features/accounts/server/attempt-reconnect.ts` exists with `"use server"` directive + `attemptReconnect` export
    - Auth check via `supabase.auth.getUser()` — returns `{success:false, error:"Not authenticated"}` when null
    - Account fetch scoped by `eq("user_id", user.id)` (RLS defense-in-depth)
    - Reddit-only (other platforms → `platform_unsupported`) per CONTEXT D-06
    - On `runRedditPreflight` returning `'ok'`: updates `health_status` to `'warmup'` if `warmup_completed_at` null, else `'healthy'`
    - On `'banned'`: returns `{success:false, error:"still_banned"}` with NO DB update
    - On `'transient'`: returns `{success:false, error:"try_again"}` with NO DB update
    - `revalidatePath("/accounts")` called on success path
    - `account-card.tsx` renders Reconnect button conditionally on `health_status IN ('needs_reconnect','captcha_required')`
    - Reconnect button uses `variant="default"` + `ArrowSquareOut` icon (UI-SPEC)
    - Reconnect button click opens cloud-browser URL in new tab via `window.open(..., "_blank", "noopener,noreferrer")`
    - 6 test cases in attempt-reconnect.test.ts covering V-24, V-25, transient, no-auth, not-found, linkedin
    - `pnpm vitest run src/features/accounts/server/attempt-reconnect.test.ts` exits 0
    - `pnpm typecheck && pnpm lint` exits 0
  </acceptance_criteria>
  <done>Server action + Reconnect button shipped; recovery loop functional; tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → `attemptReconnect` server action | unauthenticated session may invoke; auth gate is the only enforcement |
| `(app)/layout.tsx` query → all authenticated users | server-rendered banner reads social_accounts of the current user only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-18-04-01 | Spoofing | `attemptReconnect` invoked with another user's accountId | mitigate | Server action runs `supabase.auth.getUser()` first; account fetch scoped by `eq("user_id", user.id)`. Existing `startAccountBrowser` analog uses identical pattern. |
| T-18-04-02 | Information Disclosure | Banner reveals handles to wrong user | mitigate | Layout query runs against the SSR-authenticated client; RLS on social_accounts already restricts SELECT to row-owner (Phase 1+). Banner only sees what the user is allowed to see. |
| T-18-04-03 | Tampering | `attemptReconnect` called repeatedly to hammer Reddit fetch | mitigate | runRedditPreflight (Plan 02) has 1h cache via `last_preflight_at` — repeated calls within 1h after a successful preflight short-circuit at the cache layer (DB roundtrip but no network call). RESEARCH L-9 acknowledges this as acceptable. |
| T-18-04-04 | Elevation of Privilege | Server action mutates other user's row | mitigate | Update `eq("id", account.id).eq("user_id", user.id)` — RLS + explicit user_id filter both enforced. |
| T-18-04-05 | XSS | Banner renders user-controlled handle | mitigate | React auto-escapes; handle is plain text inside `<span>`. No `dangerouslySetInnerHTML`. |
</threat_model>

<verification>
After all 3 tasks pass:

1. `pnpm typecheck && pnpm lint` exits 0 from project root
2. `pnpm vitest run src/components/account-degraded-banner.test.tsx src/features/accounts/server/attempt-reconnect.test.ts` exits 0; covers V-20, V-21, V-22, V-23, V-24, V-25
3. Hand-verification on dev branch via `pnpm dev --port 3001`:
   - Set a dev account `health_status='needs_reconnect'` manually → banner appears at top of dashboard with Reconnect button
   - Click Reconnect → opens cloud-browser tab + calls attemptReconnect → toast shows result
   - Restore status to 'healthy' → banner disappears on next page load
   - Set `health_status='banned'` → banner uses destructive variant
</verification>

<success_criteria>
- shadcn Alert primitive shipped at src/components/ui/alert.tsx
- HealthBadge supports all 7 ENUM values with locked tints
- Banner visible whenever any account is degraded; null when none; destructive variant when ANY row is banned
- Account-card Reconnect button visible iff health_status IN (needs_reconnect, captcha_required)
- attemptReconnect recovery loop functional: degraded account → user clicks Reconnect → preflight → status cleared
- All component + server-action tests green
</success_criteria>

<output>
After completion, create `.planning/phases/18-cookies-persistence-preflight-ban-detection/18-04-SUMMARY.md` recording:
- Test pass counts (banner + server-action suites)
- V-IDs covered automatically vs deferred to manual QA (V-23 needs hand-verify against real degraded account)
- Whether the cloud-browser URL field name matched expectation or required adjustment in account-card.tsx
- Any drift from UI-SPEC (color/copy/spacing) that needed adjustment
</output>
