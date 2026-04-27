-- =============================================================================
-- Migration: 00023_browser_profiles.sql
-- Phase: 15 (BPRX-01, BPRX-02 schema half)
-- Purpose: Create browser_profiles table; rewrite social_accounts to reference it
-- Depends on: 00002_initial_schema.sql (users, social_accounts), 00003_rls_policies.sql (RLS pattern)
-- =============================================================================

-- Step 1: Create browser_profiles table (D-01 column set, no forward-looking columns)
CREATE TABLE browser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gologin_profile_id text UNIQUE NOT NULL,
  gologin_proxy_id text UNIQUE NOT NULL,
  country_code text NOT NULL,
  timezone text NOT NULL,
  locale text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Index on user_id (per D-09 / RESEARCH §5)
CREATE INDEX idx_browser_profiles_user_id ON browser_profiles (user_id);

-- Step 3: RLS enable + 4 owner-only policies (D-07)
ALTER TABLE browser_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own browser profiles"
  ON browser_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own browser profiles"
  ON browser_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own browser profiles"
  ON browser_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own browser profiles"
  ON browser_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Step 4: Wipe existing social_accounts test rows (D-06; test data on dev branch only)
DELETE FROM social_accounts;

-- Step 5: Add nullable browser_profile_id FK column (D-03)
ALTER TABLE social_accounts
  ADD COLUMN browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE;

-- Step 6: Unique constraint — 1 account per platform per profile (D-04)
-- Postgres default NULLS DISTINCT semantics allow multiple (NULL, 'reddit') rows.
ALTER TABLE social_accounts
  ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform);

-- Step 7: Index on browser_profile_id for JOIN performance
CREATE INDEX idx_social_accounts_browser_profile_id
  ON social_accounts (browser_profile_id);

-- Step 8: Drop legacy columns (D-05) — no FK/index/check ref these (RESEARCH §2)
ALTER TABLE social_accounts DROP COLUMN gologin_profile_id;
ALTER TABLE social_accounts DROP COLUMN proxy_id;
