---
phase: 05-billing-onboarding-growth
plan: 02
subsystem: onboarding
tags: [onboarding, wizard, middleware, claude, scan-animation, checklist]

requires:
  - phase: 05-billing-onboarding-growth
    plan: 01
    provides: onboarding_completed_at column on users (migration 00010)
  - phase: 02-monitoring-intent-feed
    provides: monitoring_signals + product_profiles tables
  - phase: 01-foundation
    provides: users table + auth middleware + AppShell
provides:
  - OnboardingAnswers / GeneratedKeywords / ONBOARDING_STEPS types
  - generateKeywords server action (Claude Sonnet)
  - saveOnboarding server action (upserts profile, seeds monitoring signals, marks onboarding complete)
  - Onboarding middleware gate (redirects users without onboarding_completed_at to /onboarding)
  - /live, /api/scan, /api/stripe/webhook, /api/og public route exclusions
  - OnboardingWizard (3-step forward-only wizard + scan animation)
  - OnboardingStep component (step indicator, input/textarea, Enter-to-submit)
  - ScanAnimation (typing animation cycling through subreddits for 3-5s)
  - OnboardingChecklist dashboard card (Progress bar, 4 items, localStorage-dismissible)
affects:
  - 05-03 Stripe integration (middleware public-route exclusion for /api/stripe/webhook is now in place)
  - 05-04 credit-burn cron (builds on Phase 5 migration already applied)
  - 05-05 /live page (public route exclusion ready)
  - 05-07 billing UI (can assume onboarding gate exists)

tech-stack:
  added: []
  patterns:
    - "Server action that calls Anthropic SDK per-invocation (serverless-safe)"
    - "JSON-mode prompt with markdown code-fence stripping (reused sonnet-classifier pattern)"
    - "Middleware query on users.onboarding_completed_at to gate post-signup flow"
    - "Fixed overlay wizard on /onboarding to bypass inherited AppShell layout"
    - "localStorage key repco_checklist_dismissed for per-browser UX state"

key-files:
  created:
    - src/features/onboarding/lib/types.ts
    - src/features/onboarding/actions/generate-keywords.ts
    - src/features/onboarding/actions/save-onboarding.ts
    - src/features/onboarding/components/onboarding-step.tsx
    - src/features/onboarding/components/scan-animation.tsx
    - src/features/onboarding/components/onboarding-wizard.tsx
    - src/features/onboarding/components/onboarding-checklist.tsx
    - src/app/(app)/onboarding/page.tsx
  modified:
    - src/middleware.ts
    - src/app/(app)/page.tsx

key-decisions:
  - "Wizard rendered as fixed overlay (z-50, bg-background) so it masks the inherited (app)/layout AppShell without a competing nested layout file"
  - "Competitor-only step uses textarea (allows comma-separated multi-entry); steps 1+2 use Input"
  - "After saveOnboarding completes, scan animation shows signalCount=0 (real scan runs on next cron tick) — matches CONTEXT zero-state copy instead of blocking on a live scan call"
  - "Competitor keywords (alternative-to-X phrases) seeded as reddit_keyword signals alongside generated keywords"
  - "Checklist 'Keywords generated' tied to product_profiles existence (same gate as 'Describe your product') — they are atomic post-onboarding"

requirements-completed: [ONBR-01, ONBR-02, ONBR-03, ONBR-06, ONBR-07]

duration: 6min
completed: 2026-04-20
---

# Phase 05 Plan 02: Onboarding Wizard + Middleware Gate Summary

**Three-question onboarding wizard with Claude-generated keywords/subreddits, typing scan animation, and a dismissible dashboard checklist — plus middleware gate redirecting new users to /onboarding and excluding /live, /api/scan, /api/stripe/webhook, /api/og from auth.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-20T11:40:50Z
- **Completed:** 2026-04-20T11:46:25Z
- **Tasks:** 2
- **Files created:** 8
- **Files modified:** 2

## Accomplishments

- Middleware now gates any authenticated user whose `users.onboarding_completed_at` is null, redirecting them to `/onboarding`; completed users visiting `/onboarding` bounce back to `/`
- `generateKeywords` server action calls Claude Sonnet with a tight JSON prompt (`keywords`, `subreddits`, `competitor_keywords`) and tolerates markdown code-fenced responses (same pattern as sonnet-classifier)
- `saveOnboarding` upserts `product_profiles` (one per user), seeds `monitoring_signals` rows for keywords + competitor phrases + subreddits, and stamps `onboarding_completed_at`
- Wizard uses step-scoped `key="step-N"` so each mount autofocuses its input; Enter submits, forward-only, min-5-char validation on the two required steps
- Scan animation uses `setInterval` at 60ms/char with a per-line hold; clamps duration to 3000–5000ms before revealing either the found-count heading or the zero-state message
- Checklist card renders Progress (0/4–4/4), live checkmark status, and a Dismiss button that appears only when all four items are done; dismissal persists via `repco_checklist_dismissed` localStorage key
- Dashboard only shows the checklist when `?onboarded=true` or any item is incomplete — once all items clear and the user dismisses, it stays hidden

## Task Commits

1. **Task 1: Types + server actions + middleware** — `b739e4e` (feat)
2. **Task 2: Wizard UI + scan animation + dashboard checklist** — `41485c3` (feat)

## Files Created/Modified

**Created:**
- `src/features/onboarding/lib/types.ts` — `OnboardingAnswers`, `GeneratedKeywords`, `OnboardingStep` type + `ONBOARDING_STEPS` tuple
- `src/features/onboarding/actions/generate-keywords.ts` — `"use server"`; instantiates Anthropic per call, uses `SONNET_MODEL_ID ?? "claude-sonnet-4-6"`
- `src/features/onboarding/actions/save-onboarding.ts` — `"use server"`; upserts `product_profiles`, inserts `monitoring_signals` rows, updates `users.onboarding_completed_at`
- `src/features/onboarding/components/onboarding-step.tsx` — `"use client"`; 3-dot step indicator, Input/Textarea, Skip/Next buttons, fade-in transition
- `src/features/onboarding/components/scan-animation.tsx` — `"use client"`; typing `setInterval`, reveals signal count or zero-state copy
- `src/features/onboarding/components/onboarding-wizard.tsx` — `"use client"`; drives steps 1-4, calls generate/save actions, router.push to `/?onboarded=true`
- `src/features/onboarding/components/onboarding-checklist.tsx` — `"use client"`; Progress + 4 checklist rows, localStorage-dismissible
- `src/app/(app)/onboarding/page.tsx` — server page renders wizard in fixed overlay

**Modified:**
- `src/middleware.ts` — adds public routes (`/live`, `/api/scan`, `/api/stripe/webhook`, `/api/og`), queries `users.onboarding_completed_at`, redirects to/from `/onboarding`
- `src/app/(app)/page.tsx` — imports `OnboardingChecklist`, loads product/reddit/completed-action counts, renders checklist when incomplete or `?onboarded=true`

## Decisions Made

- **Fixed-overlay wizard** — the plan suggested either a dedicated layout or an overlay. An overlay keeps things simple: the `(app)/layout.tsx` AppShell still renders, but the `fixed inset-0 z-50 bg-background` wrapper inside `onboarding/page.tsx` fully masks it without requiring a parallel route group.
- **No live scan during wizard** — the scan animation shows a `signalCount=0` reveal intentionally. The plan's animation is "simulated scanning"; the real 15-minute cron produces results asynchronously. Showing zero-state copy matches CONTEXT: *"repco will start scanning every 15 minutes. Here are broader keywords that might help."* Avoiding a synchronous scan keeps the first-run path fast and predictable.
- **Competitor keywords merged into monitoring signals** — `alternative to X` phrases are exactly the kind of language Claude looks for during classification. Seeding them as `reddit_keyword` signals (rather than storing them as a separate column) means the existing Phase 2 structural matcher picks them up immediately.
- **Checklist atomicity** — "Describe your product" and "Keywords generated" both flip from false→true the moment `saveOnboarding` finishes. Treating them as a single gate (product_profile existence) avoids UI confusion where the first is green but the second is not for a few seconds.
- **Step-scoped `key` prop for autofocus** — each step's `OnboardingStep` uses `key="step-N"` so React remounts the component per step, letting a simple `useEffect` focus the input reliably without tracking visibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused eslint-disable directive placement**
- **Found during:** Task 2 lint check
- **Issue:** `react-hooks/set-state-in-effect` lint rule flagged `setDismissed` call inside the localStorage-hydration `useEffect`. This is the correct pattern (can't read localStorage server-side, so state must be set after mount), but the rule treats it as a cascading-render risk. Initial attempt with an eslint-disable on the `useEffect` line itself showed an "unused directive" warning because the rule engine tags the `setState` line specifically.
- **Fix:** Moved `// eslint-disable-next-line react-hooks/set-state-in-effect` directly above the `setDismissed(nextDismissed)` call.
- **Files modified:** `src/features/onboarding/components/onboarding-checklist.tsx`
- **Verification:** `pnpm lint` now reports zero errors/warnings for any onboarding file
- **Committed in:** `41485c3`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None — localized to one line.

## Issues Encountered

None. All plan acceptance criteria met and `pnpm typecheck` / `pnpm lint` are clean for the files in scope. Pre-existing lint errors in `tmp/`, `src/hooks/use-mobile.ts`, and `src/lib/gologin/adapter.ts` are out of scope (SCOPE BOUNDARY rule).

## User Setup Required

- **`ANTHROPIC_API_KEY`** must be set in the server environment for `generateKeywords` to succeed (already used by Phase 2 and Phase 3).
- **Migration 00010** must be applied in the target Supabase environment (dev + prod) so that `users.onboarding_completed_at` exists. Per the 05-01 SUMMARY, this migration is still unapplied in dev/prod; without it, middleware queries will 500 for every authenticated request.

## Next Phase Readiness

- Middleware already exempts `/api/stripe/webhook` → **05-03 Stripe integration** can plug its webhook handler in without further middleware edits.
- Middleware already exempts `/live` + `/api/scan` → **05-05 /live page** + Scan-my-product hook land without auth friction.
- `users.onboarding_completed_at` is now written at the end of onboarding → billing/onboarding queries in later plans have a reliable completion marker.
- Dashboard checklist already exposes the 4 setup states the plan expects; follow-up plans (e.g., 05-03 once Stripe is live) can add a 5th item ("Subscribe / start trial") with a minimal patch.

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*

## Self-Check: PASSED

- All 8 created files present on disk
- Both task commits (`b739e4e`, `41485c3`) present in git log
- `pnpm typecheck` clean
- `pnpm lint` clean for every onboarding file and both modified files
