-- =============================================================================
-- Migration: 00002_initial_schema.sql
-- Purpose: Create all 11 PRD tables with indexes and constraints
-- Depends on: 00001_enums.sql (ENUM types)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  stripe_customer_id text,
  billing_period billing_period_type,
  trial_ends_at timestamptz,
  subscription_active boolean DEFAULT false,
  credits_balance integer DEFAULT 500,
  credits_included_monthly integer DEFAULT 500,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. credit_transactions
-- ---------------------------------------------------------------------------
CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  type credit_type NOT NULL,
  amount integer NOT NULL,
  description text,
  pack_size integer,
  stripe_payment_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions (user_id);

-- ---------------------------------------------------------------------------
-- 3. monitoring_signals
-- ---------------------------------------------------------------------------
CREATE TABLE monitoring_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  signal_type signal_source_type NOT NULL,
  value text NOT NULL,
  credits_per_day integer NOT NULL DEFAULT 3,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_monitoring_signals_user_id_active ON monitoring_signals (user_id, active);

-- ---------------------------------------------------------------------------
-- 4. product_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE product_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  problem_solved text,
  competitors text[],
  keywords text[],
  generated_queries jsonb,
  subreddits text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_profiles_user_id ON product_profiles (user_id);

-- ---------------------------------------------------------------------------
-- 5. social_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  platform platform_type NOT NULL,
  handle text,
  profile_url text,
  gologin_profile_id text,
  proxy_id text,
  health_status health_status_type DEFAULT 'warmup',
  warmup_day integer DEFAULT 0,
  warmup_completed_at timestamptz,
  daily_dm_limit integer DEFAULT 8,
  daily_engage_limit integer DEFAULT 20,
  timezone text DEFAULT 'UTC',
  active_hours_start integer DEFAULT 8,
  active_hours_end integer DEFAULT 22,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_social_accounts_user_id ON social_accounts (user_id);

-- ---------------------------------------------------------------------------
-- 6. intent_signals
-- ---------------------------------------------------------------------------
CREATE TABLE intent_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  platform platform_type NOT NULL,
  post_url text UNIQUE NOT NULL,
  post_content text,
  author_handle text,
  author_profile_url text,
  intent_type intent_type,
  intent_strength integer CHECK (intent_strength BETWEEN 1 AND 10),
  intent_reasoning text,
  suggested_angle text,
  status signal_status_type DEFAULT 'pending',
  is_public boolean DEFAULT true,
  detected_at timestamptz DEFAULT now()
);

CREATE INDEX idx_intent_signals_user_id_status ON intent_signals (user_id, status);
CREATE INDEX idx_intent_signals_detected_at ON intent_signals (detected_at DESC);
CREATE INDEX idx_intent_signals_is_public ON intent_signals (is_public) WHERE is_public = true;

-- ---------------------------------------------------------------------------
-- 7. prospects
-- ---------------------------------------------------------------------------
CREATE TABLE prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  platform platform_type NOT NULL,
  handle text,
  profile_url text,
  display_name text,
  bio text,
  public_email text,
  public_website text,
  intent_signal_id uuid REFERENCES intent_signals,
  pipeline_status pipeline_status_type DEFAULT 'detected',
  assigned_account_id uuid REFERENCES social_accounts,
  notes text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_prospects_user_id_pipeline ON prospects (user_id, pipeline_status);

-- ---------------------------------------------------------------------------
-- 8. actions
-- ---------------------------------------------------------------------------
CREATE TABLE actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects ON DELETE CASCADE,
  account_id uuid REFERENCES social_accounts,
  action_type action_type NOT NULL,
  status action_status_type DEFAULT 'pending_approval',
  drafted_content text,
  final_content text,
  approved_at timestamptz,
  executed_at timestamptz,
  error text,
  sequence_step integer,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_actions_user_id_status ON actions (user_id, status);
CREATE INDEX idx_actions_status_executing ON actions (status, executed_at) WHERE status = 'executing';

-- ---------------------------------------------------------------------------
-- 9. action_counts (composite PK, no gen_random_uuid)
-- ---------------------------------------------------------------------------
CREATE TABLE action_counts (
  account_id uuid NOT NULL REFERENCES social_accounts ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  dm_count integer DEFAULT 0,
  engage_count integer DEFAULT 0,
  reply_count integer DEFAULT 0,
  PRIMARY KEY (account_id, date)
);

-- ---------------------------------------------------------------------------
-- 10. live_stats
-- ---------------------------------------------------------------------------
CREATE TABLE live_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signals_last_hour integer DEFAULT 0,
  signals_last_24h integer DEFAULT 0,
  active_users integer DEFAULT 0,
  dms_sent_24h integer DEFAULT 0,
  replies_24h integer DEFAULT 0,
  scans_per_hour integer DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 11. job_logs
-- ---------------------------------------------------------------------------
CREATE TABLE job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type job_type NOT NULL,
  status job_status_type NOT NULL,
  user_id uuid REFERENCES users ON DELETE SET NULL,
  action_id uuid REFERENCES actions ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  error text,
  metadata jsonb
);

CREATE INDEX idx_job_logs_job_type_status ON job_logs (job_type, status);
CREATE INDEX idx_job_logs_started_at ON job_logs (started_at DESC);
