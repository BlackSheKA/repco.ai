---
phase: 18
plan: 03
status: complete
completed_at: "2026-04-27"
commits:
  - "0581d26 feat(18-03): add Haiku detect-ban-state wrapper + defensive tests"
  - "afac39f feat(18-03): splice post-action ban detector into worker"
  - "91147f6 feat(18-03): extend send-account-warning to 4 statuses + 24h debounce"
  - "40467ee test(18-03): add placeholder fixture PNGs for detector ML tests"
---

# 18-03 Summary — Detector + Alerts

## Outcome

Post-action ban detector wired end-to-end. Haiku CU classifies the final
screenshot of every Browserbase/Stagehand action; verdict maps to
`health_status` per D-16; `sendAccountWarning` debounces 24h via `job_logs`.

## What landed

1. **`src/lib/computer-use/detect-ban-state.ts`** — single-shot Haiku
   classifier. Vanilla `messages.create`, no agent loop (D-14). Returns
   `{ banned, suspended, captcha }`. On API/parse failure returns
   all-false (L-3 / D-23 — detector failure ≠ ban flip).
2. **`worker.ts` splice (84 lines)** — after every successful CU action,
   take screenshot → `detectBanState` → flip `social_accounts.health_status`
   if banned/suspended/captcha → call `sendAccountWarning`.
3. **`send-account-warning.ts`** — 4-status union (`warning | banned |
   needs_reconnect | captcha_required`), platform-aware copy, 24h debounce
   via `job_logs WHERE job_type='account_warning_email' AND metadata->>account_id=$accountId`.
4. **`account-warning.tsx`** — STATUS_COPY map with 4 status variants.
5. **Test fixtures** — 4 placeholder 1×1 PNGs gated behind `INTEGRATION=1`.
   Real screenshots needed before prod ML validation (open follow-up).

## Tests

- 7 unit tests in `detect-ban-state.test.ts` covering V-15 + parsing edges.
- 4 fixture-based integration tests gated behind `INTEGRATION=1` env flag.
- `account-warning.test.ts` updated for new platform-aware subject line.

## Deviations

1. **PNG fixtures are placeholders** (1×1 PNGs, 69 bytes). User must drop
   real banned/suspended/captcha screenshots before fixture-based ML tests
   are meaningful. Tests gated behind `INTEGRATION=1` so CI passes regardless.
2. **`metadata.account_id` stored as string** (per L-6) for stable JSONB
   debounce queries.

## Open follow-ups

- Real fixture screenshots (handed to user).
- 18-04: UI banner + Reconnect button consume the new `health_status` values.
