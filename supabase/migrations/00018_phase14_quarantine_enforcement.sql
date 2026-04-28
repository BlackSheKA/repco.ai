-- =============================================================================
-- Migration: 00018_phase14_quarantine_enforcement.sql
-- Purpose:   Phase 14 — gate claim_action on social_accounts quarantine state
--            (health_status in ('warning','banned') OR cooldown_until > now())
-- Depends on: 00006 (claim_action), 00017 (Phase 13 schema)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_action(p_action_id uuid)
RETURNS SETOF public.actions AS $$
  UPDATE public.actions
  SET status = 'executing', executed_at = now()
  WHERE id = (
    SELECT a.id
    FROM public.actions a
    JOIN public.social_accounts sa ON sa.id = a.account_id
    WHERE a.id = p_action_id
      AND a.status = 'approved'
      AND sa.health_status NOT IN ('warning','banned')
      AND (sa.cooldown_until IS NULL OR sa.cooldown_until <= now())
    FOR UPDATE OF a SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

COMMENT ON FUNCTION public.claim_action(uuid) IS
  'Phase 14: atomic claim with quarantine filter. Returns 0 rows when the action is on an account with health_status in (warning,banned) OR cooldown_until > now(). The action stays in status=approved and becomes claimable again automatically when the account is un-quarantined (manual reset or cooldown expiry). Defense-in-depth: worker.ts re-checks the same predicate.';
