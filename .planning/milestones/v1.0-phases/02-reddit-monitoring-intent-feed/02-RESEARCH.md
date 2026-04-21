# Phase 2: Reddit Monitoring + Intent Feed - Research

**Researched:** 2026-04-17
**Domain:** Reddit API monitoring, AI classification, real-time dashboard, agent persona UI
**Confidence:** MEDIUM-HIGH

## Summary

Phase 2 builds the core monitoring pipeline: Reddit ingestion via snoowrap, structural keyword matching with Claude Sonnet fallback for ambiguous signals, a real-time intent feed dashboard, and an agent persona card. The existing Phase 1 foundation provides the app shell, Supabase schema (all 11 tables including `intent_signals`, `monitoring_signals`, `product_profiles`, `job_logs`), auth, and design system tokens.

The primary technical risk is Reddit API access: snoowrap is archived (March 2024) and Reddit now requires pre-approval for all new OAuth apps (since November 2025). The PRD and STATE.md both flag this: "Register Reddit OAuth app immediately -- 2-4 week pre-approval window." snoowrap still works with valid OAuth credentials and the free tier allows 100 QPM, which is more than sufficient for 15-minute cron cycles. The library's archived status is acceptable for MVP since the Reddit API itself hasn't changed in breaking ways.

The Supabase schema is already deployed with all tables needed. Two minor schema extensions are needed: a `dismissed_at` timestamp on `intent_signals` (CONTEXT specifies soft-dismiss with recoverable filter) and a `subreddit` text column for display purposes. Supabase Realtime subscription to `intent_signals` INSERT events will power live dashboard updates.

**Primary recommendation:** Use snoowrap as-is (PRD-locked decision), implement a thin adapter layer to isolate Reddit API calls, use standard Anthropic SDK `messages.create` for Sonnet classification (NOT the batch API which has 24h latency), and leverage existing Supabase client patterns established in Phase 1.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Keywords can be single words or multi-word phrases -- structural matcher handles both
- Keyword matching is exact match only (no regex patterns) -- Sonnet handles nuanced/pattern-based intent
- Match keywords against both post title and body text
- All signals get an intent_strength score (1-10): rule-based heuristic for structural matches, Sonnet-generated for ambiguous ones
- Sonnet classification returns full output: intent_type (buying/comparing/complaining/asking), intent_strength (1-10), reasoning (1 sentence), suggested_angle
- Sonnet only classifies ambiguous matches (~10-20% of search results per PRD) -- NOT all subreddit posts
- Batch classification: send 10-20 posts per Sonnet call for cost efficiency
- On Sonnet API failure: queue and retry -- show signal immediately with "Classifying..." state, update when Sonnet responds
- Intent strength displayed as flame/heat icon scale (cold/warm/hot tiers) -- not numeric bars or badges
- Each card shows: platform badge, subreddit, author handle, time ago, 2-3 line post excerpt (~150 chars), flame heat indicator
- "View on Reddit" link on each card
- "Contact" button creates a prospect record (status: detected) with a toast "Prospect saved -- outreach available in Phase 3"
- "Dismiss" is soft: sets dismissed_at timestamp, hides from feed, recoverable via filter
- Feed sorted by recency, filterable by platform (Reddit/LinkedIn placeholder) and minimum intent strength
- Standard SaaS layout: sidebar nav (from Phase 1 shell) + main content area -- NOT multi-column
- Terminal header: persistent strip at top of main content area, below the app header -- shows last 5 agent actions
- Terminal header styling uses design system tokens from shadcn preset (dark surface, Geist Mono, accent indigo) -- NOT arbitrary "black background"
- Agent card: dedicated card above the intent feed in the main content area, shows repco's current state + today's stats
- Below agent card: filter bar, then scrollable intent feed
- 7 emotional states per PRD: Scanning, Found, Waiting, Sent, Reply, Cooldown, Quiet
- Tone: "chill colleague" -- relaxed, conversational, not robotic or over-the-top enthusiastic
- Settings page with manual keyword and subreddit input (add/remove, instant save) -- no auto-generation yet (Phase 5)
- Single Vercel Cron fires every 15 min, processes all users' configs sequentially
- snoowrap search API per keyword across specified subreddits -- Reddit does the filtering
- Fixed 48h freshness cutoff for all users (not configurable)
- Deduplication by post_url (UNIQUE constraint in DB)
- Each monitoring run logged to job_logs with duration, status, signal count
- New signals pushed to dashboard via Supabase Realtime

### Claude's Discretion
- Rule-based scoring heuristics for structural matches (how to assign 1-10 based on match quality)
- Exact flame icon breakpoints (which scores map to cold/warm/hot)
- Terminal header update animation/transition
- Agent card visual design details (avatar, layout, spacing)
- Settings page layout and validation
- snoowrap query pagination and rate limiting strategy
- Retry queue implementation for failed Sonnet classifications

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MNTR-01 | System scans Reddit every 15 minutes for posts matching user's keywords and subreddits via snoowrap | snoowrap adapter + Vercel Cron pattern (see zombie-recovery route as template) |
| MNTR-03 | System applies structural matching (keyword, regex, competitor mention) to filter ~80-90% of signals at zero AI cost | Note: CONTEXT overrides regex -- exact match only. Structural matcher module handles keyword matching |
| MNTR-04 | System classifies ambiguous signals (~10-20%) using Claude Sonnet with intent_type, intent_strength, reasoning, suggested_angle | Anthropic SDK `messages.create` with structured JSON output |
| MNTR-05 | System deduplicates signals by post_url (UNIQUE constraint) and filters posts older than 48h | Already in schema: `intent_signals.post_url UNIQUE`. Filter by timestamp in snoowrap query |
| MNTR-06 | System pushes new signals to dashboard in real-time via Supabase Realtime | Supabase channel subscription to `intent_signals` INSERT events |
| MNTR-07 | System logs each monitoring run to job_logs with duration, status, and signal count | Existing pattern from zombie-recovery cron route |
| FEED-01 | User can view intent signals in a scrollable feed sorted by recency | Server component with Supabase query + client-side Realtime subscription for live updates |
| FEED-02 | Each signal shows platform, subreddit/source, author handle, time ago, post excerpt, and intent strength with visual bar | CONTEXT overrides: flame/heat icon scale (cold/warm/hot), not numeric bar |
| FEED-03 | User can click "Contact" to initiate outreach sequence for a signal | Creates prospect record (status: detected) with toast -- actual outreach is Phase 3 |
| FEED-04 | User can click "Dismiss" to remove a signal from the feed | Soft dismiss: sets dismissed_at, hides from feed, recoverable via filter toggle |
| FEED-05 | User can filter signals by platform and minimum intent strength | Client-side filter bar with platform dropdown and intent strength range |
| AGNT-01 | Dashboard displays agent card showing "repco" with current state and today's stats | Agent card component above feed, reads from derived state |
| AGNT-02 | Agent has emotional states: Scanning, Found, Waiting, Sent, Reply, Cooldown, Quiet | State machine module with 7 states and transition logic |
| AGNT-03 | Terminal header shows last 5 agent actions in real-time with monospace font and indigo accents | CONTEXT overrides: design system tokens, not arbitrary black bg. Geist Mono + accent indigo |
| DASH-01 | Dashboard displays persistent terminal header with last 5 agent actions in real-time | Terminal header component in app layout, Supabase Realtime on job_logs/intent_signals |
| DASH-02 | Dashboard displays multi-column layout | CONTEXT overrides: standard SaaS layout with sidebar + main content area, NOT multi-column. Agent card > filter bar > feed |
| DASH-03 | Dashboard updates in real-time via Supabase Realtime for authenticated users | Supabase Realtime postgres_changes subscription pattern |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| snoowrap | 1.23.0 | Reddit API wrapper (search, subreddit queries) | PRD-locked decision; still works with valid OAuth credentials despite archived status |
| @anthropic-ai/sdk | 0.90.0 | Claude Sonnet 4.6 classification of ambiguous signals | PRD-locked: Anthropic only vendor |
| @supabase/supabase-js | 2.103.3 (installed) | Database operations, Realtime subscriptions | Already in project |
| @supabase/ssr | 0.10.2 (installed) | Server-side Supabase client | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 1.8.0 (installed) | Icons including Flame icon for intent strength | Already in project |
| sonner | 2.0.7 (installed) | Toast notifications (dismiss, contact actions) | Already in project |
| date-fns | latest | "time ago" formatting for signal cards | Lightweight date utility; avoid moment.js |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| snoowrap | Raw Reddit API via fetch | More control but no built-in auth refresh, rate limiting, or promise chains. Stick with snoowrap per PRD |
| date-fns | Intl.RelativeTimeFormat | Native API but inconsistent "time ago" formatting across browsers. date-fns is 3KB for formatDistanceToNow |
| Anthropic batch API | Standard messages.create | Batch API has 24h latency window and 50% cost savings but is unusable for near-real-time classification. Use standard API |

**Installation:**
```bash
pnpm add snoowrap @anthropic-ai/sdk date-fns
pnpm add -D @types/snoowrap
```

**Note on @types/snoowrap:** snoowrap ships its own TypeScript declarations. Check if `@types/snoowrap` exists on npm; if not, the built-in types from the package are sufficient.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx              # Existing — add terminal header here
│   │   ├── page.tsx                # Dashboard home — agent card + feed
│   │   └── settings/
│   │       └── page.tsx            # Monitoring config (keywords, subreddits)
│   ├── api/
│   │   └── cron/
│   │       ├── zombie-recovery/    # Existing
│   │       └── monitor-reddit/
│   │           └── route.ts        # 15-min cron: Reddit ingestion
├── features/
│   ├── monitoring/
│   │   ├── lib/
│   │   │   ├── reddit-adapter.ts   # snoowrap wrapper (thin adapter)
│   │   │   ├── structural-matcher.ts # Keyword matching + scoring
│   │   │   ├── sonnet-classifier.ts  # Anthropic SDK classification
│   │   │   └── ingestion-pipeline.ts # Orchestrates: fetch → match → classify → store
│   │   └── components/
│   │       └── settings-form.tsx   # Keyword/subreddit management
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── terminal-header.tsx  # Last 5 agent actions strip
│   │   │   ├── agent-card.tsx       # repco persona card
│   │   │   ├── signal-card.tsx      # Individual intent signal card
│   │   │   ├── signal-feed.tsx      # Scrollable feed with Realtime
│   │   │   ├── filter-bar.tsx       # Platform + intent strength filters
│   │   │   └── flame-indicator.tsx  # Cold/warm/hot flame icon
│   │   └── lib/
│   │       ├── agent-state.ts       # Emotional state machine
│   │       └── use-realtime-signals.ts # Custom hook for Supabase Realtime
│   └── auth/                        # Existing
├── components/
│   ├── shell/                       # Existing app shell
│   └── ui/                          # Existing shadcn components
└── lib/                             # Existing (supabase, logger, etc.)
```

### Pattern 1: Vercel Cron Route Handler (Established)
**What:** Route handler with CRON_SECRET authorization, service_role Supabase client, job_logs tracking
**When to use:** All cron endpoints
**Example:**
```typescript
// src/app/api/cron/monitor-reddit/route.ts
// Follow exact same pattern as zombie-recovery/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60; // Reddit monitoring may take longer

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ... monitoring logic
}
```

### Pattern 2: snoowrap Adapter (Thin Wrapper)
**What:** Isolate snoowrap initialization and search calls behind an adapter
**When to use:** All Reddit API interactions
**Example:**
```typescript
// src/features/monitoring/lib/reddit-adapter.ts
import Snoowrap from "snoowrap";

let client: Snoowrap | null = null;

function getClient(): Snoowrap {
  if (!client) {
    client = new Snoowrap({
      userAgent: "repco.ai/1.0 (monitoring)",
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      refreshToken: process.env.REDDIT_REFRESH_TOKEN!,
    });
    client.config({ requestDelay: 1000 }); // 1s between requests
  }
  return client;
}

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: { name: string };
  subreddit: { display_name: string };
  url: string;
  created_utc: number;
  permalink: string;
}

export async function searchSubreddit(
  subreddit: string,
  query: string,
  options?: { time?: string; limit?: number }
): Promise<RedditPost[]> {
  const r = getClient();
  const results = await r.getSubreddit(subreddit).search({
    query,
    time: options?.time ?? "day",
    sort: "new",
    limit: options?.limit ?? 25,
  });
  return results as unknown as RedditPost[];
}
```

### Pattern 3: Supabase Realtime Hook
**What:** React hook for subscribing to table INSERT events
**When to use:** Dashboard live updates
**Example:**
```typescript
// src/features/dashboard/lib/use-realtime-signals.ts
"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

export function useRealtimeSignals(userId: string) {
  const [newSignals, setNewSignals] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel("intent-signals")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "intent_signals",
          filter: `user_id=eq.${userId}`,
        },
        (payload: RealtimePostgresInsertPayload<any>) => {
          setNewSignals((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  return newSignals;
}
```

### Pattern 4: Sonnet Classification (Standard Messages API)
**What:** Send batch of posts in a single prompt for cost-efficient classification
**When to use:** Ambiguous signals that pass structural matching but need AI evaluation
**Example:**
```typescript
// src/features/monitoring/lib/sonnet-classifier.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

interface ClassificationResult {
  post_url: string;
  intent_type: "buying" | "comparing" | "complaining" | "asking";
  intent_strength: number; // 1-10
  reasoning: string;
  suggested_angle: string;
}

export async function classifySignals(
  posts: { url: string; title: string; body: string }[],
  productContext: { name: string; description: string; keywords: string[] }
): Promise<ClassificationResult[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Classify these Reddit posts for purchase intent related to: ${productContext.name} - ${productContext.description}

Keywords: ${productContext.keywords.join(", ")}

Posts:
${posts.map((p, i) => `[${i + 1}] URL: ${p.url}\nTitle: ${p.title}\nBody: ${p.body}\n`).join("\n")}

For each post, return JSON array with:
- post_url: the URL
- intent_type: "buying" | "comparing" | "complaining" | "asking"
- intent_strength: 1-10 (10 = strongest purchase intent)
- reasoning: one sentence explaining why
- suggested_angle: one sentence suggesting how to approach

Return ONLY valid JSON array, no other text.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return JSON.parse(text);
}
```

### Pattern 5: Agent Emotional State Machine
**What:** Derive agent state from system data, not manual state management
**When to use:** Agent card display, terminal header messages
**Example:**
```typescript
// src/features/dashboard/lib/agent-state.ts
export type AgentState =
  | "scanning"
  | "found"
  | "waiting"
  | "sent"
  | "reply"
  | "cooldown"
  | "quiet";

interface AgentContext {
  isMonitoringActive: boolean;
  recentHighIntentCount: number;     // signals >= 8 in last 15min
  pendingApprovals: number;
  recentDmsSent: number;             // last hour
  recentReplies: number;             // last hour
  hasWarningAccount: boolean;
  signalsLast24h: number;
}

const MESSAGES: Record<AgentState, string[]> = {
  scanning: ["Scanning Reddit for buyers...", "Checking r/SaaS..."],
  found: ["Found someone. Strong intent. Worth a look."],
  waiting: ["{count} people waiting for your go-ahead."],
  sent: ["Reached out. Ball's in their court."],
  reply: ["They replied. Looks positive."],
  cooldown: ["Taking a break on an account -- resumes tomorrow."],
  quiet: ["Quiet day. Keeping an eye out."],
};

export function deriveAgentState(ctx: AgentContext): AgentState {
  if (ctx.hasWarningAccount) return "cooldown";
  if (ctx.recentReplies > 0) return "reply";
  if (ctx.recentDmsSent > 0) return "sent";
  if (ctx.pendingApprovals > 0) return "waiting";
  if (ctx.recentHighIntentCount > 0) return "found";
  if (ctx.isMonitoringActive) return "scanning";
  return "quiet";
}
```

### Anti-Patterns to Avoid
- **Polling for dashboard updates:** Use Supabase Realtime, not setInterval fetching. The schema already supports this.
- **Calling Sonnet for every post:** Structural matching must filter 80-90% first. Only ambiguous posts go to Sonnet.
- **One Sonnet call per post:** Batch 10-20 posts per call for cost efficiency. The CONTEXT explicitly requires this.
- **Storing snoowrap client globally in module scope without lazy init:** Vercel serverless functions are ephemeral. Use lazy initialization pattern.
- **Using Supabase anon key in cron routes:** Cron routes need service_role key to bypass RLS (established pattern in zombie-recovery).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reddit API auth/refresh | Custom OAuth flow | snoowrap built-in token refresh | Handles rate limiting, token refresh, promise chains automatically |
| Time ago formatting | Custom date math | date-fns `formatDistanceToNow` | Edge cases with timezones, "just now" vs "1 minute ago" |
| Real-time subscriptions | WebSocket server | Supabase Realtime postgres_changes | Already integrated, handles reconnection, auth-scoped |
| Cron scheduling | Custom scheduler | Vercel Cron (vercel.json) | Managed, reliable, already used for zombie-recovery |
| JSON parsing from LLM | Regex extraction | Anthropic structured output or try/catch JSON.parse | LLMs occasionally produce invalid JSON; need robust handling |

**Key insight:** The monitoring pipeline has exactly two custom parts: the structural matcher (keyword matching + scoring) and the ingestion orchestrator. Everything else (Reddit API, AI classification, real-time push, cron scheduling, database) uses existing libraries and infrastructure.

## Common Pitfalls

### Pitfall 1: Reddit API Access Blocked
**What goes wrong:** Creating a new Reddit OAuth app fails because Reddit requires pre-approval since November 2025
**Why it happens:** Reddit changed its policy -- all new OAuth tokens require manual review
**How to avoid:** STATE.md already flags this: "Register Reddit OAuth app immediately -- 2-4 week pre-approval window." Ensure the Reddit app is registered before Phase 2 implementation begins. If already registered with valid credentials, no issue.
**Warning signs:** 401/403 from Reddit API, "invalid_grant" errors

### Pitfall 2: snoowrap TypeScript Issues
**What goes wrong:** snoowrap's TypeScript types are incomplete or outdated (library archived March 2024)
**Why it happens:** No active maintenance; types don't cover all return shapes
**How to avoid:** Use the adapter pattern to isolate snoowrap calls. Cast results through your own interfaces. Don't leak snoowrap types into the rest of the codebase.
**Warning signs:** `any` types creeping into components, type errors on search results

### Pitfall 3: Sonnet JSON Output Parsing Failures
**What goes wrong:** Claude returns markdown-wrapped JSON (`\`\`\`json ... \`\`\``) or includes explanatory text around the JSON
**Why it happens:** LLMs don't always follow "return ONLY JSON" instructions perfectly
**How to avoid:** Strip markdown code fences before parsing. Use try/catch with a fallback. Consider using the Anthropic SDK's tool_use/function calling feature for guaranteed structured output instead of free-text JSON.
**Warning signs:** JSON.parse errors in production logs

### Pitfall 4: Supabase Realtime Not Receiving Events
**What goes wrong:** Dashboard doesn't update in real-time despite new rows being inserted
**Why it happens:** Supabase Realtime is disabled by default for tables. Must enable replication for `intent_signals` table in Supabase dashboard (Database > Replication).
**How to avoid:** Enable Realtime replication for `intent_signals` table before testing. Also enable for `job_logs` if terminal header subscribes to it.
**Warning signs:** Channel subscribes successfully but callback never fires

### Pitfall 5: UNIQUE Constraint on post_url Causing Insert Failures
**What goes wrong:** Monitoring cron crashes when trying to insert a duplicate post
**Why it happens:** Multiple cron runs may find the same post within the 48h window
**How to avoid:** Use `INSERT ... ON CONFLICT (post_url) DO NOTHING` or Supabase's `upsert({ onConflict: 'post_url' })` with `ignoreDuplicates: true`. This is the deduplication mechanism.
**Warning signs:** 409 errors or unhandled constraint violations in job_logs

### Pitfall 6: Vercel Function Timeout on Large Monitoring Runs
**What goes wrong:** Cron function exceeds 60s (Vercel Pro limit) when processing many users/keywords
**Why it happens:** Sequential processing of all users' configs with multiple snoowrap API calls per keyword
**How to avoid:** Set `maxDuration = 60`. Process users sequentially but keywords in parallel where possible. Log duration to job_logs. If approaching limit, split into multiple cron invocations.
**Warning signs:** p95 duration > 50s in job_logs

### Pitfall 7: Missing Schema Columns
**What goes wrong:** CONTEXT decisions require columns not in current schema
**Why it happens:** Schema was designed from PRD, CONTEXT adds Phase 2-specific decisions
**How to avoid:** Create a migration adding: `dismissed_at timestamptz` to `intent_signals` (for soft dismiss), `subreddit text` to `intent_signals` (for display). Also consider `classification_status text` for the "Classifying..." intermediate state.
**Warning signs:** Column not found errors on insert/query

## Code Examples

### Vercel Cron Configuration (vercel.json)
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/zombie-recovery",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/monitor-reddit",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Structural Matcher with Scoring Heuristic (Claude's Discretion)
```typescript
// src/features/monitoring/lib/structural-matcher.ts
interface MatchResult {
  matched: boolean;
  intent_strength: number;  // 1-10
  intent_type: "direct" | "competitive" | "problem" | "engagement";
  match_source: "title" | "body" | "both";
  ambiguous: boolean; // true = send to Sonnet
}

export function matchPost(
  title: string,
  body: string,
  keywords: string[],
  competitors: string[]
): MatchResult {
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();

  // Direct keyword match
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    const inTitle = titleLower.includes(kwLower);
    const inBody = bodyLower.includes(kwLower);

    if (inTitle || inBody) {
      return {
        matched: true,
        intent_strength: scoreMatch(inTitle, inBody, titleLower),
        intent_type: "direct",
        match_source: inTitle && inBody ? "both" : inTitle ? "title" : "body",
        ambiguous: false,
      };
    }
  }

  // Competitor mention
  for (const comp of competitors) {
    const compLower = comp.toLowerCase();
    if (titleLower.includes(compLower) || bodyLower.includes(compLower)) {
      return {
        matched: true,
        intent_strength: 7,
        intent_type: "competitive",
        match_source: titleLower.includes(compLower) ? "title" : "body",
        ambiguous: false,
      };
    }
  }

  // No structural match — ambiguous, send to Sonnet if it came from search results
  return {
    matched: false,
    intent_strength: 0,
    intent_type: "direct",
    match_source: "body",
    ambiguous: true,
  };
}

function scoreMatch(inTitle: boolean, inBody: boolean, title: string): number {
  let score = 5; // base score for keyword match
  if (inTitle && inBody) score += 2;  // strong signal: keyword in both
  else if (inTitle) score += 1;       // title match slightly stronger

  // Boost for buying-intent phrases in title
  const buyingPhrases = ["looking for", "need", "recommend", "alternative to", "best", "help me find"];
  if (buyingPhrases.some((p) => title.includes(p))) score += 2;

  return Math.min(score, 10);
}
```

### Flame Icon Breakpoints (Claude's Discretion)
```typescript
// src/features/dashboard/components/flame-indicator.tsx
import { Flame } from "lucide-react";

type HeatTier = "cold" | "warm" | "hot";

export function getHeatTier(strength: number): HeatTier {
  if (strength >= 8) return "hot";
  if (strength >= 5) return "warm";
  return "cold";
}

const tierStyles: Record<HeatTier, string> = {
  cold: "text-zinc-400",           // muted
  warm: "text-amber-500",          // warm amber
  hot: "text-[#4338CA]",           // brand accent (indigo)
};

export function FlameIndicator({ strength }: { strength: number }) {
  const tier = getHeatTier(strength);
  return (
    <div className="flex items-center gap-1">
      <Flame className={`h-4 w-4 ${tierStyles[tier]}`} />
      <span className={`text-xs font-medium ${tierStyles[tier]}`}>
        {strength}/10
      </span>
    </div>
  );
}
```

### Deduplication on Insert
```typescript
// Using Supabase upsert with conflict handling
const { error } = await supabase
  .from("intent_signals")
  .upsert(
    signals.map((s) => ({
      user_id: userId,
      platform: "reddit",
      post_url: s.url,
      post_content: s.excerpt,
      subreddit: s.subreddit,
      author_handle: s.author,
      author_profile_url: `https://reddit.com/u/${s.author}`,
      intent_type: s.intent_type,
      intent_strength: s.intent_strength,
      intent_reasoning: s.reasoning,
      suggested_angle: s.suggested_angle,
      status: "pending",
      is_public: true,
      detected_at: new Date().toISOString(),
    })),
    { onConflict: "post_url", ignoreDuplicates: true }
  );
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| snoowrap actively maintained | snoowrap archived (read-only) | March 2024 | No bug fixes; wrap in adapter for future replacement |
| Reddit self-service API keys | Pre-approval required for all new apps | November 2025 | 1-2 week approval delay; register early |
| Supabase Realtime v1 (channels) | Supabase Realtime v2 (postgres_changes) | 2023 | Use `postgres_changes` event type, not legacy `*` |
| Free-text JSON from LLMs | Tool use / structured outputs | 2024+ | Consider Anthropic tool_use for guaranteed JSON schema |

**Deprecated/outdated:**
- snoowrap's `Bluebird` promises: snoowrap uses Bluebird promises internally. Modern code should `await` them -- they're compatible with native Promises.
- `supabase.channel().on('*')`: Legacy Realtime v1 syntax. Use `postgres_changes` with explicit event type.

## Open Questions

1. **Reddit OAuth App Status**
   - What we know: STATE.md says "Register Reddit OAuth app immediately"
   - What's unclear: Whether the app has already been registered and approved
   - Recommendation: Verify before starting implementation. If not registered, this blocks Phase 2.

2. **Sonnet Model Identifier**
   - What we know: PRD says "claude-sonnet-4-6". Anthropic SDK uses model IDs like `claude-sonnet-4-6-20250514`
   - What's unclear: Exact model ID string at time of implementation
   - Recommendation: Use a constant/env var for the model ID so it can be updated without code changes

3. **intent_signals Schema Extensions**
   - What we know: CONTEXT requires `dismissed_at` timestamp and signals need `subreddit` for display
   - What's unclear: Whether to add these in a new migration or modify existing
   - Recommendation: New migration file `00005_phase2_extensions.sql` adding `dismissed_at timestamptz`, `subreddit text`, and `classification_status text DEFAULT 'completed'`

4. **Supabase Realtime Table Replication**
   - What we know: Realtime must be enabled per-table in Supabase dashboard
   - What's unclear: Whether it's currently enabled for `intent_signals`
   - Recommendation: Document as Wave 0 setup step; verify in Supabase dashboard

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in project |
| Config file | None -- needs Wave 0 setup |
| Quick run command | `pnpm exec vitest run --reporter=verbose` (recommended) |
| Full suite command | `pnpm exec vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MNTR-03 | Structural keyword matching scores correctly | unit | `pnpm exec vitest run src/features/monitoring/lib/__tests__/structural-matcher.test.ts` | Wave 0 |
| MNTR-04 | Sonnet classifier returns valid classification JSON | unit (mocked) | `pnpm exec vitest run src/features/monitoring/lib/__tests__/sonnet-classifier.test.ts` | Wave 0 |
| MNTR-05 | Deduplication filters duplicate post_url | unit | `pnpm exec vitest run src/features/monitoring/lib/__tests__/ingestion-pipeline.test.ts` | Wave 0 |
| AGNT-02 | Agent state derivation from context | unit | `pnpm exec vitest run src/features/dashboard/lib/__tests__/agent-state.test.ts` | Wave 0 |
| MNTR-01 | Cron endpoint returns 401 without CRON_SECRET | unit | `pnpm exec vitest run src/app/api/cron/monitor-reddit/__tests__/route.test.ts` | Wave 0 |
| MNTR-06 | Realtime subscription fires on insert | integration (manual) | Manual -- requires Supabase Realtime enabled | manual-only |
| DASH-03 | Dashboard updates without refresh | e2e (manual) | Manual -- browser test | manual-only |

### Sampling Rate
- **Per task commit:** `pnpm exec vitest run --reporter=verbose`
- **Per wave merge:** `pnpm exec vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- Vitest configuration with path aliases matching tsconfig
- [ ] `pnpm add -D vitest @testing-library/react @testing-library/jest-dom` -- test framework install
- [ ] `src/features/monitoring/lib/__tests__/structural-matcher.test.ts` -- covers MNTR-03
- [ ] `src/features/monitoring/lib/__tests__/sonnet-classifier.test.ts` -- covers MNTR-04
- [ ] `src/features/dashboard/lib/__tests__/agent-state.test.ts` -- covers AGNT-02

## Sources

### Primary (HIGH confidence)
- Project schema: `supabase/migrations/00002_initial_schema.sql` -- verified all table structures
- Project codebase: `src/app/api/cron/zombie-recovery/route.ts` -- established cron pattern
- PRD: `PRD/repco-prd-final.md` sections 7.2, 7.3, 7.7, 8.3 -- monitoring spec, agent persona, dashboard layout, schema
- CONTEXT.md -- locked decisions constraining implementation

### Secondary (MEDIUM confidence)
- [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs) -- CRON_SECRET authorization pattern
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) -- postgres_changes subscription API
- [snoowrap GitHub](https://github.com/not-an-aardvark/snoowrap) -- API reference, archived March 2024
- [Anthropic SDK npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.90.0, messages.create API

### Tertiary (LOW confidence)
- [Reddit API pre-approval policy](https://replydaddy.com/blog/reddit-api-pre-approval-2025-personal-projects-crackdown) -- November 2025 changes, needs verification with Reddit's official developer portal
- [Reddit API rate limits](https://data365.co/blog/reddit-api-limits) -- 100 QPM free tier claim, verify against Reddit's official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are PRD-locked or already installed; versions verified against npm registry
- Architecture: HIGH -- patterns established in Phase 1 (cron routes, Supabase clients, feature folders); direct extension
- Pitfalls: MEDIUM-HIGH -- Reddit API policy changes verified across multiple sources; snoowrap archived status confirmed; Supabase Realtime gotchas from official docs
- Agent state machine: MEDIUM -- logical derivation from PRD states; implementation pattern is Claude's discretion

**Research date:** 2026-04-17
**Valid until:** 2026-05-01 (Reddit API policy may evolve; check before implementation)
