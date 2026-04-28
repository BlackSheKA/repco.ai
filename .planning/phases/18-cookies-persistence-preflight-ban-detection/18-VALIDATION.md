---
phase: 18
slug: cookies-persistence-preflight-ban-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-27
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth: §11 of `18-RESEARCH.md`. Per memory rule
> `feedback_supabase_mocked_tests_mask_column_drift`, mocked Supabase
> tests around new columns are de-prioritized in favor of real-DB
> integration tests against dev branch `effppfiphrykllkpkdbv`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none yet (per CLAUDE.md "No test framework configured yet"); Wave 0 installs vitest |
| **Config file** | `vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `pnpm test --run --reporter=basic` |
| **Full suite command** | `INTEGRATION=1 pnpm test --run` (gates real-API/real-DB tests) |
| **Estimated runtime** | ~10s quick, ~60s full (incl. real-net Reddit calls + dev-DB) |

---

## Sampling Rate

- **After every task commit:** `pnpm typecheck && pnpm lint`
- **After every plan wave:** `pnpm test --run --reporter=basic`
- **Before `/gsd-verify-work`:** `INTEGRATION=1 pnpm test --run` must be green
- **Max feedback latency:** 60 seconds (full); 10 seconds (quick)

---

## Per-Task Verification Map

> Filled by planner. The planner produces tasks; each task gets a row here.
> Below is the **anchored validation contract** — the planner MUST map each task
> to one of these rows. Categories are exhaustive (every phase behavior maps).

| Behavior ID | Requirement | Test Type | Command / Method | Status |
|-------------|-------------|-----------|-----------------|--------|
| V-01 | BPRX-07: migration applies (cookies_jar, last_preflight_*, ENUM extensions) | real-DB smoke | Supabase Management API: `apply migration` then `SELECT enum_range(NULL::health_status_type)` and `\d browser_profiles` | ⬜ |
| V-02 | BPRX-07: `getCookies(profileId)` returns valid Chromium-cookie array | real-API integration (gated `INTEGRATION=1`) | spin up dev profile, navigate reddit.com, assert array of cookies with name/value/domain | ⬜ |
| V-03 | BPRX-07: `setCookies(profileId, jar)` round-trip equals input | real-API integration | save jar → fetch jar → assert equality after stable sort | ⬜ |
| V-04 | BPRX-07: `saveCookiesAndRelease` runs idle 30-60s on success, skips on failure | hand-verification | dev worker logs show 30-60s gap on success path; no gap on failure path | ⬜ |
| V-05 | BPRX-08: preflight against `u/spez` (healthy stable account) returns `{ kind: 'ok' }` | real-net integration | gate `INTEGRATION=1` | ⬜ |
| V-06 | BPRX-08: preflight against `u/this-user-does-not-exist-${ts}` returns `{ kind: 'banned', reason: '404' }` | real-net integration | gate `INTEGRATION=1` | ⬜ |
| V-07 | BPRX-08: preflight against known-suspended username returns `{ kind: 'banned', reason: 'suspended' }` | real-net integration | use stable suspended namespace; gate `INTEGRATION=1` | ⬜ |
| V-08 | BPRX-08: 5xx/timeout retry once with 2s backoff, then `{ kind: 'transient' }` | mocked-fetch unit | mock `global.fetch` to return 503 twice; assert retry + final `transient` | ⬜ |
| V-09 | BPRX-08: cache hit (within 1h, status='ok') skips fetch | real-DB integration | insert row, run preflight, assert no `fetch` happened (spy) | ⬜ |
| V-10 | BPRX-08: status flip to `'banned'` writes DB row, returns `account_quarantined`, NO `connectToProfile` call | real-DB integration | run worker against quarantined-result account; assert no GoLogin client invocation | ⬜ |
| V-11 | BPRX-09: detector on `banned-rules.png` fixture returns `{banned:true, suspended:false, captcha:false}` | fixture-based ML | $ pnpm test detect-ban-state --run; ~$0.0017/run | ⬜ |
| V-12 | BPRX-09: detector on `account-suspended.png` fixture returns `{banned:false, suspended:true, captcha:false}` | fixture-based ML | same | ⬜ |
| V-13 | BPRX-09: detector on `cloudflare-captcha.png` fixture returns `{banned:false, suspended:false, captcha:true}` | fixture-based ML | same | ⬜ |
| V-14 | BPRX-09: detector on `clean-feed.png` fixture returns all-false | fixture-based ML | same | ⬜ |
| V-15 | BPRX-09: detector defensive — Anthropic API throws → returns all-false, logs to Sentry, does NOT flip status | mocked SDK | mock `Anthropic.messages.create` to throw; assert all-false return + no DB write | ⬜ |
| V-16 | BPRX-09: detector flips status to `'banned'` / `'captcha_required'` correctly per D-16 mapping | real-DB integration | run worker with stubbed detector outputs; assert health_status writes | ⬜ |
| V-17 | Phase 14 quarantine guard extended to `'needs_reconnect'` and `'captcha_required'` | real-DB integration | set status, claim action, assert short-circuit + `runError='account_quarantined'` | ⬜ |
| V-18 | Email debounce: second `sendAccountWarning` for same account within 24h is skipped | real-DB integration | insert two `account_warning_email` job_logs 1h apart, call helper, assert second skip | ⬜ |
| V-19 | Email subject/body for each of three statuses (banned, needs_reconnect, captcha_required) match UI-SPEC §Email Copy | snapshot test | React Email snapshot per status | ⬜ |
| V-20 | `<AccountDegradedBanner>` renders one row per degraded account when array non-empty | RTL component test | mock layout.tsx fetch return; assert N rows | ⬜ |
| V-21 | `<AccountDegradedBanner>` returns null when array empty | RTL component test | empty array; `container.firstChild === null` | ⬜ |
| V-22 | Banner variant flips to `destructive` when ANY row has `health_status='banned'` | RTL component test | one banned row in array; assert `data-variant="destructive"` or class | ⬜ |
| V-23 | Account-card "Reconnect" button visible iff `health_status IN ('needs_reconnect','captcha_required')` | RTL component test | render with each of 7 statuses; assert presence/absence | ⬜ |
| V-24 | `attemptReconnect` server action: ok preflight clears status to `'healthy'` | real-DB integration | set `'needs_reconnect'`, mock fetch as ok, call action, assert DB row | ⬜ |
| V-25 | `attemptReconnect` server action: banned preflight leaves status as-is | real-DB integration | set `'needs_reconnect'`, mock fetch as banned, call action, assert no change | ⬜ |
| V-26 | Cookies restore happens BEFORE `connectToProfile` and skips when cookies_jar is NULL | real-DB integration | one fresh profile (cookies_jar NULL) → assert no setCookies call; one returning profile → assert setCookies call before CDP connect | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — install vitest + @testing-library/react + @testing-library/jest-dom
- [ ] `package.json` — add `"test": "vitest"` script
- [ ] `__tests__/fixtures/` directory with 4 PNGs (banned-rules.png, account-suspended.png, cloudflare-captcha.png, clean-feed.png) — captured manually from real Reddit/LinkedIn pages and committed
- [ ] `__tests__/setup-integration.ts` — env guard reading `INTEGRATION=1`, dev-Supabase client init
- [ ] `__tests__/helpers/spy-fetch.ts` — `vi.spyOn(global, 'fetch')` helper for cache-hit tests

*Note:* Per CLAUDE.md "No test framework configured yet", this phase is the first to require a test framework. Plan-checker may flag this as scope-creep beyond BPRX-07/08/09; planner should explicitly justify or move framework install to a separate Wave 0 plan.

**Alternative if framework install is rejected:** All `unit` / `mocked` / `RTL` rows above downgrade to **hand-verification via `pnpm dev`** at the cost of ~3 manual runs × 5 minutes each. Planner decides during planning; checker approves.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|-----------|-------------------|
| End-to-end fresh-account survival smoke | success criterion #1 | Multi-day timing; involves real Reddit account, real GoLogin profile | Per ANTI-BAN-ARCHITECTURE §Verification lines 295+: connect a fresh Reddit account, run worker for 5 actions over 2 days, assert account survives without `health_status` flipping to `banned` due to false-positive |
| Save-cookies-then-30-60s-idle timing observed in production logs | BPRX-07 | Timing is non-deterministic; assertions on `setTimeout(60s)` elapsed time would be flaky | Run `pnpm dev`, trigger one action, observe Axiom log gap between `cookies.saved` and `gologin.releaseProfile` is in [30s, 60s] |
| External Reddit ban → next action quarantines without browser spin-up | success criterion #4 | Requires manually banning a Reddit account from Reddit's side | Manually delete a test Reddit account → wait 1h cache TTL → trigger action → assert `health_status='banned'` written and no GoLogin REST POST /browser/{id}/web fired (check Axiom for absence of `gologin.startCloudBrowser` log line) |

---

## Validation Sign-Off

- [ ] All 26 behavior IDs mapped to plan tasks by planner
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers framework install OR all rows downgraded to hand-verify (plan decides)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for full suite
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
