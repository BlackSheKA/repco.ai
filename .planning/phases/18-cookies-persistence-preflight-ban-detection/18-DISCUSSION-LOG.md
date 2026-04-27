# Phase 18: Cookies Persistence + Preflight + Ban Detection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-27
**Phase:** 18-cookies-persistence-preflight-ban-detection
**Areas discussed:** Cookies lifecycle + migration, Preflight scope/transport/cache, Preflight failure taxonomy, Haiku CU detector + quarantine alert

---

## Cookies lifecycle + migration

### Q1: When should the worker save the cookie jar?

| Option | Description | Selected |
|--------|-------------|----------|
| End of session only | Save once in worker.ts finally block before releaseProfile() | ✓ |
| After every CU step | Save mid-session after each successful tool action | |
| Periodic (every N seconds) | Background tick during the session | |

**User's choice:** End of session only.

### Q2: 30–60s idle delay policy

| Option | Description | Selected |
|--------|-------------|----------|
| Random 30–60s per session | Uniform random sleep between save and release | ✓ |
| Fixed 45s | Pattern-detectable but simple | |
| Random 10–30s | Lower latency but Reddit may still flag fast-exit | |
| Skip in cron, only user-initiated | Branched logic | |

**User's choice:** Random 30–60s per session.

### Q3: Restore failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Log + proceed with empty jar | Treat as fresh-login, NULL the jar, action continues | |
| Abort the action | Mark failed with reason 'cookie_restore_failed' | |
| Retry restore once, then proceed | Single retry with 1s backoff before fallback | |

**User's choice:** Free-text — "logowanie jest akcją, którą musi wykonać user. CU samo tego nie zrobi. my nie zapisujemy w systemie danych logowania. jeśli user zostanie wylogowany musimy go prosić o ponowne zalogowanie ręcznie".
**Notes:** Hard rule — no credentials stored, CU cannot auto-login. Triggered follow-up questions on reconnect UX and status code.

### Q4: Migration shape

| Option | Description | Selected |
|--------|-------------|----------|
| cookies_jar JSONB nullable, default NULL | Minimal per Phase 15 D-01 | ✓ |
| + cookies_updated_at | Adds explicit staleness signal | |
| + cookies_updated_at + last_preflight_at | Pre-emptively supports Area 2 caching | |

**User's choice:** Minimal — cookies_jar JSONB nullable, default NULL.

### Q5 (follow-up): Reconnect UX

| Option | Description | Selected |
|--------|-------------|----------|
| Reconnect button on account-card | Opens existing GoLogin Cloud Browser URL | ✓ |
| Email-only with link | Resend email with cloud-browser URL | |
| Both — badge + email | Belt-and-suspenders | |

**User's choice:** Reconnect button on account-card opens existing GoLogin Cloud Browser URL.

### Q6 (follow-up): Worker status on logged-out abort

| Option | Description | Selected |
|--------|-------------|----------|
| health_status='warning' + 24h cooldown | Reuses existing ENUM | |
| health_status='banned' | Too aggressive | |
| New status: 'needs_reconnect' | New ENUM value, dedicated UI badge | ✓ |

**User's choice:** New status: 'needs_reconnect'.

---

## Preflight scope, transport & caching

### Q1: Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Reddit only | BPRX-08 wording is Reddit-specific | ✓ |
| Reddit + LinkedIn (DOM-based) | Hybrid, doubles scope | |

**User's choice:** Reddit only.

### Q2: Transport

| Option | Description | Selected |
|--------|-------------|----------|
| Direct fetch through proxy, no browser | Node fetch with proxy URL, ~500ms | ✓ |
| Through running GoLogin browser | Defeats the abort-before-spin-up purpose | |
| Direct fetch WITHOUT proxy | Uses Vercel IP, may shadowban-detect differently | |

**User's choice:** Direct fetch through proxy, no browser.

### Q3: Cache TTL

| Option | Description | Selected |
|--------|-------------|----------|
| Cache 1 hour | First action pays, subsequent skip | ✓ |
| No cache — every action | Maximum freshness, ~500ms each | |
| Cache 24 hours | One per day per account | |

**User's choice:** Cache 1 hour.

### Q4: Shadowban check resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Drop shadowban from this phase | is_suspended + karma + 404 satisfy success criterion | ✓ |
| Stub via karma trend | Requires storing prior snapshots | |
| Inside the action via CU detector | Detector picks up shadowban-style signals | |

**User's choice:** Drop shadowban check from this phase.

### Q5 (follow-up): Cache storage

| Option | Description | Selected |
|--------|-------------|----------|
| last_preflight_at + last_preflight_status on social_accounts | Two new columns, persistent across cold starts | ✓ |
| Skip cache entirely | Reverts the 1h decision | |
| Reuse job_logs table | No schema change but slower lookup | |

**User's choice:** Two new columns on social_accounts.

---

## Preflight failure taxonomy & false-positives

### Q1: Distinguish banned vs transient

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP-status-based taxonomy | 200+is_suspended → banned; 5xx → transient | ✓ |
| Conservative — anything non-200 = abort but don't flip | Lower false-positive risk | |
| Aggressive — any non-200 → banned | Maximum safety, high false-positive risk | |

**User's choice:** HTTP-status-based taxonomy.

### Q2: Retry policy

| Option | Description | Selected |
|--------|-------------|----------|
| No retry on definitive, retry on transient | Single retry with 2s backoff on 5xx/timeout | ✓ |
| Always retry once before flipping | Adds latency for marginal benefit | |
| No retry at all | First response authoritative | |

**User's choice:** No retry on definitive signals, single retry on transient.

### Q3: Status mapping

| Option | Description | Selected |
|--------|-------------|----------|
| All three → 'banned' | Single semantic state, single alert | ✓ |
| Tri-state: banned + warmup + warning | More semantically correct, more code | |
| is_suspended → banned; karma<5 → warning; 404 → banned | Asymmetric by recoverability | |

**User's choice:** All three → 'banned'.

### Q4: Pipeline placement

| Option | Description | Selected |
|--------|-------------|----------|
| New gate in worker.ts before connectToProfile | After Phase 14 guard at line 78 | ✓ |
| Inside cron's claim loop | More wire points | |
| Separate hourly cron job | Decoupled but adds another cron | |

**User's choice:** New gate in worker.ts before connectToProfile.

---

## Haiku CU detector + quarantine alert

### Q1: When does detect_ban_state run?

| Option | Description | Selected |
|--------|-------------|----------|
| Every action, on the final screenshot only | Post-loop call, predictable cost | ✓ |
| As a tool inside the executor loop | Lets Haiku invoke mid-action | |
| Only on action failure | Halves cost, misses post-success bans | |

**User's choice:** Every action, on the final screenshot only.

### Q2: Detector return shape & status mapping

| Option | Description | Selected |
|--------|-------------|----------|
| { banned, captcha, suspended, rate_limited }; any true → 'banned' | Matches ANTI-BAN doc verbatim | |
| Same JSON; rate_limited → 'cooldown', others → 'banned' | Asymmetric by recoverability | |
| Same JSON + confidence field; flip only if ≥0.8 | Hedge against false-positives | |

**User's choice:** Free-text — "ale jak zobaczy captcha to nie może straszyć usera, że dostał bana. tak samo rate limit - pozatym nie wiem czy reddit lub linkedin zgłaszają w ogłe rate limit!!".
**Notes:** Captcha must NOT show "banned" framing. Rate-limit existence as a modal is uncertain. Triggered follow-up on differentiated mapping; rate_limited dropped from schema.

### Q3: Pause monitoring_signals on flip?

| Option | Description | Selected |
|--------|-------------|----------|
| Worker.ts already blocks — no signal change | Existing Phase 14 guard sufficient | ✓ |
| Also pause user's monitoring_signals | Too aggressive, user has multiple channels | |
| Pause only signals routed through this account | Future-proof, no-op today | |

**User's choice:** Worker.ts already blocks — no signal change needed.

### Q4: Alert dispatch

| Option | Description | Selected |
|--------|-------------|----------|
| Email via send-account-warning.ts | Reuse Phase 14 helper, debounced via job_logs | |
| Email + in-app toast | Toast surface doesn't exist yet | |
| Sentry only — no user-facing | Bad UX | |

**User's choice:** Free-text — "email i jakiś baner w dashboardzie aplikacji oraz button przy koncie".
**Notes:** Three channels — email + dashboard banner + per-account Reconnect button. Triggered follow-ups on banner shape and debounce policy.

### Q5 (follow-up): Captcha → which health_status?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 'needs_reconnect' | Same user action (open browser) | |
| New ENUM 'captcha_required' | Distinct semantics | ✓ |
| 'warning' + 24h cooldown | Hides the real need | |

**User's choice:** New ENUM 'captcha_required'.

### Q6 (follow-up): Rate-limit flag

| Option | Description | Selected |
|--------|-------------|----------|
| Drop from detector schema entirely | Uncertain whether platforms surface it | ✓ |
| Keep, abort + 1h cooldown, no flip | Defensive in case it surfaces | |
| Keep, treat same as captcha | One code path | |

**User's choice:** Drop from detector schema entirely.

### Q7 (follow-up): Banner shape

| Option | Description | Selected |
|--------|-------------|----------|
| Top-of-dashboard banner aggregating degraded accounts | Single dismissible banner above main content | ✓ |
| Per-account banner inline on /accounts only | Less intrusive, easier to miss | |
| Toast on next page load | Requires "shown" state tracking | |

**User's choice:** Top-of-dashboard banner.

### Q8 (follow-up): Email/banner debounce

| Option | Description | Selected |
|--------|-------------|----------|
| Email once per status flip, banner stays until cleared | Debounce email via job_logs 24h check | ✓ |
| Email every time, no debounce | Inbox spam | |
| Email only for 'banned'; banner for everything | Asymmetric channels by severity | |

**User's choice:** Email once per status flip, banner stays until cleared.

---

## Claude's Discretion

- Exact wording of Haiku detector JSON-only prompt — plan-phase iterates against fixture screenshots.
- Banner copy + shadcn component choice — match existing dashboard vocabulary.
- Whether the Reconnect button also POSTs a "Run preflight now" server action.
- Source-of-truth for proxy connection string in `runRedditPreflight` (depends on Phase 17 D-06 resolution).
- Whether `saveCookiesAndRelease` runs the idle delay on FAILED actions too.

## Deferred Ideas

- LinkedIn preflight (DOM/authwall) — separate phase
- Shadowban detection — needs authenticated session; defer
- Rate-limit detector flag — restore if observed in production
- Confidence-thresholded detection
- Toast notifications surface
- Auto-pausing monitoring_signals on banned account
- cookies_updated_at audit column
- "Run preflight now" manual button action
- Realtime subscription for the dashboard banner
- detect_ban_state as a CU loop tool (rejected)
