# Phase 17: Residential Proxy + GoLogin Profile Allocator — Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 5 new/modified
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/browser-profiles/lib/country-map.ts` (NEW) | utility (constant + helper) | pure transform | `src/features/accounts/lib/types.ts` (typed unions + helper fn) | role-match |
| `src/features/browser-profiles/lib/allocator.ts` (NEW) | service (orchestrator) | request-response (DB writes + REST) | `src/features/accounts/actions/account-actions.ts:21-69` (`connectAccount`) | role-match (closest end-to-end orchestration in repo) |
| `src/lib/gologin/client.ts` (MODIFY) | utility (REST client) | request-response | self — own existing functions `createProfile`/`deleteProfile`/`startCloudBrowser` | exact (extending the same module) |
| `src/features/accounts/actions/account-actions.ts` (MODIFY — `connectAccount`) | server-action (controller) | request-response | self — current `connectAccount` becomes a thin wrapper, `deleteAccount` lines 179–221 is rollback analog | exact |
| `src/features/accounts/components/account-list.tsx` (MODIFY — pending state copy) | component (UI) | event-driven | self — `submitting` state at lines 84–86 already exists; only inline label changes | exact |

## Pattern Assignments

### `src/features/browser-profiles/lib/country-map.ts` (NEW)

**Analog:** `src/features/accounts/lib/types.ts` lines 10–25 (string-literal union + interface) and helper-fn shape from `getWarmupState` (same file lines 92–145).

**Pattern to copy — typed-union + Record-keyed map + throwing helper:**

```ts
// Shape — adapted from types.ts:10 (HealthStatus union) + types.ts:17 (BrowserProfile interface)
export type SupportedCountry = "US" | "GB" | "DE" | "PL" | "FR" | "CA" | "AU"

export const COUNTRY_MAP: Record<
  SupportedCountry,
  { timezone: string; locale: string; userAgent: string; language: string }
> = {
  US: { timezone: "America/New_York", locale: "en-US", language: "en-US,en", userAgent: UA_CHROME_130_WIN64 },
  // ... 6 more from CONTEXT D-12
}

export function mapForCountry(code: string) {
  if (!(code in COUNTRY_MAP)) {
    throw new Error(`Unsupported country_code: ${code}`)
  }
  return COUNTRY_MAP[code as SupportedCountry]
}
```

**UA constant source:** `src/lib/gologin/client.ts:54-55` — copy the existing Chrome 130 Win64 string verbatim (D-08 mandates same major across all 7 countries).

**No imports** required beyond TypeScript primitives. Zero runtime deps. Pure module.

---

### `src/features/browser-profiles/lib/allocator.ts` (NEW)

**Analog:** `src/features/accounts/actions/account-actions.ts:21-69` (`connectAccount` — current orchestrator) + lines 205–217 (best-effort cleanup pattern from `deleteAccount`).

**Imports pattern** (mirror `account-actions.ts:1-11`, but no `"use server"` — allocator is a plain module):

```ts
import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createProfileV2,
  patchProfileFingerprints,
  deleteProfile,
  startCloudBrowser,
} from "@/lib/gologin/client"
import { mapForCountry, type SupportedCountry } from "./country-map"
import { getBrowserProfileForAccount } from "./get-browser-profile" // sibling
```

**Supabase-client-as-parameter pattern** (from `get-browser-profile.ts:13-16` — Phase 15 D-08):

```ts
export async function allocateBrowserProfile(args: {
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  country: SupportedCountry
  supabase: SupabaseClient
}): Promise<{ browserProfileId: string; gologinProfileId: string; cloudBrowserUrl: string }>
```

**Best-effort rollback pattern** — copy from `account-actions.ts:205-217`:

```ts
// Best-effort GoLogin cleanup — don't fail the whole op if these 500.
if (account?.gologin_profile_id) {
  try {
    await stopCloudBrowser(account.gologin_profile_id)
  } catch {
    // ignore
  }
  try {
    await deleteProfile(account.gologin_profile_id)
  } catch {
    // ignore
  }
}
```

For allocator: wrap each post-`createProfileV2` step in `try { … } catch (err) { if (newlyCreated) await deleteProfile(gologinProfileId).catch(() => {}); throw err }`.

**Reuse-lookup query** — sibling export style, same supabase param shape as `getBrowserProfileById` (`get-browser-profile.ts:33-44`):

```ts
const { data } = await supabase
  .from("browser_profiles")
  .select("id, gologin_profile_id")
  .eq("user_id", userId)
  .eq("country_code", country)
  .not("id", "in",
    `(SELECT browser_profile_id FROM social_accounts
       WHERE platform = '${platform}' AND browser_profile_id IS NOT NULL)`,
  )
  .order("created_at", { ascending: true })
  .limit(1)
  .maybeSingle()
```

(Plan-phase verifies whether the subquery form is supported via PostgREST `not.in` or needs a two-step SELECT-then-filter.)

**`revalidatePath` pattern** — from `account-actions.ts:67`:

```ts
revalidatePath("/accounts")
```

---

### `src/lib/gologin/client.ts` (MODIFY)

**Analog:** itself. Existing `createProfile` (lines 41–73) is the template for `createProfileV2`; existing `deleteProfile` (lines 80–92) is the template for `patchProfileFingerprints`.

**REST-call shape** (lines 41–73 — every wrapper follows this):

```ts
export async function createProfileV2(args: {
  accountHandle: string
  countryCode: string
  navigator: { userAgent: string; resolution: string; language: string; platform: string }
  startUrl?: string
  timezone: string
}): Promise<{ id: string; proxy?: { id?: string } }> {
  const response = await fetch(`${GOLOGIN_API}/browser`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: `repco-${args.accountHandle}`,
      os: "win",
      browserType: "chrome",
      startUrl: args.startUrl ?? "",
      navigator: args.navigator,
      timezone: { enabled: true, fillBasedOnIp: false, timezone: args.timezone },
      proxy: { mode: "geolocation", autoProxyRegion: args.countryCode, autoProxyCity: "" },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin createProfileV2 failed (${response.status}): ${body}`)
  }

  return (await response.json()) as { id: string; proxy?: { id?: string } }
}
```

**Key changes vs legacy `createProfile` (line 60):** `proxy: { mode: "gologin" }` → `proxy: { mode: "geolocation", autoProxyRegion, autoProxyCity: "" }`. UA is now passed in via `navigator` arg, not hardcoded.

**`patchProfileFingerprints` shape** — copy `deleteProfile` (lines 80–92) but POST with empty body:

```ts
export async function patchProfileFingerprints(profileId: string): Promise<void> {
  // Path TBC by plan-phase probe (Open Question #1 in 17-RESEARCH.md)
  const response = await fetch(`${GOLOGIN_API}/browser/${profileId}/fingerprints`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GoLogin patchProfileFingerprints failed (${response.status}): ${body}`)
  }
}
```

**Error-handling pattern** (lines 64–69, 86–91, 117–122): always `if (!response.ok) { const body = await response.text(); throw new Error(...) }`. Never swallow REST errors at the wrapper level — caller decides.

**Removal:** `createProfile` (lines 41–73) is deleted once `connectAccount` migrates (D-15: "no other callers, confirmed via grep").

---

### `src/features/accounts/actions/account-actions.ts` — `connectAccount` rewrite

**Analog:** itself, lines 21–69 (current shape).

**Server-action return-shape pattern** (line 29, 49, 66, 68):

```ts
"use server"
// auth gate
if (!user) return { error: "Not authenticated" }
// orchestration
try {
  const { browserProfileId, gologinProfileId, cloudBrowserUrl } =
    await allocateBrowserProfile({
      userId: user.id,
      platform,
      handle: effectiveHandle,
      country: "US", // D-01: hardcoded for this phase
      supabase,
    })
  return { success: true, accountId: ..., profileId: gologinProfileId }
} catch (err) {
  return { error: "Could not set up the account right now — please try again in a moment." } // D-11 copy
}
```

**Auth pattern** (lines 25–29) — keep as-is:

```ts
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }
```

**LinkedIn handle placeholder** (lines 34–37) — keep verbatim; allocator receives the resolved handle.

---

### `src/features/accounts/components/account-list.tsx` — pending-state copy

**Analog:** itself, lines 36–40 (`submitting` state) + 84–86 (set/await/clear).

**Pattern (already in place):**

```ts
const [submitting, setSubmitting] = useState(false)
// ...
setSubmitting(true)
const result = await connectAccount("reddit", handle)
setSubmitting(false)
```

**Spinner pattern** — copy from `connection-flow.tsx:106-110`:

```tsx
{submitting && (
  <div className="flex items-center gap-2 text-base">
    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    <span>Setting up your account...</span>
  </div>
)}
```

**Button-disabled guard** (D-09: only race-protection layer) — already at lines 135, 143:

```tsx
<Button onClick={...} disabled={isPending || submitting}>
```

Just add `submitting` to the existing `disabled={isPending}` expression on the Reddit/LinkedIn submit button. No new component.

## Shared Patterns

### Supabase-client-as-parameter (no singleton)

**Source:** `src/features/browser-profiles/lib/get-browser-profile.ts:13-16` (Phase 15 D-08)
**Apply to:** `allocator.ts` only. Server actions still call `createClient()` themselves and pass it in.

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
export async function fn(args: { ...; supabase: SupabaseClient }) { ... }
```

### Best-effort GoLogin cleanup

**Source:** `src/features/accounts/actions/account-actions.ts:205-217` (`deleteAccount`)
**Apply to:** Allocator's catch blocks for steps 4/5/6 of the algorithm. Same `try { await deleteProfile(id) } catch { /* ignore + log */ }` shape — but raise the original error to the caller.

### REST-wrapper error shape

**Source:** `src/lib/gologin/client.ts:64-69` (and four more identical blocks at 86, 117, 144, 167)
**Apply to:** All new wrappers in `client.ts` — `createProfileV2`, `patchProfileFingerprints`. Never modify the response body before throw.

### Server-action result shape

**Source:** `src/features/accounts/actions/account-actions.ts:29, 49, 66, 68`
**Apply to:** `connectAccount` rewrite. Return `{ error }` on failure, `{ success: true, ...payload }` on success. UI already knows how to render `error`.

### Inline `Loader2` spinner

**Source:** `src/features/accounts/components/connection-flow.tsx:107-110`
**Apply to:** Connect-dialog pending state in `account-list.tsx`. Same Lucide `Loader2 h-4 w-4 animate-spin text-muted-foreground` styling.

## No Analog Found

None — every new artifact has a close existing reference.

## Metadata

**Analog search scope:**
- `src/lib/gologin/**`
- `src/features/accounts/**`
- `src/features/browser-profiles/**`
- `src/features/accounts/lib/types.ts`

**Files scanned:** 9 read in full or in targeted ranges
**Pattern extraction date:** 2026-04-27
