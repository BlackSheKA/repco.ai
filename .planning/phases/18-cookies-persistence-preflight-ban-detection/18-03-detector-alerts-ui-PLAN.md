---
phase: 18
plan: 03
type: execute
wave: 3
depends_on:
  - 18-01
  - 18-02
files_modified:
  - src/lib/computer-use/detect-ban-state.ts
  - src/lib/computer-use/detect-ban-state.test.ts
  - src/lib/action-worker/worker.ts
  - src/features/notifications/lib/send-account-warning.ts
  - src/features/notifications/emails/account-warning.tsx
  - __tests__/fixtures/banned-rules.png
  - __tests__/fixtures/account-suspended.png
  - __tests__/fixtures/cloudflare-captcha.png
  - __tests__/fixtures/clean-feed.png
autonomous: false
requirements:
  - BPRX-07
  - BPRX-09
must_haves:
  truths:
    - "After every action, detectBanState classifies the final screenshot into {banned, suspended, captcha}"
    - "banned||suspended flips health_status='banned'; captcha flips health_status='captcha_required'; all-false leaves status untouched"
    - "Anthropic API errors return all-false and DO NOT flip health_status (defensive per L-3)"
    - "send-account-warning supports 4 statuses (warning|banned|needs_reconnect|captcha_required) with platform-aware copy"
    - "Email debounced 24h via job_logs WHERE job_type='account_warning_email' AND metadata->>'account_id'=$1"
  artifacts:
    - path: "src/lib/computer-use/detect-ban-state.ts"
      provides: "detectBanState(screenshotBase64) → { banned, suspended, captcha }"
      exports: ["detectBanState"]
    - path: "__tests__/fixtures/{banned-rules,account-suspended,cloudflare-captcha,clean-feed}.png"
      provides: "4 hand-curated detector fixtures"
  key_links:
    - from: "src/lib/action-worker/worker.ts (post-CU splice)"
      to: "detectBanState"
      via: "result.screenshots[length-1] passed to detector"
      pattern: "detectBanState\\("
    - from: "src/lib/action-worker/worker.ts (detector → status mapping)"
      to: "sendAccountWarning + supabase.update(health_status)"
      via: "D-16 mapping table"
      pattern: "health_status.*captcha_required"
---

<objective>
Land the post-action ban detector + email alert pipeline: Haiku CU classification of the final screenshot after every action (banned/suspended/captcha), worker.ts splice that maps detector verdicts to `health_status` flips per D-16, and `send-account-warning` extension to four statuses with platform-aware subject/body copy + 24h debounce.

Purpose: Closes BPRX-09 detection + alert backend half. The user-facing recovery surface (banner, account-card Reconnect button, attemptReconnect server action, shadcn Alert primitive, HealthBadge tints) ships in Plan 04 — split off per plan-checker scope-sanity blocker.

Output: 1 detector module + 4 fixture PNGs + worker.ts splice + extended email helper + extended email template + colocated tests. Files touched do NOT overlap with Plan 04 (Plans 03 and 04 can run in parallel within Wave 3).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-CONTEXT.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md
@.planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md
@src/lib/computer-use/executor.ts
@src/features/notifications/lib/send-account-warning.ts
@src/features/notifications/emails/account-warning.tsx
@src/features/accounts/components/account-card.tsx
@src/features/accounts/components/health-badge.tsx
@src/app/(app)/layout.tsx

<interfaces>
<!-- Anthropic SDK shape (PATTERNS §5 + RESEARCH §4) -->

The detector uses VANILLA `client.messages.create` — NOT `client.beta.messages.create`. No tools, no betas. Single user message with one image + one short text instruction.

```ts
import Anthropic from "@anthropic-ai/sdk"
const client = new Anthropic()
const response = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 200,
  system: DETECT_BAN_STATE_SYSTEM_PROMPT,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
      { type: "text", text: "Inspect this screenshot." },
    ],
  }],
})
```

<!-- Existing send-account-warning signature (PATTERNS §9) -->

```ts
// existing src/features/notifications/lib/send-account-warning.ts
export async function sendAccountWarning(
  to: string,
  accountHandle: string,
  status: "warning" | "banned",
): Promise<void>
```

<!-- Existing layout.tsx query (PATTERNS §11) -->

```ts
// src/app/(app)/layout.tsx:32 (current)
.in("health_status", ["warning", "cooldown", "banned"])
// note: currently selects count via {count:'exact', head:true} — must be changed to row fetch
```

<!-- Existing health-badge HEALTH_STYLES map (PATTERNS §12 + UI-SPEC §Color) -->

The map is a `Record<HealthStatus, { label, bg, fg, border }>` keyed by status. Add two entries:
- `needs_reconnect`: blue `#3B82F6` (bg `rgba(59,130,246,0.15)`, border `rgba(59,130,246,0.3)`), label `"Needs reconnect"`
- `captcha_required`: violet `#8B5CF6` (bg `rgba(139,92,246,0.15)`, border `rgba(139,92,246,0.3)`), label `"Captcha needed"`

<!-- Existing account-card LogIn button analog (PATTERNS §12) -->

```tsx
// account-card.tsx:158-178 — pattern reference
<Button type="button" variant="ghost" size="sm" className="h-7"
  onClick={() => onReconnect(account.id, account.browser_profile_id, account.platform)}
  aria-label={verified ? `Re-login...` : `Log in...`}>
  <LogIn className="mr-1 h-3.5 w-3.5" />
  {verified ? "Re-login" : "Log in"}
</Button>
```

New Reconnect button is a SIBLING; uses `variant="default"` (primary) and Phosphor `ArrowSquareOut` icon (UI-SPEC §Account-card).

<!-- attemptReconnect analog (PATTERNS §7) -->

```ts
// src/features/accounts/actions/account-actions.ts:90-134 — analog
"use server"
export async function startAccountBrowser(accountId: string): Promise<{success, url?, error?}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }
  const { data: account } = await supabase.from("social_accounts")
    .select("...").eq("id", accountId).eq("user_id", user.id).single()
  // ...
}
```
</interfaces>

<critical_constraints>
- Plans 01 AND 02 must be applied (depends_on: 18-01, 18-02). Plan 03 runs in Wave 3 AFTER Plan 02's worker.ts commit lands. Plan 03's worker edit is a NEW splice point that does NOT overlap with Plan 02's edits: between `result = await executeCUAction(...)` return and the existing `return { success: result.success, ... }` — i.e., after Plan 02's last edit and before the action result is returned to the caller.
- Plan 04 (UI surface — banner, account-card Reconnect, attemptReconnect server action, shadcn Alert primitive, HealthBadge tints) runs in parallel with Plan 03 within Wave 3. Plans 03 and 04 do NOT share files.
- L-3 (RESEARCH §12): detector failures (Anthropic throws, JSON parse fails) MUST return all-false and MUST NOT flip status. Worker must not treat all-false as a banned signal.
- D-14: detector is NOT a CU tool inside executor's loop — it's a post-loop call from worker.ts.
- D-19: email debounce queries `job_logs WHERE job_type='account_warning_email' AND metadata->>'account_id'=$1 AND finished_at > now() - interval '24 hours'`. Use `job_type` (the actual ENUM column name) not `kind`.
- L-6 (RESEARCH §12): every `account_warning_email` job_logs insert MUST set `metadata.account_id` as a string for the dedup query to work.
- UI-SPEC §Color: status tints are inline RGBA (matching existing HEALTH_STYLES pattern at health-badge.tsx:6-40), NOT new CSS variables.
- Memory `feedback_no_proxy_ux_complexity`: never expose "proxy" / "profile" / "fingerprint" in UI copy.
- Memory `feedback_landing_copy_style`: sentence case, no eyebrow pills, no exclamation marks.
- Memory `feedback_credit_ui_no_burn_math`: banner copy must NOT mention burn rate or "X days remaining".
- The 4 fixture PNGs are user-curated screenshots from real Reddit/LinkedIn pages — Task 3 is a CHECKPOINT pausing for user upload before fixture-based detector tests can pass.
- Fixture-skip path: when `INTEGRATION` env is unset, the fixture-based detector tests in Task 4 MUST skip cleanly (per checker warning #2 — guards against future regression that runs fixture tests unconditionally).
- Path `(app)` layout file: in tools/grep, brackets must be escaped — actual filesystem path is literally `src/app/(app)/layout.tsx`.
</critical_constraints>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create detectBanState wrapper + defensive test</name>
  <read_first>
    - src/lib/computer-use/executor.ts (lines 1-68 — Anthropic init + image content block analog)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §4 (model + locked system prompt + parsing recipe)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §5
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-15 (defensive test row)
  </read_first>
  <files>
    src/lib/computer-use/detect-ban-state.ts
    src/lib/computer-use/detect-ban-state.test.ts
  </files>
  <behavior>
    - Test V-15: when `client.messages.create` throws, returns `{banned:false, suspended:false, captcha:false}` and logs to Sentry/console (no rethrow)
    - Test: well-formed JSON `{"banned":true,"suspended":false,"captcha":false}` parses correctly
    - Test: malformed text (no `{...}`) returns all-false
    - Test: JSON with extra keys is tolerated (only banned/suspended/captcha read)
    - Test: missing key in JSON treated as false (e.g. `{"banned":true}` returns `{banned:true, suspended:false, captcha:false}`)
    (V-11 through V-14 fixture-based tests live in Task 4 once user uploads PNGs)
  </behavior>
  <action>
Create `src/lib/computer-use/detect-ban-state.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk"

const DETECT_BAN_STATE_SYSTEM_PROMPT = `You are a Reddit and LinkedIn page-state classifier. You inspect a screenshot of a
browser viewport and decide whether the page indicates the user has been BANNED,
SUSPENDED, or is being shown a CAPTCHA challenge.

Return ONLY a single JSON object on one line, with these three boolean keys, in
this order:

  {"banned": <bool>, "suspended": <bool>, "captcha": <bool>}

Definitions:

- "banned": A subreddit-level rule violation, account ban, or "you broke a rule"
  modal is visible. Includes "Account Suspended" pages, "you have been banned
  from r/X" notices, and Reddit/LinkedIn account-restriction interstitials.

- "suspended": Account-level suspension is shown. The account is logged out OR
  the page shows a permanent or temporary suspension notice naming the
  specific account.

- "captcha": A captcha challenge is visible — Cloudflare turnstile, Reddit
  captcha modal, LinkedIn "verify you are human" page, hCaptcha, reCAPTCHA, or
  any image-grid / checkbox / puzzle that blocks further interaction.

If the screenshot shows a normal feed, post, profile, DM thread, or any other
page where the user can continue working, return all three flags as false.

Do not include explanations, reasoning, markdown fences, or any text other
than the JSON object.`

export type BanStateVerdict = {
  banned: boolean
  suspended: boolean
  captcha: boolean
}

const ALL_FALSE: BanStateVerdict = { banned: false, suspended: false, captcha: false }

/**
 * Single-shot Haiku classification of the post-action screenshot.
 * Per RESEARCH §4 + D-14: vanilla messages.create, no tools, no agent loop.
 *
 * Defensive (per L-3): any failure (API error, parse failure, missing block)
 * returns all-false and logs. Caller MUST NOT flip health_status on all-false.
 */
export async function detectBanState(screenshotBase64: string): Promise<BanStateVerdict> {
  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: DETECT_BAN_STATE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotBase64 } },
            { type: "text", text: "Inspect this screenshot." },
          ],
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === "text")
    const text = textBlock && "text" in textBlock ? textBlock.text : ""
    const match = text.match(/\{[^}]+\}/)
    if (!match) return ALL_FALSE
    let parsed: { banned?: unknown; suspended?: unknown; captcha?: unknown }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return ALL_FALSE
    }
    return {
      banned: parsed.banned === true,
      suspended: parsed.suspended === true,
      captcha: parsed.captcha === true,
    }
  } catch (err) {
    console.error("[detect-ban-state] failed (returning all-false):", err instanceof Error ? err.message : String(err))
    return ALL_FALSE
  }
}
```

Create `src/lib/computer-use/detect-ban-state.test.ts` covering V-15 and parsing edge cases:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { detectBanState } from "./detect-ban-state"

vi.mock("@anthropic-ai/sdk", () => {
  const messagesCreate = vi.fn()
  return {
    default: vi.fn().mockImplementation(() => ({ messages: { create: messagesCreate } })),
    __mock: { messagesCreate },
  }
})

import * as sdk from "@anthropic-ai/sdk"
const mock = (sdk as any).__mock

beforeEach(() => mock.messagesCreate.mockReset())

function ok(json: string) {
  return { content: [{ type: "text", text: json }] }
}

describe("detectBanState", () => {
  it("V-15: API error returns all-false (does NOT throw)", async () => {
    mock.messagesCreate.mockRejectedValue(new Error("network"))
    const v = await detectBanState("base64data")
    expect(v).toEqual({ banned: false, suspended: false, captcha: false })
  })

  it("parses well-formed JSON", async () => {
    mock.messagesCreate.mockResolvedValue(ok('{"banned":true,"suspended":false,"captcha":false}'))
    const v = await detectBanState("data")
    expect(v).toEqual({ banned: true, suspended: false, captcha: false })
  })

  it("malformed text returns all-false", async () => {
    mock.messagesCreate.mockResolvedValue({ content: [{ type: "text", text: "not json at all" }] })
    expect(await detectBanState("data")).toEqual({ banned: false, suspended: false, captcha: false })
  })

  it("missing key in JSON treated as false", async () => {
    mock.messagesCreate.mockResolvedValue(ok('{"banned":true}'))
    expect(await detectBanState("data")).toEqual({ banned: true, suspended: false, captcha: false })
  })

  it("JSON with extra keys tolerated", async () => {
    mock.messagesCreate.mockResolvedValue(ok('{"banned":false,"suspended":true,"captcha":false,"reason":"x"}'))
    expect(await detectBanState("data")).toEqual({ banned: false, suspended: true, captcha: false })
  })

  it("non-boolean values coerce to false", async () => {
    mock.messagesCreate.mockResolvedValue(ok('{"banned":"yes","suspended":1,"captcha":null}'))
    expect(await detectBanState("data")).toEqual({ banned: false, suspended: false, captcha: false })
  })
})
```
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/computer-use/detect-ban-state.ts','utf8');const checks=[/export async function detectBanState/, /export type BanStateVerdict/, /claude-haiku-4-5-20251001/, /max_tokens: 200/, /DETECT_BAN_STATE_SYSTEM_PROMPT/, /client\.messages\.create/, /text\.match\(\/\\\{\[\^\\\}\]\+\\\}\/\)/, /banned: parsed\.banned === true/, /banned: false, suspended: false, captcha: false/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}if(/client\.beta\.messages\.create/.test(s)){console.error('FORBIDDEN: must use vanilla messages.create per D-14');process.exit(1);}console.log('OK');" && pnpm vitest run src/lib/computer-use/detect-ban-state.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/computer-use/detect-ban-state.ts` exports `detectBanState` and `BanStateVerdict`
    - Uses `client.messages.create` (NOT `client.beta.messages.create`)
    - Model is `claude-haiku-4-5-20251001`, `max_tokens: 200`
    - System prompt matches RESEARCH §4 verbatim (locked)
    - Defensive: try/catch returns `{banned:false, suspended:false, captcha:false}` on any error
    - Parse uses regex `/\{[^}]+\}/` then JSON.parse, with all-false fallback on failure
    - Each output key uses strict equality `=== true` (non-boolean coerces to false)
    - Test file exists with at least 6 `it(...)` blocks including V-15 (API throw)
    - `pnpm vitest run src/lib/computer-use/detect-ban-state.test.ts` exits 0
  </acceptance_criteria>
  <done>Detector module exported; defensive paths tested; vanilla SDK confirmed.</done>
</task>

<task type="auto">
  <name>Task 2: Splice detector call into worker.ts; map output to status flips + email dispatch</name>
  <read_first>
    - src/lib/action-worker/worker.ts (POST-Plan-02 state — read after Plan 02 commits; locate `result = await executeCUAction(...)` return point and the existing return-success block)
    - src/lib/computer-use/detect-ban-state.ts (just created)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §4 splice point + Option A decision
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §8 Analog D
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-CONTEXT.md D-16 mapping table
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-16
  </read_first>
  <files>src/lib/action-worker/worker.ts</files>
  <action>
**This task runs AFTER Plan 02's worker.ts edits commit.** Coordinate ordering with Plan 02 — Plan 03 starts only when Plan 02's worker.ts commit lands (both Plan 02 and Plan 03 declare `files_modified: src/lib/action-worker/worker.ts` to force serialization within Wave 2).

Add detector splice between `result = await executeCUAction(...)` (CU executor return) and the existing return-result block. Locate by grep: search for the assignment that captures the CU executor's `CUResult` (per RESEARCH §4 splice point Option A — happens before the `finally` block that runs `saveCookiesAndRelease`).

**Imports to add at top:**
```ts
import { detectBanState } from "@/lib/computer-use/detect-ban-state"
import { sendAccountWarning } from "@/features/notifications/lib/send-account-warning"
```

**Splice block** (insert AFTER `const result = await executeCUAction(...)` and BEFORE the return statement that propagates `result.success`):

```ts
// Phase 18 (BPRX-09, D-14 + D-16): post-action detector pass.
// Runs against the final screenshot. NOT a tool inside the CU loop.
// Per L-3: detector failures return all-false → no status change.
if (result.screenshots && result.screenshots.length > 0) {
  const finalScreenshot = result.screenshots[result.screenshots.length - 1]
  const verdict = await detectBanState(finalScreenshot)

  if (verdict.banned || verdict.suspended) {
    await supabase
      .from("social_accounts")
      .update({ health_status: "banned" })
      .eq("id", account.id)
    await sendAccountWarning(account.user_email, account.handle, "banned", {
      platform: account.platform,
      supabase,
      userId: account.user_id,
      accountId: account.id,
    })
  } else if (verdict.captcha) {
    await supabase
      .from("social_accounts")
      .update({ health_status: "captcha_required" })
      .eq("id", account.id)
    await sendAccountWarning(account.user_email, account.handle, "captcha_required", {
      platform: account.platform,
      supabase,
      userId: account.user_id,
      accountId: account.id,
    })
  }
  // all-false → no status change. Action result stands.
}
```

Adjust `account.user_email` to whatever field the existing `account` row carries (worker.ts already has `account.user_id`; the email comes from a join or a separate `users` lookup — read existing Phase 14 patterns: the existing `sendAccountWarning` call site shows the email source). If user email is fetched separately, use the same source.

DO NOT touch any of the four Plan-02 insertion points (quarantine guard, preflight gate, cookies restore, saveCookiesAndRelease). Plan 03's worker edit is purely additive in a different code region.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/action-worker/worker.ts','utf8');const checks=[/import \{ detectBanState \} from \"@\/lib\/computer-use\/detect-ban-state\"/, /import \{ sendAccountWarning \} from \"@\/features\/notifications\/lib\/send-account-warning\"/, /detectBanState\(finalScreenshot\)/, /verdict\.banned \|\| verdict\.suspended/, /health_status: \"banned\"/, /verdict\.captcha/, /health_status: \"captcha_required\"/, /sendAccountWarning\([^)]*\"banned\"/, /sendAccountWarning\([^)]*\"captcha_required\"/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm typecheck && pnpm lint</automated>
  </verify>
  <acceptance_criteria>
    - 2 new imports added (detectBanState, sendAccountWarning)
    - Detector call splice exists between CU executor return and the result return
    - Final screenshot extraction: `result.screenshots[result.screenshots.length - 1]`
    - `verdict.banned || verdict.suspended` → updates `health_status='banned'` + dispatches email with status `'banned'`
    - `verdict.captcha` → updates `health_status='captcha_required'` + dispatches email with status `'captcha_required'`
    - All-false path makes NO DB update and NO email dispatch (per L-3)
    - sendAccountWarning calls pass `platform`, `supabase`, `userId`, `accountId` opts
    - Plan 02's quarantine guard, preflight gate, cookies restore, saveCookiesAndRelease blocks are STILL PRESENT and unchanged
    - `pnpm typecheck && pnpm lint` exits 0
  </acceptance_criteria>
  <done>Worker dispatches detector + maps verdict to status + email per D-16; Plan 02 changes preserved.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3 [CHECKPOINT]: User uploads 4 hand-curated detector fixture PNGs</name>
  <what-built>
    Detector and test scaffolding from Tasks 2 + 3 are committed. Fixture-based detector tests (V-11 through V-14) require 4 real screenshots from Reddit/LinkedIn that Claude cannot reasonably synthesize.
  </what-built>
  <how-to-verify>
    The user must capture and place 4 PNG screenshots at exactly these paths (filenames are referenced by the test in Task 5):

    1. `__tests__/fixtures/banned-rules.png` — a Reddit "you have been banned from r/X" or "rule violation" page. Capture from a real subreddit ban screen (or a screenshot saved earlier). 1280x900 or similar viewport.

    2. `__tests__/fixtures/account-suspended.png` — a Reddit or LinkedIn "Account Suspended" / suspension-notice page. Reddit's `/user/{handle}` page for a suspended account works (`https://www.reddit.com/user/spam` style).

    3. `__tests__/fixtures/cloudflare-captcha.png` — a Cloudflare turnstile / hCaptcha / reCAPTCHA / "verify you are human" challenge page. Any visible captcha modal/page.

    4. `__tests__/fixtures/clean-feed.png` — a normal Reddit home feed OR LinkedIn feed page. No modals, no warnings, regular browsing state.

    Place them in the project under `__tests__/fixtures/`. Each PNG should be a clean viewport screenshot (not the full desktop). Save under `screenshots/` first if you prefer (per CLAUDE.md), then copy into `__tests__/fixtures/`.

    After uploading, type "approved" and Task 5 will run the fixture-based detector tests against them.
  </how-to-verify>
  <resume-signal>Type "approved" when all 4 PNGs are in place at `__tests__/fixtures/`. Type "skip-fixtures" to defer V-11–V-14 to manual QA (Task 5 will be marked best-effort).</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Add fixture-based detector tests (V-11 through V-14)</name>
  <read_first>
    - src/lib/computer-use/detect-ban-state.ts (Task 2 output)
    - __tests__/fixtures/*.png (4 files uploaded in Task 4)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-11–V-14
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §4 (cost: ~$0.0017/call × 4 = ~$0.007/full run)
  </read_first>
  <files>src/lib/computer-use/detect-ban-state.test.ts</files>
  <action>
Append fixture-based tests to the existing `src/lib/computer-use/detect-ban-state.test.ts` file (created in Task 2). These tests hit the real Anthropic API and are gated behind `INTEGRATION=1` (per VALIDATION.md sampling section) so they don't run on every commit.

```ts
import fs from "node:fs"
import path from "node:path"

const fixturesDir = path.join(process.cwd(), "__tests__", "fixtures")
const fixturesPresent = fs.existsSync(path.join(fixturesDir, "banned-rules.png"))

const itFixture = process.env.INTEGRATION === "1" && fixturesPresent ? it : it.skip

describe("detectBanState — fixture-based ML tests (INTEGRATION=1 + fixtures)", () => {
  // Note: vi.unmock the SDK for these — they hit the real API.
  beforeEach(() => vi.doUnmock("@anthropic-ai/sdk"))

  itFixture("V-11: banned-rules.png → {banned:true, suspended:false, captcha:false}", async () => {
    const { detectBanState: real } = await vi.importActual<typeof import("./detect-ban-state")>("./detect-ban-state")
    const png = fs.readFileSync(path.join(fixturesDir, "banned-rules.png"))
    const v = await real(png.toString("base64"))
    expect(v.banned).toBe(true)
  })

  itFixture("V-12: account-suspended.png → suspended:true", async () => {
    const { detectBanState: real } = await vi.importActual<typeof import("./detect-ban-state")>("./detect-ban-state")
    const png = fs.readFileSync(path.join(fixturesDir, "account-suspended.png"))
    const v = await real(png.toString("base64"))
    expect(v.suspended).toBe(true)
  })

  itFixture("V-13: cloudflare-captcha.png → captcha:true", async () => {
    const { detectBanState: real } = await vi.importActual<typeof import("./detect-ban-state")>("./detect-ban-state")
    const png = fs.readFileSync(path.join(fixturesDir, "cloudflare-captcha.png"))
    const v = await real(png.toString("base64"))
    expect(v.captcha).toBe(true)
  })

  itFixture("V-14: clean-feed.png → all false", async () => {
    const { detectBanState: real } = await vi.importActual<typeof import("./detect-ban-state")>("./detect-ban-state")
    const png = fs.readFileSync(path.join(fixturesDir, "clean-feed.png"))
    const v = await real(png.toString("base64"))
    expect(v).toEqual({ banned: false, suspended: false, captcha: false })
  })
})
```

If fixtures absent (user typed "skip-fixtures" in Task 3), the tests skip cleanly. Document the skip in 18-03-SUMMARY.md.

**Skip-mode regression guard** (per checker warning #2): include this assertion in the test file so a future regression that runs fixture tests unconditionally is caught:

```ts
it("skip-mode guard: when INTEGRATION env is unset, fixture tests do NOT execute", () => {
  // Asserts the gating expression — protects against a future change that
  // forgets the env check and tries to read fixture PNGs unconditionally
  // (which would fail with ENOENT on machines without curated fixtures).
  if (process.env.INTEGRATION === "1" && fixturesPresent) return // we ARE running them
  // The 4 V-11..V-14 itFixture blocks above evaluated to it.skip — confirm by
  // re-checking the gate matches what those blocks were registered with.
  expect(itFixture).toBe(it.skip)
})
```

Run with: `INTEGRATION=1 pnpm vitest run src/lib/computer-use/detect-ban-state.test.ts`. Cost: ~$0.007 per full run (4 × ~$0.0017).
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('src/lib/computer-use/detect-ban-state.test.ts','utf8');const checks=[/banned-rules\.png/, /account-suspended\.png/, /cloudflare-captcha\.png/, /clean-feed\.png/, /V-11/, /V-12/, /V-13/, /V-14/, /process\.env\.INTEGRATION/];const missing=checks.filter(r=>!r.test(s));if(missing.length){console.error('MISSING',missing.map(m=>m.toString()));process.exit(1);}console.log('OK');" && pnpm vitest run src/lib/computer-use/detect-ban-state.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Test file extended with 4 fixture-based `it.skip` (or `it`) blocks named V-11, V-12, V-13, V-14
    - Each block reads a specific PNG from `__tests__/fixtures/`
    - `INTEGRATION=1` env gate present
    - `vi.unmock`/`vi.importActual` used to bypass the Task 2 mock for real API calls
    - Default test run (without INTEGRATION=1) skips fixtures cleanly and exits 0
    - With `INTEGRATION=1` AND all 4 fixtures present, the tests run against the real API
    - Skip-mode regression guard test asserts `itFixture === it.skip` when env unset (protects against a future regression that runs fixture tests unconditionally)
  </acceptance_criteria>
  <done>Fixture tests scaffolded; default suite still green; integration suite available behind env flag.</done>
</task>

<task type="auto">
  <name>Task 5: Extend send-account-warning with 4 statuses, platform-aware copy, 24h debounce</name>
  <read_first>
    - src/features/notifications/lib/send-account-warning.ts (current 2-status implementation)
    - src/features/notifications/emails/account-warning.tsx (current 2-status template)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-UI-SPEC.md §Email Copy (subject + body table)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-PATTERNS.md §9, §10
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-RESEARCH.md §10 (debounce — uses `job_type='account_warning_email'` + `metadata->>'account_id'`)
    - .planning/phases/18-cookies-persistence-preflight-ban-detection/18-VALIDATION.md V-18, V-19
  </read_first>
  <files>
    src/features/notifications/lib/send-account-warning.ts
    src/features/notifications/emails/account-warning.tsx
  </files>
  <action>
**File A — `src/features/notifications/lib/send-account-warning.ts`:**

Extend the signature and add debounce + job_logs insert.

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
// keep existing imports (Resend client, React, AccountWarningEmail) intact

type WarningStatus = "warning" | "banned" | "needs_reconnect" | "captcha_required"
type Platform = "reddit" | "linkedin"

type WarningOpts = {
  platform?: Platform
  supabase?: SupabaseClient
  userId?: string
  accountId?: string
}

export async function sendAccountWarning(
  to: string,
  accountHandle: string,
  status: WarningStatus,
  opts?: WarningOpts,
): Promise<void> {
  // 24h debounce — skip if a recent account_warning_email job_log exists for this account.
  if (opts?.supabase && opts.accountId) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await opts.supabase
      .from("job_logs")
      .select("id")
      .eq("job_type", "account_warning_email")
      .filter("metadata->>account_id", "eq", opts.accountId)
      .gte("finished_at", since)
      .limit(1)
    if (recent && recent.length > 0) {
      return // debounced — already sent within 24h
    }
  }

  const platform = opts?.platform ?? "reddit"
  const subject = renderSubject(status, accountHandle, platform)

  // Existing Resend dispatch — extend to pass status + platform + handle to the email component.
  // (preserve existing await render(...) + resend.emails.send(...) shape; only change the props passed)
  // Pseudo:
  //   const html = await render(<AccountWarningEmail status={status} accountHandle={accountHandle} platform={platform} />)
  //   await resend.emails.send({ to, subject, html })

  // After successful Resend send, log to job_logs for the debounce dedup.
  if (opts?.supabase && opts.userId && opts.accountId) {
    await opts.supabase.from("job_logs").insert({
      job_type: "account_warning_email",
      status: "completed",
      user_id: opts.userId,
      finished_at: new Date().toISOString(),
      metadata: { account_id: opts.accountId, status },
    })
  }
}

function renderSubject(status: WarningStatus, handle: string, platform: Platform): string {
  const platformLabel = platform === "reddit" ? "Reddit" : "LinkedIn"
  const handlePrefixed = platform === "reddit" ? `u/${handle}` : handle
  switch (status) {
    case "banned":
      return `Your ${platformLabel} account ${handlePrefixed} was suspended`
    case "needs_reconnect":
      return `Reconnect needed for ${handlePrefixed}`
    case "captcha_required":
      return `Captcha is blocking ${handlePrefixed} — quick fix`
    case "warning":
    default:
      return `Heads up — ${handlePrefixed} is showing problems`
  }
}
```

Keep the existing Resend send call shape — only the React component's props expand (Task File B).

**File B — `src/features/notifications/emails/account-warning.tsx`:**

Replace status ternaries with a `STATUS_COPY: Record<WarningStatus, { headline, body }>` map. Plain text bodies per UI-SPEC §Email Copy:

```ts
import * as React from "react"

type WarningStatus = "warning" | "banned" | "needs_reconnect" | "captcha_required"
type Platform = "reddit" | "linkedin"

type Props = {
  accountHandle: string
  status: WarningStatus
  platform?: Platform
}

const DASHBOARD_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://repco.ai") + "/accounts"

const STATUS_COPY: Record<WarningStatus, { headline: (h: string, p: string) => string; body: (h: string, p: string) => string; cta: string }> = {
  banned: {
    headline: (h, p) => `Your ${p} account ${h} was suspended`,
    body: (h, p) => `Heads up — ${h} was suspended on ${p} and we've stopped sending actions through it.\n\nIf this is a mistake, you can appeal directly with ${p}. Otherwise, connect a different account to keep your campaigns running.`,
    cta: "View account",
  },
  needs_reconnect: {
    headline: (h) => `Reconnect needed for ${h}`,
    body: (h) => `${h} got logged out and we can't recover the session automatically. Open your dashboard and click Reconnect to sign back in — takes about a minute.`,
    cta: "Reconnect",
  },
  captcha_required: {
    headline: (h, p) => `Captcha is blocking ${h} — quick fix`,
    body: (h, p) => `${p} is showing a captcha for ${h}, so we've paused its actions. Open your dashboard and click Reconnect to solve the captcha in the cloud browser.`,
    cta: "Fix it",
  },
  warning: {
    headline: (h) => `Heads up — ${h} is showing problems`,
    body: (h) => `Recent failures on ${h} — we're slowing down outreach to protect the account.`,
    cta: "View account",
  },
}

export function AccountWarningEmail({ accountHandle, status, platform = "reddit" }: Props) {
  const platformLabel = platform === "reddit" ? "Reddit" : "LinkedIn"
  const handleDisplay = platform === "reddit" ? `u/${accountHandle}` : accountHandle
  const copy = STATUS_COPY[status]
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>{copy.headline(handleDisplay, platformLabel)}</h2>
      <p style={{ fontSize: 14, whiteSpace: "pre-line" }}>{copy.body(handleDisplay, platformLabel)}</p>
      <p style={{ fontSize: 14 }}>
        <a href={DASHBOARD_URL}>{copy.cta} →</a>
      </p>
    </div>
  )
}

export default AccountWarningEmail
```

Preserve any existing default export shape that `send-account-warning.ts` depends on. If the current file uses different exports (e.g. named only), adjust accordingly while keeping all 4 status branches in the STATUS_COPY map.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const a=fs.readFileSync('src/features/notifications/lib/send-account-warning.ts','utf8');const b=fs.readFileSync('src/features/notifications/emails/account-warning.tsx','utf8');const checksA=[/\"warning\" \| \"banned\" \| \"needs_reconnect\" \| \"captcha_required\"/, /platform\?: Platform/, /job_type.*account_warning_email/, /metadata->>account_id/, /24 \* 60 \* 60 \* 1000/, /metadata: \{ account_id: opts\.accountId, status \}/];const checksB=[/STATUS_COPY/, /needs_reconnect:\s*\{/, /captcha_required:\s*\{/, /banned:\s*\{/, /warning:\s*\{/];const missing=[...checksA.filter(r=>!r.test(a)).map(r=>'A:'+r),...checksB.filter(r=>!r.test(b)).map(r=>'B:'+r)];if(missing.length){console.error('MISSING',missing);process.exit(1);}console.log('OK');" && pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `sendAccountWarning` signature accepts 4-value status union + opts (`platform`, `supabase`, `userId`, `accountId`)
    - 24h debounce query uses `job_type='account_warning_email'` AND `metadata->>account_id=$accountId` AND `finished_at >= now()-24h`
    - On debounce hit, function returns without sending email
    - After successful send, inserts `job_logs` row with `job_type='account_warning_email'`, `metadata.account_id` (string), `metadata.status`
    - `account-warning.tsx` `STATUS_COPY` Record contains all 4 statuses with subject + body + cta
    - Subject lines match UI-SPEC §Email Copy verbatim (sentence case, no exclamation marks)
    - `pnpm typecheck` exits 0
  </acceptance_criteria>
  <done>Helper + template support all 4 statuses; debounce wired to job_logs; types compile.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Worker → Anthropic API | screenshot bytes leave our infra; potentially contains PII (Reddit DM previews, LinkedIn handles) |
| Email channel → user inbox | account state alerts may include handle/platform; no credentials |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-18-03-01 | Information Disclosure | Screenshot sent to Anthropic | accept | Existing CU executor already sends screenshots (Phase 3+); detector adds 1 more per action. CLAUDE.md §Architecture treats Anthropic as trusted vendor. No PII reduction beyond what executor already does. |
| T-18-03-02 | Tampering | Detector verdict spoofed by Anthropic compromise | accept | Out-of-scope for application-layer mitigation. Detector failure mode (all-false on error) means a compromised vendor surfaces as elevated bot detection coverage gaps, not false flips. |
| T-18-03-03 | DoS | Detector cost runaway from per-action $0.0017 calls | mitigate | Per RESEARCH §4 cost is bounded ≤100 actions/day × $0.0017 = $0.17/day at v1.2 scale. Telemetry assertion logs `cu.detect_ban_state.cost_usd` per call so spikes are visible. |
| T-18-03-04 | Repudiation | Email sent without audit | mitigate | Every successful send writes a `job_logs` row with `job_type='account_warning_email'`, `metadata.account_id`, `metadata.status`, `finished_at`. Same row drives the 24h debounce. |
| T-18-03-05 | Information Disclosure | Email contains handle in subject line | accept | Subject lines per UI-SPEC contain `u/{handle}` or `{name}`. User chose to add the account; the handle is theirs. No PII beyond what the user provided. |
</threat_model>

<verification>
After all 5 tasks pass:

1. `pnpm typecheck && pnpm lint` exits 0 from project root
2. `pnpm vitest run` (default suite, no INTEGRATION) exits 0; covers V-15, V-18 partial
3. `INTEGRATION=1 pnpm vitest run src/lib/computer-use/detect-ban-state.test.ts` runs V-11–V-14 against real API (cost ≤ $0.01 per full run)
4. Hand-verification on dev branch via `pnpm dev --port 3001`:
   - Trigger an action against a dev account → worker.ts post-CU detector logs verdict in Axiom
   - Force an Anthropic API failure (invalid key) → detector returns all-false, no health_status change (L-3 assertion)
   - Set `detect_ban_state` to return `{captcha:true}` via fixture-fed harness → worker writes `health_status='captcha_required'`, sends email; second action within 24h does NOT send a duplicate email
5. Email snapshot check via React Email preview (V-19)
</verification>

<success_criteria>
- BPRX-09 backend: Haiku detect_ban_state + status flips + email alert pipeline complete
- Email debounced 24h with platform-aware copy
- All detector + email tests green
- Fixture tests gated behind INTEGRATION=1 (skip cleanly when unset)
- UI surface (banner, account-card Reconnect, attemptReconnect) ships in Plan 04 — independent of this plan
</success_criteria>

<output>
After completion, create `.planning/phases/18-cookies-persistence-preflight-ban-detection/18-03-SUMMARY.md` recording:
- Test pass/skip counts (default suite vs INTEGRATION=1 suite)
- V-IDs covered automatically vs deferred to manual QA (V-04, V-05, V-06, V-07, V-10, V-16, V-17, V-26-real-DB)
- Whether user uploaded all 4 fixture PNGs (or `skip-fixtures` was selected) — if skipped, V-11–V-14 in manual QA queue
- Per-action detector cost telemetry observed during dev hand-test
- Any drift from UI-SPEC (color/copy/spacing) that needed adjustment
</output>
