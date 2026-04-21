---
phase: 10
slug: linkedin-outreach-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 10 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — typecheck + grep + manual E2E |
| **Quick run command** | `pnpm typecheck` |
| **Full suite command** | `pnpm typecheck && pnpm lint` |
| **Estimated runtime** | ~25 seconds |

## Sampling Rate

- **After every task commit:** `pnpm typecheck`
- **After wave:** `pnpm typecheck && pnpm lint`
- **Before `/gsd:verify-work`:** Type + lint clean + E2E LinkedIn connect flow

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 10-01-01 | 01 | 1 | ACTN-01, ACTN-05 | grep | `grep -q 'connection_request' src/features/actions/lib/types.ts` | ⬜ |
| 10-01-02 | 01 | 1 | BILL-06 | grep | `grep -q 'connection_request: 20' src/features/billing/lib/types.ts` | ⬜ |
| 10-02-01 | 02 | 1 | ACTN-01 | migration | `test -f supabase/migrations/00014*.sql && grep -q daily_connection_limit supabase/migrations/00014*.sql` | ⬜ |
| 10-02-02 | 02 | 1 | BILL-06 | sql-grep | `grep -q 'connection_request' supabase/migrations/00014*.sql` | ⬜ |
| 10-03-01 | 03 | 2 | ONBR-05 | grep | `grep -q 'platformLabel' src/features/accounts/components/connection-flow.tsx` | ⬜ |
| 10-04-01 | 04 | 2 | ACTN-01, ACTN-05 | file | `test -f src/lib/computer-use/actions/linkedin-connect.ts` | ⬜ |
| 10-04-02 | 04 | 2 | ACTN-05 | grep | `grep -q 'case "connection_request"' src/lib/action-worker/worker.ts` | ⬜ |
| 10-04-03 | 04 | 2 | ACTN-01 | grep | `grep -q 'connection_request' src/features/accounts/lib/types.ts` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| User connects LinkedIn account end-to-end | ONBR-05 | Requires GoLogin + real LinkedIn | Open `/accounts`, choose LinkedIn, complete 3-step flow; account reaches `healthy` |
| connection_request executes end-to-end via CU | ACTN-05 | Requires real LinkedIn profile | Approve a drafted `connection_request`; worker runs; action → completed; job_logs row present; pipeline_status → contacted |
| already_connected detection | ACTN-05 | Requires known 1st-degree | Target a connected profile; action → failed with `already_connected`; pipeline_status → connected |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity satisfied
- [ ] No watch-mode flags
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
