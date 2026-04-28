# Phase 19: Free Tier ENUM + Signup Flow — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 19-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 19-free-tier-enum-signup-flow
**Areas discussed:** Tier schema model, Anti-abuse IP+email, Legacy field cleanup, Per-tier column defaults

---

## Tier schema model

| Option | Description | Selected |
|--------|-------------|----------|
| PRICING.md two-axis | subscription_plan (free, pro) + billing_cycle (monthly, annual). Matches Phase 21 Stripe refresh. | ✓ |
| ROADMAP four-value ENUM | subscription_tier (free, monthly, quarterly, annual). Matches PRIC-04 wording but conflicts with 2-price Stripe model. | |
| Other / discuss further | | |

**User's choice:** PRICING.md two-axis
**Notes:** Quarterly tier is silently dropped — OK because all current users are test data and PRICING.md §11 commits to 2 Stripe prices.

| Option | Description | Selected |
|--------|-------------|----------|
| Columns on users | balance_cap + included_monthly populated by trigger/webhook. | ✓ |
| Lookup table by plan+cycle | tier_config table; JOIN on every read. | |
| Both — lookup + cached | Canonical table + denormalized columns. | |

**User's choice:** Columns on users

| Option | Description | Selected |
|--------|-------------|----------|
| Update REQUIREMENTS.md PRIC-04, PRIC-14 | Rewrite to use subscription_plan + billing_cycle. | ✓ |
| Leave REQ as-is, note divergence | Faster but creates drift. | |

**User's choice:** Update REQUIREMENTS.md

---

## Anti-abuse IP+email

| Option | Description | Selected |
|--------|-------------|----------|
| auth.users.raw_user_meta_data['ip'] | Server action passes IP via signUp options.data; trigger reads NEW.raw_user_meta_data. OAuth captured in /auth/callback. | ✓ |
| Separate audit table written post-signup | Trigger minimal; server action handles dedup + rollback. | |
| DB function called from server action | Trigger minimal; explicit RPC call. Dual-source-of-truth risk. | |

**User's choice:** raw_user_meta_data['ip']

| Option | Description | Selected |
|--------|-------------|----------|
| Allow signup, audit only | duplicate_flag=true, user still gets 250 cr. | ✓ |
| Hard reject — block signup | Strict, but blocks shared-IP legit users. | |
| Allow signup, zero credits | Confusing UX (looks broken). | |

**User's choice:** Audit only

| Option | Description | Selected |
|--------|-------------|----------|
| Normalized: lowercase + strip Gmail dots/+aliases | Catches plus-trick abuse. | ✓ |
| Exact match only | Trivially bypassable. | |

**User's choice:** Normalized

---

## Legacy field cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Add new, keep legacy nullable, refactor in P21 | Smallest blast radius. New trigger sets legacy fields to safe nulls. | ✓ |
| Add new + refactor consumers + drop legacy in P19 | Clean end state, bigger phase. | |
| Add new + drop trial_ends_at only (hybrid) | Targeted middle ground. | |

**User's choice:** Defer cleanup to P21

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm startFreeTrial is gone, document in CONTEXT.md | grep returned no matches. | ✓ |
| Search harder for renamed equivalent | | |

**User's choice:** Confirm gone

---

## Per-tier column defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Backfill all to free defaults | Migration UPDATEs all rows to plan='free', cap=500, grant=250. | ✓ |
| Leave NULL, rely on Phase 20 wipe | Adds null-safety burden. | |
| Backfill by inferring from subscription_active | Overkill — users get wiped. | |

**User's choice:** Backfill all to free defaults

| Option | Description | Selected |
|--------|-------------|----------|
| Constants in TS (lib/billing/plan-config.ts) | Single source for webhook + UI; trigger uses literals. | ✓ |
| Postgres function get_plan_config(plan) | More DB plumbing. | |
| Inline literals everywhere | Drifts. | |

**User's choice:** TS constants

---

## Claude's Discretion

- Migration filename + ordering
- Email normalization helper (Postgres function vs inline)
- RLS policy on signup_audit (recommended: service-role only)

## Deferred Ideas

- Refactor cron + billing UI consumers → Phase 21
- Drop legacy `trial_ends_at`/`subscription_active`/`billing_period` → Phase 21
- Stripe webhook 2-price refactor → Phase 21
- Free tier hard caps enforcement → Phase 21
- Browser fingerprint anti-abuse → v1.3+
- Hard-reject duplicate email+IP → post-launch revisit
