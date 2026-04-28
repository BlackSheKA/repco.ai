---
phase: 17
plan: 02
type: execute
wave: 2
depends_on: [17-01]
files_modified:
  - src/features/browser-profiles/lib/allocator.ts
  - src/features/accounts/actions/account-actions.ts
  - src/features/accounts/components/account-list.tsx
  - src/lib/gologin/client.ts
autonomous: false
requirements: [BPRX-03, BPRX-06]
tags: [phase-17, allocator, connect-account, gologin]

must_haves:
  truths:
    - "When a user clicks Connect Reddit/LinkedIn, the system either reuses an existing same-country browser_profile (no platform conflict) or allocates a new GeoProxy + GoLogin profile, then patches its fingerprint, before the connect-flow reaches the browser-login step"
    - "Two accounts on different platforms (one reddit, one linkedin) belonging to the same user with country='US' land on the SAME browser_profile_id row"
    - "A second reddit account creates a NEW browser_profile (different id from the first) because the first profile already has a reddit account"
    - "Allocation failure surfaces the exact copy from D-11 ('Could not set up the account right now — please try again in a moment.') and leaves no orphan rows in browser_profiles or social_accounts"
    - "GoLogin profile is best-effort deleted on post-create failure (newly-created path only); on reuse-path failure the existing GoLogin profile survives"
    - "Legacy createProfile in client.ts is removed; grep returns zero matches for `mode: \"gologin\"` across src/"
    - "Connect dialog shows a Loader2 spinner with copy 'Setting up your account...' for the entire allocation window (no proxy/profile/fingerprint terms exposed to the user)"
  artifacts:
    - path: src/features/browser-profiles/lib/allocator.ts
      provides: "allocateBrowserProfile orchestrator owning reuse lookup, GoLogin alloc, fingerprint patch, both DB inserts, revalidatePath, startCloudBrowser"
      contains: "export async function allocateBrowserProfile"
    - path: src/features/accounts/actions/account-actions.ts
      provides: "Refactored connectAccount that delegates to allocateBrowserProfile (D-14)"
      contains: "allocateBrowserProfile"
    - path: src/features/accounts/components/account-list.tsx
      provides: "Updated pending-state copy ('Setting up your account...') for both Reddit submit button and LinkedIn pending card"
      contains: "Setting up your account"
    - path: src/lib/gologin/client.ts
      provides: "Legacy createProfile export REMOVED (D-15)"
  key_links:
    - from: src/features/accounts/actions/account-actions.ts
      to: src/features/browser-profiles/lib/allocator.ts
      via: "connectAccount calls allocateBrowserProfile"
      pattern: "allocateBrowserProfile\\("
    - from: src/features/browser-profiles/lib/allocator.ts
      to: src/lib/gologin/client.ts
      via: "createProfileV2 + patchProfileFingerprints + deleteProfile + startCloudBrowser"
      pattern: "createProfileV2|patchProfileFingerprints"
    - from: src/features/browser-profiles/lib/allocator.ts
      to: browser_profiles + social_accounts tables
      via: "Two INSERTs in sequence with rollback on failure"
      pattern: "from\\(\"browser_profiles\"\\)|from\\(\"social_accounts\"\\)"
    - from: src/features/accounts/components/account-list.tsx
      to: D-09 race-protection
      via: "Button disabled={submitting} as the only race-protection layer"
      pattern: "disabled=\\{submitting"

user_setup: []
---

<objective>
Wire the allocator: implement the reuse-or-create algorithm in `src/features/browser-profiles/lib/allocator.ts`, refactor `connectAccount` to call it (D-14), update the `account-list.tsx` connect dialog copy to use the unified "Setting up your account..." pending state (UI-SPEC §State A), and remove the legacy `createProfile` export from `client.ts` (D-15). This plan closes BPRX-03 (residential GeoProxy allocation through the new chokepoint) and BPRX-06 (auto-reuse algorithm).

Purpose: After this plan ships, every new social account gets a country-matched residential GeoProxy + fingerprint-patched GoLogin profile via a single chokepoint, the legacy `mode: "gologin"` shared pool is unreachable from any code path, and the user sees no proxy/profile terminology.

Output:
  - `allocator.ts` with `allocateBrowserProfile({ userId, platform, handle, country, supabase })`
  - `connectAccount` reduced to auth gate + allocator call + return shape
  - `account-list.tsx` showing unified pending copy
  - Legacy `createProfile` deleted from `client.ts`
  - Manual UAT walkthrough recorded as the 5-row table in 17-VALIDATION.md
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-RESEARCH.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-PATTERNS.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-UI-SPEC.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md
@.planning/phases/17-residential-proxy-gologin-profile-allocator/17-01-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- Plan 01 outputs (now on disk) -->

From src/features/browser-profiles/lib/country-map.ts:
```ts
export type SupportedCountry = "US" | "GB" | "DE" | "PL" | "FR" | "CA" | "AU"
export interface CountryProfile {
  timezone: string; locale: string; userAgent: string; language: string
}
export const COUNTRY_MAP: Record<SupportedCountry, CountryProfile>
export function mapForCountry(code: string): CountryProfile  // throws on unknown
```

From src/lib/gologin/client.ts (post plan 01):
```ts
export async function createProfileV2(args: {
  accountHandle: string
  countryCode: string
  navigator: { userAgent: string; resolution: string; language: string; platform: string }
  timezone: string
  startUrl?: string
}): Promise<{ id: string; proxy?: { id?: string | null } | null; [k: string]: unknown }>

export async function patchProfileFingerprints(profileId: string): Promise<void>
export async function deleteProfile(profileId: string): Promise<void>
export async function startCloudBrowser(profileId: string): Promise<{ status: string; remoteOrbitaUrl: string }>
export async function getProfile(profileId: string): Promise<GoLoginProfile | null>
// LEGACY: createProfile(handle, startUrl?) — deleted by Task 3 of THIS plan.
```

From src/features/browser-profiles/lib/get-browser-profile.ts (Phase 15):
```ts
export async function getBrowserProfileForAccount(accountId: string, supabase: SupabaseClient): Promise<BrowserProfile | null>
export async function getBrowserProfileById(browserProfileId: string, supabase: SupabaseClient): Promise<BrowserProfile | null>
// BrowserProfile shape: { id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name }
```

From supabase/migrations/00023_browser_profiles.sql (Phase 15, on disk):
```
browser_profiles (id, user_id, gologin_profile_id UNIQUE NOT NULL, gologin_proxy_id UNIQUE NOT NULL,
                  country_code, timezone, locale, display_name nullable, created_at)
social_accounts.browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE
CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform)  -- D-04 enforcement
```

CRITICAL — `gologin_proxy_id` is `UNIQUE NOT NULL`. The probe in plan 01 (17-API-PROBE.md OQ#2) settled which value to write. If the probe found that geolocation mode echoes no stable proxy id, fall back to the documented strategy (likely: write the GoLogin profile id as a synthetic proxy id, OR coordinate a Phase 15.1 migration relaxing NOT NULL — read 17-API-PROBE.md before designing the INSERT).
</interfaces>

<decisions_pinned>
- D-01: country='US' hardcoded at every call site in this phase. Allocator function accepts `country: SupportedCountry` arg; `connectAccount` always passes `'US'`.
- D-02: Reuse rule = first-match WHERE user_id + country_code AND profile NOT IN (profiles with an account on the requested platform). Order by created_at ASC LIMIT 1.
- D-09: NO race lock. Button disabled is only guard. Two concurrent allocations may create two profiles — accepted.
- D-10: Best-effort `deleteProfile` rollback after createProfileV2 if any later step fails. On reuse-path failure, the GoLogin profile survives (it's still in valid use by other accounts).
- D-11: User-facing error copy is exactly `"Could not set up the account right now — please try again in a moment."`
- D-14: New module path `src/features/browser-profiles/lib/allocator.ts`, function name `allocateBrowserProfile`, return shape `{ browserProfileId, gologinProfileId, cloudBrowserUrl }`.
- D-15: Legacy `createProfile` REMOVED from `client.ts` in this plan.
- D-16: Mocked unit tests on the allocator are deferred. UAT covers correctness.
- UI-SPEC §State A: Unified "Setting up your account..." copy for both Reddit submit button label and LinkedIn pending card. Loader2 spinner reused (no new icon).
</decisions_pinned>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement allocateBrowserProfile orchestrator</name>
  <files>src/features/browser-profiles/lib/allocator.ts</files>
  <read_first>
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md (proxy id field decision)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-RESEARCH.md (§Allocator Algorithm pseudocode lines 107-170, §Failure Modes table)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-02, D-09, D-10, D-14)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-PATTERNS.md (§allocator.ts section, lines 51-127)
    - src/features/accounts/actions/account-actions.ts (lines 21-74 current connectAccount + lines 186-238 best-effort cleanup pattern)
    - src/features/browser-profiles/lib/get-browser-profile.ts (sibling export style; supabase-as-parameter pattern)
    - src/features/browser-profiles/lib/country-map.ts (mapForCountry + SupportedCountry from plan 01)
    - src/lib/gologin/client.ts (createProfileV2, patchProfileFingerprints, deleteProfile, startCloudBrowser shapes after plan 01)
    - supabase/migrations/00023_browser_profiles.sql (column types + UNIQUE constraints)
  </read_first>
  <action>
Create `src/features/browser-profiles/lib/allocator.ts`. This is the single chokepoint for browser_profile + social_account creation.

Imports:
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
```

Public surface:
```ts
export interface AllocateBrowserProfileArgs {
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  country: SupportedCountry  // per D-01, callers pass 'US' literally
  supabase: SupabaseClient
}

export interface AllocateBrowserProfileResult {
  browserProfileId: string
  gologinProfileId: string
  cloudBrowserUrl: string
  reused: boolean  // useful for Axiom logging in plan 02-03
}

export async function allocateBrowserProfile(
  args: AllocateBrowserProfileArgs,
): Promise<AllocateBrowserProfileResult>
```

Algorithm (from 17-RESEARCH.md §Allocator Algorithm). Implement in this exact order:

1. **Reuse lookup** (BPRX-06, D-02). Query `browser_profiles` filtered by `user_id` and `country_code`, exclude any profile that already has an account on the requested platform. Order by `created_at ASC`, `LIMIT 1`. Implementation note: PostgREST does not support arbitrary subqueries in `not.in`; use a two-step query — (a) `SELECT browser_profile_id FROM social_accounts WHERE platform = $platform AND browser_profile_id IS NOT NULL` to get the excluded set, (b) `SELECT * FROM browser_profiles WHERE user_id = $userId AND country_code = $country AND id NOT IN (excludedSet) ORDER BY created_at ASC LIMIT 1` (use `.not("id", "in", `(${ids.join(",")})`)` with array-as-csv when ids non-empty; skip the `.not` clause entirely when the excluded set is empty).

2. **Reuse path:** If a profile is found, skip to step 7 with `browserProfileId = found.id`, `gologinProfileId = found.gologin_profile_id`, `newlyCreated = false`.

3. **Allocate new (D-09 — no lock):** Resolve `const { timezone, locale, userAgent, language } = mapForCountry(args.country)` (throws on unknown — fail closed). Then call:
```ts
const created = await createProfileV2({
  accountHandle: args.handle,
  countryCode: args.country,
  navigator: { userAgent, resolution: "1920x1080", language, platform: "Win32" },
  timezone,
})
const gologinProfileId = created.id
const newlyCreated = true
```
Source the proxy id per `17-API-PROBE.md` OQ#2 (read the file). Examples of what the probe might have settled:
  - `created.proxy?.id` echoed inline → use that.
  - Required follow-up `getProfile(gologinProfileId)` → call it once and read `profile.proxy.id`.
  - No stable id available → use the fallback documented in the probe (e.g., reuse `gologinProfileId` as the proxy id placeholder so the UNIQUE NOT NULL constraint is satisfied; this is documented as accepted edge case in the probe).

4. **Patch fingerprint** (BPRX-04, D-07). Wrap in try/catch:
```ts
try {
  await patchProfileFingerprints(gologinProfileId)
} catch (err) {
  if (newlyCreated) {
    try { await deleteProfile(gologinProfileId) } catch { /* swallow + log */ }
  }
  throw err
}
```

5. **INSERT browser_profiles row.** Wrap in try/catch with same rollback shape. Generate `display_name` per RESEARCH §Open Questions #3 recommendation: `${args.country}-${seq}` where `seq` is `(SELECT COUNT(*) FROM browser_profiles WHERE user_id = $userId AND country_code = $country) + 1`. Use:
```ts
const { data: bpRow, error: bpErr } = await args.supabase
  .from("browser_profiles")
  .insert({
    user_id: args.userId,
    gologin_profile_id: gologinProfileId,
    gologin_proxy_id: <value-from-probe-step-3>,
    country_code: args.country,
    timezone,
    locale,
    display_name: `${args.country}-${seq}`,
  })
  .select("id")
  .single()
if (bpErr || !bpRow) {
  if (newlyCreated) { try { await deleteProfile(gologinProfileId) } catch {} }
  throw new Error(`Failed to insert browser_profile: ${bpErr?.message}`)
}
const browserProfileId = bpRow.id
```

6. (combined into 7 — no separate step needed)

7. **INSERT social_accounts row.** Try/catch — but only delete the GoLogin profile on rollback if `newlyCreated === true`:
```ts
const { data: saRow, error: saErr } = await args.supabase
  .from("social_accounts")
  .insert({
    user_id: args.userId,
    platform: args.platform,
    handle: args.handle,
    browser_profile_id: browserProfileId,
    health_status: "warmup",
    warmup_day: 1,
  })
  .select("id")
  .single()
if (saErr || !saRow) {
  if (newlyCreated) {
    // Also delete the browser_profiles row we inserted in step 5 — ON DELETE CASCADE
    // would clean it up if a different SA insert succeeded later, but here we own the rollback.
    try { await args.supabase.from("browser_profiles").delete().eq("id", browserProfileId) } catch {}
    try { await deleteProfile(gologinProfileId) } catch {}
  }
  // Surface UNIQUE-violation distinctly so the caller can pick the right user-facing copy.
  throw new Error(`Failed to insert social_account: ${saErr?.message}`)
}
```

8. **revalidatePath + start cloud browser:**
```ts
revalidatePath("/accounts")
const session = await startCloudBrowser(gologinProfileId)
return {
  browserProfileId,
  gologinProfileId,
  cloudBrowserUrl: session.remoteOrbitaUrl,
  reused: !newlyCreated,
}
```

Add a JSDoc header to the file documenting: D-09 no-lock concurrency caveat, D-10 best-effort rollback rule, D-02 reuse semantics. Reference these decision IDs in comments at the matching code locations (per "honor user decisions" rule — traceability).
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; grep -c "export async function allocateBrowserProfile" src/features/browser-profiles/lib/allocator.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/features/browser-profiles/lib/allocator.ts` exists.
    - `grep -c "export async function allocateBrowserProfile" src/features/browser-profiles/lib/allocator.ts` returns `1`.
    - `grep -E "createProfileV2|patchProfileFingerprints|deleteProfile|startCloudBrowser|mapForCountry" src/features/browser-profiles/lib/allocator.ts` returns at least 5 distinct match lines.
    - `grep -E "D-02|D-09|D-10" src/features/browser-profiles/lib/allocator.ts` returns at least 3 matches (decision-ID traceability comments).
    - `grep -c "newlyCreated" src/features/browser-profiles/lib/allocator.ts` returns at least `4` (rollback decision points).
    - `pnpm typecheck` passes.
    - File does NOT contain `"use server"` (it's a pure module — server actions import it).
  </acceptance_criteria>
  <done>Allocator can be imported and invoked; reuse-or-create logic, fingerprint patch, both DB inserts, and rollback paths are encoded with the D-02/D-09/D-10 semantics referenced inline.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor connectAccount + update connect dialog UI copy</name>
  <files>src/features/accounts/actions/account-actions.ts, src/features/accounts/components/account-list.tsx, src/features/browser-profiles/lib/allocator.ts</files>
  <read_first>
    - src/features/accounts/actions/account-actions.ts (lines 1-74 — current connectAccount; lines 186-238 — pattern reference only, do not modify deleteAccount)
    - src/features/accounts/components/account-list.tsx (lines 79-96 submitRedditHandle, lines 199-204 submit button copy, lines 225-237 LinkedIn pending card)
    - src/features/browser-profiles/lib/allocator.ts (Task 1 output)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-UI-SPEC.md (§State A — copy contract; §Copywriting Contract — exact strings)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-01, D-11, D-14)
  </read_first>
  <action>
Two file edits.

**File 1: `src/features/accounts/actions/account-actions.ts`** — refactor `connectAccount` to call the allocator (D-14). Other server actions (`skipWarmup`, `startAccountBrowser`, `stopAccountBrowser`, `deleteAccount`, `verifyAccountSession`) are NOT modified.

Update imports — remove `createProfile`, add `allocateBrowserProfile`:
```ts
import { allocateBrowserProfile } from "@/features/browser-profiles/lib/allocator"
import {
  deleteProfile,           // KEEP — deleteAccount still uses it
  startCloudBrowser,       // KEEP — startAccountBrowser still uses it
  stopCloudBrowser,        // KEEP — stop/delete account use it
} from "@/lib/gologin/client"
```

Rewrite `connectAccount` (replace lines 25-74 entirely):
```ts
export async function connectAccount(
  platform: "reddit" | "linkedin",
  handle: string,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // LinkedIn flow skips upfront handle (extracted post-login). Use placeholder.
  const effectiveHandle =
    platform === "linkedin" && !handle.trim()
      ? `linkedin-${user.id.slice(0, 8)}`
      : handle

  try {
    // D-01: country hardcoded 'US' in this phase. Future phases wire a real source here.
    const result = await allocateBrowserProfile({
      userId: user.id,
      platform,
      handle: effectiveHandle,
      country: "US",
      supabase,
    })
    return {
      success: true,
      accountId: undefined as string | undefined, // accountId no longer surfaced — see note
      profileId: result.gologinProfileId,
      cloudBrowserUrl: result.cloudBrowserUrl,
    }
  } catch (err) {
    // D-11: exact user-facing copy. Full err logged server-side via console + (existing logger if present).
    console.error("[connectAccount] allocation failed", { userId: user.id, platform, err })
    return {
      error: "Could not set up the account right now — please try again in a moment.",
    }
  }
}
```

WAIT — `account-list.tsx` currently reads `result.accountId` to drive the connection flow (line 65, 93). The allocator returns `browserProfileId` but not the social_account row id. Two options:

  - Option A (minimal change): Have `allocateBrowserProfile` ALSO return the inserted `social_accounts.id`. Add `socialAccountId: string` to its result type and return it. Then `connectAccount` returns `accountId: result.socialAccountId`. **Choose this option** — it's the smallest delta and matches the existing UI contract.
  - Option B: Refactor `ConnectionFlow` to take `browserProfileId` instead. Larger blast radius, defer.

→ Update `allocator.ts` (Task 1's file) to capture the `social_accounts` row id in step 7 and add it to the return shape:
```ts
export interface AllocateBrowserProfileResult {
  browserProfileId: string
  gologinProfileId: string
  cloudBrowserUrl: string
  socialAccountId: string  // NEW — surfaced for connectAccount caller
  reused: boolean
}
```
And `connectAccount` returns `accountId: result.socialAccountId`.

**File 2: `src/features/accounts/components/account-list.tsx`** — update copy only. No structural changes. Two locations:

(a) Reddit submit button — line 199-203, change `"Creating profile..."` to `"Setting up your account..."`:
```tsx
{submitting ? "Setting up your account..." : "Continue"}
```

(b) LinkedIn pending card — line 233, change `"Creating your LinkedIn browser profile..."` to `"Setting up your account..."`:
```tsx
<p className="text-base">Setting up your account...</p>
```

Also remove the `"u/"` prefix display from line 173 ONLY IF it appears alongside the new copy (it's a label adornment, not pending state — leave it as-is). Per UI-SPEC: only the two copy strings change.

The Sonner `toast.error(result.error)` on line 61, 89 already renders the D-11 error copy verbatim — no change needed.

D-09 race protection: `disabled={submitting}` is already wired on the Reddit submit button (line 197) and the LinkedIn click handler is gated by `if (platform === "linkedin")` short-circuit — no double-click possible while `submitting=true` because `openConnectDialog` re-runs setSubmitting(true) before any work. UI-SPEC §Interaction Contracts confirms no new logic needed.
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; grep -c "Setting up your account..." src/features/accounts/components/account-list.tsx &amp;&amp; grep -c "allocateBrowserProfile" src/features/accounts/actions/account-actions.ts &amp;&amp; ! grep -E "createProfile\(" src/features/accounts/actions/account-actions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "Setting up your account..." src/features/accounts/components/account-list.tsx` returns at least `2` (Reddit button label + LinkedIn pending card).
    - `grep -c "Creating profile" src/features/accounts/components/account-list.tsx` returns `0`.
    - `grep -c "Creating your LinkedIn browser profile" src/features/accounts/components/account-list.tsx` returns `0`.
    - `grep -c "allocateBrowserProfile" src/features/accounts/actions/account-actions.ts` returns at least `1` (import + call).
    - `grep -E "createProfile\(" src/features/accounts/actions/account-actions.ts` returns NO matches (legacy callsite removed).
    - `grep "Could not set up the account right now — please try again in a moment." src/features/accounts/actions/account-actions.ts` returns `1` match (D-11 verbatim copy).
    - `pnpm typecheck` passes.
    - `pnpm lint` passes (or no new violations).
  </acceptance_criteria>
  <done>The /accounts page UI flows through the allocator end-to-end with unified copy; legacy createProfile is no longer called from any server action.</done>
</task>

<task type="auto">
  <name>Task 3: Remove legacy createProfile from client.ts + grep-prove no callers remain</name>
  <files>src/lib/gologin/client.ts</files>
  <read_first>
    - src/lib/gologin/client.ts (lines 41-73 — legacy createProfile to delete)
    - .planning/phases/17-residential-proxy-gologin-profile-allocator/17-CONTEXT.md (D-15)
  </read_first>
  <action>
Final cleanup. Per D-15: "no other callers, confirmed via grep" — Task 2 already migrated `connectAccount`. Verify and delete.

1. Run `grep -rn "createProfile\b" src/` and inspect output. The ONLY remaining match should be the export definition itself in `src/lib/gologin/client.ts`. If any other call site exists (worker.ts, scripts, tests), STOP and report — D-15 invariant violated.

2. Delete the entire `createProfile` function from `src/lib/gologin/client.ts` (lines 41-73 in the original — the JSDoc comment block above the export plus the function body). Leave `createProfileV2`, `deleteProfile`, `startCloudBrowser`, `stopCloudBrowser`, `getProfile`, the `headers()` helper, the `GOLOGIN_API` const, and the `GoLoginProfile` interface untouched.

3. Verify the only remaining occurrence of `mode: "gologin"` (string literal) in the entire `src/` tree is ZERO. (After deletion, the legacy line that hardcoded the shared pool is gone.)
  </action>
  <verify>
    <automated>pnpm typecheck &amp;&amp; ! grep -rE "mode:\s*\"gologin\"" src/ &amp;&amp; ! grep -rE "from\s+[\"']@/lib/gologin/client[\"'].*createProfile\b[^V]" src/</automated>
  </verify>
  <acceptance_criteria>
    - `grep -rE "mode:\s*\"gologin\"" src/` returns NO matches.
    - `grep -rn "export async function createProfile\b" src/lib/gologin/client.ts` returns NO matches (legacy gone).
    - `grep -rn "export async function createProfileV2" src/lib/gologin/client.ts` returns `1` match (V2 retained).
    - `grep -rE "\bcreateProfile\b" src/ | grep -v "createProfileV2"` returns NO matches across the whole src/ tree.
    - `pnpm typecheck` passes.
    - `pnpm build` succeeds (final smoke).
  </acceptance_criteria>
  <done>The legacy `createProfile` shared-pool path is unreachable from any code path. `mode: "gologin"` is a forbidden string in the codebase and grep proves it.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: UAT against dev Supabase + dev GoLogin workspace</name>
  <files>.planning/phases/17-residential-proxy-gologin-profile-allocator/17-VALIDATION.md, screenshots/uat-17-bprx03-geolocation.png, screenshots/uat-17-bprx06-reuse.png</files>
  <action>Run the 5 UAT scenarios documented in <how-to-verify> below against dev Supabase branch effppfiphrykllkpkdbv via `pnpm dev --port 3001` and dev GoLogin workspace. Capture screenshots to `screenshots/uat-17-*.png`. Update the per-task verification table in 17-VALIDATION.md with PASS/FAIL for rows 17-02-04.</action>
  <verify>
    <automated>test -f screenshots/uat-17-bprx06-reuse.png &amp;&amp; grep -E "17-02-04.*✅" .planning/phases/17-residential-proxy-gologin-profile-allocator/17-VALIDATION.md</automated>
  </verify>
  <done>All 5 UAT scenarios marked PASS in 17-VALIDATION.md; screenshots committed under screenshots/uat-17-*.png; user has typed "approved" in the resume signal.</done>
  <what-built>
    - `allocateBrowserProfile` orchestrator
    - Refactored `connectAccount` server action calling the allocator with country='US'
    - `account-list.tsx` showing unified "Setting up your account..." pending copy
    - Legacy `createProfile` and `mode: "gologin"` both removed from src/
  </what-built>
  <how-to-verify>
Run against the dev Supabase branch (`effppfiphrykllkpkdbv`) and dev GoLogin workspace via `pnpm dev --port 3001`. Execute the 5 UAT scenarios from `17-RESEARCH.md` §Validation Architecture and update `17-VALIDATION.md` per-task verification table with PASS/FAIL for each:

1. **BPRX-03 — geolocation mode (no shared pool):**
   a. Sign in to a fresh test user (or wipe `auth.users` test rows on dev branch first).
   b. Click "Connect Reddit Account", enter handle `phase17_test_a`, submit.
   c. Wait for the cloud-browser viewer URL to appear (~5-10s).
   d. Open GoLogin dashboard → find the new profile → assert `proxy.mode === "geolocation"` and the country shown matches `US`.
   e. Query dev Supabase: `SELECT proxy_mode_check_via_get_profile FROM browser_profiles WHERE user_id = $u` — should return the country tuple from D-12 (timezone `America/New_York`, locale `en-US`).
   f. Take screenshot to `screenshots/uat-17-bprx03-geolocation.png`.

2. **BPRX-04 — fingerprint patched:**
   a. After step 1's profile is created, inspect the GoLogin profile's fingerprint surfaces (canvas, webGL, audio) via the GoLogin dashboard "Browser fingerprint" section. Assert they appear NON-default (post-patch). Alternatively, check Axiom/console for the `patchProfileFingerprints` call log line printed during step 1.

3. **BPRX-05 — country map mirrored:**
   - Already covered by Task 2 of plan 01 (unit suite) plus the row inspection in step 1e above.

4. **BPRX-06 — auto-reuse algorithm (the key behavior):**
   a. With the same test user, click "Connect LinkedIn Account". Wait for completion.
   b. Query: `SELECT id, browser_profile_id, platform FROM social_accounts WHERE user_id = $u`.
   c. Assert: BOTH the reddit and linkedin rows have the SAME `browser_profile_id`. (Reused.)
   d. Click "Connect Reddit Account" again, enter handle `phase17_test_b`. Wait for completion.
   e. Query the same table — assert this third row has a DIFFERENT `browser_profile_id` (new profile created because the first profile already had a reddit account).
   f. Take screenshot of the dev Supabase row inspector showing the 3 rows + 2 distinct `browser_profile_id` values to `screenshots/uat-17-bprx06-reuse.png`.

5. **D-10 rollback (fault injection):**
   a. In dev Supabase, manually insert a duplicate `(browser_profile_id, platform)` row to seed a UNIQUE violation OR temporarily revoke INSERT on `social_accounts` for the authenticated role.
   b. Click "Connect Reddit Account" with a fresh handle.
   c. Assert: Sonner toast shows exactly `"Could not set up the account right now — please try again in a moment."`
   d. Inspect GoLogin dashboard — the failed-allocation profile should be gone (deleted via rollback).
   e. Inspect dev Supabase `browser_profiles` — no orphan row from the failed attempt.
   f. Restore the dev DB to working state.

After UAT:
  - Update `17-VALIDATION.md` per-task verification table with PASS for each scenario (or describe any FAIL).
  - Commit screenshots under `screenshots/uat-17-*.png`.
  - If any scenario fails, document in the SUMMARY and route back to plan 02 revision rather than approving.
  </how-to-verify>
  <resume-signal>Type "approved" to mark plan 02 complete, or describe any UAT failures (e.g., "FAIL scenario 4 — third reddit account reused profile X instead of creating new").</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser → Server action (`connectAccount`) | Authenticated user submits `(platform, handle)`. Handle is untrusted user input. |
| Server action → Allocator → Supabase | Service-shaped writes to `browser_profiles` + `social_accounts` tables under RLS. |
| Server action → GoLogin REST | Bearer-token call. Untrusted JSON returned. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-17-02-01 | Tampering | `handle` parameter fed to `createProfileV2` profile name | mitigate | `createProfileV2` interpolates handle into `name: \`repco-${handle}\`` only. The handle is a user-controlled string but is sandboxed (a) in a JSON body to GoLogin, not into SQL, (b) in the `social_accounts.handle` text column under RLS. No shell or eval surface. |
| T-17-02-02 | Spoofing | Reuse lookup picks the wrong profile (e.g., another user's) | mitigate | Lookup query filters `user_id = $userId` (not just `country_code`). Phase 15 RLS policy enforces `auth.uid() = user_id` on browser_profiles SELECT — even if app-level filter regressed, RLS blocks cross-user reads. |
| T-17-02-03 | Elevation of Privilege | UNIQUE-violation race on `(browser_profile_id, platform)` lets a duplicate slip through | mitigate | Phase 15 D-04 enforces `UNIQUE (browser_profile_id, platform)` at DB level (constraint `one_account_per_platform` per migration 00023:57). Even if app-level NOT IN check regressed, DB rejects the second insert. |
| T-17-02-04 | Denial of Service | D-09 no-lock allows concurrent same-user double-allocation → 2× billable proxy | accept | Documented and accepted (D-09). UI button-disabled is the only race-protection layer. Bounded blast radius: $1.99/GB residential per duplicate. |
| T-17-02-05 | Information Disclosure | Error message leaks GoLogin internal state to user | mitigate | D-11 user-facing copy is a fixed string. Server-side `console.error` captures full `err` object; no GoLogin response body crosses to the browser via `toast.error`. |
| T-17-02-06 | Repudiation | Allocation succeeded but no audit trail | accept | `browser_profiles.created_at` + `social_accounts.created_at` + Vercel/Supabase logs are sufficient for solo-dev MVP. Structured Axiom logging is out of scope this phase (added when worker integration arrives in Phase 18+). |
| T-17-02-07 | Tampering | Orphaned GoLogin profile after partial failure | mitigate | D-10 best-effort `deleteProfile` rollback in catch blocks. If `deleteProfile` itself fails, error logged via `console.error` (Sentry breadcrumb in future phase). User retries; orphans accumulate in GoLogin dashboard at acceptable rate. |
</threat_model>

<verification>
Phase-level verification after all tasks complete:
- `pnpm typecheck` clean
- `pnpm test` green (Wave 0 + plan 01 country-map unit suite + any allocator tests)
- `pnpm build` succeeds
- `pnpm lint` clean
- `grep -rE "mode:\s*\"gologin\"" src/` returns NO matches
- `grep -rn "createProfile\b" src/ | grep -v "createProfileV2"` returns NO matches
- `grep -c "allocateBrowserProfile" src/features/accounts/actions/account-actions.ts` returns ≥1
- All 5 UAT scenarios in 17-VALIDATION.md marked PASS
</verification>

<success_criteria>
- BPRX-03: Every new browser_profile is created via `mode: "geolocation"` matching its country_code; mode:"gologin" is unreachable from any code path (proven by grep).
- BPRX-06: Reuse rule produces same `browser_profile_id` for cross-platform second account, distinct id for same-platform second account (proven by UAT scenario 4).
- D-10 rollback path verified by UAT scenario 5 (no orphan rows after fault injection).
- D-11 user-facing copy verified verbatim in UI.
</success_criteria>

<output>
After completion, create `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-02-SUMMARY.md` recording:
  - Final allocator code-flow summary (numbered steps as shipped)
  - Resolution of any deviations from D-04/D-07/D-10 surfaced during implementation
  - UAT screenshots referenced (path list)
  - Whether the `gologin_proxy_id` column ended up storing a real proxy id or the documented fallback
  - Confirmation of `auth.users` test-data state on dev branch (whether it was wiped before UAT, what handles were created)
</output>
