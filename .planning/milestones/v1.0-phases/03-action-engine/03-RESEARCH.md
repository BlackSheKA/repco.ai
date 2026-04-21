# Phase 3: Action Engine - Research

**Researched:** 2026-04-17
**Domain:** Browser automation, AI computer use, action queue processing, anti-ban systems
**Confidence:** MEDIUM

## Summary

Phase 3 builds the action execution pipeline: user approves a DM draft in the approval queue, which triggers a chain of DB Webhook -> Vercel Function -> GoLogin Cloud -> Playwright CDP -> Claude Haiku Computer Use -> screenshot verification. This is the highest technical risk phase in the entire project, combining three external services (GoLogin API, Anthropic Computer Use API, Supabase DB Webhooks) with anti-ban behavioral patterns.

Key technical findings: (1) GoLogin Cloud provides a simple WebSocket CDP endpoint that Playwright connects to with a single `connectOverCDP()` call -- no local browser binaries needed, which is ideal for Vercel serverless. (2) Anthropic Computer Use requires the `computer-use-2025-01-24` beta header for Haiku 4.5, with a specific tool schema and an agent loop pattern. (3) Vercel Pro with Fluid Compute supports up to 800s timeout (not the 60s stated in the PRD), giving ample room for multi-step CU actions. (4) The `action_status_type` enum needs an `expired` value added via migration.

**Primary recommendation:** Use `playwright-core` (no bundled browsers) connecting to GoLogin Cloud via CDP WebSocket. Implement the Haiku CU agent loop in TypeScript with a max 15-step cap and 3-identical-screenshot stuck detection. Store screenshots in Supabase Storage. Use Supabase DB Webhook on `actions` table UPDATE to trigger `/api/webhooks/actions` Vercel Function.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Approval queue: stacked cards on main dashboard (not separate route), same visual language as signal cards
- Each card shows: post excerpt, intent score (flame), suggested angle, DM draft, action buttons (Approve, Edit inline, Reject, Regenerate)
- Inline editing: textarea directly in card, no modal
- Regenerate: asks Claude Sonnet for fresh draft with different angle
- 12-hour expiry: cards silently disappear, no countdown timer shown
- Sorted by recency, newest first
- DM generation: Claude Sonnet 4.6, max 3 sentences, no links in first message, references specific post
- Quality control: automated rules only (no second Sonnet call) -- reject if >3 sentences, contains URL, mentions price/discount, doesn't reference original post. On QC failure: auto-regenerate once; if second attempt fails, drop silently
- Voice: casual, helpful, no hard sell (default until Phase 5 onboarding adds voice config)
- GoLogin profiles via API, all Cloud-only, no local GoLogin desktop app
- User logs into Reddit via GoLogin web dashboard, repco auto-verifies session via headless Playwright
- Account health dashboard: dedicated /accounts route with card per account showing health badge, warmup progress, daily limits
- 7-day progressive warmup: days 1-3 browse, days 4-5 likes+follows, day 6-7 public reply, day 8+ DM
- Warmup skippable with confirmation dialog

### Claude's Discretion
- GoLogin API integration details (profile creation params, session management)
- Playwright CDP connection strategy and adapter pattern for GoLogin compatibility drift
- Haiku CU step execution logic (navigation sequences for Reddit DM, like, follow actions)
- Stuck detection implementation (3 identical screenshots comparison)
- Screenshot storage strategy (Supabase Storage vs external)
- DB Webhook -> Vercel Function trigger configuration
- FOR UPDATE SKIP LOCKED implementation for atomic action claiming
- Behavioral noise patterns (scroll, read, like on unrelated content)
- Random delay distribution (mean 90s, std 60s, min 15s)
- Action timing within timezone active hours
- Target isolation enforcement (no two accounts contact same prospect)
- Exact warmup automation sequences

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACTN-01 | System creates engage actions (like, follow) with auto-approved status when user clicks Contact | Action creation server action + auto-approve flow |
| ACTN-02 | System generates DM draft via Claude Sonnet 4.6 (max 3 sentences, references specific post, no link) | Anthropic SDK DM generation pattern |
| ACTN-03 | System runs quality control pass on generated DM | Automated rule-based QC (no AI call) |
| ACTN-04 | DM action appears in approval queue with status pending_approval | Supabase Realtime subscription pattern |
| ACTN-05 | System executes approved actions via DB Webhook -> Vercel Function -> GoLogin Cloud -> Playwright CDP -> Haiku CU | Full pipeline architecture documented |
| ACTN-06 | System uses FOR UPDATE SKIP LOCKED for atomic action claiming | PostgreSQL queue pattern documented |
| ACTN-07 | System takes screenshot after action execution for verification | Supabase Storage upload from serverless |
| ACTN-08 | System limits Haiku CU to max 15 steps with stuck detection (3 identical screenshots = abort) | CU agent loop with step counter + image hash comparison |
| ACTN-09 | System enforces daily action limits per account (DM: 8, engage: 20, public reply: 5) | action_counts table with date-based tracking |
| ACTN-10 | Action expires after 12h if not approved (CONTEXT.md overrides PRD 4h) | Expiry cron + `expired` status enum migration |
| APRV-01 | User can view pending DM drafts with post context, intent score, suggested angle | Approval queue UI from UI-SPEC |
| APRV-02 | User can approve a DM draft with one click | Server action + DB Webhook trigger |
| APRV-03 | User can edit a DM draft before approving | Inline textarea edit pattern |
| APRV-04 | User can reject a DM draft | Server action with status update |
| ABAN-01 | Each social account uses dedicated GoLogin Cloud profile with unique fingerprint and built-in proxy | GoLogin API profile creation with proxy |
| ABAN-02 | System enforces 7-day progressive warmup | Warmup cron + warmup_day tracking |
| ABAN-03 | System adds random delays between actions (mean 90s, std 60s, min 15s) | Gaussian delay with floor clamping |
| ABAN-04 | System generates behavioral noise: 60% scroll, read, like on unrelated content | Noise action sequences via CU |
| ABAN-05 | System varies action timing within user timezone active hours | Timezone-aware scheduling |
| ABAN-06 | System ensures no two accounts contact same prospect (target isolation) | DB constraint + prospect.assigned_account_id |
| ABAN-07 | System tracks account health: healthy, warning (auto-cooldown 48h), cooldown, banned | Health state machine + cron |
| ACCT-01 | User can view health status and warmup progress for each connected social account | /accounts page UI |
| ACCT-02 | User can see daily action limits and remaining capacity per account | action_counts query + UI |
| ACCT-03 | User can assign accounts to signal sources | Account assignment UI |
| ACCT-04 | System automatically manages GoLogin profiles (create, open, close) | GoLogin API adapter |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright-core` | 1.59.1 | CDP connection to GoLogin Cloud browser | Lightweight -- no bundled browsers, connects via WebSocket to remote Chrome. Works in Vercel serverless |
| `@anthropic-ai/sdk` | 0.90.0 | Claude API for DM generation (Sonnet 4.6) + Computer Use (Haiku 4.5) | Already in project dependencies |
| `gologin` | 2.2.8 | GoLogin API SDK for profile CRUD and cloud launch | Official SDK, handles auth and profile management |
| `@supabase/supabase-js` | 2.103.3 | DB operations, Realtime subscriptions, Storage uploads | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | latest | Screenshot image comparison for stuck detection | Compare screenshots by hashing/SSIM for 3-identical-screenshot abort |
| `pixelmatch` | latest | Pixel-level screenshot comparison | Alternative to sharp for stuck detection -- simpler API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `playwright-core` (CDP only) | Full `playwright` package | Full package is 280MB+, too large for Vercel serverless. `playwright-core` is lightweight, connects via CDP |
| `gologin` npm package | Direct REST API calls | SDK handles auth token management, but wraps Puppeteer internally. May only need REST calls + `playwright-core` for CDP |
| `sharp` for stuck detection | Simple base64 string comparison | Sharp gives proper image similarity; base64 comparison works if screenshots are pixel-identical |
| Supabase Storage | Vercel Blob | Supabase Storage is already in the stack, no new service needed |

**Installation:**
```bash
pnpm add playwright-core gologin
```

**Note on `gologin` package:** The npm `gologin` package wraps Puppeteer. For this project, we may only need the GoLogin REST API directly (profile CRUD, cloud launch) and connect via `playwright-core` CDP. Evaluate whether to use the SDK or raw REST calls to avoid Puppeteer dependency bloat.

**Version verification:** `playwright-core@1.59.1`, `@anthropic-ai/sdk@0.90.0` (already installed), `gologin@2.2.8` all verified against npm registry 2026-04-17.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── features/
│   ├── actions/
│   │   ├── actions/              # Server actions (approve, reject, regenerate, create-actions)
│   │   ├── components/           # ApprovalQueue, ApprovalCard, DMDraftEditor
│   │   └── lib/                  # DM generation, QC rules, action helpers
│   └── accounts/
│       ├── actions/              # Server actions (connect, skip-warmup, assign)
│       ├── components/           # AccountCard, WarmupProgress, HealthBadge, ConnectionFlow
│       └── lib/                  # GoLogin adapter, health state machine
├── lib/
│   ├── gologin/
│   │   ├── client.ts             # GoLogin REST API client (profile CRUD, cloud launch)
│   │   └── adapter.ts            # CDP connection adapter (wraps compatibility drift)
│   ├── computer-use/
│   │   ├── executor.ts           # Haiku CU agent loop (max 15 steps, stuck detection)
│   │   ├── actions/              # Reddit-specific CU action prompts (dm, like, follow)
│   │   └── screenshot.ts         # Screenshot capture, comparison, storage
│   └── action-worker/
│       ├── worker.ts             # Main action execution pipeline
│       ├── claim.ts              # FOR UPDATE SKIP LOCKED atomic claiming
│       └── limits.ts             # Daily limit checking + enforcement
├── app/
│   ├── (app)/
│   │   └── accounts/
│   │       └── page.tsx          # Account management page
│   └── api/
│       ├── webhooks/
│       │   └── actions/
│       │       └── route.ts      # DB Webhook handler (action execution)
│       └── cron/
│           ├── warmup/
│           │   └── route.ts      # Warmup automation cron
│           └── expire-actions/
│               └── route.ts      # Action expiry cron
```

### Pattern 1: GoLogin CDP Adapter
**What:** Wrapper around GoLogin Cloud connection that isolates Playwright from GoLogin API drift.
**When to use:** Every browser automation interaction.
**Example:**
```typescript
// src/lib/gologin/adapter.ts
import { chromium } from "playwright-core"

const GOLOGIN_CLOUD_URL = "https://cloudbrowser.gologin.com/connect"

export async function connectToProfile(profileId: string) {
  const token = process.env.GOLOGIN_API_TOKEN!
  const wsUrl = `${GOLOGIN_CLOUD_URL}?token=${token}&profile=${profileId}`
  
  const browser = await chromium.connectOverCDP(wsUrl)
  const context = browser.contexts()[0] // GoLogin provides pre-configured context
  const page = context?.pages()[0] ?? await context.newPage()
  
  return { browser, context, page }
}

export async function disconnectProfile(browser: Browser) {
  await browser.close()
}
```

### Pattern 2: Haiku CU Agent Loop
**What:** Iterative loop calling Claude Haiku with computer use tool, executing actions on GoLogin browser, returning screenshots.
**When to use:** Every action execution (DM, like, follow).
**Example:**
```typescript
// src/lib/computer-use/executor.ts
import Anthropic from "@anthropic-ai/sdk"
import type { Page } from "playwright-core"

const MAX_STEPS = 15
const BETA_HEADER = "computer-use-2025-01-24" // For Haiku 4.5

interface CUResult {
  success: boolean
  steps: number
  screenshots: string[]
  error?: string
}

export async function executeCUAction(
  page: Page,
  prompt: string,
): Promise<CUResult> {
  const client = new Anthropic()
  const screenshots: string[] = []
  let steps = 0

  // Take initial screenshot
  const initialScreenshot = await captureScreenshot(page)
  screenshots.push(initialScreenshot)

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: initialScreenshot } },
        { type: "text", text: prompt },
      ],
    },
  ]

  while (steps < MAX_STEPS) {
    const response = await client.beta.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      tools: [
        {
          type: "computer_20250124",
          name: "computer",
          display_width_px: 1024,
          display_height_px: 768,
        },
      ],
      messages,
      betas: [BETA_HEADER],
    })

    // Process tool use blocks
    const toolUses = response.content.filter(b => b.type === "tool_use")
    if (toolUses.length === 0) break // Task complete

    const toolResults = []
    for (const toolUse of toolUses) {
      steps++
      const result = await executeComputerAction(page, toolUse.input)
      const screenshot = await captureScreenshot(page)
      screenshots.push(screenshot)

      // Stuck detection: compare last 3 screenshots
      if (isStuck(screenshots)) {
        return { success: false, steps, screenshots, error: "Stuck: 3 identical screenshots" }
      }

      toolResults.push({
        type: "tool_result" as const,
        tool_use_id: toolUse.id,
        content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: screenshot } }],
      })
    }

    messages.push({ role: "assistant", content: response.content })
    messages.push({ role: "user", content: toolResults })
  }

  return { success: steps < MAX_STEPS, steps, screenshots }
}
```

### Pattern 3: FOR UPDATE SKIP LOCKED Action Claiming
**What:** Atomic action claiming preventing duplicate execution across concurrent Vercel Function invocations.
**When to use:** Action worker entry point.
**Example:**
```typescript
// src/lib/action-worker/claim.ts
export async function claimAction(supabase: SupabaseClient, actionId: string) {
  // Use raw SQL via RPC for SKIP LOCKED (not available via PostgREST)
  const { data, error } = await supabase.rpc("claim_action", {
    p_action_id: actionId,
  })
  return { data, error }
}

// SQL function (migration):
// CREATE OR REPLACE FUNCTION claim_action(p_action_id uuid)
// RETURNS actions AS $$
//   UPDATE actions
//   SET status = 'executing', executed_at = now()
//   WHERE id = (
//     SELECT id FROM actions
//     WHERE id = p_action_id
//     AND status = 'approved'
//     FOR UPDATE SKIP LOCKED
//   )
//   RETURNING *;
// $$ LANGUAGE sql;
```

### Pattern 4: DB Webhook -> Vercel Function
**What:** Supabase Database Webhook fires on `actions` UPDATE where status changes to `approved`, triggering the action worker endpoint.
**When to use:** Event-driven action execution.
**Configuration:**
```sql
-- In Supabase Dashboard: Database > Webhooks > Create
-- Table: actions
-- Events: UPDATE
-- Endpoint: https://repco.ai/api/webhooks/actions
-- Headers: { "Authorization": "Bearer ${WEBHOOK_SECRET}" }
```

### Anti-Patterns to Avoid
- **Running full Playwright in serverless:** Never install full `playwright` with browsers. Use `playwright-core` + remote CDP only.
- **Polling for approved actions:** Never poll. Use DB Webhooks for event-driven execution.
- **Storing GoLogin API token client-side:** Token must be server-only environment variable.
- **Skipping the adapter pattern for GoLogin:** GoLogin CDP compatibility drifts. Wrap in adapter from day 1.
- **Using PostgREST for SKIP LOCKED:** PostgREST doesn't support row-level locking. Use a Supabase RPC function.
- **Sending screenshots to Anthropic without resizing:** Scale to 1024x768 to stay within API constraints and reduce token cost.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser fingerprinting | Custom fingerprint rotation | GoLogin Cloud built-in fingerprints | Thousands of edge cases (canvas, WebGL, fonts, timezone) |
| Proxy management | Custom proxy rotation | GoLogin built-in proxy per profile | Proxy health, rotation, geolocation already handled |
| CAPTCHA solving | 2Captcha integration | GoLogin built-in CAPTCHA solver | Sufficient for Reddit CAPTCHAs at MVP scale |
| Screenshot comparison | Pixel-by-pixel comparison loop | Buffer comparison or `pixelmatch` | Edge cases with anti-aliasing, sub-pixel rendering |
| Action queue | Custom queue with Redis | PostgreSQL `FOR UPDATE SKIP LOCKED` | Supabase already provides PostgreSQL, no new service needed |
| Random delay distribution | Custom random number generator | Box-Muller transform for Gaussian | Well-known algorithm, handles mean/std/min correctly |

**Key insight:** GoLogin Cloud eliminates 80% of browser automation complexity (fingerprinting, proxy rotation, cookie persistence, CAPTCHA). The remaining 20% is the CDP connection and CU agent loop.

## Common Pitfalls

### Pitfall 1: GoLogin CDP Connection Failures
**What goes wrong:** GoLogin Cloud WebSocket URL format changes, or profile fails to start in cloud.
**Why it happens:** GoLogin is a third-party service with its own release cycle. CDP endpoints can drift.
**How to avoid:** Wrap all GoLogin interactions in an adapter pattern. Add retry logic (3 attempts, exponential backoff). Log connection failures with correlation IDs.
**Warning signs:** Connection timeouts, WebSocket handshake failures, empty browser contexts.

### Pitfall 2: Haiku CU Step Explosion
**What goes wrong:** Claude enters a loop, taking 50+ steps for a simple action, burning tokens and hitting timeouts.
**Why it happens:** Haiku has 56% benchmark confidence on complex navigation. It may click wrong elements, navigate away, and try to recover.
**How to avoid:** Hard cap at 15 steps. Stuck detection after 3 identical screenshots. Provide very specific, step-by-step prompts (not open-ended "send a DM"). Include example screenshots of expected UI states.
**Warning signs:** Step count consistently > 10 for simple actions, high token costs per action.

### Pitfall 3: Vercel Function Cold Start + GoLogin Launch = Timeout
**What goes wrong:** Cold start (2-5s) + GoLogin profile launch (5-15s) + CU steps (5s each x 10) = 60-80s total.
**Why it happens:** Multiple sequential network calls in a serverless function.
**How to avoid:** Vercel Pro with Fluid Compute gives 800s max timeout (not 60s as PRD states). Set `maxDuration` to 300 in route config. This is not a blocking concern for MVP.
**Warning signs:** p95 duration approaching configured timeout.

### Pitfall 4: DB Webhook Payload Does Not Include Old Row Values
**What goes wrong:** Webhook fires on every UPDATE to `actions` table, not just status changes to `approved`.
**Why it happens:** Supabase DB Webhooks fire on all table events matching the type (INSERT/UPDATE/DELETE) without column-level filtering.
**How to avoid:** In the webhook handler, check that `new_record.status === 'approved'` and `old_record.status !== 'approved'` before processing. Add early return for irrelevant updates.
**Warning signs:** Webhook handler executing for reject/expire/edit operations.

### Pitfall 5: Missing `expired` Status in Enum
**What goes wrong:** Cannot set action status to `expired` because the enum doesn't include it.
**Why it happens:** Original schema defined `action_status_type` without `expired` value.
**How to avoid:** Add migration: `ALTER TYPE action_status_type ADD VALUE 'expired';`
**Warning signs:** Database error on expiry cron.

### Pitfall 6: Target Isolation Race Condition
**What goes wrong:** Two accounts simultaneously assigned to the same prospect.
**Why it happens:** No database constraint preventing it.
**How to avoid:** Add a UNIQUE constraint on `prospects(handle, user_id)` for dedup, and enforce target isolation via `assigned_account_id` -- check before assigning. Use a Supabase RPC function that atomically checks and assigns.
**Warning signs:** Same prospect receiving DMs from multiple accounts.

### Pitfall 7: Action Counts Not Atomic
**What goes wrong:** Two concurrent actions exceed daily limit because both read the count before either increments.
**Why it happens:** Non-atomic read-then-increment pattern.
**How to avoid:** Use `INSERT ... ON CONFLICT DO UPDATE SET dm_count = dm_count + 1` with a pre-check in the claiming RPC function. The claim function should atomically check limits AND claim the action.
**Warning signs:** Daily counts exceeding configured limits.

## Code Examples

### GoLogin Profile Creation via REST API
```typescript
// Source: GoLogin API docs (https://api.gologin.com/docs)
const GOLOGIN_API = "https://api.gologin.com"

export async function createGoLoginProfile(accountHandle: string) {
  const response = await fetch(`${GOLOGIN_API}/browser`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GOLOGIN_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `repco-${accountHandle}`,
      os: "win",
      navigator: { language: "en-US,en" },
      proxy: { mode: "gologin" }, // Use GoLogin built-in proxy
    }),
  })
  const profile = await response.json()
  return profile.id // Store as gologin_profile_id in social_accounts
}
```

### DM Generation with Claude Sonnet
```typescript
// Source: Anthropic SDK docs
import Anthropic from "@anthropic-ai/sdk"

export async function generateDM(
  postContent: string,
  productDescription: string,
  suggestedAngle: string,
): Promise<{ content: string; passed: boolean }> {
  const client = new Anthropic()
  
  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 300,
    system: `You are writing a Reddit DM on behalf of a product owner. Rules:
- Max 3 sentences
- No links or URLs
- No mentions of price, discount, or promotion
- Reference something specific from their post
- Casual, helpful tone -- no hard sell
- End with a question or soft CTA
- Do NOT start with "Hey, I saw your post"`,
    messages: [{
      role: "user",
      content: `Post: ${postContent}\n\nProduct: ${productDescription}\n\nAngle: ${suggestedAngle}\n\nWrite a DM.`,
    }],
  })
  
  const content = response.content[0].type === "text" ? response.content[0].text : ""
  
  // Quality control (automated rules, no AI call)
  const passed = runQualityControl(content, postContent)
  return { content, passed }
}

function runQualityControl(dm: string, originalPost: string): boolean {
  const sentences = dm.split(/[.!?]+/).filter(s => s.trim().length > 0)
  if (sentences.length > 3) return false
  if (/https?:\/\/|www\./i.test(dm)) return false
  if (/price|discount|promo|offer|deal|free trial/i.test(dm)) return false
  // Check post reference (simple heuristic)
  const postWords = originalPost.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  const hasReference = postWords.some(w => dm.toLowerCase().includes(w))
  if (!hasReference) return false
  return true
}
```

### Supabase Storage Screenshot Upload
```typescript
// Source: Supabase Storage docs
export async function uploadScreenshot(
  supabase: SupabaseClient,
  actionId: string,
  screenshotBase64: string,
  step: number,
): Promise<string | null> {
  const buffer = Buffer.from(screenshotBase64, "base64")
  const path = `actions/${actionId}/step-${step}.png`
  
  const { error } = await supabase.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    })
  
  if (error) return null
  
  const { data } = supabase.storage
    .from("screenshots")
    .getPublicUrl(path)
  
  return data.publicUrl
}
```

### Gaussian Random Delay
```typescript
// Box-Muller transform for normally distributed delays
export function randomDelay(mean = 90, std = 60, min = 15): number {
  // Box-Muller transform
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const delay = Math.max(min, Math.round(mean + z * std))
  return delay // seconds
}

export function sleep(seconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000))
}
```

### Webhook Handler Route
```typescript
// src/app/api/webhooks/actions/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const maxDuration = 300 // 5 minutes for Vercel Pro

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const payload = await req.json()
  const { type, record: newRecord, old_record: oldRecord } = payload
  
  // Only process status changes to 'approved'
  if (type !== "UPDATE" || newRecord.status !== "approved") {
    return NextResponse.json({ skipped: true })
  }
  if (oldRecord?.status === "approved") {
    return NextResponse.json({ skipped: true }) // Already approved
  }
  
  // Execute action pipeline...
  // 1. Claim action (FOR UPDATE SKIP LOCKED)
  // 2. Check daily limits
  // 3. Connect GoLogin profile
  // 4. Execute CU action
  // 5. Upload screenshot
  // 6. Update status
  // 7. Log to job_logs
  
  return NextResponse.json({ success: true })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Playwright selectors (CSS/XPath) | Claude Computer Use (vision-based) | Oct 2024 | Resilient to UI redesigns, undetectable as automation |
| Local browser + Bright Data proxy | GoLogin Cloud + built-in proxy | 2024 | No local Chrome needed, works in serverless |
| Polling for job queue | DB Webhook event-driven | Supabase 2024 | Zero idle compute, instant response |
| Vercel 60s timeout | Vercel Fluid Compute 800s | 2025 | No need for Railway fallback at MVP scale |
| `computer-use-2024-10-22` beta | `computer-use-2025-01-24` beta (Haiku 4.5) | Jan 2025 | New actions: scroll, wait, hold_key, triple_click |

**Deprecated/outdated:**
- PRD states "Vercel Pro 60s timeout" -- this is outdated. Fluid Compute (enabled by default) gives 300s default, 800s max on Pro.
- PRD mentions `computer-use-2024-10-22` -- current beta for Haiku 4.5 is `computer-use-2025-01-24`. For Sonnet 4.6/Opus: `computer-use-2025-11-24`.

## Open Questions

1. **GoLogin npm package vs raw REST API**
   - What we know: The `gologin` npm package (2.2.8) wraps Puppeteer internally. We use Playwright.
   - What's unclear: Whether the SDK's profile management functions work independently of its Puppeteer integration, or if we should just call the REST API directly.
   - Recommendation: Use raw REST API for profile CRUD (`fetch` calls). Use `playwright-core` `connectOverCDP()` for browser connection. Skip the `gologin` npm package to avoid Puppeteer dependency.

2. **Supabase DB Webhook payload format**
   - What we know: Webhooks fire as POST with JSON payload containing `type`, `record`, `old_record`, table info.
   - What's unclear: Exact format of the payload for UPDATE events -- whether `old_record` reliably contains the previous state.
   - Recommendation: Verify payload format in local Supabase dev. Add fallback: if `old_record` is null, check the action status independently.

3. **Supabase Storage bucket configuration**
   - What we know: Need a `screenshots` bucket for action verification screenshots.
   - What's unclear: Whether to use public or private bucket. Screenshots contain Reddit UI.
   - Recommendation: Use a private bucket with signed URLs (user's own action screenshots, not public data).

4. **Reddit DM UI Navigation Sequence**
   - What we know: Haiku CU needs to navigate Reddit's chat/DM interface.
   - What's unclear: Reddit's DM UI has changed multiple times. CU's reliability on the current Reddit chat interface.
   - Recommendation: Build and test specific CU prompts for Reddit DM flow. Include fallback prompts. Log all CU sessions for debugging.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (exists, configured with `@/` alias) |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACTN-02 | DM generation produces valid output | unit | `pnpm vitest run src/features/actions/lib/__tests__/dm-generation.test.ts -t "generates"` | Wave 0 |
| ACTN-03 | QC rules reject invalid DMs | unit | `pnpm vitest run src/features/actions/lib/__tests__/quality-control.test.ts` | Wave 0 |
| ACTN-06 | claim_action RPC returns correct row | integration | `pnpm vitest run src/lib/action-worker/__tests__/claim.test.ts` | Wave 0 |
| ACTN-08 | Stuck detection fires at 3 identical screenshots | unit | `pnpm vitest run src/lib/computer-use/__tests__/stuck-detection.test.ts` | Wave 0 |
| ACTN-09 | Daily limits enforced correctly | unit | `pnpm vitest run src/lib/action-worker/__tests__/limits.test.ts` | Wave 0 |
| ACTN-10 | Expiry cron marks old actions expired | unit | `pnpm vitest run src/lib/action-worker/__tests__/expiry.test.ts` | Wave 0 |
| ABAN-03 | Random delay distribution matches spec | unit | `pnpm vitest run src/lib/action-worker/__tests__/delays.test.ts` | Wave 0 |
| ABAN-06 | Target isolation prevents double contact | unit | `pnpm vitest run src/lib/action-worker/__tests__/target-isolation.test.ts` | Wave 0 |
| ACTN-05 | Full pipeline executes approved action | integration | Manual -- requires GoLogin + Anthropic API keys | manual-only |
| APRV-01-04 | Approval queue renders and responds | integration | Manual -- UI interaction test | manual-only |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/features/actions/lib/__tests__/dm-generation.test.ts` -- covers ACTN-02
- [ ] `src/features/actions/lib/__tests__/quality-control.test.ts` -- covers ACTN-03
- [ ] `src/lib/action-worker/__tests__/claim.test.ts` -- covers ACTN-06
- [ ] `src/lib/computer-use/__tests__/stuck-detection.test.ts` -- covers ACTN-08
- [ ] `src/lib/action-worker/__tests__/limits.test.ts` -- covers ACTN-09
- [ ] `src/lib/action-worker/__tests__/expiry.test.ts` -- covers ACTN-10
- [ ] `src/lib/action-worker/__tests__/delays.test.ts` -- covers ABAN-03
- [ ] `src/lib/action-worker/__tests__/target-isolation.test.ts` -- covers ABAN-06

## Sources

### Primary (HIGH confidence)
- [Anthropic Computer Use Tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) -- beta headers, tool schema, agent loop pattern, limitations
- [GoLogin Cloud Browser docs](https://gologin.com/docs/api-reference/cloud-browser/getting-started) -- WebSocket CDP URL format, connection method
- [GoLogin API full docs](https://gologin.com/docs/llms-full.txt) -- profile CRUD, proxy config, rate limits (300-1200 req/min)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks) -- webhook setup, pg_net async behavior
- [Vercel Function Duration](https://vercel.com/docs/functions/configuring-functions/duration) -- Pro Fluid Compute: 300s default, 800s max

### Secondary (MEDIUM confidence)
- [PostgreSQL SKIP LOCKED patterns](https://www.inferable.ai/blog/posts/postgres-skip-locked) -- verified by multiple sources including Netdata, CYBERTEC
- [GoLogin Playwright integration](https://gologin.com/cloud-browser/playwright-and-puppeteer/) -- CDP connection examples

### Tertiary (LOW confidence)
- GoLogin npm package internals -- need to verify if REST API is sufficient without SDK
- Reddit DM UI navigation reliability with Haiku CU -- untested, requires experimentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified, versions confirmed via npm registry
- Architecture: MEDIUM -- pipeline pattern is sound but GoLogin + CU integration is untested in this specific combination
- Pitfalls: HIGH -- well-documented failure modes from GoLogin docs, Anthropic CU limitations, and PostgreSQL queue patterns
- Anti-ban system: MEDIUM -- patterns from PRD are reasonable but effectiveness against Reddit's detection is unverified

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (30 days -- GoLogin API and Anthropic CU are actively evolving)
