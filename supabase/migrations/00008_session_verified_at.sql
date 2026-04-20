-- Migration: track when user asserted they completed login on a social account
-- session_verified_at is set when the user clicks "I've logged in" on the
-- ConnectionFlow. Worker pipeline can use its presence to gate outreach.

ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS session_verified_at timestamptz;
