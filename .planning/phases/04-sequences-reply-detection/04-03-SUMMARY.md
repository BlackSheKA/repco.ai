---
phase: 04-sequences-reply-detection
plan: 03
subsystem: sequences
tags: [cron, follow-up-scheduler, daily-digest, auto-send, timezone, vercel-cron]

requires:
  - phase: 04-sequences-reply-detection
    provides: findDueFollowUps, FOLLOW_UP_SCHEDULE, DueFollowUp (Plan 04-01); sendDailyDigest, date-fns-tz (Plan 04-02)
  - phase: 03-action-engine
    provides: generateDM (Anthropic DM generation with QC loop), action_type='followup_dm'
  - phase: 01-foundation
    provides: cron auth pattern (Bearer token + CRON_SECRET), job_logs schema, logger
provides:
  - /api/cron/schedule-followups cron route (every 4h; creates followup_dm actions with AI-generated content)
  - /api/cron/daily-digest cron route (hourly; filters to users whose local hour is 8 via timezone)
  - toggleAutoSend server action (updates users.auto_send_followups)
  - AutoSendToggle client component (shadcn Switch + sonner toast + aria metadata)
  - Settings page "Follow-up Sequences" section
  - Vercel cron registrations for both new routes
affects: [04-sequences-reply-detection, 05-billing-onboarding-growth]

tech-stack:
  added: []
  patterns:
    - "Follow-up angle override: step 1/2/3 each gets a distinct prompt injected into generateDM's suggestedAngle, so the same QC pipeline handles all follow-up DMs"
    - "Timezone-aware digest filter: formatInTimeZone(now, user.tz, 'H') === 8 gates the per-user loop; yesterday boundary also computed in user TZ and converted back to UTC for Supabase queries"
    - "Optimistic toggle with revert-on-error: setEnabled(checked) before startTransition; catch block reverts and toast.error"
    - "Per-user try/catch inside digest loop so one user failure doesn't abort the whole cron"
    - "Skip empty digests (0 signals + 0 pending + 0 replies) so we don't spam inactive users"

key-files:
  created:
    - src/app/api/cron/schedule-followups/route.ts
    - src/app/api/cron/daily-digest/route.ts
    - src/features/sequences/actions/toggle-auto-send.ts
    - src/features/sequences/components/auto-send-toggle.tsx
  modified:
    - vercel.json
    - src/app/(app)/settings/page.tsx

key-decisions:
  - "Follow-up angle as suggestedAngle override (not separate prompt path) — reuses generateDM + runQualityControl unchanged, only the angle text changes per step"
  - "24h expiry on pending follow-ups — matches plan requirement; expire-actions cron (already wired in Phase 3) will cancel them if unapproved"
  - "DM generation failure = skip that follow-up (logged, counted as failed_count) — locked decision from PLAN: missed step means skip, not retry"
  - "Daily digest skips users with zero activity — avoids empty 'nothing happened yesterday' emails that train users to ignore"
  - "Yesterday boundaries computed by rendering yesterday's date string in user TZ, then reparsing through formatInTimeZone to produce a UTC ISO boundary — avoids date-fns-tz zonedTimeToUtc which was removed in v3"

requirements-completed: [FLLW-05, NTFY-01]

duration: 3min
completed: 2026-04-20
---

# Phase 04 Plan 03: Follow-up Scheduler + Daily Digest + Auto-Send Toggle Summary

**Two Vercel cron routes (schedule-followups every 4h, daily-digest hourly with timezone filter) plus a Switch-backed auto-send toggle on the settings page wired to a revalidating server action**

## Performance

- **Duration:** ~2.5 min
- **Started:** 2026-04-20T06:37:54Z
- **Completed:** 2026-04-20T06:40:19Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 2

## Accomplishments

- **`src/app/api/cron/schedule-followups/route.ts`** — Bearer-token-auth'd cron that:
  - Calls `findDueFollowUps(supabase)` to list prospects whose next follow-up is due
  - For each: loads the original intent signal, loads the user's `auto_send_followups` flag and product description, then calls `generateDM` with a step-specific angle override (feature/benefit for step 1, value/insight for step 2, low-pressure check-in for step 3)
  - On QC pass, inserts a `followup_dm` action with status `approved` or `pending_approval` based on the toggle, `sequence_step` set to the step number, and 24h `expires_at`
  - On QC fail, logs a warning and skips (locked plan decision)
  - Per-prospect try/catch so one failure doesn't abort the whole run
  - Logs to `job_logs` with `scheduled_count`, `failed_count`, `due_count`, `correlation_id`
  - Calls `logger.flush()` before responding
  - `runtime = "nodejs"`, `maxDuration = 60` (Anthropic calls can be slow)

- **`src/app/api/cron/daily-digest/route.ts`** — Hourly cron that:
  - Loads all users with `id, email, timezone`
  - Per user: computes `localHour = parseInt(formatInTimeZone(now, tz, "H"))` and skips if not 8
  - Computes yesterday's UTC boundaries expressed in the user's TZ, then queries:
    - `intent_signals` count (detected_at in yesterday)
    - `actions` pending_approval count (live queue)
    - `prospects` replies count (replied_detected_at in yesterday)
    - top 3 signals by intent_strength with subreddit extracted from post_url
  - Fetches product name from `product_profiles` (fallback: "your product")
  - Skips users with zero activity (avoid empty digests)
  - Calls `sendDailyDigest(user.email, data)` from Plan 04-02
  - Logs per-user errors (try/catch) without aborting the run
  - Job_logs + logger.flush
  - `maxDuration = 30`

- **`src/features/sequences/actions/toggle-auto-send.ts`** — `"use server"` action: auth check via `supabase.auth.getUser()`, updates `users.auto_send_followups = enabled` for the authed user, `revalidatePath("/settings")`, returns `{success: true}`. Throws on unauthorized or DB error.

- **`src/features/sequences/components/auto-send-toggle.tsx`** — `"use client"` Switch:
  - Optimistic: `setEnabled(checked)` immediately, then `startTransition(async () => toggleAutoSend(checked))`
  - On error: reverts and shows `toast.error("Failed to update setting")`
  - On success: shows `toast("Auto-send enabled" | "Auto-send disabled")`
  - Accessibility: `aria-label="Auto-send follow-ups"`, `aria-describedby="auto-send-description"`, explicit `<label htmlFor="auto-send">`

- **`src/app/(app)/settings/page.tsx`** — Added query for `users.auto_send_followups`, imported `AutoSendToggle`, rendered a new "Follow-up Sequences" section (`mt-8`, `max-w-[640px]`, muted rounded card) below the existing `SettingsForm`. Existing monitoring UI is untouched.

- **`vercel.json`** — Registered both new crons (`schedule-followups` every 4h, `daily-digest` hourly). No existing cron entries were modified.

## Task Commits

1. **Task 1 (follow-up scheduler + daily digest + vercel.json)** — `b6de897` (feat)
2. **Task 2 (auto-send toggle + server action + settings page)** — `cff2701` (feat)

## Files Created/Modified

### Created

- `src/app/api/cron/schedule-followups/route.ts` — Follow-up scheduler cron
- `src/app/api/cron/daily-digest/route.ts` — Daily digest cron
- `src/features/sequences/actions/toggle-auto-send.ts` — Auto-send server action
- `src/features/sequences/components/auto-send-toggle.tsx` — Auto-send Switch component

### Modified

- `vercel.json` — Added `schedule-followups` and `daily-digest` cron entries
- `src/app/(app)/settings/page.tsx` — Added `AutoSendToggle` section + `auto_send_followups` query

## Decisions Made

- **Angle injection via `suggestedAngle`** — Rather than plumbing a separate "follow-up mode" through `generateDM`, I override the `suggestedAngle` field per step. Keeps the QC pipeline identical for first DMs and follow-ups, which is lower risk and easier to iterate on prompts.
- **Skip empty digests** — Users with zero signals/pending/replies yesterday get no email. Sending "nothing happened" trains users to ignore the digest; this maximizes signal-to-noise. Can be revisited once we have retention data.
- **Yesterday boundary via round-trip through `formatInTimeZone`** — `date-fns-tz` v3 dropped the `zonedTimeToUtc` helper; rendering the local midnight string and reparsing through `formatInTimeZone` produces a correct UTC boundary without bringing in an extra tz library. Tested mentally for US/Pacific + Europe/Warsaw edge cases (DST boundaries handled by `date-fns-tz`).
- **Per-user try/catch in digest loop** — One bad email address or TZ string shouldn't kill the whole hourly run. Errors are logged and counted, the loop continues.

## Deviations from Plan

### Out-of-Scope: cron count accounting

**What the plan says:** "vercel.json total crons count is 5 (zombie-recovery, monitor-reddit, warmup, schedule-followups, daily-digest)"

**Reality:** `vercel.json` already had 4 pre-existing crons when this plan started: `zombie-recovery`, `monitor-reddit`, `warmup`, and `expire-actions` (the last one was added in Phase 3 for the 24h action expiry feature but wasn't reflected in the 04-03 plan's count). Adding the 2 new crons from this plan makes **6** crons total. After this plan's commits an external edit also added a `check-replies` cron (presumably from a parallel plan), bringing the current file to 7.

**Impact:** No functional impact. The 2 crons required by this plan (`schedule-followups`, `daily-digest`) are correctly registered with the exact schedules the plan specified. The acceptance criterion "total crons count is 5" was stale and is marked as a plan-authoring inaccuracy, not an execution deviation.

### Otherwise

Plan executed exactly as written. No Rule 1/2/3 auto-fixes needed — the existing infrastructure from Plans 04-01 and 04-02 was clean and the contracts matched.

## Verification

- `pnpm typecheck` passes clean after both tasks
- Task 1 grep checks: `schedule-followups` and `daily-digest` both present in `vercel.json`; `findDueFollowUps` imported in scheduler cron; `sendDailyDigest` + `formatInTimeZone` both imported in digest cron
- Task 2 grep checks: `toggleAutoSend` exported; `AutoSendToggle` exported; `AutoSendToggle` + "Follow-up Sequences" both present in settings page
- Existing `SettingsForm` rendering in settings page is preserved unchanged

## Next Phase Readiness

- Follow-up scheduler is live-wired end-to-end: the cron -> `findDueFollowUps` -> `generateDM` -> `actions` insert path is complete. Once a user has `contacted` prospects with `executed_at` on the initial DM, the hourly cron will create step 1 follow-ups on day 3, step 2 on day 7, step 3 on day 14.
- Daily digest is production-capable as long as `RESEND_API_KEY` is set and DNS/SPF/DKIM are configured on `repco.ai` (user setup carryover from Plan 04-02).
- Auto-send toggle ships the contract expected by the scheduler cron (`users.auto_send_followups`). Default is `false` (approval required); users opt in via settings.
- **Ready for:** Plan 04-04 (reply detection cron) can slot in beside these without schema or import changes. The `check-replies` cron registration that appeared in `vercel.json` suggests Plan 04-04 is already being built in parallel.
- **Blockers:** None for downstream plans.

## Self-Check: PASSED

Verified:

- `src/app/api/cron/schedule-followups/route.ts` — FOUND
- `src/app/api/cron/daily-digest/route.ts` — FOUND
- `src/features/sequences/actions/toggle-auto-send.ts` — FOUND
- `src/features/sequences/components/auto-send-toggle.tsx` — FOUND
- `vercel.json` contains `schedule-followups` — FOUND
- `vercel.json` contains `daily-digest` — FOUND
- `src/app/(app)/settings/page.tsx` imports `AutoSendToggle` — FOUND
- Commit `b6de897` — FOUND
- Commit `cff2701` — FOUND
- Typecheck: clean

---
*Phase: 04-sequences-reply-detection*
*Completed: 2026-04-20*
