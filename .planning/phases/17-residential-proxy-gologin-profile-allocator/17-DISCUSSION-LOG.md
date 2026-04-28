# Phase 17: Residential Proxy + GoLogin Profile Allocator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 17-residential-proxy-gologin-profile-allocator
**Areas discussed:** Country derivation & UX, Allocator strategy + pool exhaustion, Concurrency & failure rollback, Fingerprint + UA + UI surface

---

## Country derivation & UX

### Q1: Where does country_code come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded 'US' default, no UI | Zero UI change, fastest to ship, matches no-UX-complexity memory rule | ✓ |
| Derived from product_profile target market | Read product_profiles.target_country, fall back to US | |
| Quiet country dropdown on connect dialog | 7-option select on existing dialog | |

**User's choice:** Hardcoded `'US'` default.
**Notes:** Country picker / derivation deferred until real non-US users appear.

### Q2: Reuse rule

| Option | Description | Selected |
|--------|-------------|----------|
| Same user + same country + no platform conflict | Strict per BPRX-06; first match wins | ✓ |
| Bias toward least-recently-used profile | Requires last_used_at column (Phase 15 deferred) | |
| Pack tightly (fewest profiles wins) | Saves slots; less clean separation | |

**User's choice:** Same user + same country + no platform conflict.

### Q3: UI surface during allocation

| Option | Description | Selected |
|--------|-------------|----------|
| Existing flow + inline 'Setting up...' spinner | Reuse current dialog; pending state covers ~3-8s | ✓ |
| Zero UI change — silent delay | 8s wait may feel broken | |
| Inline status text ('Allocating browser session...') | Same as spinner with rotating status line | |

**User's choice:** Existing flow + inline `Setting up...` spinner.

---

## Allocator strategy + pool exhaustion

### Q1: How to pick a residential proxy?

| Option | Description | Selected |
|--------|-------------|----------|
| Variant A — explicit pool selection (GET /proxy/v2 + filter free same-country) | Reuses 8 floppydata first; full control | |
| Variant B — GoLogin auto-pick via mode:'geolocation' + autoProxyRegion | Simpler; opaque pool selection | ✓ |
| Variant A + fall-through to B | Guarantees reuse without blocking | |

**User's choice:** Variant B.
**Notes:** Variant B contradicts BPRX-03 success criterion #1 ("reuse 8 first"); follow-up Q2 reconciled this.

### Q2: How to reconcile Variant B with BPRX-03 #1 ("reuse 8 floppydata first")?

| Option | Description | Selected |
|--------|-------------|----------|
| Accept — drop the 'reuse 8 first' guarantee | Trust GoLogin auto-pick; amend success criterion | ✓ |
| Keep guarantee — list pool first, fall back to autoProxyRegion | Hybrid; ~20 lines extra | |
| Manually pre-assign the 8, allocator always uses autoProxyRegion | Wasteful but simplest runtime | |

**User's choice:** Accept — drop the reuse guarantee. Success criterion #1 amended in CONTEXT D-05.

### Q3: GoLogin allocation failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with user-facing error message | "Could not set up account right now — try again." Log full error to Sentry/Axiom | ✓ |
| Fail silently + admin alert via Sentry | Generic 500 to user; less actionable | |
| Auto-fallback to a different country | Country mismatch breaks anti-ban; strongly discouraged | |

**User's choice:** User-facing error + Sentry/Axiom log.

---

## Concurrency & failure rollback

### Q1: Race protection between concurrent connectAccount calls

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres advisory lock per (user_id, country) | pg_advisory_xact_lock; second call blocks until first commits | |
| UI-side double-submit guard only | Disable button on click; fragile against retry-bombs / multi-tab | |
| Best-effort: accept rare duplicate profile | No lock; document as known edge case | ✓ |

**User's choice:** No lock — accept duplicates.
**Notes (user verbatim):** "stworzy dwa konta i ok - dwa zaliczą mu się do limitu w systemie. każde założenia konta koszuje creditsy. w sumie im więcej ma kont tym więcej powinniśmy zarabiać." Each account creation is a billable credit event; duplicates = more revenue.

### Q2: Allocator failure rollback strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Try/catch with deleteProfile() compensation | Best-effort cleanup in finally/catch; matches existing account-actions pattern | ✓ |
| Accept orphans + nightly reaper cron | New infra; more robust | |
| Two-phase: insert browser_profile with status='pending' first | Requires status column (not in BPRX-01) | |

**User's choice:** Try/catch with deleteProfile() compensation.

---

## Fingerprint + UA + UI surface

### Q1: User-Agent source

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded country→UA mapping table | Predictable; no extra API call; UA refresh deferred to kosmetyka | ✓ |
| Call patch_profile_update_ua_to_new_browser_v after creation | Always fresh; opaque; +1 API call | |
| Hardcoded mapping now + UA-rotation cron in later phase | Same as option 1 with explicit deferred-idea note | |

**User's choice:** Hardcoded country→UA mapping table.

### Q2: patch_profile_fingerprints call shape

| Option | Description | Selected |
|--------|-------------|----------|
| Default GoLogin randomization (no field overrides) | One call, GoLogin defaults; minimal surface area | ✓ |
| Explicit randomization of canvas + webGL + audio only | Deterministic test target; risks drifting from GoLogin defaults | |
| Skip the patch — rely on createProfile defaults | Violates BPRX-04 success criterion #2 | |

**User's choice:** Default GoLogin randomization (no params).

### Q3: Geo map coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly 7 countries (US/GB/DE/PL/FR/CA/AU) all 4 fields | Full map per BPRX-05 minimum | ✓ |
| 7 countries + Postgres CHECK constraint on country_code | Adds migration churn for new countries | |
| Just US for Phase 17, expand later | Minimal scope but breaks BPRX-05 minimum | |

**User's choice:** Exactly 7 countries with full mapping.

---

## Claude's Discretion

- Whether a new migration is needed (no new columns required by current decisions; only candidate is `fingerprint_patched_at`)
- Exact `pending` state styling in the connect dialog (text-only / shadcn `<Button isPending>` / `<Skeleton>`)
- Helper return shape for reuse lookup (null vs throw)
- Source-of-truth field for `gologin_proxy_id` storage with `mode: "geolocation"` (verified during research)

## Deferred Ideas

- Country picker UI / multi-country support
- Periodic UA rotation (kosmetyka backlog)
- `fingerprint_patched_at`, `last_used_at` columns
- Postgres CHECK on country_code
- Race-protection lock (explicitly rejected)
- Utilizing the 8 prepaid floppydata proxies
- Mocked unit tests for allocator
- Orphan-reaper cron for GoLogin profiles
