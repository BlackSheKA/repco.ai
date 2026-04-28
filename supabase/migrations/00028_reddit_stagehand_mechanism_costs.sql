-- Phase 17.7 — Reddit executors pivot from Computer Use (Haiku) to deterministic Stagehand.
-- Per CONTEXT D-04b: post-action verifier uses extract() only on DOM-check false;
-- expect ~5-15% of actions to incur extract() on top of observe() baseline.
-- Per RESEARCH: prior unit_cost reflected Haiku CU loop (~5-10 LLM calls per action);
-- Stagehand observe() with cache HIT is ~0 LLM calls; cache MISS ~1; extract() fallback ~1.

BEGIN;

UPDATE public.mechanism_costs
SET
  unit_cost = 8,
  description = 'Reddit DM (Stagehand DOM; ~1 observe MISS + 5-15% extract fallback)'
WHERE mechanism_id = 'OR1';

UPDATE public.mechanism_costs
SET
  unit_cost = 4,
  description = 'Reddit top-level comment (Stagehand DOM; ~1 observe MISS + 5-15% extract fallback)'
WHERE mechanism_id = 'OR2';

UPDATE public.mechanism_costs
SET
  unit_cost = 4,
  description = 'Reddit reply to comment (Stagehand DOM; ~1 observe MISS + 5-15% extract fallback)'
WHERE mechanism_id = 'OR3';

-- OR4 (upvote, unit_cost=0) and OR8 (follow, unit_cost=0) unchanged — already DOM-only.

COMMIT;
