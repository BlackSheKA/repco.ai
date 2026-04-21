# Phase 7: Reply Detection Fix — Research

**Researched:** 2026-04-21
**Domain:** Handle normalization bug in reply matching pipeline (Reddit DM inbox → prospects)
**Confidence:** HIGH (bug fully reproduced in code; fix is low-risk, single-call-site)

## Summary

Phase 7 is a **gap-closure phase fixing a single upstream bug** that silently cascades into three unsatisfied requirements (RPLY-02/03/04) plus one broken feature path (FLLW-04 follow-up cancellation). The bug is exactly as the audit described and is confirmed by reading the four relevant source files.

`matchReplyToProspect` normalizes the **inbox sender** (`"u/testuser"` → `"testuser"`) before comparing, but the **stored prospect handle** is inserted with the `u/` prefix intact via two paths: (1) `ingestion-pipeline.ts` line 55 writes `u/${post.author.name}` into `intent_signals.author_handle`, and (2) `create-actions.ts` line 99 copies `signal.author_handle` verbatim into `prospects.handle`. So the in-memory comparison is `"testuser" === "u/testuser"` — always false.

The cascade is real and complete: (a) `matchReplyToProspect` returns null → `handleReplyDetected` never runs → `actions` are never cancelled (FLLW-04) and `prospects.pipeline_status` never becomes `'replied'`; (b) `sendReplyAlert` is called inside the same block guarded by the match → RPLY-03 email never dispatches; (c) the Realtime subscription `use-realtime-replies` listens for `pipeline_status = 'replied'` UPDATE events → RPLY-04 push never fires.

Scope is clearer than the audit suggests: LinkedIn reply detection **does not exist yet** (`check-replies` hardcodes `platform: "reddit"` and `"Reddit"` in the email call; LinkedIn DM inbox check is deferred to Phase 10 LinkedIn Outreach Execution). So Phase 7 only needs to correctly handle **Reddit** — we are not fixing a multi-platform bug, just the Reddit path. But any shared util we introduce should be platform-aware to prepare for LinkedIn.

**Primary recommendation:** Normalize at the comparison boundary only. Introduce `src/lib/handles/normalize.ts` exporting `normalizeHandle(raw, platform)` that strips `u/` (Reddit) or `@`/`in/` (LinkedIn future) and lowercases. Use it in `matchReplyToProspect` on **both sides** of the equality check (sender AND stored handle). Do NOT migrate existing `prospects.handle` data — the display code (`prospect-card.tsx`, `prospect-detail.tsx`) renders the stored value and "u/alice" is the correct user-facing form for Reddit. Add regression tests using production-shaped fixtures (`u/testuser` in stored `handle` column).

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase — `/gsd:discuss-phase` was not run. All scope decisions are at Claude's discretion within the Phase 7 description + ROADMAP success criteria.

### Discretion Areas (Claude recommends during planning)
- Normalization direction: **strip both sides at compare time** (recommended — least invasive, no data migration, keeps `u/` in UI)
- Location of shared util: **`src/lib/handles/normalize.ts`** (cross-feature lib, not monitoring/ or sequences/)
- DB check constraint on `prospects.handle`: **NOT recommended** — would require a migration and would break the existing production data (all Reddit prospects stored as `u/*`). Instead rely on the shared util + test fixtures
- Test fixtures: **production-shaped** (`u/username` in the `handle` field) so the bug cannot regress silently

### Deferred Ideas (OUT OF SCOPE)
- LinkedIn reply detection (no `check-replies` path for LinkedIn exists yet — Phase 10 concern)
- Data migration to strip `u/` from `prospects.handle` column (not needed; rejected because UI relies on the stored form)
- Unifying handle format across `intent_signals.author_handle`, `prospects.handle`, `social_accounts.handle` (same stored format, separate discussion)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RPLY-02 | System matches reply sender to prospect record and updates pipeline_status to "replied" | Bug located in `src/features/sequences/lib/reply-matching.ts:30` + `src/features/monitoring/lib/ingestion-pipeline.ts:55` + `src/features/actions/actions/create-actions.ts:99`. Fix: normalize both sides of compare. `handleReplyDetected` already correctly updates `pipeline_status` to `replied` when called. |
| RPLY-03 | System sends email notification to user when a reply is received | Email infra already wired: `src/features/notifications/lib/send-reply-alert.ts` + `src/features/notifications/emails/reply-alert.tsx` + Resend v6. Called from `src/app/api/cron/check-replies/route.ts:250`. Never fires because RPLY-02 match returns null. Fixing RPLY-02 unblocks this with zero additional code. |
| RPLY-04 | System pushes reply event to dashboard via Supabase Realtime | Realtime hook `src/features/sequences/lib/use-realtime-replies.ts` fully implemented, subscribes to `prospects` UPDATE events filtered to `user_id` and checks `pipeline_status === 'replied'`. Never fires because RPLY-02 match returns null → `pipeline_status` never transitions. Fixing RPLY-02 unblocks this with zero additional code. |
| FLLW-04 (cascade) | System stops all follow-ups immediately when any reply is detected | `handleReplyDetected` at `src/features/sequences/lib/stop-on-reply.ts:30-37` already cancels pending/approved `followup_dm` actions correctly. Cascade fix: fixing RPLY-02 match restores this behavior. Already checked in REQUIREMENTS.md row 69 (status "Complete"); the cascade means it's not actually complete in production. Worth re-verifying post-fix. |

## Standard Stack

### Core
| Library | Version (current) | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| vitest | 4.1.4 (installed) / 4.1.5 (latest) | Unit test runner — already configured (`vitest.config.ts`, happy-dom, globals, path alias `@`) | Project convention; phase 4 tests (`reply-matching.test.ts`, `stop-on-reply.test.ts`) already use it |
| @supabase/supabase-js | 2.103.3 | DB client — existing tests mock the query-builder chain | Canonical repo pattern |
| resend | 6.12.0 | Reply alert email delivery (RPLY-03) | Already wired and tested (Phase 4 Plan 02) |

No NEW libraries needed. The fix is pure refactor + tests.

### Installation
None. All dependencies present.

### Version verification
```
$ npm view vitest version  → 4.1.5
$ npm view resend version  → 6.12.2
```
Installed versions (4.1.4 vitest, 6.12.0 resend) are within one patch — safe for this phase, no upgrade needed.

## Architecture Patterns

### Recommended File Structure
```
src/
├── lib/
│   └── handles/
│       ├── normalize.ts           # NEW: normalizeHandle(raw, platform) util
│       └── __tests__/
│           └── normalize.test.ts  # NEW: edge cases (prefix, case, whitespace, null)
└── features/sequences/lib/
    ├── reply-matching.ts          # MODIFY: use normalizeHandle on both sides
    └── __tests__/
        └── reply-matching.test.ts # MODIFY: fixtures use `u/username` stored form
```

### Pattern 1: Normalize-at-compare-boundary (not at-write)
**What:** Store handles in whatever natural form the source produces (`u/alice` for Reddit; raw `alice` for LinkedIn per `linkedin-ingestion-pipeline.ts:70`). Normalize only at the equality check.

**When to use:** When the stored form is user-visible (repco shows `prospect.handle` directly in the prospect kanban, detail page, CSV export, and reply toast — always with an implicit `u/` for Reddit because that IS the stored value). Data migration would change every UI surface silently.

**Example:**
```typescript
// src/lib/handles/normalize.ts (NEW)
export function normalizeHandle(
  raw: string | null | undefined,
  platform: string,
): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  switch (platform) {
    case "reddit":
      return trimmed.replace(/^u\//i, "").toLowerCase()
    case "linkedin":
      // LinkedIn stores raw name already (linkedin-ingestion-pipeline.ts:70)
      // Future: strip `@` or `linkedin.com/in/` if we ever add those prefixes
      return trimmed.toLowerCase()
    default:
      return trimmed.toLowerCase()
  }
}
```

### Pattern 2: Query-builder chain mocks (existing convention)
**What:** Build a minimal fake `SupabaseClient` where `.from().select().eq().eq().neq()` resolves to a programmable data array.

**Source:** `src/features/sequences/lib/__tests__/reply-matching.test.ts:10-28` already shows the exact shape.

**When to use:** Unit tests against lib functions that take a `SupabaseClient`. Keep using this; do NOT introduce a new mocking library.

### Anti-Patterns to Avoid
- **Normalizing on write (ingestion).** Don't rewrite `ingestion-pipeline.ts` to strip `u/` — that changes `intent_signals.author_handle` and cascades to signal-card display, reply toast, terminal header, prospect detail page. Orders of magnitude more blast radius than the bug itself.
- **DB-level CHECK constraint to enforce `u/` prefix.** Requires migration, breaks on insert for existing LinkedIn/future platforms, and papers over the real fix (compare-boundary normalization).
- **Hand-rolling handle normalization inline inside `matchReplyToProspect`.** That's exactly the original bug pattern (inline `replace(/^u\//i, "")` only on one side). Use a shared util so both sides use identical logic.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Handle normalization | Inline `replace` at each call site | `normalizeHandle(raw, platform)` shared util | Inline is what caused the current bug — one side drifted |
| Supabase query-builder mocks | Custom fake framework | Existing `buildSupabase()` pattern in `__tests__/reply-matching.test.ts` | Already works, matches project convention |
| Test fixture generation | Factory helpers / faker | Literal `handle: "u/testuser"` strings | Bug reproduction needs byte-exact production-shaped values |
| Reply alert email | New template | Existing `ReplyAlertEmail` + `sendReplyAlert` | Already shipped and tested in Phase 04 Plan 02 |
| Realtime subscription | New channel | Existing `useRealtimeReplies` | Already shipped and correctly listens for `pipeline_status = replied` UPDATE |

**Key insight:** This phase should touch ~3 source files (`reply-matching.ts`, new `normalize.ts`, updated test) plus ~1 new test file. The surrounding infrastructure (email, realtime, stop-on-reply, cron) all works correctly and just needs `matchReplyToProspect` to return a non-null result.

## Common Pitfalls

### Pitfall 1: Test fixtures that mask the bug
**What goes wrong:** Existing `reply-matching.test.ts` at line 35, 60, 66, 87, 121 uses **bare** handles (`"testuser123"`, `"alice"`, `"bob"`, `"someone-else"`, `"myuser"`) — exactly the normalized form. The production column actually holds `u/testuser123`. The test passes; production silently fails.

**Why it happens:** Tests were written against the normalized comparison target, not against what the DB actually stores. Classic "confirmation bias" test — it verifies the function does what the author expected, not what production data produces.

**How to avoid:** Every fixture in the updated test MUST use the production-shaped stored form (`handle: "u/testuser123"`). After the fix, tests should pass with `u/` prefix in the stored field AND fail if you revert the fix.

**Warning signs:** Test data that looks "clean" relative to what the DB actually contains. Grep the ingestion code (`grep "handle" src/features/monitoring/lib/*pipeline*.ts`) and compare to fixtures.

### Pitfall 2: Double-stripping with existing inline normalization
**What goes wrong:** If we introduce `normalizeHandle` but forget to delete the inline `replace(/^u\//i, "")` at line 30, running it twice is harmless — but leaving inline logic at call sites creates drift opportunity (someone edits one, not the other).

**How to avoid:** Delete the inline normalization entirely. All normalization happens via the util.

### Pitfall 3: Platform field in `prospects` can be anything
**What goes wrong:** `prospects.platform` is a `platform_type` ENUM (values: `reddit`, `linkedin`, etc.). `normalizeHandle(raw, platform)` must handle both. A future LinkedIn reply path (Phase 10) will pass `"linkedin"` — the util should already DTRT.

**How to avoid:** Include a LinkedIn branch in the util even though Phase 7 only exercises Reddit. Add a test case for LinkedIn (raw name, no prefix expected).

### Pitfall 4: Case sensitivity mismatch on LinkedIn
**What goes wrong:** LinkedIn author names from Apify might be mixed-case display names (`"John Doe"`). If we lowercase both sides but the stored form is `"John Doe"`, match succeeds for `"john doe"` sender. That's fine — but note Reddit usernames are case-insensitive per Reddit spec, LinkedIn display names are NOT unique. Phase 7 doesn't need to solve this (no LinkedIn inbox check yet), just don't hard-code `.toLowerCase()` in a way that blocks a future LinkedIn-aware match.

**How to avoid:** Centralize in `normalizeHandle` — change later per platform without touching call sites.

### Pitfall 5: Existing data in `prospects.handle` is already `u/*` for all Reddit rows
**What goes wrong:** Any "fix" that strips `u/` on write (migration OR ingestion change) breaks the UI which renders `prospect.handle` directly. Users would see `"alice"` instead of `"u/alice"` in the kanban, losing Reddit context.

**How to avoid:** Do NOT touch stored data. Fix at compare-boundary only. Confirmed via grep — `prospect-card.tsx:86`, `prospect-detail.tsx:190`, `(app)/page.tsx:313`, `scheduler.ts:141`, `export-csv.ts:30` all read `prospect.handle` raw.

## Code Examples

Verified patterns from the existing repo.

### Reproducing the bug (current production behavior)
```typescript
// src/features/sequences/lib/reply-matching.ts (CURRENT, BUGGY)
export async function matchReplyToProspect(
  supabase: SupabaseClient,
  senderHandle: string,    // e.g. "testuser" (from CU response, stripped)
  platform: string,        // "reddit"
  accountUserId: string,
): Promise<MatchedReply | null> {
  const normalized = senderHandle.replace(/^u\//i, "").toLowerCase()
  // normalized = "testuser"

  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, handle, user_id, pipeline_status")
    .eq("user_id", accountUserId)
    .eq("platform", platform)
    .neq("pipeline_status", "replied")

  // prospects[0].handle = "u/testuser" (from create-actions.ts:99 ← ingestion-pipeline.ts:55)
  const match = prospects.find((p) => p.handle?.toLowerCase() === normalized)
  //                                  "u/testuser"            !== "testuser"
  //                                  → undefined → null returned
}
```

### Proposed fix
```typescript
// src/lib/handles/normalize.ts (NEW)
export function normalizeHandle(
  raw: string | null | undefined,
  platform: string,
): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  switch (platform) {
    case "reddit":
      return trimmed.replace(/^u\//i, "").toLowerCase()
    case "linkedin":
      return trimmed.toLowerCase()
    default:
      return trimmed.toLowerCase()
  }
}

// src/features/sequences/lib/reply-matching.ts (PATCHED)
import { normalizeHandle } from "@/lib/handles/normalize"

export async function matchReplyToProspect(
  supabase: SupabaseClient,
  senderHandle: string,
  platform: string,
  accountUserId: string,
): Promise<MatchedReply | null> {
  const normalized = normalizeHandle(senderHandle, platform)
  if (!normalized) return null

  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, handle, user_id, pipeline_status")
    .eq("user_id", accountUserId)
    .eq("platform", platform)
    .neq("pipeline_status", "replied")

  if (!prospects?.length) return null

  const match = (prospects as Array<{
    id: string
    handle: string | null
    user_id: string
    pipeline_status: string
  }>).find((p) => normalizeHandle(p.handle, platform) === normalized)

  if (!match) return null

  return {
    prospectId: match.id,
    prospectHandle: match.handle ?? normalized,  // keep stored form for display
    userId: match.user_id,
    replySnippet: "",
  }
}
```

### Regression test (production-shaped fixture)
```typescript
// src/features/sequences/lib/__tests__/reply-matching.test.ts (PATCHED)
it("matches Reddit reply when stored handle has u/ prefix (RPLY-02 regression)", async () => {
  const supabase = buildSupabase([
    {
      id: "prospect-1",
      handle: "u/testuser123",            // ← production stored form
      user_id: "user-1",
      pipeline_status: "contacted",
    },
  ])

  const result = await matchReplyToProspect(
    supabase,
    "testuser123",                         // ← CU inbox sender (no prefix)
    "reddit",
    "user-1",
  )

  expect(result).not.toBeNull()
  expect(result?.prospectId).toBe("prospect-1")
  expect(result?.prospectHandle).toBe("u/testuser123")  // display form preserved
})

it("matches when both sender and stored handle have u/ prefix", async () => {
  const supabase = buildSupabase([
    { id: "p1", handle: "u/Alice", user_id: "u1", pipeline_status: "contacted" },
  ])
  const result = await matchReplyToProspect(supabase, "u/alice", "reddit", "u1")
  expect(result?.prospectId).toBe("p1")
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline handle normalization at one side of compare | Shared `normalizeHandle` util called on both sides | Phase 7 (this phase) | Fixes RPLY-02/03/04 cascade |
| Bare-handle test fixtures | Production-shaped (`u/*`) fixtures | Phase 7 | Regression-proof |
| CLAUDE.md "No test framework configured yet" | Vitest 4.1.4 is installed, configured, and has 2 passing reply-related test files | Already current (documentation is stale) | Phase 7 can write unit tests immediately; no framework setup wave needed |

**Deprecated/outdated:**
- CLAUDE.md line "Current state: No test framework configured yet." is outdated — Vitest is set up in `vitest.config.ts` with `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, and `@vitejs/plugin-react`. Phase 4 already committed tests. Update CLAUDE.md as a minor doc-hygiene item (non-blocking for Phase 7).

## Open Questions

1. **Should Phase 7 include a post-fix data sanity check?**
   - What we know: No data migration needed; all stored `prospects.handle` for Reddit is `u/*` and UI expects that.
   - What's unclear: Are there any "legacy" rows from pre-Phase-3 testing where `prospects.handle` does NOT have the prefix? If yes, the fix catches them correctly (normalize-both-sides); if any row is `u/u/alice` from a bug, the regex handles one prefix only.
   - Recommendation: In the phase plan, add one SQL sanity query as a verification step: `SELECT DISTINCT substring(handle, 1, 2) FROM prospects WHERE platform = 'reddit';` — expected values: `u/` only. Surface any anomalies before merge.

2. **Should we fix `author_handle` in `intent_signals` simultaneously?**
   - What we know: `intent_signals.author_handle` also has the `u/` prefix and participates in the terminal header / signal-card display (`signal-card.tsx` renders with prefix). Not part of the reply-detection bug.
   - Recommendation: Out of scope for Phase 7. Only touch what the bug touches.

3. **Should `NTFY-02` (reply email) be explicitly re-verified post-fix?**
   - What we know: REQUIREMENTS.md marks NTFY-02 as Complete; audit confirms `sendReplyAlert` is wired but never reached.
   - Recommendation: Phase 7 verification should include one integration-style test or manual trigger confirming Resend receives the call when a match succeeds. Listed in Validation Architecture below.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 (already configured) |
| Config file | `vitest.config.ts` (happy-dom env, globals, path alias `@` → `./src`) |
| Quick run command | `pnpm test src/features/sequences/lib/__tests__/reply-matching.test.ts` |
| Full suite command | `pnpm test` |
| Setup file | `vitest.setup.ts` (imports `@testing-library/jest-dom/vitest`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPLY-02 | Inbox sender `"alice"` matches stored prospect `"u/alice"` on reddit platform | unit | `pnpm test src/features/sequences/lib/__tests__/reply-matching.test.ts` | ✅ (update fixtures to `u/*` form) |
| RPLY-02 | Sender `"u/Alice"` (prefix+case variant) matches stored `"u/alice"` | unit | (same file, same command) | ✅ (update existing case-variant test) |
| RPLY-02 | Sender `"nobody"` returns null when no prospect with that handle exists | unit | (same file) | ✅ (keep) |
| RPLY-02 | Prospects already `replied` are excluded by DB filter | unit | (same file) | ✅ (keep) |
| RPLY-02 | normalizeHandle util: Reddit strips `u/`, lowercases, trims whitespace | unit | `pnpm test src/lib/handles/__tests__/normalize.test.ts` | ❌ Wave 0 (NEW file) |
| RPLY-02 | normalizeHandle util: LinkedIn leaves handle as-is, lowercased | unit | (same file) | ❌ Wave 0 |
| RPLY-02 | normalizeHandle util: null/undefined/empty-string inputs return "" | unit | (same file) | ❌ Wave 0 |
| RPLY-02 + RPLY-03 + RPLY-04 + FLLW-04 | End-to-end inside cron handler: when CU returns an unread message whose sender matches a Reddit prospect with `u/`-prefixed handle, then `handleReplyDetected` is called, `sendReplyAlert` is called, `prospects.pipeline_status` transitions to `replied` (which Realtime listens for) | integration | `pnpm test src/app/api/cron/check-replies/__tests__/route.test.ts` | ❌ Wave 0 (optional — see notes) |
| RPLY-03 | Reply alert email subject includes `u/{handle}` and platform name | unit | `pnpm test src/features/notifications/lib/__tests__/reply-alert.test.ts` | ✅ (existing, no change — already tests this) |
| RPLY-04 | Realtime hook fires toast + state update on `pipeline_status` UPDATE to `replied` | unit (happy-dom + Supabase client mock) | (hook test — see notes) | ❌ OPTIONAL Wave 0 (the cascade validates this; direct hook test is defense-in-depth) |
| FLLW-04 | `handleReplyDetected` cancels pending followup_dm actions + flips status | unit | `pnpm test src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | ✅ (existing, no change) |

### Sampling Rate
- **Per task commit:** `pnpm test src/features/sequences src/lib/handles` (targeted paths, <10s)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green + one manual smoke test trigger via the cron endpoint with a seeded `u/*` prospect, confirmed by Supabase dashboard showing `pipeline_status = replied` and Resend logs showing email delivery, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/handles/normalize.ts` — extracted util, platform-aware
- [ ] `src/lib/handles/__tests__/normalize.test.ts` — unit tests for every platform branch + edge cases (null, empty, whitespace, case, prefix-variants `u/`, `U/`, `/u/` malformed)
- [ ] Update `src/features/sequences/lib/__tests__/reply-matching.test.ts` — fixtures MUST use `u/*` stored form; add new test explicitly named for RPLY-02 regression with production-shaped data
- [ ] `src/features/sequences/lib/reply-matching.ts` — replace inline `replace(/^u\//i, "")` with `normalizeHandle(..., platform)` on BOTH sides of equality
- [ ] (Optional but recommended) `src/app/api/cron/check-replies/__tests__/route.test.ts` — integration-style test that asserts the full downstream cascade (matchReplyToProspect → handleReplyDetected → sendReplyAlert) happens end-to-end in the cron handler. Uses existing mock patterns; no new framework

### Tests That Would Have Caught The Original Bug
Any ONE of these would have prevented the RPLY-02/03/04 regression:

1. **Production-shaped fixture test** (definitive): `handle: "u/testuser"` in the mock prospect row, sender `"testuser"` from CU, expect non-null match. Instead, Phase 4 test used `handle: "testuser"` — masking the prefix mismatch entirely. This is the single highest-leverage test.

2. **Invariant assertion on ingestion-pipeline output** (defensive): A test that `runIngestionForUser` writes `author_handle` matching a `^u\//` regex, coupled with a test that `create-actions.ts` copies `author_handle` into `prospects.handle` unchanged. Makes the storage contract explicit.

3. **End-to-end integration test of `check-replies` cron** (broadest): Seed a prospect with `handle: "u/alice"`, mock the CU response to return `sender: "alice"`, assert the route's response shows `totalReplies: 1`. Exercises every layer.

Phase 7 plan should implement #1 + #2 minimally, #3 as optional (high-value, moderate cost).

### Recommended Fixtures
All tests MUST use **production-shaped** fixtures — `handle` column values that match what ingestion actually writes:

| Platform | Example stored `prospects.handle` | Example CU `sender` |
|----------|-----------------------------------|---------------------|
| reddit | `"u/alice"` | `"alice"` or `"u/alice"` or `"U/Alice"` (CU reads display text) |
| reddit (edge) | `"u/MixedCaseUser"` | `"mixedcaseuser"` |
| linkedin | `"John Doe"` | `"john doe"` (future, Phase 10) |
| null/empty | `null` | anything — should return null cleanly, never throw |

## Sources

### Primary (HIGH confidence)
- `src/features/sequences/lib/reply-matching.ts` — bug location, line 30
- `src/features/monitoring/lib/ingestion-pipeline.ts` — storage format source, line 55
- `src/features/actions/actions/create-actions.ts` — prospect creation from signal, line 99
- `src/app/api/cron/check-replies/route.ts` — cron wiring, lines 225-263
- `src/features/sequences/lib/stop-on-reply.ts` — `handleReplyDetected` behavior (already correct)
- `src/features/sequences/lib/use-realtime-replies.ts` — Realtime subscription (already correct)
- `src/features/notifications/lib/send-reply-alert.ts` + `emails/reply-alert.tsx` — Resend email infra (already correct)
- `src/features/sequences/lib/__tests__/reply-matching.test.ts` — existing tests, expose the fixture gap
- `vitest.config.ts` + `package.json` — test framework confirmed installed (4.1.4)
- `supabase/migrations/00002_initial_schema.sql` line 129 — `prospects.handle text` column
- `supabase/migrations/00006_phase3_action_engine.sql` lines 17-19 — unique index `(user_id, handle, platform)`
- `vercel.json` line 29 — cron `/api/cron/check-replies` scheduled every 2h (aligns with RPLY-01 10-minute alert latency requirement)
- `.planning/v1.0-MILESTONE-AUDIT.md` — authoritative root-cause description

### Secondary (MEDIUM confidence)
- `npm view vitest version` → 4.1.5 (installed 4.1.4, patch-safe)
- `npm view resend version` → 6.12.2 (installed 6.12.0, patch-safe)

### Tertiary (LOW confidence)
- None. All critical claims verified against source code.

## Metadata

**Confidence breakdown:**
- Bug location and root cause: HIGH — reproduced via direct file read at exact line numbers cited by audit
- Fix approach (normalize at compare boundary): HIGH — no alternatives have better risk/reward
- Downstream cascade (RPLY-03/04, FLLW-04): HIGH — all confirmed via reading cron route + realtime hook + stop-on-reply
- LinkedIn scope deferral: HIGH — grepped `check-replies` for `linkedin`, only Reddit references exist; LinkedIn inbox check is Phase 10 scope per ROADMAP
- Test framework readiness: HIGH — `vitest.config.ts` exists, scripts in package.json, 2 reply-related test files already passing
- CLAUDE.md staleness re: test framework: HIGH — package.json shows Vitest + React Testing Library devDependencies and a `"test"` script

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days; domain is stable — no library upgrades expected to affect this phase)
