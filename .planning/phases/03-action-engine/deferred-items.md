# Phase 03 - Deferred Items

## Pre-existing Build Failure: worker.ts SupabaseClient type mismatch

- **File:** `src/lib/action-worker/worker.ts:55`
- **Error:** `Argument of type 'SupabaseClient<any, "public", ...>' is not assignable to parameter of type 'SupabaseClient<unknown, ...>'`
- **Root cause:** `updateActionStatus` uses `ReturnType<typeof createClient>` but the supabase client passed to it has a different generic signature
- **Impact:** `pnpm build` fails (pre-existing, not caused by any 03-06 changes)
- **Fix:** Change `updateActionStatus` parameter type to use `SupabaseClient` from `@supabase/supabase-js` directly
- **Discovered during:** 03-06 Task 3 verification

## Pre-existing Typecheck Error: zod module missing in approval-actions.ts

- **File:** `src/features/actions/actions/approval-actions.ts:4`
- **Error:** `Cannot find module 'zod' or its corresponding type declarations`
- **Root cause:** `zod` import present in file but module not resolvable (dependency drift in working tree)
- **Impact:** `pnpm typecheck` fails (pre-existing, unrelated to 03-08 sidebar-dot wiring)
- **Verification:** Stashed 03-08 edits → `pnpm typecheck` still failed with same error → confirmed pre-existing
- **Fix:** Install/restore `zod` dependency or replace import with alternative
- **Discovered during:** 03-08 Task 2 verification
