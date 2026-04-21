# Phase 4: Sequences + Reply Detection - Research

**Researched:** 2026-04-18
**Domain:** Follow-up scheduling, inbox detection via CU, transactional email (Resend), sequence state machines
**Confidence:** HIGH

## Summary

Phase 4 adds three subsystems on top of Phase 3's action engine: (1) a follow-up scheduler that creates day 3/7/14 follow-up actions with stop-on-reply logic, (2) a reply detection worker that checks Reddit DM inboxes every 2h via the existing GoLogin + Playwright + Haiku CU pipeline, and (3) transactional email notifications via Resend (reply alerts, daily digest, account warnings).

The core database schema (`actions`, `prospects`, `social_accounts`, `job_logs`) already supports most Phase 4 needs. The `actions` table has `action_type = 'followup_dm'` and `sequence_step` columns from the Phase 1 migration. The `prospects` table has `pipeline_status` with a `'replied'` enum value. The `job_type` enum includes `'reply_check'`. The main new pieces are: (a) a `cancelled` status for the action enum, (b) sequence tracking columns on the `prospects` table (auto_send, sequence metadata), (c) a user-level timezone column for daily digest scheduling, and (d) a `user_settings` table or columns for the auto-send toggle.

The biggest technical risk is reply detection -- navigating Reddit's DM inbox via Haiku CU is more complex than sending a DM (Phase 3). The inbox has multiple UI states (chat requests vs messages, old vs new chat UI) and the CU must read message content, identify the sender, and report it back. This requires carefully designed prompts and robust error handling.

**Primary recommendation:** Reuse Phase 3's GoLogin + Playwright + Haiku CU pipeline for inbox checks. Add Resend + React Email for notifications. Use a single daily cron for follow-up scheduling (checking all prospects with active sequences) and a separate 2h cron for inbox checks. Store sequence state on the `prospects` table with new columns rather than a separate table.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Default mode: each follow-up appears in the approval queue for user review before sending
- Auto-send toggle available: global setting (not per-prospect) that switches all follow-ups to auto-send without approval
- Follow-up angles per PRD: day 3 (feature/benefit), day 7 (value/insight), day 14 (low-pressure check-in)
- Follow-up DMs generated just-in-time when each step is due (not pre-generated upfront)
- Follow-up cards in approval queue have 24h expiry (longer than initial DM's 12h)
- Missed follow-up: skip and continue -- remaining follow-ups still fire on original schedule
- Quality control: same rules as Phase 3 DM generation (max 3 sentences, no links, must reference original post)
- When auto-send is enabled: follow-ups skip the approval queue entirely, log in terminal header as sent action
- Replies surface via: Sonner toast + terminal header event + dedicated reply card in Replies section on dashboard
- Reply card shows full thread: original DM (collapsed) + prospect reply (expanded) + prospect info + View on Reddit link
- When reply detected: all pending follow-ups cancelled immediately, prospect pipeline_status updated to replied
- Visual indicator on prospect record: "Sequence stopped -- reply received" badge
- Agent card transitions to Reply emotional state on new reply detection
- Reply pushed to dashboard via Supabase Realtime
- Dashboard warning banner after any failed inbox check
- Email alert sent after 3 consecutive inbox check failures
- Email provider: Resend
- Three email types: reply alert, daily digest, account warning
- All three use branded HTML templates (Resend React email) with repco branding: indigo accent, Inter font, logo
- Reply alert: minimal -- prospect handle, platform, View in repco CTA. No reply text in email. Sent within 10 min of detection
- Daily digest (8:00 user timezone): yesterday's signal count, top 1-3 signals, count of DMs pending approval, replies received
- Account warning email: account handle, new status, recommended action. Triggered immediately on status change
- All notifications on by default, no in-app settings page, no unsubscribe in V1
- Prospect card shows mini-timeline: sent DM -> FU1 (day 3) -> FU2 (day 7) -> FU3 (day 14)
- Stop sequence button on prospect timeline -- cancels all remaining follow-ups
- Auto-send toggle lives in a global Settings page (or monitoring config page)

### Claude's Discretion
- Follow-up scheduler cron implementation (timing, batch processing)
- Sequence state machine internals (DB schema for tracking sequence progress)
- Inbox navigation strategy for Haiku CU (how to find and read DM replies on Reddit)
- Reply-to-prospect matching logic
- Resend React email template layout details
- Daily digest timezone handling implementation
- Dashboard Replies section layout and positioning relative to intent feed and approval queue

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLLW-01 | System schedules follow-up 1 at day 3 (feature/benefit angle) if no reply detected | Follow-up scheduler cron + sequence state on prospects table |
| FLLW-02 | System schedules follow-up 2 at day 7 (value/insight angle) if no reply detected | Same cron, sequence_step tracking on actions table |
| FLLW-03 | System schedules follow-up 3 at day 14 (low-pressure check-in) if no reply detected | Same cron, final step in sequence |
| FLLW-04 | System stops all follow-ups immediately when any reply is detected | Reply detection worker cancels pending followup_dm actions |
| FLLW-05 | Each follow-up appears in approval queue for user review before sending | Reuses Phase 3 approval queue; auto-send toggle bypasses |
| RPLY-01 | System checks DM inboxes every 2h via GoLogin + Playwright CDP + Haiku CU | Reply detection cron reusing Phase 3 GoLogin/CU pipeline |
| RPLY-02 | System matches reply sender to prospect record and updates pipeline_status to replied | Prospect matching by handle + platform + user_id |
| RPLY-03 | System sends email notification to user when reply is received | Resend API with React Email template |
| RPLY-04 | System pushes reply event to dashboard via Supabase Realtime | Supabase Realtime on prospects table UPDATE (pipeline_status change) |
| NTFY-01 | User receives daily email digest with signal count, top signal, and pending DMs | Daily digest cron at 8:00 user timezone via Resend |
| NTFY-02 | User receives email notification when a prospect replies | Reply alert email via Resend (within 10 min) |
| NTFY-03 | User receives email alert when account is flagged (warning/banned) | Account warning email via Resend on health_status change |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `resend` | 6.12.0 | Transactional email sending API | Official SDK, simple API, excellent DX, supports React Email templates natively |
| `@react-email/components` | 1.0.12 | React components for building email templates | Official companion to Resend, renders to HTML email, supports all major clients |
| `date-fns` | 4.1.0 | Date manipulation for scheduling and timezone handling | Already in project dependencies |
| `date-fns-tz` | 3.2.0 | Timezone-aware date operations for daily digest scheduling | Companion to date-fns for IANA timezone conversion |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `playwright-core` | 1.59.1 | CDP connection for inbox checks | Reuse Phase 3 GoLogin adapter |
| `@anthropic-ai/sdk` | 0.90.0 | Haiku CU for inbox navigation | Reuse Phase 3 CU executor |
| `@supabase/supabase-js` | 2.103.3 | DB operations, Realtime subscriptions | All data access |
| `sonner` | 2.0.7 | Toast notifications for reply alerts | Dashboard notifications |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `resend` | `nodemailer` + SMTP | Resend is simpler, has React Email integration, better deliverability tracking. Nodemailer requires managing SMTP credentials and lacks built-in analytics |
| `@react-email/components` | Raw HTML email templates | React Email provides type-safe components, responsive layout primitives, and cross-client compatibility. Raw HTML emails are fragile and hard to maintain |
| `date-fns-tz` | Intl.DateTimeFormat + manual math | date-fns-tz handles DST transitions correctly; manual timezone math is error-prone |

**Installation:**
```bash
pnpm add resend @react-email/components date-fns-tz
```

**Version verification:** `resend@6.12.0`, `@react-email/components@1.0.12`, `date-fns-tz@3.2.0` all verified against npm registry 2026-04-18. `date-fns@4.1.0`, `playwright-core@1.59.1`, `@anthropic-ai/sdk@0.90.0` already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── features/
│   ├── sequences/
│   │   ├── actions/              # Server actions (stop-sequence, toggle-auto-send)
│   │   ├── components/           # SequenceTimeline, FollowUpTag, RepliesSection, ReplyCard
│   │   └── lib/                  # Sequence state, follow-up generation, types
│   └── notifications/
│       ├── lib/                  # Resend client, email sending functions
│       └── emails/               # React Email templates (reply-alert, daily-digest, account-warning)
├── app/
│   └── api/
│       └── cron/
│           ├── schedule-followups/
│           │   └── route.ts      # Daily cron: create due follow-up actions
│           ├── check-replies/
│           │   └── route.ts      # 2h cron: inbox check via GoLogin + CU
│           └── daily-digest/
│               └── route.ts      # Hourly cron: send digest to users whose 8:00 has arrived
```

### Pattern 1: Follow-up Scheduler Cron
**What:** A cron job (runs every hour or daily) that finds prospects with active sequences whose next follow-up is due, generates the follow-up DM, and creates it as a `followup_dm` action.
**When to use:** Scheduled follow-up creation.
**Example:**
```typescript
// src/app/api/cron/schedule-followups/route.ts
// Pattern: same cron auth + correlation ID + service role as zombie-recovery

// 1. Query prospects where:
//    - pipeline_status IN ('contacted') -- DM was sent
//    - sequence_stopped = false
//    - No pending/approved followup_dm actions exist for this prospect
// 2. For each prospect, check if next follow-up is due:
//    - Find the most recent completed DM/followup_dm action
//    - Calculate days since that action
//    - Determine next step: day 3 -> step 1, day 7 -> step 2, day 14 -> step 3
// 3. Generate follow-up DM via Claude Sonnet (same as Phase 3 DM generation)
// 4. Create action with:
//    - action_type: 'followup_dm'
//    - sequence_step: 1/2/3
//    - status: auto_send_enabled ? 'approved' : 'pending_approval'
//    - expires_at: now() + 24h
// 5. Log to job_logs
```

### Pattern 2: Reply Detection Cron
**What:** A cron job (every 2h) that opens each connected Reddit account's inbox via GoLogin + CU and reads new messages.
**When to use:** Automated inbox checking.
**Example:**
```typescript
// src/app/api/cron/check-replies/route.ts
// 1. Get all active social_accounts with platform = 'reddit'
// 2. For each account:
//    a. Connect to GoLogin profile (reuse adapter.ts)
//    b. Navigate to Reddit inbox/messages via Haiku CU
//    c. CU reads visible messages and returns structured data:
//       { messages: [{ sender: string, preview: string, timestamp: string }] }
//    d. Match senders against prospects table (handle + platform + user_id)
//    e. For matched prospects with pipeline_status != 'replied':
//       - Update pipeline_status to 'replied'
//       - Cancel all pending followup_dm actions for this prospect
//       - Store reply snippet in prospect record (new column: last_reply_snippet)
//       - Send reply alert email via Resend
//    f. Disconnect GoLogin profile
//    g. Log to job_logs with status + duration
// 3. Track consecutive failures per account for 3-failure email alert
```

### Pattern 3: Daily Digest Timezone Scheduling
**What:** A cron that runs hourly and sends the daily digest to users whose local time is 8:00.
**When to use:** Timezone-aware scheduled notifications.
**Example:**
```typescript
// Cron runs every hour at :00
// 1. Get current UTC hour
// 2. Calculate which timezone offsets make it 8:00 AM right now
//    e.g., if UTC is 13:00, then UTC-5 (EST) users get their digest
// 3. Query users whose timezone matches
// 4. For each user: fetch yesterday's stats, send digest via Resend
//
// Using date-fns-tz:
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

function isDigestTimeForUser(userTimezone: string): boolean {
  const now = new Date()
  const localHour = parseInt(formatInTimeZone(now, userTimezone, "H"))
  return localHour === 8
}
```

### Pattern 4: Sequence State on Prospects Table
**What:** Track sequence progress directly on the prospects table rather than a separate sequences table.
**When to use:** Simple 3-step fixed sequence (not configurable).
**Rationale:** The sequence is fixed (day 3/7/14), not user-customizable. A separate table adds JOIN overhead for a simple state machine. Columns on prospects keep queries simple.
```sql
-- New columns on prospects table:
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sequence_stopped boolean DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_snippet text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS replied_detected_at timestamptz;
```
The sequence step progress is derived from completed `followup_dm` actions in the `actions` table (query `actions WHERE prospect_id = X AND action_type = 'followup_dm' AND status = 'completed'`). No need to duplicate this on the prospects row.

### Pattern 5: Auto-Send Toggle Storage
**What:** Store the auto-send preference at the user level.
**When to use:** Global setting that affects all follow-ups for a user.
```sql
-- Option A: Column on users table (simpler, avoids new table)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_send_followups boolean DEFAULT false;

-- Option B: user_settings table (more extensible for future settings)
-- Overkill for a single boolean in V1
```
**Recommendation:** Column on `users` table. One boolean, one query. If Phase 5 needs more settings, migrate to a settings table then.

### Anti-Patterns to Avoid
- **Pre-generating all 3 follow-ups upfront:** CONTEXT.md explicitly says just-in-time generation for fresher context. Generate each follow-up only when its day arrives.
- **Separate sequences table for a fixed 3-step sequence:** Over-engineering. Use action records + prospect columns to track progress.
- **Polling for replies from client-side:** Replies come in via cron server-side. Push to client via Supabase Realtime.
- **Sending reply text in email:** CONTEXT.md explicitly says no reply text in email -- drive users back to the app.
- **Building custom email HTML strings:** Use React Email components for cross-client compatibility.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email sending | Custom SMTP integration | Resend SDK | Handles deliverability, SPF/DKIM, bounce tracking, rate limiting |
| Email templates | Raw HTML string concatenation | @react-email/components | Cross-client rendering, responsive layouts, type-safe props |
| Timezone scheduling | Manual UTC offset math | date-fns-tz `formatInTimeZone` | Handles DST transitions, IANA timezone database, leap seconds |
| Inbox navigation | Playwright selectors for Reddit DM UI | Haiku CU (Phase 3 pattern) | Reddit UI changes frequently; CU adapts visually |
| Action queue | Custom follow-up queue | Existing `actions` table with `followup_dm` type | Already has claiming, expiry, status tracking from Phase 3 |

**Key insight:** Phase 4's follow-up system is just Phase 3's action engine with scheduled creation instead of user-initiated creation. The entire approval/execution pipeline is reused.

## Common Pitfalls

### Pitfall 1: Reddit Inbox UI Complexity
**What goes wrong:** Haiku CU cannot reliably navigate Reddit's inbox because of multiple UI states (chat requests, message requests, old/new chat, different layouts for desktop/mobile).
**Why it happens:** Reddit has iterated on its messaging UI multiple times. The CU may encounter unexpected layouts.
**How to avoid:** Use a very specific CU prompt that tells Haiku to navigate to `https://www.reddit.com/message/inbox/` (old Reddit messages URL) which has a simpler, more stable layout than the new chat UI. Take a screenshot first, then decide navigation strategy. Add fallback URLs. Log all CU sessions.
**Warning signs:** High failure rate on inbox checks, CU step count consistently at max (15).

### Pitfall 2: Reply Matching False Positives/Negatives
**What goes wrong:** CU reads a message from u/someone but the handle doesn't match any prospect, or matches the wrong prospect.
**Why it happens:** Reddit handles are case-insensitive, display names differ from usernames, CU may misread characters.
**How to avoid:** Normalize handles to lowercase for matching. Match on (handle, platform, user_id) tuple. If CU returns a handle not found in prospects, log it as unmatched (don't create a fake prospect). Consider storing the Reddit conversation URL for more reliable matching.
**Warning signs:** Unmatched reply count growing, prospects stuck in 'contacted' despite replies.

### Pitfall 3: Daily Digest Timezone Edge Cases
**What goes wrong:** Users in half-hour or quarter-hour offsets (India UTC+5:30, Nepal UTC+5:45) never receive their digest, or receive it at the wrong time.
**Why it happens:** Hourly cron only catches whole-hour offsets.
**How to avoid:** When the hourly cron runs, check all users and use `formatInTimeZone` to get their local hour. Send to anyone whose local time is between 8:00 and 8:59. This catches all offsets within the hour window.
**Warning signs:** Users in IST or other half-hour zones reporting no digest.

### Pitfall 4: Race Condition Between Reply Detection and Follow-up Scheduler
**What goes wrong:** Follow-up scheduler creates a new follow-up action at the same time reply detection detects a reply, resulting in a follow-up being sent after the reply.
**Why it happens:** Two cron jobs running concurrently without coordination.
**How to avoid:** Reply detection cancels follow-ups first, then updates prospect status. Follow-up scheduler checks `pipeline_status != 'replied' AND sequence_stopped = false` before creating. Use database-level guard: the follow-up creation query should include `WHERE pipeline_status != 'replied'` in the prospect check.
**Warning signs:** Follow-up sent to a prospect who already replied.

### Pitfall 5: Missing `cancelled` Action Status
**What goes wrong:** Cannot cancel pending follow-ups because there is no `cancelled` status in the `action_status_type` enum.
**Why it happens:** Original enum has: pending_approval, approved, rejected, executing, completed, failed, expired. No `cancelled`.
**How to avoid:** Add migration: `ALTER TYPE action_status_type ADD VALUE IF NOT EXISTS 'cancelled';`
**Warning signs:** Using `rejected` for cancelled follow-ups conflates user rejections with system cancellations.

### Pitfall 6: Resend Rate Limits on Daily Digest
**What goes wrong:** Sending daily digests to many users simultaneously hits Resend's rate limits.
**Why it happens:** Resend free tier: 100 emails/day, 1 email/second. Paid tier varies.
**How to avoid:** Process users in batches with small delays between sends. Log failures and retry on next hourly run. For MVP scale (< 100 users), this is unlikely to be an issue.
**Warning signs:** 429 responses from Resend API.

### Pitfall 7: No User Timezone Column
**What goes wrong:** Cannot send daily digest at 8:00 user's local time because the `users` table has no timezone column.
**Why it happens:** Timezone is on `social_accounts` (per account), not on `users` (per user).
**How to avoid:** Add `timezone` column to `users` table. Default to 'UTC'. For V1, can infer from the user's first social account's timezone if not set.
**Warning signs:** All digests sent at 8:00 UTC regardless of user location.

## Code Examples

### Resend Email Sending
```typescript
// src/features/notifications/lib/resend-client.ts
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendReplyAlert(
  to: string,
  prospectHandle: string,
  platform: string,
) {
  const { data, error } = await resend.emails.send({
    from: "repco <notifications@repco.ai>",
    to,
    subject: `u/${prospectHandle} replied on ${platform}`,
    react: ReplyAlertEmail({ prospectHandle, platform }),
  })
  if (error) throw error
  return data
}
```

### React Email Template
```typescript
// src/features/notifications/emails/reply-alert.tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Text,
} from "@react-email/components"

interface ReplyAlertEmailProps {
  prospectHandle: string
  platform: string
}

export function ReplyAlertEmail({ prospectHandle, platform }: ReplyAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: "#FFFFFF", fontFamily: "Inter, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "32px 24px" }}>
          <Text style={{ fontSize: "28px", fontWeight: "bold", color: "#4338CA" }}>
            repco
          </Text>
          <Heading style={{ fontSize: "20px", fontWeight: 600, color: "#1C1917" }}>
            u/{prospectHandle} replied on {platform}
          </Heading>
          <Text style={{ fontSize: "16px", color: "#78716C" }}>
            View the conversation in your repco dashboard.
          </Text>
          <Section style={{ marginTop: "24px" }}>
            <Button
              href={`${process.env.NEXT_PUBLIC_SITE_URL}`}
              style={{
                backgroundColor: "#4338CA",
                color: "#EEF2FF",
                fontSize: "16px",
                fontWeight: 600,
                padding: "12px 24px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "block",
                textAlign: "center",
              }}
            >
              View in repco
            </Button>
          </Section>
          <Text style={{ fontSize: "14px", color: "#78716C", textAlign: "center", marginTop: "32px" }}>
            repco -- Your AI sales rep
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
```

### Follow-up Scheduler Query
```typescript
// Core query: find prospects whose next follow-up is due
const FOLLOW_UP_DAYS = [3, 7, 14] as const

async function findDueFollowUps(supabase: SupabaseClient) {
  // Get prospects with completed initial DMs and no pending follow-ups
  const { data: prospects } = await supabase
    .from("prospects")
    .select(`
      id, user_id, handle, platform, intent_signal_id,
      pipeline_status, sequence_stopped,
      actions!inner (
        id, action_type, status, sequence_step,
        executed_at, created_at
      )
    `)
    .eq("pipeline_status", "contacted")
    .eq("sequence_stopped", false)

  // Filter to prospects where the next follow-up day has arrived
  // and no pending/approved follow-up exists
  // ... (logic uses FOLLOW_UP_DAYS array and date arithmetic)
}
```

### Cancel Follow-ups on Reply
```typescript
// When a reply is detected for a prospect:
async function handleReplyDetected(
  supabase: SupabaseClient,
  prospectId: string,
  replySnippet: string,
) {
  // 1. Cancel all pending follow-ups
  await supabase
    .from("actions")
    .update({ status: "cancelled" })
    .eq("prospect_id", prospectId)
    .eq("action_type", "followup_dm")
    .in("status", ["pending_approval", "approved"])

  // 2. Update prospect
  await supabase
    .from("prospects")
    .update({
      pipeline_status: "replied",
      sequence_stopped: true,
      last_reply_snippet: replySnippet,
      replied_detected_at: new Date().toISOString(),
    })
    .eq("id", prospectId)

  // 3. Supabase Realtime will push the prospect UPDATE to connected dashboards
  // 4. Send reply alert email (async, non-blocking)
}
```

### Inbox Check CU Prompt
```typescript
// Specific CU prompt for reading Reddit inbox
const INBOX_CHECK_PROMPT = `You are checking a Reddit DM inbox. Follow these steps:

1. You are on Reddit. Navigate to https://www.reddit.com/message/inbox/ 
2. Look at the message list. For each conversation:
   - Read the sender's username (starts with u/)
   - Read the most recent message preview text
   - Note if it's a new/unread message
3. When done reading all visible messages, respond with a JSON summary:
   { "messages": [{ "sender": "username", "preview": "message text", "unread": true/false }] }

IMPORTANT:
- Only read messages, do NOT click on or open any conversations
- Do NOT send any messages or replies
- If you see a "Message requests" tab, check it too
- Report the exact username as displayed (case-sensitive)
- If the inbox is empty, return { "messages": [] }`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SendGrid/Mailgun for transactional email | Resend with React Email | 2023-2024 | Type-safe email templates, simpler API, better DX |
| moment-timezone for tz handling | date-fns-tz (v3) | 2024 | Tree-shakeable, ESM native, smaller bundle |
| Custom follow-up queue table | Reuse existing actions table with followup_dm type | Phase 1 schema | No new table needed, consistent with action engine |
| Manual HTML email templates | @react-email/components | 2023 | Component-based, responsive by default, preview tooling |

**Deprecated/outdated:**
- Resend v3 (now v6) had different API shape -- use current `resend.emails.send()` pattern
- `@react-email/render` is no longer needed as a separate package -- Resend SDK handles rendering internally when you pass `react` prop

## Open Questions

1. **Reddit Inbox CU Reliability**
   - What we know: Haiku CU has 56% benchmark confidence. Reddit DM inbox reading requires multiple steps (navigate, read, parse).
   - What's unclear: Actual success rate of inbox navigation. Reddit may show captchas or rate-limit automated sessions.
   - Recommendation: Build robust error handling. Log all CU sessions. Start with a conservative prompt that reads old.reddit.com/message/inbox (simpler HTML layout). Accept that some inbox checks will fail; the 2h cadence means retries happen naturally.

2. **CU Response Parsing for Message Data**
   - What we know: Haiku CU returns text responses. We need structured data (sender, message content).
   - What's unclear: How reliably Haiku returns valid JSON in its text response blocks.
   - Recommendation: Parse CU text response with JSON.parse wrapped in try/catch. If JSON parsing fails, attempt regex extraction of usernames and message previews. Log unparseable responses for debugging.

3. **Resend Domain Verification**
   - What we know: Resend requires domain verification (DNS records) to send from a custom domain.
   - What's unclear: Whether repco.ai domain is already configured in Resend, or if DNS setup is needed.
   - Recommendation: Verify domain setup as Wave 0 prerequisite. Use Resend's test mode during development.

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
| FLLW-01 | Follow-up 1 scheduled at day 3 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 3"` | Wave 0 |
| FLLW-02 | Follow-up 2 scheduled at day 7 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 7"` | Wave 0 |
| FLLW-03 | Follow-up 3 scheduled at day 14 | unit | `pnpm vitest run src/features/sequences/lib/__tests__/scheduler.test.ts -t "day 14"` | Wave 0 |
| FLLW-04 | All follow-ups cancelled on reply | unit | `pnpm vitest run src/features/sequences/lib/__tests__/stop-on-reply.test.ts` | Wave 0 |
| FLLW-05 | Follow-up appears in approval queue (or auto-sends) | unit | `pnpm vitest run src/features/sequences/lib/__tests__/auto-send.test.ts` | Wave 0 |
| RPLY-01 | Inbox checked every 2h via CU | integration | Manual -- requires GoLogin + Anthropic API | manual-only |
| RPLY-02 | Reply sender matched to prospect | unit | `pnpm vitest run src/features/sequences/lib/__tests__/reply-matching.test.ts` | Wave 0 |
| RPLY-03 | Email sent on reply detection | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | Wave 0 |
| RPLY-04 | Reply event pushed via Realtime | integration | Manual -- requires Supabase Realtime | manual-only |
| NTFY-01 | Daily digest sent at 8:00 user time | unit | `pnpm vitest run src/features/notifications/lib/__tests__/daily-digest.test.ts` | Wave 0 |
| NTFY-02 | Reply notification email sent | unit | `pnpm vitest run src/features/notifications/lib/__tests__/reply-alert.test.ts` | Wave 0 |
| NTFY-03 | Account warning email sent | unit | `pnpm vitest run src/features/notifications/lib/__tests__/account-warning.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/features/sequences/lib/__tests__/scheduler.test.ts` -- covers FLLW-01, FLLW-02, FLLW-03
- [ ] `src/features/sequences/lib/__tests__/stop-on-reply.test.ts` -- covers FLLW-04
- [ ] `src/features/sequences/lib/__tests__/auto-send.test.ts` -- covers FLLW-05
- [ ] `src/features/sequences/lib/__tests__/reply-matching.test.ts` -- covers RPLY-02
- [ ] `src/features/notifications/lib/__tests__/reply-alert.test.ts` -- covers RPLY-03, NTFY-02
- [ ] `src/features/notifications/lib/__tests__/daily-digest.test.ts` -- covers NTFY-01
- [ ] `src/features/notifications/lib/__tests__/account-warning.test.ts` -- covers NTFY-03

## Database Migration Summary

Phase 4 requires migration `00007_phase4_sequences_notifications.sql`:

```sql
-- 1. Add 'cancelled' to action_status_type enum
ALTER TYPE action_status_type ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Add sequence tracking columns to prospects
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS sequence_stopped boolean DEFAULT false;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_snippet text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS replied_detected_at timestamptz;

-- 3. Add auto-send preference to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_send_followups boolean DEFAULT false;

-- 4. Add timezone to users (for daily digest scheduling)
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';

-- 5. Add inbox check tracking to social_accounts
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS last_inbox_check_at timestamptz;
ALTER TABLE social_accounts ADD COLUMN IF NOT EXISTS consecutive_inbox_failures integer DEFAULT 0;

-- 6. Enable Supabase Realtime for prospects table (for reply events)
ALTER PUBLICATION supabase_realtime ADD TABLE prospects;

-- 7. Index for follow-up scheduler queries
CREATE INDEX IF NOT EXISTS idx_prospects_sequence_active
  ON prospects (user_id, pipeline_status)
  WHERE pipeline_status = 'contacted' AND sequence_stopped = false;

-- 8. Index for follow-up actions by prospect
CREATE INDEX IF NOT EXISTS idx_actions_prospect_followup
  ON actions (prospect_id, action_type, status)
  WHERE action_type = 'followup_dm';
```

## Cron Schedule Summary

New crons to add to `vercel.json`:

| Cron | Path | Schedule | Purpose |
|------|------|----------|---------|
| Follow-up scheduler | `/api/cron/schedule-followups` | `0 */4 * * *` (every 4h) | Check for due follow-ups and create actions |
| Reply detection | `/api/cron/check-replies` | `0 */2 * * *` (every 2h) | Check Reddit inboxes via GoLogin + CU |
| Daily digest | `/api/cron/daily-digest` | `0 * * * *` (every hour) | Send daily digest to users whose local time is 8:00 |

**Note:** Vercel Pro Hobby supports up to 2 crons, Pro supports up to 40. Current count: 2 (zombie-recovery, monitor-reddit). Adding 3 more brings total to 5, well within Pro limits.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `supabase/migrations/00001_enums.sql`, `00002_initial_schema.sql`, `00006_phase3_action_engine.sql` -- schema contracts
- Existing codebase: `src/app/api/cron/zombie-recovery/route.ts` -- cron route pattern
- Existing codebase: `src/features/dashboard/lib/use-realtime-signals.ts` -- Realtime subscription pattern
- Existing codebase: `src/features/dashboard/lib/agent-state.ts` -- Agent state machine (already has "reply" state)
- Existing codebase: `src/app/(app)/page.tsx` -- Dashboard page structure
- Existing codebase: `src/app/(app)/settings/page.tsx` -- Settings page structure
- Existing codebase: `src/components/shell/app-sidebar.tsx` -- Sidebar nav items
- npm registry: `resend@6.12.0`, `@react-email/components@1.0.12` -- verified 2026-04-18

### Secondary (MEDIUM confidence)
- Phase 3 RESEARCH.md -- GoLogin + CU pipeline architecture, patterns, pitfalls
- Phase 4 CONTEXT.md -- User decisions and locked requirements
- Phase 4 UI-SPEC.md -- Visual contracts for all Phase 4 screens

### Tertiary (LOW confidence)
- Reddit inbox CU navigation reliability -- untested, requires experimentation
- Resend rate limits at scale -- depends on plan tier, not verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Resend and React Email are well-established; all other libraries already in project
- Architecture: HIGH -- Follow-up scheduler and email notifications are straightforward; reuses Phase 3 pipeline
- Reply detection: MEDIUM -- CU inbox navigation is the highest risk area; Reddit UI variability and CU reliability are uncertain
- Pitfalls: HIGH -- Well-documented from Phase 3 research and codebase analysis

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days -- Resend API is stable; Reddit inbox UI may change)
