-- =============================================================================
-- Migration: 00003_rls_policies.sql
-- Purpose: Enable RLS on all 11 tables and create access policies
-- Depends on: 00002_initial_schema.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE intent_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- users: read/update own row only (no INSERT -- trigger handles creation)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- credit_transactions: read-only for authenticated users (server writes via service_role)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own credit transactions"
  ON credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- monitoring_signals: full CRUD for own signals
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- product_profiles: read/insert/update own (no delete -- protect profile data)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own product profiles"
  ON product_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own product profiles"
  ON product_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own product profiles"
  ON product_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- social_accounts: read/insert/update own (no delete -- lifecycle managed server-side)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own social accounts"
  ON social_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own social accounts"
  ON social_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own social accounts"
  ON social_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- intent_signals: read/insert/update own + anon read for public signals (/live page)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own intent signals"
  ON intent_signals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anon can read public intent signals"
  ON intent_signals FOR SELECT
  TO anon
  USING (is_public = true);

CREATE POLICY "Users can create own intent signals"
  ON intent_signals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intent signals"
  ON intent_signals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- prospects: read/insert/update own (no delete)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own prospects"
  ON prospects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own prospects"
  ON prospects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prospects"
  ON prospects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- actions: read/insert/update own (no delete)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own actions"
  ON actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own actions"
  ON actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions"
  ON actions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- action_counts: read-only via social account ownership (server writes via service_role)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own action counts"
  ON action_counts FOR SELECT
  TO authenticated
  USING (
    auth.uid() = (
      SELECT user_id FROM social_accounts WHERE id = action_counts.account_id
    )
  );

-- ---------------------------------------------------------------------------
-- live_stats: public read access for /live page (server writes via service_role)
-- ---------------------------------------------------------------------------
CREATE POLICY "Anyone can read live stats"
  ON live_stats FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- job_logs: read-only for own logs (server writes via service_role)
-- ---------------------------------------------------------------------------
CREATE POLICY "Users can read own job logs"
  ON job_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
