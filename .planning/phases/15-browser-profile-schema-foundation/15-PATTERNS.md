# Phase 15: Browser Profile Schema Foundation - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 10 (1 created, 1 new helper, 8 modified)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/00023_browser_profiles.sql` | migration | CRUD | `supabase/migrations/00003_rls_policies.sql` + `00002_initial_schema.sql` | exact |
| `src/features/browser-profiles/lib/get-browser-profile.ts` | lib helper | request-response | `src/features/sequences/lib/stop-on-reply.ts` + `reply-matching.ts` | exact |
| `src/features/accounts/actions/account-actions.ts` | server action | CRUD | self (modify existing) | self |
| `src/features/accounts/components/account-card.tsx` | RSC component (client) | request-response | self (modify existing) | self |
| `src/features/accounts/lib/types.ts` | type definition | — | self (modify existing) | self |
| `src/lib/action-worker/worker.ts` | service / orchestrator | event-driven | self (modify existing) | self |
| `src/app/api/cron/check-replies/route.ts` | cron route handler | event-driven | self (modify existing) | self |
| `src/app/api/cron/linkedin-prescreen/route.ts` | cron route handler | event-driven | self (modify existing) | self |
| `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts` | unit test fixture | — | `worker-quarantine.test.ts` | exact |
| `src/lib/action-worker/__tests__/worker-quarantine.test.ts` | unit test fixture | — | self (modify existing) | self |
| `src/app/api/cron/check-replies/__tests__/route.test.ts` | unit test fixture | — | self (modify existing) | self |

---

## Pattern Assignments

### `supabase/migrations/00023_browser_profiles.sql` (migration, CRUD)

**Primary analog:** `supabase/migrations/00003_rls_policies.sql`
**Secondary analog:** `supabase/migrations/00002_initial_schema.sql`

**Migration header comment pattern** (00002 lines 1-5):
```sql
-- =============================================================================
-- Migration: 00023_browser_profiles.sql
-- Purpose: Create browser_profiles table; rewrite social_accounts to reference it
-- Depends on: 00003_rls_policies.sql (RLS patterns), 00002_initial_schema.sql
-- =============================================================================
```

**Table CREATE pattern** (00002 lines 10-21 — users table, closest structural match):
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  ...
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
New table follows: `uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `TIMESTAMPTZ DEFAULT now()`. No `updated_at` needed (immutable config row).

**Index pattern** (00002 line 96):
```sql
CREATE INDEX idx_social_accounts_user_id ON social_accounts (user_id);
```
Mirror for new table:
```sql
CREATE INDEX idx_browser_profiles_user_id ON browser_profiles (user_id);
CREATE INDEX idx_social_accounts_browser_profile_id ON social_accounts (browser_profile_id);
```

**RLS enable + 4-policy owner-only pattern** (00003 lines 44-66 — monitoring_signals, the only table with all 4 CRUD policies):
```sql
ALTER TABLE monitoring_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own monitoring signals"
  ON monitoring_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own monitoring signals"
  ON monitoring_signals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monitoring signals"
  ON monitoring_signals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own monitoring signals"
  ON monitoring_signals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```
Apply verbatim for `browser_profiles`, substituting the table name and policy label strings.

**UNIQUE constraint on partial index pattern** (00022 lines 10-13):
```sql
CREATE UNIQUE INDEX monitoring_signals_user_type_value_unique
  ON monitoring_signals (user_id, signal_type, value)
  WHERE active = true;
```
The `one_account_per_platform` constraint is a named table constraint, not a partial index — use `ADD CONSTRAINT` form instead:
```sql
ALTER TABLE social_accounts
  ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform);
```
Do NOT use `NULLS NOT DISTINCT` (RESEARCH.md §1: NULLs must remain distinct).

**Full migration step order** (from RESEARCH.md §6 — verified correct):
```sql
-- Step 1: CREATE TABLE browser_profiles
-- Step 2: CREATE INDEX idx_browser_profiles_user_id
-- Step 3: ALTER TABLE ... ENABLE ROW LEVEL SECURITY + 4 policies
-- Step 4: DELETE FROM social_accounts
-- Step 5: ALTER TABLE social_accounts ADD COLUMN browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE
-- Step 6: ALTER TABLE social_accounts ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform)
-- Step 7: CREATE INDEX idx_social_accounts_browser_profile_id ON social_accounts (browser_profile_id)
-- Step 8: ALTER TABLE social_accounts DROP COLUMN gologin_profile_id
-- Step 9: ALTER TABLE social_accounts DROP COLUMN proxy_id
```
No `DROP CONSTRAINT` or `DROP INDEX` needed before step 8-9 — RESEARCH.md §2 confirms both legacy columns have no FK, no index, no check constraint.

---

### `src/features/browser-profiles/lib/get-browser-profile.ts` (lib helper, request-response)

**Primary analog:** `src/features/sequences/lib/stop-on-reply.ts`
**Secondary analog:** `src/features/sequences/lib/reply-matching.ts`

**Import + function signature pattern** (`stop-on-reply.ts` lines 1, 13-17 and `reply-matching.ts` lines 1, 33-38):
```typescript
import type { SupabaseClient } from "@supabase/supabase-js"

export async function handleReplyDetected(
  supabase: SupabaseClient,
  prospectId: string,
  replySnippet: string,
): Promise<boolean> {
```
New helper mirrors: supabase client is ALWAYS the first parameter, never imported as singleton. Return type is explicit.

**Null-guard + early return pattern** (`stop-on-reply.ts` lines 19-28):
```typescript
const { data: prospect } = await supabase
  .from("prospects")
  .select("pipeline_status")
  .eq("id", prospectId)
  .single()

if (!prospect) return false
```
New helper uses same pattern: destructure `data`, null-check, return `null` (not `false`).

**Supabase-js v2 foreign-table embed pattern** (RESEARCH.md §4):
```typescript
const { data } = await supabase
  .from("social_accounts")
  .select("browser_profile_id, browser_profiles(*)")
  .eq("id", accountId)
  .single()

return data?.browser_profiles ?? null
```
The embedded key name is the TABLE name `browser_profiles`, not the FK column name.

**Full helper signature** (RESEARCH.md §3 — both functions):
```typescript
export async function getBrowserProfileForAccount(
  accountId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null>

export async function getBrowserProfileById(
  browserProfileId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null>
```
Return `null` (not throw) when account has no `browser_profile_id` or no matching row — consistent with all 4+ call-site guard patterns in worker.ts and check-replies route.

**Pattern divergence to avoid:** Do NOT `import { createClient } from "@/lib/supabase/server"` inside this helper. The caller (worker or cron) passes its own service-role client. This is the established pattern in `stop-on-reply.ts` and `reply-matching.ts`.

---

### `src/features/accounts/actions/account-actions.ts` (server action, CRUD)

**Analog:** self — surgical edits to existing file.

**Current `connectAccount` write to drop** (lines 55-63 — `gologin_profile_id: profileId` must be removed, `browser_profile_id: null` written instead):
```typescript
const { data, error } = await supabase
  .from("social_accounts")
  .insert({
    user_id: user.id,
    platform,
    handle: effectiveHandle,
    gologin_profile_id: profileId,   // DROP THIS LINE
    health_status: "warmup",
    warmup_day: 1,
  })
```
After: `gologin_profile_id` write removed entirely; `browser_profile_id: null` added. The `createProfile()` GoLogin call above it is removed or relocated to Phase 17.

**Current `deleteAccount` GoLogin lookup pattern** (lines 190-195 — read source changes from `gologin_profile_id` to JOIN via helper):
```typescript
const { data: account } = await supabase
  .from("social_accounts")
  .select("gologin_profile_id")
  .eq("id", accountId)
  .eq("user_id", user.id)
  .single()
```
After: select `browser_profile_id`, then call `getBrowserProfileById(account.browser_profile_id, supabase)` to get `gologin_profile_id` for GoLogin cleanup.

**`startAccountBrowser` and `stopAccountBrowser` selects** (lines 105-108, 140-144):
```typescript
.select("gologin_profile_id, platform")  // startAccountBrowser
.select("gologin_profile_id")            // stopAccountBrowser
```
After: select `browser_profile_id`, resolve via helper before calling GoLogin.

**Auth guard pattern to preserve** (lines 25-29 — do not touch):
```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }
```

---

### `src/features/accounts/components/account-card.tsx` (RSC component / client, request-response)

**Analog:** self — single surgical line change.

**Current usage of `gologin_profile_id`** (lines 162-168):
```typescript
onClick={() =>
  onReconnect(
    account.id,
    account.gologin_profile_id,   // CHANGE TO: account.browser_profile_id
    account.platform,
  )
}
```
The prop type `profileId: string | null` in `AccountCardProps.onReconnect` (line 35) stays the same shape — only the field name on `account` changes.

---

### `src/features/accounts/lib/types.ts` (type definition)

**Analog:** self — field substitution.

**Current `SocialAccount` interface fields to replace** (lines 23-24):
```typescript
gologin_profile_id: string | null   // DROP
proxy_id: string | null             // DROP
```
**Replacement field** (lines 23):
```typescript
browser_profile_id: string | null   // ADD
```

**New `BrowserProfile` type to add** (new export, matches D-08 return shape):
```typescript
export interface BrowserProfile {
  id: string
  gologin_profile_id: string
  gologin_proxy_id: string
  country_code: string
  timezone: string
  locale: string
  display_name: string | null
}

export type SocialAccountWithProfile = SocialAccount & {
  browser_profiles: BrowserProfile | null
}
```
Place `BrowserProfile` above `SocialAccount` since `SocialAccount` will reference it indirectly. Export `BrowserProfile` from here — it's the domain type the helper returns.

---

### `src/lib/action-worker/worker.ts` (service/orchestrator, event-driven)

**Analog:** self — replace guard pattern at 3 call sites.

**Current guard pattern at lines 130-133 and 137 and 162-164** — all three check `account?.gologin_profile_id`. After refactor, the guard becomes:
```typescript
const browserProfile = await getBrowserProfileForAccount(account.id, supabase)
if (!browserProfile) {
  // same log + early return / fall-through as current gologin_profile_id guard
}
```

**Current `connectToProfile` call at line 260**:
```typescript
connection = await connectToProfile(account!.gologin_profile_id!)
```
After:
```typescript
connection = await connectToProfile(browserProfile!.gologin_profile_id)
```

**Import to add**:
```typescript
import { getBrowserProfileForAccount } from "@/features/browser-profiles/lib/get-browser-profile"
```
Add after existing `@/features/*` imports, keeping the React/Next → third-party → `@/*` order.

**Service-role client pattern to preserve** (lines 36-41 — do not touch):
```typescript
function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```
Pass this `supabase` instance into the helper — it's already available in `executeAction`.

---

### `src/app/api/cron/check-replies/route.ts` (cron route handler, event-driven)

**Analog:** self — replace select column + guard at lines 183-213.

**Current select + inline type + guard** (lines 183-212):
```typescript
const { data: accountsRaw, error: accountsError } = await supabase
  .from("social_accounts")
  .select("id, user_id, handle, gologin_profile_id, consecutive_inbox_failures")
  ...

const accounts = (accountsRaw ?? []) as Array<{
  id: string
  user_id: string
  handle: string | null
  gologin_profile_id: string | null
  consecutive_inbox_failures: number | null
}>
```
After: remove `gologin_profile_id` from select string and inline type. Add `browser_profile_id: string | null` to inline type.

**Current null-guard** (lines 208-213):
```typescript
if (!account.gologin_profile_id) {
  logger.warn("Skipping account — no gologin_profile_id", { ... })
  continue
}
```
After: resolve helper before `connectToProfile`, guard on `browserProfile === null`.

**`connectToProfile` call** (line 222):
```typescript
connection = await connectToProfile(account.gologin_profile_id)
```
After:
```typescript
const browserProfile = await getBrowserProfileForAccount(account.id, supabase)
if (!browserProfile) {
  logger.warn("Skipping account — no browser profile", { correlationId, accountId: account.id })
  continue
}
connection = await connectToProfile(browserProfile.gologin_profile_id)
```

---

### `src/app/api/cron/linkedin-prescreen/route.ts` (cron route handler, event-driven)

**Analog:** self — replace select column + guard + `.not()` filter.

**Current select** (line 98):
```typescript
.select("id, gologin_profile_id, user_id")
```
After: `.select("id, browser_profile_id, user_id")`

**Current `.not()` filter** (line 101):
```typescript
.not("gologin_profile_id", "is", null)
```
After: `.not("browser_profile_id", "is", null)`
This pre-filters accounts without a profile at the query level — preserve the pattern, just change the column name.

**Current `connectToProfile` call** (line 172):
```typescript
connection = await connectToProfile(account.gologin_profile_id as string)
```
After: resolve via `getBrowserProfileById(account.browser_profile_id!, supabase)` and use `browserProfile.gologin_profile_id`.

---

### `src/lib/action-worker/__tests__/worker-quarantine.test.ts` (unit test fixture)

**Analog:** self — mock type + factory update.

**Current `AccountRow` type** (lines 109-119):
```typescript
type AccountRow = {
  id: string
  platform: "reddit" | "linkedin"
  gologin_profile_id: string         // REMOVE
  warmup_day: number
  timezone: string
  active_hours_start: number
  active_hours_end: number
  health_status: "warmup" | "healthy" | "warning" | "cooldown" | "banned"
  cooldown_until: string | null
}
```
After: replace `gologin_profile_id: string` with `browser_profile_id: string | null`.

**Current `buildSupabase` factory** (lines 121-145): The `social_accounts` branch returns `account` directly from `.single()`. After refactor, worker.ts will call `getBrowserProfileForAccount` which queries `social_accounts` with embedded `browser_profiles(*)`. The mock needs to handle the embed — either:

Option A (simpler): mock `getBrowserProfileForAccount` module entirely via `vi.mock("@/features/browser-profiles/lib/get-browser-profile", ...)` at the top of the test file, bypassing the Supabase chain for this helper.

Option B: extend the `from("social_accounts")` branch's select handler to detect the `browser_profiles(*)` embed string and return `{ ...account, browser_profiles: mockBrowserProfile() }`.

**Recommended: Option A** — keeps mock surface minimal and prevents the mock from mirroring internal JOIN string format (which would break when RESEARCH.md §4 join syntax changes).

**New `mockBrowserProfile` factory to add** (copy structure from RESEARCH.md §3 return shape):
```typescript
function mockBrowserProfile(overrides?: Partial<BrowserProfile>): BrowserProfile {
  return {
    id: "bp-test-id",
    gologin_profile_id: "gp-test-id",
    gologin_proxy_id: "proxy-test-id",
    country_code: "PL",
    timezone: "Europe/Warsaw",
    locale: "pl-PL",
    display_name: null,
    ...overrides,
  }
}
```

---

### `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts` (unit test fixture)

**Analog:** `worker-quarantine.test.ts` — identical structural change.

**Current `SuParams.account` shape** (lines 113-123):
```typescript
type SuParams = {
  account: {
    id: string
    platform: "reddit" | "linkedin"
    gologin_profile_id: string      // REMOVE
    warmup_day: number
    timezone: string
    active_hours_start: number
    active_hours_end: number
  }
  ...
}
```
After: replace `gologin_profile_id: string` with `browser_profile_id: string | null`.

Apply same Option A mock strategy: add `vi.mock("@/features/browser-profiles/lib/get-browser-profile", ...)` at top, returning `mockBrowserProfile()`.

---

### `src/app/api/cron/check-replies/__tests__/route.test.ts` (unit test fixture)

**Analog:** self — mock fixture data update in `buildRouteSupabase` (lines 111-146).

**Current `social_accounts` mock data row** (lines 127-135):
```typescript
data: [
  {
    id: "acct-1",
    user_id: "user-1",
    handle: "u/myaccount",
    gologin_profile_id: "gp-1",         // CHANGE FIELD NAME
    consecutive_inbox_failures: 0,
  },
],
```
After: replace `gologin_profile_id: "gp-1"` with `browser_profile_id: "bp-1"`.

Same mock-strategy decision as worker tests: add `vi.mock("@/features/browser-profiles/lib/get-browser-profile", ...)` to return a `mockBrowserProfile({ gologin_profile_id: "gp-1" })` so the route's `connectToProfile` call receives the right profile id.

---

## Shared Patterns

### Supabase client as parameter (never singleton)
**Source:** `src/features/sequences/lib/stop-on-reply.ts` line 1, `reply-matching.ts` line 1
**Apply to:** `get-browser-profile.ts`
```typescript
import type { SupabaseClient } from "@supabase/supabase-js"
// ... function signature always receives supabase as first or last param
```

### Service-role client instantiation in crons/worker
**Source:** `src/lib/action-worker/worker.ts` lines 36-41
**Apply to:** All cron routes (already use this pattern — preserve it)
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
```

### Null guard + warn + continue in cron loops
**Source:** `src/app/api/cron/check-replies/route.ts` lines 208-213
**Apply to:** All three cron files after removing direct column reads
```typescript
if (!account.gologin_profile_id) {
  logger.warn("Skipping account — no gologin_profile_id", {
    correlationId,
    accountId: account.id,
  })
  continue
}
```
After: same structure, column name replaced by helper null-check.

### RLS policy naming convention
**Source:** `supabase/migrations/00003_rls_policies.sql` lines 47-66
**Apply to:** `00023_browser_profiles.sql` RLS section
Pattern: `"Users can <verb> own <table noun>"` with `TO authenticated`.

### Vitest mock factory pattern for Supabase
**Source:** `src/lib/action-worker/__tests__/worker-quarantine.test.ts` lines 121-145
**Apply to:** All three test files
```typescript
function buildSupabase(account: AccountRow) {
  const updates = new Map<string, unknown[]>()
  const client = {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from: vi.fn((table: string) => {
      if (table === "social_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: account, error: null })),
            })),
          })),
          ...
        }
      }
      ...
    }),
  }
  return { client, updates }
}
```

---

## No Analog Found

All files have close codebase analogs. No file requires falling back to RESEARCH.md patterns alone.

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `src/features/`, `src/lib/action-worker/`, `src/app/api/cron/`
**Files scanned:** 12 source files + 3 migration files
**Pattern extraction date:** 2026-04-27
