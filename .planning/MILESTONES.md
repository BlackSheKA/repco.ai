# Milestones

## v1.1 LinkedIn Action Expansion (In Progress, started 2026-04-23)

**Scope:** 1 phase, 5 plans (TBD during plan-phase)
**Status:** Roadmap defined, awaiting `/gsd:plan-phase 13`

**Goal:** Reach outreach parity with Reddit on LinkedIn by porting the deterministic DOM flow (proven in v1.0 Phase 10 + commit 042e842) to every remaining LinkedIn action type.

**Requirements:** LNKD-01 through LNKD-06 (LinkedIn DM, Follow, Like, Comment, followup_dm sequences, pre-screening)

**Phase:**
- [ ] **Phase 13: LinkedIn Action Expansion** — 5 plans (DM, Follow, Like+Comment, followup_dm, pre-screening)

---

## v1.0 Foundation (Shipped: 2026-04-21)

**Phases completed:** 12 phases, 47 plans
**Audit status:** tech_debt (2 critical bugs fixed in-audit, 2 tech-debt items deferred)

**Key accomplishments:**

1. **Foundation + Auth + Observability** (P1) — Google OAuth, Supabase schema with 11 RLS-protected tables, Sentry+Axiom structured logging with correlation IDs, zombie-recovery cron, OBSV-04 threshold alerting
2. **Reddit monitoring + intent feed** (P2) — snoowrap adapter, structural + Claude Sonnet classifier, real-time dashboard with agent persona, 48h freshness dedup, staleness banner
3. **Action engine with anti-ban** (P3) — GoLogin + Playwright CDP + Haiku Computer Use, approval queue, 7-day warmup gate, daily limits, target isolation, account health state machine
4. **Sequences + reply detection** (P4, P7) — day 3/7/14 follow-ups, check-replies cron, normalize-at-compare-boundary handle matching (Phase 7 regression test)
5. **Billing + onboarding + growth** (P5) — Stripe checkout (subscriptions + credit packs), 3-question onboarding wizard, /live public stats page, prospect pipeline with CSV export
6. **LinkedIn monitoring via Apify** (P6) — every 2-4h LinkedIn ingestion, canary gate, signal matching, pipeline integration
7. **Public stats + digest cleanup** (P8) — refresh-live-stats cron (*/5min), digest consolidation to single endpoint, TZ-aware hour=8 gate, last_digest_sent_at idempotency
8. **Cross-platform approval + audit trail** (P9) — platform-aware ApprovalCard (Reddit/LinkedIn badges), worker.ts try/finally with schema-valid job_logs insert
9. **LinkedIn Connect execution** (P10) — connection_request action arm via GoLogin + CU, 5 failure-mode detection, daily connection limit, 20 credit cost, Add-a-note forced path
10. **Nyquist validation compliance** (P11) — all 7 prior phases reached status=final, nyquist_compliant=true; 288 tests across 42 files; retroactive 06-VERIFICATION.md
11. **Trial auto-activation + expiry reconciliation** (P12) — handle_new_user trigger sets trial_ends_at+500 credits atomically; backfill for existing users; ACTN-10 spec reconciled to 12h with boundary test; Start Trial CTA removed

**Migrations shipped:** 00001–00016 (16 total)
**Test suite:** 288 tests across 42 files, all green
**Requirements:** 42/42 satisfied

**Known tech debt (tracked for v1.1):**
- NTFY-03 wiring gap: worker.ts doesn't call sendAccountWarning on LinkedIn CU security_checkpoint/session_expired (health transitions silently)
- Orphaned health state machine: transitionHealth/applyHealthTransition never called in production; worker.ts does inline updates
- Migrations 00015 + 00016 need manual deploy to dev/prod Supabase
- E2E verification of LinkedIn connection_request and trial auto-activation deferred to post-deploy

**Bugs fixed in-audit:**
- pipeline_status='connected' enum crash on LinkedIn already_connected path (migration 00016)
- connection_request 12h expiry contradiction (expiry.ts .neq() filter)

---
