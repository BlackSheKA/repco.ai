---
created: 2026-04-23T10:18:48.403Z
title: Design free tier for PLG landing promise
area: planning
files:
  - .planning/marketing/landing-copy.md
---

## Problem

Landing page (`.planning/marketing/landing-copy.md`) promises free tier as the core PLG hook — repeated 3× across hero, mid-CTA, and final CTA:

- `500 free credits · no card · first DM out in 4 minutes`
- `500 credits · no card · one-click cancel`
- `500 credits · no card · cancel in one click · refund if we miss your goal`

Right now this is marketing fiction — there's no free tier implemented. If we ship the landing page without it, the PLG promise breaks at first user touch and the viral self-serve funnel dies.

We need to design and implement the free tier before the new landing goes live.

## Open questions

**Credit economics**
- How many free credits? (copy promises 500 — is that right?)
- What can 500 credits actually buy? (1 credit ≈ what action — 1 DM? 1 intent signal scored? 1 Reddit scan?)
- Enough to produce *first real DM + first real reply* (otherwise PLG promise breaks)
- Tight enough to force conversion within reasonable timeframe

**Feature gating**
- Which platforms in free? (Reddit only? LinkedIn only? both?)
- Which features gated? (autopilot vs approve-each? follow-ups? multiple goals?)
- Signal volume caps? (daily/monthly)

**Abuse prevention**
- Email verification required?
- IP/device fingerprinting to prevent multi-account farming?
- LinkedIn/Reddit account uniqueness checks?
- Rate limits per account

**Conversion triggers**
- Credits depleted?
- Time-based (14-day trial)?
- Feature-gated (hit a wall on follow-ups or second platform)?
- Goal achieved → convert?
- Hybrid

**Self-serve conversion funnel**
- What's the minimum viable "aha moment" on free tier? (first DM reply? first booked meeting?)
- Billing/paywall UX when limit hit
- One-click upgrade flow

## Solution

TBD — needs its own phase. Probably a spec + discuss round before implementation.

**Research to do first:**
- Clay free tier structure
- Instantly free tier
- Apollo free plan
- Smartlead pricing/free
- gojiberry pricing/free (direct inspiration for our positioning)
- Self-serve B2B SaaS free-to-paid conversion rate benchmarks (OpenView / Lennybot data)

**Must-haves for v1:**
- No credit card at signup
- Real outcome achievable on free (at least 1 real DM + 1 signal, ideally 1 reply)
- Clear visual "X credits left" counter in dashboard
- Hard paywall at limit, not soft nag
- One-click upgrade with preserved session/context

**Nice-to-haves:**
- Referral credits (invite a founder, get +100 credits) — viral loop
- Founder-friendly lifetime-free-for-building-in-public tier
- Credit refill on goal-miss (matches the "refund if we miss" promise in final CTA)
