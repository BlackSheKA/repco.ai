---
phase: 18
plan: 04
subsystem: accounts-ui
tags: [ui, banner, recovery, reddit-preflight, shadcn]
requires:
  - 18-01 (ENUM values needs_reconnect + captcha_required)
  - 18-02 (runRedditPreflight)
provides:
  - shadcn Alert primitive
  - AccountDegradedBanner server component (mounted in (app)/layout.tsx)
  - attemptReconnect server action
  - AccountCard Reconnect button
affects:
  - src/app/(app)/layout.tsx (query extended)
  - src/features/accounts/components/health-badge.tsx (tints + labels updated)
tech_stack:
  added: ["shadcn/ui Alert"]
  patterns:
    [
      "server-component banner driven by layout query",
      "discriminated-union → toast variant mapping",
      "user_id-scoped server action (defense-in-depth + RLS)",
    ]
key_files:
  created:
    - src/components/ui/alert.tsx
    - src/components/account-degraded-banner.tsx
    - src/components/account-degraded-banner.test.tsx
    - src/features/accounts/server/attempt-reconnect.ts
    - src/features/accounts/server/attempt-reconnect.test.ts
  modified:
    - src/features/accounts/components/health-badge.tsx
    - src/app/(app)/layout.tsx
    - src/features/accounts/components/account-card.tsx
decisions:
  - "Reconnect button does NOT auto-open a cloud-browser URL — SocialAccount carries no such field; the existing Re-login (LogIn) button covers that path. Reconnect's job is to re-run Reddit preflight server-side and clear status optimistically. (Drift from plan §Task 3 cloud_browser_url assumption.)"
  - "RefreshCw icon (lucide) used instead of Phosphor ArrowSquareOut — matches existing AccountCard icon vocabulary (lucide everywhere)."
  - "useTransition for Reconnect button gives free disabled-while-pending state; aligns with existing delete pattern."
metrics:
  duration_minutes: 10
  completed_date: 2026-04-27
---

# Phase 18 Plan 04: UI Banner + Reconnect Summary

User-facing recovery surface for the three new degraded states (`banned`, `needs_reconnect`, `captcha_required`): shadcn Alert primitive, dashboard-wide banner, account-card Reconnect button, and the `attemptReconnect` server action that calls `runRedditPreflight` and clears `health_status` on a clean preflight.

## What Shipped

- `src/components/ui/alert.tsx` — shadcn `radix-nova` Alert primitive (added via `npx shadcn add alert`).
- `src/features/accounts/components/health-badge.tsx` — HEALTH_STYLES tints corrected: `needs_reconnect` blue (#3B82F6), `captcha_required` violet (#8B5CF6), labels "Needs reconnect" + "Captcha needed".
- `src/components/account-degraded-banner.tsx` — server component, returns `null` when no degraded accounts, otherwise renders shadcn Alert (`destructive` variant when any row banned) listing every degraded account with badge + reason + Reconnect/View link.
- `src/app/(app)/layout.tsx` — query switched from count-only to `select("id, handle, platform, health_status")`; IN-list extended with `needs_reconnect` + `captcha_required`; banner mounted above `{children}`.
- `src/features/accounts/server/attempt-reconnect.ts` — server action: auth check → owner-scoped account fetch → Reddit-only branch → `runRedditPreflight` → on `ok` set `health_status` to `warmup` (if `warmup_completed_at IS NULL`) or `healthy`; on `banned` returns `still_banned`; on `transient` returns `try_again`; LinkedIn returns `platform_unsupported`; `revalidatePath` on success.
- `src/features/accounts/components/account-card.tsx` — Reconnect button (lucide `RefreshCw`) visible iff `health_status IN (needs_reconnect, captcha_required)`. Uses `useTransition` for pending state. Toast variants follow D-11 (`still_banned` → error, `try_again` → warning, `success` → success).

## Tests

- `account-degraded-banner.test.tsx` — 4 cases (V-20, V-21, V-22, singular/plural heading). All green.
- `attempt-reconnect.test.ts` — 7 cases (no-auth, not-found, V-24 ok→healthy, ok→warmup, V-25 banned, transient, linkedin). All green.
- Targeted run: `pnpm vitest run src/components/account-degraded-banner.test.tsx src/features/accounts/server/attempt-reconnect.test.ts` → 11/11 pass.
- `pnpm typecheck` → clean.

## Validation Coverage

| V-ID | Status | Notes |
|------|--------|-------|
| V-20 | auto | banner renders one row per degraded account |
| V-21 | auto | banner returns null on empty array |
| V-22 | auto | destructive variant when any row is banned |
| V-23 | manual | hand-verify Reconnect button visibility on dev branch (set `health_status='needs_reconnect'` in dev DB) |
| V-24 | auto | ok preflight → status cleared to healthy/warmup |
| V-25 | auto | banned preflight → row unchanged, still_banned error |

V-23 requires a real degraded account row in dev Supabase; left as manual UAT step for the operator.

## Deviations from Plan

### Rule 3 — Cloud-browser URL field absent on SocialAccount

- **Found during:** Task 3 (AccountCard Reconnect button wiring).
- **Issue:** Plan §Task 3 §File C assumes `account.cloud_browser_url` on the `SocialAccount` prop, with a fallback note "could be `gologin_cloud_browser_url`, `browser_profile?.cloud_browser_url`, etc." Phase 17.5 swapped GoLogin for Browserbase (`browserbase_context_id` only); SocialAccount carries no cloud-browser URL field, and the broader v17.5 architecture no longer exposes one to client code (see memory `feedback_no_proxy_ux_complexity`).
- **Fix:** Reconnect button calls `attemptReconnect` directly via `useTransition`. The user already has the existing **Re-login** button for the cloud-browser path. The two buttons are complementary: Re-login spins up the connection flow; Reconnect re-runs the Reddit preflight server-side and clears the status when the account is provably clean.
- **Files modified:** `src/features/accounts/components/account-card.tsx`.
- **Commit:** `15d8073`.

### Rule 3 — Phosphor `ArrowSquareOut` swapped for lucide `RefreshCw`

- **Found during:** Task 3.
- **Issue:** Plan asks for Phosphor `ArrowSquareOut` (the "open in new tab" arrow). Since the button no longer opens a new tab (see deviation above), an arrow icon misleads. Existing AccountCard icons are all lucide — adding a Phosphor icon would be the only Phosphor usage in the file.
- **Fix:** Used lucide `RefreshCw` (the standard "retry/refresh" icon) — semantically correct for the action and consistent with the file's existing icon set.
- **Files modified:** `src/features/accounts/components/account-card.tsx`.
- **Commit:** `15d8073`.

### Rule 1 — HealthBadge tints had drifted to amber

- **Found during:** Task 1.
- **Issue:** Pre-existing entries for `needs_reconnect` and `captcha_required` (added earlier) used the same amber rgba as `warning`, contradicting UI-SPEC §Color (blue + violet) and the project rule in this prompt.
- **Fix:** Updated to canonical RGBA values from UI-SPEC: `needs_reconnect` → `#3B82F6` (blue), `captcha_required` → `#8B5CF6` (violet); label "Captcha required" → "Captcha needed" to match UI-SPEC.
- **Files modified:** `src/features/accounts/components/health-badge.tsx`.
- **Commit:** `301f9ba`.

## Auth Gates

None. All work was code-only inside the dev tree.

## Commits

| Hash | Message |
|------|---------|
| 301f9ba | feat(18-04): add shadcn Alert primitive and update HealthBadge tints |
| 09bd9be | feat(18-04): add AccountDegradedBanner and mount in app layout |
| 15d8073 | feat(18-04): add attemptReconnect server action and AccountCard Reconnect button |

## Self-Check: PASSED

- src/components/ui/alert.tsx — FOUND
- src/components/account-degraded-banner.tsx — FOUND
- src/components/account-degraded-banner.test.tsx — FOUND
- src/features/accounts/server/attempt-reconnect.ts — FOUND
- src/features/accounts/server/attempt-reconnect.test.ts — FOUND
- Commit 301f9ba — FOUND
- Commit 09bd9be — FOUND
- Commit 15d8073 — FOUND
