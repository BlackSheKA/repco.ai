---
phase: 17
slug: residential-proxy-gologin-profile-allocator
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-27
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already installed; `package.json` scripts present) |
| **Config file** | `vitest.config.*` (root — confirm presence; if absent, plan 01 Task 2 must add) |
| **Quick run command** | `pnpm test -- country-map` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–15 seconds (pure-fn unit suite) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- <changed-module>` (e.g., `pnpm test -- country-map`)
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green + UAT scenarios all PASS
- **Max feedback latency:** ~15 seconds for unit suite; UAT (Plan 02 Task 4) is human-driven and ~10–15 minutes

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | BPRX-04 | T-17-01-01 / T-17-01-03 | Probe script never committed; throwaway profile cleaned up; no token leakage | manual probe + grep | `test -f .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md && grep -E "OQ#1\|OQ#2" .planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md` | ❌ W0 (created in this task) | ⬜ pending |
| 17-01-02 | 01 | 1 | BPRX-05 | T-17-01-04 | mapForCountry case-sensitive + throws on unknown — no silent fallback to a wrong country tuple | unit | `pnpm test -- country-map` | ❌ W0 (created in this task) | ⬜ pending |
| 17-01-03 | 01 | 1 | BPRX-03 (wrappers) + BPRX-04 | T-17-01-02 / T-17-01-05 | mode:"geolocation" hardcoded; mode:"gologin" appears only in legacy fn (1 grep hit max in this plan) | static + typecheck | `pnpm typecheck && grep -E "mode:\\s*\"geolocation\"" src/lib/gologin/client.ts && [ "$(grep -cE 'mode:\\s*\"gologin\"' src/lib/gologin/client.ts)" = "1" ]` | ✅ (modifies existing client.ts) | ⬜ pending |
| 17-02-01 | 02 | 2 | BPRX-03 + BPRX-06 (orchestration) | T-17-02-02 / T-17-02-03 | Reuse lookup filters by user_id (not just country) and DB UNIQUE constraint catches race-past-app-check | static + typecheck | `pnpm typecheck && grep -c "export async function allocateBrowserProfile" src/features/browser-profiles/lib/allocator.ts` | ❌ W0 (created in this task) | ⬜ pending |
| 17-02-02 | 02 | 2 | BPRX-03 (wiring) | T-17-02-05 | D-11 verbatim error copy surfaces; full err logged server-side only | static + typecheck | `pnpm typecheck && grep -c "Setting up your account..." src/features/accounts/components/account-list.tsx && grep "Could not set up the account right now" src/features/accounts/actions/account-actions.ts` | ✅ (modifies existing files) | ⬜ pending |
| 17-02-03 | 02 | 2 | BPRX-03 (final cut) | T-17-02-01 / T-17-01-02 | Legacy createProfile + mode:"gologin" string both removed from src/ → user input cannot reach the shared-pool path | static grep + build | `pnpm typecheck && pnpm build && ! grep -rE "mode:\\s*\"gologin\"" src/ && ! grep -rE "\\bcreateProfile\\b" src/ \| grep -v createProfileV2` | ✅ (modifies existing client.ts) | ⬜ pending |
| 17-02-04 | 02 | 2 | BPRX-03 + BPRX-04 + BPRX-05 + BPRX-06 (E2E behavior) | T-17-02-04 / T-17-02-07 | UAT 5 scenarios cover: geolocation mode, fingerprint patch call, country-tuple mirroring, reuse semantics, rollback on failure | manual UAT (checkpoint) | n/a — human verifies via 5 scripted scenarios; updates this row to ✅/❌ | ✅ (UI live) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] vitest already installed (`package.json` scripts: `test`, `test:watch`)
- [ ] Confirm `vitest.config.*` exists at repo root before plan 01 Task 2; if absent, add minimal config (no jsdom needed — country-map is pure ESM TS).
- [ ] `src/features/browser-profiles/lib/__tests__/country-map.test.ts` — created in plan 01 Task 2 (5 tests covering BPRX-05 + helper throw)
- [ ] `.planning/phases/17-residential-proxy-gologin-profile-allocator/17-API-PROBE.md` — created in plan 01 Task 1 (settles RESEARCH Open Questions #1 + #2 before wrappers lock)

*If absent, plan 01 Task 2 prepends a "verify vitest config exists; if not, add" step.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GoLogin profile actually receives `mode: "geolocation"` at the GoLogin side (not just sent in request) | BPRX-03 | Requires inspecting GoLogin Cloud dashboard or `GET /browser/{id}` against the live dev workspace — no test environment for GoLogin REST. | UAT scenario 1 in plan 02 Task 4 — verify via `mcp__gologin-mcp__get_browser` or dashboard. |
| Fingerprint surfaces (canvas/webGL/audio) actually re-randomized by `patch_profile_fingerprints` | BPRX-04 | The patch is observable only via fingerprint inspection of the running profile; no programmatic assertion shape the dev workspace exposes. | UAT scenario 2 — visual check in GoLogin dashboard's fingerprint panel OR Axiom log line for the patch call. |
| Connect dialog spinner copy reads "Setting up your account..." for the full ~3–8s window with no proxy/profile/fingerprint terms | UI-SPEC §State A | Visual + timing check; spinner duration is non-deterministic and cannot be asserted in jsdom. | UAT — observe Reddit + LinkedIn flows on `pnpm dev --port 3001`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoint:human-verify (UAT)
- [x] Sampling continuity: every wave has at least one automated check (Wave 1: 3/3, Wave 2: 3/4 + 1 UAT)
- [x] Wave 0 covers all MISSING references (vitest already installed; only config presence to confirm)
- [x] No watch-mode flags
- [x] Feedback latency < 17s for unit + grep checks; UAT explicitly carved out as checkpoint
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
