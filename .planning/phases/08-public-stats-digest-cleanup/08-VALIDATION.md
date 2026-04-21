---
phase: 8
slug: public-stats-digest-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — project has no test framework yet; validation is manual + scripted checks |
| **Config file** | none |
| **Quick run command** | `node scripts/phase-08-validate.mjs` (wave 0 creates) |
| **Full suite command** | `node scripts/phase-08-validate.mjs --full` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/phase-08-validate.mjs`
- **After every plan wave:** Run `node scripts/phase-08-validate.mjs --full`
- **Before `/gsd:verify-work`:** Full suite must be green + manual `/live` spot-check
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | GROW-01 | migration | `pnpm supabase db diff --linked` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | GROW-01 | sql-unit | `node scripts/phase-08-validate.mjs --live-stats-seed` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | GROW-01, GROW-02 | integration | `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/refresh-live-stats` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 1 | GROW-01, GROW-02 | sql-assert | `node scripts/phase-08-validate.mjs --live-stats-fresh` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | NTFY-01, GROW-05 | static | `node scripts/phase-08-validate.mjs --vercel-crons` | ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | NTFY-01 | static | `test ! -d src/app/api/cron/daily-digest` | n/a | ⬜ pending |
| 8-04-01 | 04 | 2 | NTFY-01 | integration | Manual: Resend dashboard count at 08:00 local for test user | manual | ⬜ pending |
| 8-04-02 | 04 | 2 | NTFY-01 | idempotency | `node scripts/phase-08-validate.mjs --digest-idempotency` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/phase-08-validate.mjs` — script runner with subcommands:
  - `--live-stats-seed`: asserts 1 row in `live_stats` after migration
  - `--live-stats-fresh`: asserts `live_stats.updated_at > now() - interval '10 minutes'` after cron tick
  - `--vercel-crons`: parses vercel.json, asserts `/api/cron/daily-digest` absent and `/api/cron/refresh-live-stats` present
  - `--digest-idempotency`: asserts `last_digest_sent_at = current_date` for test user only sent once

*Script uses `SUPABASE_SERVICE_ROLE_KEY` server-side; fails fast if env missing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/live` displays non-zero stats under real activity | GROW-01, GROW-02 | Requires authenticated browser + Supabase data | Visit http://localhost:3001/live after running cron; confirm 6 stat cards show non-zero when DB has activity |
| Digest email actually arrives | NTFY-01 | Email delivery is external (Resend) | Trigger digest for a test user at 08:00 their local TZ; verify Resend dashboard shows exactly 1 delivery |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
