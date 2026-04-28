---
phase: 15-browser-profile-schema-foundation
plan: 01
subsystem: schema-foundation
tags: [schema, migration, rls, supabase, types]
requires:
  - 00002_initial_schema.sql (users, social_accounts)
  - 00003_rls_policies.sql (4-policy owner-only RLS pattern)
provides:
  - browser_profiles table on dev branch effppfiphrykllkpkdbv
  - social_accounts.browser_profile_id FK + UNIQUE (browser_profile_id, platform)
  - getBrowserProfileForAccount / getBrowserProfileById helpers
  - BrowserProfile, SocialAccountWithProfile TypeScript types
affects:
  - All reader sites of social_accounts.gologin_profile_id / proxy_id (refactored in Plan 02)
tech-stack:
  added: []
  patterns:
    - SupabaseClient-as-parameter helper (matches src/features/sequences/lib/stop-on-reply.ts)
    - Supabase-js FK embed via table-name (browser_profiles(*))
    - 4-policy owner-only RLS naming "Users can <verb> own <noun>"
key-files:
  created:
    - supabase/migrations/00023_browser_profiles.sql
    - src/features/browser-profiles/lib/get-browser-profile.ts
  modified:
    - src/features/accounts/lib/types.ts
decisions:
  - Postgres default NULLS DISTINCT semantics retained — multiple unallocated social_accounts (NULL platform pair) coexist during transition
  - FK on browser_profiles.user_id targets public.users(id) (D-02), not auth.users
  - Legacy column drop is permanent on dev branch; existing dev test rows wiped (D-06)
metrics:
  duration: ~7 min
  completed: 2026-04-27
requirements: [BPRX-01]
---

# Phase 15 Plan 01: Browser Profile Schema Foundation Summary

One-liner: Created `browser_profiles` table (9 cols + RLS owner-only) and rewired `social_accounts` to FK it, plus the read-side helper + types that Plan 02's reader-site refactor consumes.

## What Was Built

**Migration `00023_browser_profiles.sql`** (8-step DDL):
1. CREATE TABLE browser_profiles (id, user_id FK→users, gologin_profile_id UNIQUE, gologin_proxy_id UNIQUE, country_code, timezone, locale, display_name, created_at)
2. INDEX idx_browser_profiles_user_id
3. ENABLE RLS + 4 policies (read/create/update/delete, all `auth.uid() = user_id`, TO authenticated)
4. DELETE FROM social_accounts (dev test data only)
5. ALTER TABLE social_accounts ADD COLUMN browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE
6. ALTER TABLE social_accounts ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform)
7. INDEX idx_social_accounts_browser_profile_id
8. DROP COLUMN gologin_profile_id; DROP COLUMN proxy_id

**Helper module** `src/features/browser-profiles/lib/get-browser-profile.ts`
- `getBrowserProfileForAccount(accountId, supabase): Promise<BrowserProfile | null>` — FK-embed read via `social_accounts → browser_profiles(*)`
- `getBrowserProfileById(browserProfileId, supabase): Promise<BrowserProfile | null>` — direct PK read
- SupabaseClient is a parameter (no singleton import), allowing both SSR and service-role callers

**Types update** `src/features/accounts/lib/types.ts`
- Added `BrowserProfile` interface (7 fields, mirrors helper return shape)
- `SocialAccount`: removed `gologin_profile_id` and `proxy_id`; added `browser_profile_id: string | null`
- Added `SocialAccountWithProfile = SocialAccount & { browser_profiles: BrowserProfile | null }` for embed-result typing

## Migration Application Response

```bash
POST https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query
Body: { query: <00023_browser_profiles.sql> }
Response: []   # empty array is normal for DDL — no SELECT rows produced
```

HTTP success implied by absence of error/message fields. Production project `cmkifdwjunojgigrqwnr` was not contacted (no curl call to that ID).

## Verification Query Outcomes (dev branch effppfiphrykllkpkdbv)

| # | Check | Query | Result |
|---|---|---|---|
| 1 | columns on browser_profiles | `SELECT column_name FROM information_schema.columns WHERE table_name='browser_profiles' ORDER BY ordinal_position` | 9 rows: id, user_id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name, created_at — matches D-01 exactly |
| 2 | RLS enabled | `SELECT relrowsecurity FROM pg_class WHERE relname='browser_profiles'` | `[{"relrowsecurity":true}]` |
| 3 | policy count | `SELECT count(*) FROM pg_policies WHERE tablename='browser_profiles'` | `[{"count":4}]` |
| 4 | legacy columns gone | `SELECT column_name FROM information_schema.columns WHERE table_name='social_accounts' AND column_name IN (legacy + new)` | `[{"column_name":"browser_profile_id"}]` — only the new column remains |
| 5 | unique constraint | `SELECT conname FROM pg_constraint WHERE conrelid='social_accounts'::regclass AND conname='one_account_per_platform'` | `[{"conname":"one_account_per_platform"}]` |

All 5 verifications pass.

## Helper Signature Exports

```ts
export async function getBrowserProfileForAccount(
  accountId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null>

export async function getBrowserProfileById(
  browserProfileId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null>
```

`grep -c "import.*createClient" src/features/browser-profiles/lib/get-browser-profile.ts` → 0 (no singleton import, as PATTERNS.md mandates).

## Plan 02 Handoff Manifest — Pending Reader-Site Refactor

A repo-wide `pnpm typecheck` is expected to FAIL because the following files still reference the dropped `social_accounts.gologin_profile_id` / `proxy_id` columns (located via `grep -rn`):

- `src/app/api/cron/check-replies/route.ts`
- `src/app/api/cron/check-replies/__tests__/route.test.ts`
- `src/app/api/cron/linkedin-prescreen/route.ts`
- `src/features/accounts/actions/account-actions.ts`
- `src/features/accounts/components/account-card.tsx`
- `src/lib/action-worker/worker.ts`
- `src/lib/action-worker/__tests__/worker-linkedin-followup.test.ts`
- `src/lib/action-worker/__tests__/worker-quarantine.test.ts`

(Note: `types.ts` and the new helper file also surface in the grep, but they are intentional — `BrowserProfile` legitimately contains `gologin_profile_id` and `gologin_proxy_id` fields.)

These 8 reader sites are Plan 02's responsibility per the plan's `<verification>` section.

The worktree did not have `node_modules` installed, so `pnpm typecheck` could not be exercised live in this run. The grep above is the substitute audit and gives the same handoff manifest.

## Acceptance-Criteria Notes / Plan Inconsistency

Task 3 acceptance criteria #8 / #9 expect `grep -c "gologin_profile_id" src/features/accounts/lib/types.ts` → 0 and `proxy_id` → 0. The plan's `<interfaces>` block, however, defines `BrowserProfile { gologin_profile_id, gologin_proxy_id, ... }`, which conflicts with that grep target. The interface contract was treated as authoritative (matches helper return shape and is referenced by Plan 02). After implementation:
- `gologin_profile_id` appears once (inside BrowserProfile, not SocialAccount) — intentional
- `gologin_proxy_id` appears once (inside BrowserProfile) — intentional
- `proxy_id` (the legacy SocialAccount field) is fully removed; the only match for that substring is the longer name `gologin_proxy_id`

The intent of the criteria — "legacy SocialAccount fields removed" — is satisfied.

## Deviations from Plan

None. Plan executed exactly as written, with the interface-vs-grep inconsistency noted above documented rather than worked around.

## Commits

- `e8419e2` — feat(15-01): add migration 00023 for browser_profiles schema
- `552dca1` — feat(15-01): add browser_profiles helper module + types

(Task 2 was a remote DDL apply + verification with no file changes; verification outcomes are recorded in this SUMMARY rather than a separate commit.)

## Self-Check: PASSED

- supabase/migrations/00023_browser_profiles.sql — FOUND
- src/features/browser-profiles/lib/get-browser-profile.ts — FOUND
- src/features/accounts/lib/types.ts — modified, BrowserProfile + browser_profile_id present, legacy fields removed from SocialAccount
- e8419e2 — FOUND in git log
- 552dca1 — FOUND in git log
- Dev branch schema verified live (5/5 queries pass)
- Production project cmkifdwjunojgigrqwnr UNTOUCHED
