# Phase 11: Nyquist Validation Compliance - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Close the Nyquist test-coverage gap across all shipped phases and finish Phase 6's missing VERIFICATION.md. Not a feature phase — pure process/coverage work against existing code.

**In scope:**

- Run `/gsd:validate-phase N` (backed by `gsd-nyquist-auditor` agent) against each of Phases 1–7 to transition every `VALIDATION.md` from `status: draft, nyquist_compliant: false` to `status: final, nyquist_compliant: true`.
- Write missing automated tests (unit + integration) for requirements currently without coverage — cap per-phase scope per decisions below.
- Document manual-only verification steps for requirements that genuinely cannot be automated (real GoLogin browser, Stripe Checkout hosted page, Sentry/Axiom dashboard presence, Google OAuth UI flow, Resend email receipt).
- Create `06-VERIFICATION.md` as a retroactive goal-backward synthesis of Phase 6's already-complete UAT (7/7 pass) + roadmap success criteria + milestone audit findings.

**Out of scope:**

- Adding NEW requirements or NEW features.
- Fixing bugs exposed by the test-writing (those become their own phase/patch if non-trivial). Phase 11 files them in `<deferred>`; the only bug fixes allowed in-phase are trivial one-liners needed to make existing code pass an obvious, agreed-upon requirement.
- Re-running Phase 6 UAT live; the existing 06-UAT.md (7/7 pass, 0 issues) is the source of truth.
- Validating Phases 8, 9, 10 — those phases write their own VALIDATION.md as part of their normal flow. Phase 11 only touches 1–7.
- Increasing line-coverage percentages; we target behavioral coverage per-requirement, not coverage-tool thresholds.
- Refactoring existing tests for style; leave green tests alone.

</domain>

<decisions>
## Implementation Decisions

### Scope + ordering

- **Phases covered:** 1, 2, 3, 4, 5, 6, 7 (seven total, not the six mentioned in ROADMAP). Rationale: Phase 7 VALIDATION.md is also `status: draft, nyquist_compliant: false` — same audit gap. Including it costs one extra pass and removes a surprise follow-up.
- **Ordering:** `1 → 2 → 3 → 7 → 4 → 5 → 6`. Rationale:
  - Phases 1–3 have no cross-phase dependencies worth ordering around.
  - **Phase 7 is validated BEFORE Phase 4** because Phase 7 is the fix for the RPLY-02 handle-normalization bug that cascaded through RPLY-03, RPLY-04, and FLLW-04. Phase 4 VALIDATION.md needs to reference Phase 7's regression test to satisfy those requirements post-fix; validating Phase 7 first means Phase 4 can `@see` the existing test file rather than duplicate assertions.
  - Phase 6 is last because its VERIFICATION.md (a separate deliverable) synthesizes from all prior audit context.
- **Per-phase commits:** one git commit per phase validation pass (`docs(11-N): finalize phase N validation`). Plus one commit for `06-VERIFICATION.md`. Plus per-phase test-code commits as needed (`test(phase-N): close Nyquist gaps for REQ-ID, REQ-ID`). Small blast radius per commit, clean revert boundary.
- **No bundled "validate-all" commit.** Each phase stands on its own.

### Compliance criteria (what `nyquist_compliant: true` means here)

- **Per-requirement rule:** every requirement that the phase claims to deliver must have EITHER:
  1. at least one automated test (unit, integration, or component) in `src/**/*.test.ts(x)` that would fail if the requirement were broken, OR
  2. an explicit row in the VALIDATION.md "Manual-Only Verifications" table with concrete step-by-step test instructions plus a written justification for why automation isn't cost-effective.
- **No requirement uncovered.** If neither exists, we create one during this phase.
- **Behavioral coverage, not line coverage.** We do not target a % coverage metric. A single focused test per requirement beats sprawling mocked integration tests.
- **Existing tests are not rewritten.** If a green test already covers the requirement, we link to it and move on — no style refactors in this phase.
- **Flakiness policy:** a test that is flaky is not "covered" — we either fix flakiness in this phase (if trivial) or reclassify to manual and document the flakiness reason.

### Test-writing scope per phase

- **Write missing tests NOW during Phase 11**, do not merely catalog. Cataloging-and-deferring would undo the point of "validation compliance."
- **Cap per requirement:** 1–3 focused tests per gap. If a requirement needs a heavy harness (real browser, real Stripe webhook, real Supabase Realtime), default to manual-verified with concrete instructions rather than building a brittle mocked integration.
- **Agent to use:** `gsd-nyquist-auditor` (tools: Read, Write, Edit, Bash, Glob, Grep). The auditor generates tests, validates `VALIDATION.md` tables, and updates the `nyquist_compliant` flag. Plan-phase step wires each sub-phase validation to this agent.
- **Known manual-only requirements** (confirmed up front — document them, don't try to automate):
  - OBSV-03 (Sentry dashboard presence), OBSV-03 (Axiom dataset presence) — external SaaS verification.
  - BILL-02 (Stripe Checkout hosted page redirect), BILL-03 (credit pack purchase via hosted Checkout) — hosted page can't be automated without test cards + real browser harness; document with Stripe test card numbers.
  - ONBR-04, ONBR-05 (GoLogin session connection) — real GoLogin browser; document manual flow.
  - ACTN-05 (worker pipeline end-to-end via DB webhook → Vercel Function → GoLogin → Playwright → Haiku CU) — partial automation with mocked CU is acceptable; full E2E is manual-prod.
  - NTFY-01, NTFY-02, NTFY-03 delivery confirmation — send logic is testable (and already tested); actual Resend receipt is manual-prod.
  - Google OAuth login path (auth handler).
- **Output of each validation pass:**
  1. Updated `N-VALIDATION.md` with `status: final`, `nyquist_compliant: true`, full per-task verification map, complete Manual-Only Verifications table.
  2. Any new test files under `src/**/__tests__/` or colocated `*.test.ts(x)`.
  3. A one-paragraph summary at the top of the VALIDATION.md documenting what was added in this pass.

### Cross-phase dependencies observed during validation

- **Phase 4 FLLW-04/RPLY-02/03/04:** audit showed these were broken in Phase 4 due to handle-normalization mismatch. Phase 7 fix landed. Phase 4 validation therefore references Phase 7's `reply-matching.test.ts` (already exists) as the coverage source for these IDs; Phase 4 VALIDATION.md must explicitly note "covered post-fix in Phase 7 regression test at src/features/sequences/lib/__tests__/reply-matching.test.ts".
- **Phase 3 ACTN-10 (12h vs. 4h expiry):** internally consistent but contradicts requirement doc. Nyquist-compliance does NOT require resolving the spec-vs-code contradiction here (that's Phase 12's scope). Phase 3 VALIDATION.md covers the current 12h behavior and adds a note flagging the spec drift; the drift is tracked in deferred and in Phase 12 plan.
- **Phase 5 BILL-01 trial auto-activation:** `startFreeTrial` exists but isn't wired to signup. Phase 5 VALIDATION.md covers the function's unit behavior but notes that end-to-end trial activation is Phase 12 scope, not Phase 5's nyquist gap.
- **Phase 5 GROW-01 live_stats write path:** Phase 8 delivers the fix. Phase 5 VALIDATION.md documents the original Phase 5 scope (which did not include the writer) as out-of-gap; the writer is validated by Phase 8's own VALIDATION.md.

### Phase 6 VERIFICATION.md shape

- **Retroactive doc-synthesis, not re-verification.** Phase 6 already shipped with 06-UAT.md at 7/7 pass + 0 issues; that is the empirical verification. Phase 11 writes the missing formal doc around it.
- **Structure:** goal-backward — "did the code deliver MNTR-02 (LinkedIn monitoring every 2–4h via Apify)?" Answer draws evidence from:
  - 06-UAT.md — the 7 test results with notes.
  - `.planning/v1.0-MILESTONE-AUDIT.md` — tech debt items for Phase 6 (ActionType union, credit cost SQL, connection_request executor deferral — last item now closed by Phase 10).
  - Roadmap §"Phase 6: LinkedIn" success criteria — direct map to UAT test IDs.
- **Include** a "Deferred at time of phase" section that lists items like `connection_request` executor (Phase 10), handle-normalization bug (Phase 7, pre-existing from Phase 4), LinkedIn Nyquist compliance (Phase 11 itself) — and mark which are now closed.
- **Do NOT re-run any test steps.** If the original UAT said something passed, it passed.

### Claude's Discretion

- Exact test framework patterns to use (vitest + @testing-library already installed, per `package.json`) — consistent with existing colocated `*.test.ts(x)` files.
- Whether a given requirement's gap is better closed with a unit test or a small integration test — auditor agent decides per case.
- The specific test file naming (colocated vs. `__tests__/`) — follow each phase's existing convention locally.
- Whether to split a phase's validation into multiple commits (test code + VALIDATION.md update) or bundle — per-phase choice; atomic-enough is sufficient.
- The exact wording of manual-verification step-by-step instructions — clear > comprehensive.
- Whether to write the `06-VERIFICATION.md` before, during, or after the Phase 6 validation pass — planner chooses; they're independent deliverables.
- How long the phase runs — likely several sessions given seven validation passes; use STATE.md to checkpoint between passes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/ROADMAP.md` §"Phase 11: Nyquist Validation Compliance" — goal, dependencies, 3 success criteria (note: roadmap says "phases 01-06"; this CONTEXT expands to 01-07)
- `.planning/REQUIREMENTS.md` — master requirement list to cross-reference during each phase's validation pass
- `.planning/v1.0-MILESTONE-AUDIT.md` §nyquist — `compliant_phases: []`, `partial_phases: ["01", "02", "03", "04", "05", "06"]` (add 07), `overall: "PARTIAL"`

### Workflow / process
- `C:/Users/kamil/.claude/get-shit-done/workflows/validate-phase.md` — invocation surface for the validation pass
- `gsd-nyquist-auditor` agent spec — the agent that actually writes/verifies tests
- `C:/Users/kamil/.claude/get-shit-done/templates/validation.md` (if present) — template for the VALIDATION.md final structure

### Per-phase inputs
- `.planning/phases/01-foundation/01-VALIDATION.md` + `01-VERIFICATION.md` + `01-UAT.md`
- `.planning/phases/02-reddit-monitoring-intent-feed/02-VALIDATION.md` + `02-VERIFICATION.md` + `02-UAT.md`
- `.planning/phases/03-action-engine/03-VALIDATION.md` + `03-VERIFICATION.md` + `03-UAT.md`
- `.planning/phases/04-sequences-reply-detection/04-VALIDATION.md` + `04-VERIFICATION.md` + `04-UAT.md`
- `.planning/phases/05-billing-onboarding-growth/05-VALIDATION.md` + `05-VERIFICATION.md` + `05-UAT.md`
- `.planning/phases/06-linkedin/06-VALIDATION.md` + `06-UAT.md` (VERIFICATION.md created by this phase)
- `.planning/phases/07-reply-detection-fix/07-VALIDATION.md` + `07-VERIFICATION.md` + `07-UAT.md`

### Test infra
- `package.json` — `test: vitest run`; `vitest ^4.1.4`; `@testing-library/react ^16.3.2`; `@testing-library/jest-dom ^6.9.1`; `@vitest/ui ^4.1.4`
- `vitest.config.ts` — current vitest config
- `src/features/sequences/lib/__tests__/reply-matching.test.ts` — reference implementation from Phase 7 for the normalize-at-compare-boundary pattern
- Existing `__tests__/` directories across the codebase — local conventions per feature module

### Cross-phase dependencies
- Phase 7 is the fix for Phase 4's RPLY-02 cascade — Phase 4 VALIDATION.md must cite Phase 7 tests for FLLW-04/RPLY-02/03/04 coverage.
- Phase 8, 9, 10 each create their own VALIDATION.md during their normal flow — NOT Phase 11's scope. Don't touch them here.
- Phase 12 will address ACTN-10 expiry drift + BILL-01 trial auto-activation; Phase 11 notes these as out-of-gap.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Vitest is installed and configured** — contradicts the CLAUDE.md note that says "No test framework configured yet" (stale). `vitest.config.ts` exists; `pnpm test` runs the suite.
- **~20 existing test files** across `src/features/**/__tests__/`, `src/app/api/cron/**/__tests__/`, and colocated `*.test.ts` — active patterns cover classifiers, credit math, digests, reply matching, scheduler, quality control, LinkedIn adapter/canary/ingestion, staleness banner.
- **Phase 7 regression test at `src/features/sequences/lib/__tests__/reply-matching.test.ts`** — canonical pattern for normalize-at-compare-boundary; reuse for Phase 4 back-coverage.
- **Seven draft VALIDATION.md files** (phases 01–07) — each already has task-level breakdown and placeholder tables; Phase 11 fills in status/tests/manual rows and flips compliance flags.
- **Six existing VERIFICATION.md files** (phases 01–05, 07) — Phase 6 is the single missing one; its writing template can be cribbed directly from 05-VERIFICATION.md and 07-VERIFICATION.md.

### Established Patterns
- **Colocated `__tests__/` directory** per feature module is the dominant convention; occasional sibling `*.test.ts` in flat files like `credit-burn.test.ts` — follow whichever pattern the target feature already uses.
- **Vitest + @testing-library/react** for component tests (e.g., `staleness-banner.test.tsx`); pure vitest for lib/utility tests.
- **Mock boundaries matching Phase 7 pattern** — mock external SDKs (Sentry, GoLogin, Anthropic, Resend, Supabase service client) at the module edge; run real code in between.
- **Manual-verification table in VALIDATION.md** — already scaffolded in Phase 1's file (OAuth flow, Vercel deploy, Sentry/Axiom dashboards); replicate pattern across phases 2–7.

### Integration Points
- `/gsd:validate-phase N` command wraps the `gsd-nyquist-auditor` agent; this is the primary per-phase invocation.
- `STATE.md` session tracking — Phase 11 will likely span multiple sessions; use pause/resume protocol between phase passes.
- GSD tools helper (`node "C:/Users/kamil/.claude/get-shit-done/bin/gsd-tools.cjs"`) — `init phase-op`, `state record-session`, `commit` — same pattern as every other GSD command.

</code_context>

<specifics>
## Specific Ideas

- "Nyquist compliance" means: every time a requirement's behavior would change silently, a test would shout about it. Not a coverage number.
- Pattern from Phase 7: mock external SDKs at the module boundary, run real code in between. That formula handled the RPLY-02 regression cleanly — reuse liberally.
- Manual-only is a first-class compliance state; the mistake is pretending we can automate things that can't be.
- Phase 6 VERIFICATION.md is a paperwork finish; it uses existing UAT evidence, it does not re-verify.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 12 scope items exposed during validation** — BILL-01 trial auto-activation wiring, ACTN-10 4h vs. 12h expiry reconciliation. Surface concretely in whichever phase pass observes them; leave fix to Phase 12.
- **Flaky tests discovered during validation** — any test that goes red intermittently gets quarantined (skipped with a TODO and an issue in deferred-items), not rebuilt heroically in this phase.
- **Line-coverage reporting / coverage-tool integration** — deliberately out of scope. Revisit only if behavioral coverage proves insufficient in practice.
- **E2E harness (Playwright test framework) for UI flows** — not set up; not worth setting up mid-validation. If a requirement genuinely needs it, document as manual.
- **Phase 1 retroactive auth-flow automation** — OAuth flow is manual; leave it that way unless supabase-auth-helpers testing becomes trivial.
- **Phase 6 Apify API test coverage** — the Apify adapter is tested via mocks; real Apify calls remain manual-per-environment (APIFY_API_TOKEN gated).

</deferred>

---

*Phase: 11-nyquist-validation-compliance*
*Context gathered: 2026-04-21*
