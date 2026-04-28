-- Phase 17.5: GoLogin → Browserbase column swap
-- D17.5-03 (CONTEXT.md): tabula rasa per project_users_are_test_data memory
-- All current users are test data; pre-launch wipe acceptable.
-- Sequence note: CONTEXT.md said 00024 but 00024_mechanism_costs.sql exists; this is 00025.

-- Step 1: Wipe dependent rows. social_accounts.browser_profile_id has ON DELETE
-- CASCADE in 00023 — TRUNCATE CASCADE handles social_accounts atomically.
TRUNCATE browser_profiles CASCADE;

-- Step 2: Drop GoLogin columns (UNIQUE constraints drop with the columns).
ALTER TABLE browser_profiles
  DROP COLUMN gologin_profile_id,
  DROP COLUMN gologin_proxy_id;

-- Step 3: Add Browserbase context column (UNIQUE NOT NULL).
ALTER TABLE browser_profiles
  ADD COLUMN browserbase_context_id text UNIQUE NOT NULL;
