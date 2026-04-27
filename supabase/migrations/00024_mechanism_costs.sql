-- Phase 16: Mechanism Cost Engine Schema
-- Creates mechanism_costs source-of-truth table (60 rows; 32 signal + 28 outbound)
-- Rewrites monitoring_signals around mechanism_id + frequency + config jsonb
-- Drops legacy signal_type column + signal_source_type ENUM
-- All source values verbatim from .planning/PRICING.md §5/§6 via RESEARCH.md §2

-- 1. ENUM
CREATE TYPE mechanism_kind_enum AS ENUM ('signal', 'outbound');

-- 2. mechanism_costs table
CREATE TABLE mechanism_costs (
  mechanism_id      text PRIMARY KEY,
  unit_cost         integer NOT NULL,
  mechanism_kind    mechanism_kind_enum NOT NULL,
  premium           boolean NOT NULL DEFAULT false,
  requires_gologin  boolean NOT NULL DEFAULT false,
  free_tier_allowed boolean NOT NULL DEFAULT false,
  description       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 3. RLS: authenticated SELECT only (no INSERT/UPDATE/DELETE policies = client writes denied)
ALTER TABLE mechanism_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mechanism_costs_select_authenticated"
  ON mechanism_costs FOR SELECT
  TO authenticated
  USING (true);

-- 4. Seed 60 rows (32 signal + 28 outbound) verbatim from PRICING.md §5/§6
INSERT INTO mechanism_costs (mechanism_id, unit_cost, mechanism_kind, premium, requires_gologin, free_tier_allowed, description) VALUES
  -- §5 Signal mechanisms (32 rows)
  -- Reddit (R1-R9)
  ('R1', 1, 'signal', false, false, true, 'Subreddit firehose'),
  ('R2', 2, 'signal', false, false, true, 'Post-watch comments (R1-dependent)'),
  ('R3', 1, 'signal', false, false, true, 'Competitor mention'),
  ('R4', 1, 'signal', false, false, true, 'Question pattern (custom)'),
  ('R5', 1, 'signal', false, false, true, 'Tracked user activity'),
  ('R6', 2, 'signal', false, false, true, 'Tracked user engagement'),
  ('R7', 1, 'signal', false, true,  true, 'Own Reddit engagement (gologin)'),
  ('R8', 1, 'signal', false, true,  true, 'Reddit mentions/tags (gologin)'),
  ('R9', 0, 'signal', false, false, true, 'Trending posts modifier (free enhancer on R1)'),
  -- Modifiers (M1-M3)
  ('M1', 0, 'signal', false, false, true, 'Author quality pre-filter (free, default on)'),
  ('M2', 0, 'signal', false, false, true, 'Cross-subreddit ICP (free, optional)'),
  ('M3', 0, 'signal', false, false, true, 'Subreddit tier multiplier (free, default on)'),
  -- LinkedIn (L1-L11)
  ('L1', 1, 'signal', false, false, true, 'Keyword post search'),
  ('L2', 1, 'signal', false, false, true, 'Auto-disc reactions (per scan per active tracked post)'),
  ('L3', 1, 'signal', false, false, true, 'Auto-disc comments (per scan per active tracked post)'),
  ('L4', 1, 'signal', false, false, true, 'Profile reactions (scales with last_n_posts_to_track)'),
  ('L5', 1, 'signal', false, false, true, 'Profile comments (per scan per active post per profile)'),
  ('L6', 3, 'signal', false, true,  true, 'Own LinkedIn engagement (gologin)'),
  ('L7', 1, 'signal', false, false, true, 'New posts from profile'),
  ('L8', 1, 'signal', false, false, true, 'Job change detection (24h cadence)'),
  ('L9', 1, 'signal', false, false, true, 'Hiring signals (24h cadence)'),
  ('L10',1, 'signal', false, true,  true, 'Connection requests scan (gologin)'),
  ('L11',1, 'signal', false, true,  true, 'LinkedIn mentions (gologin)'),
  -- X/Twitter (T1-T5) — premium tier, free_tier_allowed=false
  ('T1', 1, 'signal', true,  false, false, 'Keyword tweet search (X premium)'),
  ('T2', 1, 'signal', true,  false, false, 'Competitor mention X'),
  ('T3', 2, 'signal', true,  false, false, 'Own tweets engagement (gologin optional)'),
  ('T4', 3, 'signal', true,  false, false, 'Tracked X profile'),
  ('T5', 2, 'signal', true,  false, false, 'Trending topic'),
  -- Engagement composite (E1-E2)
  ('E1', 5, 'signal', false, false, true, 'Signal stacking composite (5 cr/day FLAT — special case in burn engine)'),
  ('E2', 0, 'signal', false, false, true, 'Negative feedback loop (free, default on)'),
  -- Operations (O1-O2)
  ('O1', 0, 'signal', false, false, true, 'Health monitoring (free infrastructure)'),
  ('O2', 0, 'signal', false, false, true, 'Onboarding presets (one-time AI gen, included)'),

  -- §6 Outbound mechanisms (28 rows; ALL free_tier_allowed=false, ALL requires_gologin=true)
  -- Outbound Reddit (OR1-OR9)
  ('OR1', 30, 'outbound', false, true, false, 'Reddit DM (Haiku CU)'),
  ('OR2', 15, 'outbound', false, true, false, 'Top-level comment (Haiku CU)'),
  ('OR3', 15, 'outbound', false, true, false, 'Reply to comment (Haiku CU)'),
  ('OR4', 0,  'outbound', false, true, false, 'Upvote (DOM, engage pool)'),
  ('OR5', 0,  'outbound', false, true, false, 'Downvote (UI hidden — placeholder)'), -- hard exclude (UI hidden)
  ('OR6', 30, 'outbound', false, true, false, 'Submit own post (DOM)'),
  ('OR7', 10, 'outbound', false, true, false, 'Crosspost (Haiku CU)'),
  ('OR8', 0,  'outbound', false, true, false, 'User follow (DOM)'),
  ('OR9', 0,  'outbound', false, true, false, 'Subreddit join (DOM)'),
  -- Outbound LinkedIn (OL1-OL11)
  ('OL1', 20, 'outbound', false, true, false, 'LinkedIn connection request with note (URL-hack + DOM)'),
  ('OL2', 30, 'outbound', false, true, false, 'LinkedIn DM 1° connection (DOM)'),
  ('OL3', 0,  'outbound', true,  true, false, 'InMail (post-MVP TBD — placeholder)'), -- TODO post-MVP
  ('OL4', 0,  'outbound', false, true, false, 'Reaction (DOM, engage pool)'),
  ('OL5', 15, 'outbound', false, true, false, 'LinkedIn top-level comment (DOM)'),
  ('OL6', 15, 'outbound', false, true, false, 'LinkedIn reply (Haiku CU)'),
  ('OL7', 0,  'outbound', false, true, false, 'Profile follow (DOM, engage pool)'),
  ('OL8', 20, 'outbound', false, true, false, 'Repost (with-thoughts variant)'), -- D-08: split (with-thoughts=20 / simple=5) deferred to Phase 22
  ('OL9', 25, 'outbound', false, true, false, 'LinkedIn original post publish (DOM)'),
  ('OL10',0,  'outbound', false, true, false, 'Endorse skill (DOM)'),
  ('OL11',30, 'outbound', false, true, false, 'Recommendation request/write (Haiku CU)'),
  -- Outbound X (OX1-OX8) — premium tier
  ('OX1', 10, 'outbound', true, true, false, 'X reply (DOM)'),
  ('OX2', 15, 'outbound', true, true, false, 'X quote tweet (DOM)'),
  ('OX3', 0,  'outbound', true, true, false, 'X like (DOM, engage pool)'),
  ('OX4', 5,  'outbound', true, true, false, 'X retweet simple (DOM)'),
  ('OX5', 25, 'outbound', true, true, false, 'X DM (DOM)'),
  ('OX6', 0,  'outbound', true, true, false, 'X follow profile (DOM, engage pool)'),
  ('OX7', 20, 'outbound', true, true, false, 'X original tweet (DOM/Haiku CU)'),
  ('OX8', 5,  'outbound', true, true, false, 'X list add (Haiku CU)');

-- 5. Wipe monitoring_signals (test data only; project memory `project_users_are_test_data`)
DELETE FROM monitoring_signals;

-- 6. Drop legacy unique index BEFORE dropping signal_type column it references
DROP INDEX monitoring_signals_user_type_value_unique;

-- 7-9. Add new columns
ALTER TABLE monitoring_signals ADD COLUMN frequency interval NOT NULL DEFAULT '6 hours';
ALTER TABLE monitoring_signals ADD COLUMN mechanism_id text NOT NULL REFERENCES mechanism_costs(mechanism_id) ON DELETE RESTRICT;
ALTER TABLE monitoring_signals ADD COLUMN config jsonb NOT NULL DEFAULT '{}';

-- 10-11. Drop legacy columns
ALTER TABLE monitoring_signals DROP COLUMN signal_type;
ALTER TABLE monitoring_signals DROP COLUMN credits_per_day;

-- 12. Drop legacy ENUM
DROP TYPE signal_source_type;

-- 13. Recreate unique index using mechanism_id
CREATE UNIQUE INDEX monitoring_signals_user_mech_value_unique ON monitoring_signals (user_id, mechanism_id, value) WHERE active = true;
