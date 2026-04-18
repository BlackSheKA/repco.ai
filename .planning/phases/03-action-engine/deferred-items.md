# Phase 03 - Deferred Items

## Pre-existing Build Failure: worker.ts SupabaseClient type mismatch

- **File:** `src/lib/action-worker/worker.ts:55`
- **Error:** `Argument of type 'SupabaseClient<any, "public", ...>' is not assignable to parameter of type 'SupabaseClient<unknown, ...>'`
- **Root cause:** `updateActionStatus` uses `ReturnType<typeof createClient>` but the supabase client passed to it has a different generic signature
- **Impact:** `pnpm build` fails (pre-existing, not caused by any 03-06 changes)
- **Fix:** Change `updateActionStatus` parameter type to use `SupabaseClient` from `@supabase/supabase-js` directly
- **Discovered during:** 03-06 Task 3 verification
