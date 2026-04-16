# Pitfalls Research

**Domain:** AI social outreach / intent detection platform (browser automation, Reddit + LinkedIn DMs)
**Researched:** 2026-04-16
**Confidence:** HIGH (most pitfalls verified through multiple sources including official docs, GitHub issues, and community reports)

---

## Critical Pitfalls

### Pitfall 1: Shared Client ID Triggers Cross-User Rate Limits on Reddit

**What goes wrong:**
snoowrap rate limits are tied to the OAuth client ID/secret, not to individual Reddit accounts. If user A sends a DM at 12:00, user B cannot send one until ~12:10 — even on a completely different Reddit account. At 10+ active users, the Reddit API quota becomes a shared bottleneck that serializes all outreach across all customers.

**Why it happens:**
Reddit's API enforces a single 60-requests-per-minute limit per OAuth app (client ID). Developers test with one account and never notice; only surfaces under multi-tenant load.

**How to avoid:**
Register a separate Reddit OAuth app per customer workspace (or per account they connect), not one global app. Store per-customer client credentials in Supabase, not as environment variables. This gives each customer their own rate-limit bucket.

**Warning signs:**
- DM queues backing up for users who should be independent of each other
- snoowrap throwing `RATELIMIT` errors despite `continueAfterRatelimitError: true`
- Monitoring logs showing 9-minute gaps between actions from different customers

**Phase to address:**
Reddit integration / action engine phase — before multi-user support lands.

---

### Pitfall 2: GoLogin CDP Connection Silently Fails After Recent Updates

**What goes wrong:**
GoLogin's Chromium build has had recurring compatibility issues with Playwright's `connect_over_cdp()` — specifically, the WebSocket handshake succeeds but the session never initializes (Playwright bug in v1.50-1.52). Additionally, BlackHatWorld reports from mid-2025 document GoLogin specifically (not proxies) causing Reddit to flag connections as spam after a GoLogin update, while the same proxy/IP worked fine in other browsers.

**Why it happens:**
GoLogin ships its own Chromium fork. When Playwright updates its CDP protocol expectations, the two drift out of sync. There's no upstream coordination. Reddit also appears to fingerprint the specific Chromium build, and a new GoLogin version can suddenly change that fingerprint.

**How to avoid:**
- Pin GoLogin API version and test CDP handshake in CI with a lightweight smoke test before deploying
- Add a mandatory post-connect verification step: navigate to `about:blank`, confirm page title loads within 5 seconds — abort the action if not
- Implement a fallback: if CDP connect fails 3 times, mark the profile as `unhealthy`, surface it in the account health dashboard, and skip scheduled actions until manual review

**Warning signs:**
- Playwright connect timeout logs with no network errors (WebSocket connects, session doesn't)
- Sudden spike in `FAILED` action statuses across all profiles simultaneously (GoLogin-level issue vs. per-account issue)
- Account health dashboard showing all profiles degraded at the same time

**Phase to address:**
Action engine (GoLogin + Playwright CDP) phase — CDP health check must be part of the initial integration test suite.

---

### Pitfall 3: Claude Haiku Computer Use Loops and Eats Credits Without Completing Actions

**What goes wrong:**
Claude Haiku CU has a documented ~56% success rate on browser automation benchmarks (vs. 87% for GPT-4o). For tasks like navigating to a Reddit DM thread and clicking Send, the model can get confused by modal dialogs, cookie banners, or layout shifts, and loop — repeatedly taking screenshots and emitting tool calls without making progress. Each screenshot + tool call consumes tokens and time. Without a hard step limit and stuck detection, a single action can exhaust a Vercel function's 60s window AND burn significant API credits.

**Why it happens:**
Computer Use models are not deterministic UI navigators. They reason about visual state on each step, which makes them resilient to UI changes but vulnerable to novel states they weren't trained on (like Reddit's occasional A/B test UI variations or LinkedIn's CAPTCHA triggers).

**How to avoid:**
- Enforce `max_steps: 15` per action execution (hard limit in the orchestration loop)
- Implement stuck detection: if the same screenshot hash appears 3 times in a row with different tool calls, abort and mark action as `STUCK`
- Add explicit pre-action navigation steps: go to a known URL first, wait for DOM stabilizer, then begin the task — reduces modal/banner surprises
- Never run CU tasks for actions that can be done via API (snoowrap for Reddit comment/post reading — only use CU for DM sending which has no API)

**Warning signs:**
- Action duration regularly approaching 55-59 seconds
- Anthropic API costs growing faster than action count
- `STUCK` action status appearing for the same platform consistently (signals a UI change on that platform)

**Phase to address:**
Action engine phase — before shipping approval queue to users. Stuck detection must be built before humans start approving actions.

---

### Pitfall 4: Reddit Detects Automation Through Behavioral Fingerprinting, Not Just IP

**What goes wrong:**
Reddit's BotBouncer and internal systems analyze posting speed, cross-subreddit patterns, templated language, and the 8:1 contribution-to-promotion ratio. An account that only appears in posts relevant to a product — even with varied messaging — gets shadowbanned because its behavioral graph is purely transactional. Shadowbans are silent: the account appears to function but posts are invisible to others.

**Why it happens:**
Builders focus on IP rotation and browser fingerprinting (the obvious detection vectors) and ignore Reddit's community behavior model. A technically "clean" profile that has never upvoted, commented on unrelated content, or contributed to discussions reads as a bot regardless of how human its fingerprint looks.

**How to avoid:**
- The 7-day warmup protocol must include genuine contributions: upvotes on random content, comments in unrelated subreddits, browsing dwell time (not just linear navigation)
- Enforce a post-warmup behavioral budget: the action engine must track `promotional_actions_today` vs. `organic_actions_today` and refuse to fire DMs if ratio exceeds 1:3 for that account
- Vary DM timing within a human work-day window (9am-9pm account's local timezone) — avoid 3am automated sends
- Build shadowban detection into reply check: if the account's own posts/comments return 0 public visibility via a secondary check (unauthenticated fetch), trigger `SHADOWBANNED` account status

**Warning signs:**
- DMs sent but reply rate drops to 0% over multiple weeks (not just low, but zero)
- Account karma stops growing despite activity
- Posts don't appear when checking from an incognito window

**Phase to address:**
Anti-ban system and warmup scheduler phase — must be hardened before any outreach goes live.

---

### Pitfall 5: Vercel Function Timeout Kills Mid-Action Browser Sessions Leaving Orphaned State

**What goes wrong:**
A Vercel Fluid Compute function has a 5-minute default ceiling (300s), extendable to 900s on Enterprise. A GoLogin + Playwright + Claude CU action chain (navigate → find DM → compose → verify → send) can easily take 90-180 seconds on a slow day. If Vercel terminates the function mid-action, the GoLogin profile remains in an active state with a half-composed DM and no record of completion. The next retry re-executes the action, potentially sending a duplicate DM.

**Why it happens:**
Serverless functions are stateless — they cannot resume. The action engine design assumes atomic execution. Browser sessions are stateful external resources that don't clean up on function termination.

**How to avoid:**
- Record action state transitions atomically in Supabase: `PENDING → EXECUTING → SENDING → COMPLETED` with timestamps. Before executing, check for stale `EXECUTING` records (older than 10 minutes) — treat them as failed
- GoLogin profile lock: write `profile_locked_at` to DB before connecting; clear on completion OR on error. A locked profile that times out gets detected by a cleanup cron (every 5 minutes) and unlocked
- Implement idempotency: before sending a DM, check Supabase for an existing `COMPLETED` action record for the same prospect+campaign combination — skip if found
- For the action worker, target Railway if actions consistently approach 60-90s at any user scale — plan the migration path before it becomes urgent

**Warning signs:**
- Prospects reporting receiving the same DM twice
- Actions stuck in `EXECUTING` state in the dashboard with no completion time
- Vercel function logs showing `Function execution timeout` errors

**Phase to address:**
Action engine phase — idempotency and profile locking must be designed before go-live, not added post-launch.

---

### Pitfall 6: Credit Economy Allows Usage Without Enforcement — Revenue Leakage Day 1

**What goes wrong:**
The 3-layer credit system (monitoring burn + account burn + action cost) requires that credit checks happen before spending, not after. The common mistake is to debit credits after an action completes — which means a user with 0 credits who triggers 10 actions in rapid succession successfully spends credits they don't have, because each action checked balance before the previous one updated the DB.

**Why it happens:**
Developers implement naive `read balance → check sufficient → debit on completion` logic. Under concurrent action execution, multiple reads see the same positive balance before any write commits.

**How to avoid:**
- Use Supabase's `update credits set balance = balance - cost where balance >= cost returning balance` as a single atomic SQL operation — if it returns 0 rows, the action was rejected
- Never read-then-write for credit operations — always atomic decrement with a guard
- For monitoring burn (which runs on cron): implement a pre-cycle credit reservation that locks credits for the upcoming monitoring window, releases unused credits after the cycle
- Add a circuit breaker: if a user's balance hits 0, disable all their cron jobs immediately (not lazily on next run)

**Warning signs:**
- User credit balances going negative in the DB
- Actions completing for users who are on the free tier with 0 credits remaining
- Stripe webhooks showing subscription cancellations while actions continue running

**Phase to address:**
Stripe billing and credit economy phase — atomic credit operations must be established as the pattern before any action type is wired to credits.

---

### Pitfall 7: Intent Detection False Positives Pollute the Approval Queue and Erode Trust

**What goes wrong:**
Keyword/pattern matching on Reddit posts produces high false positive rates for buying-intent signals. "Looking for alternatives to X" often means the person is content with X and exploring academically, not actively switching. "Anyone used Y?" is curiosity, not purchase intent. If 60% of the approval queue is noise, users stop reviewing it and miss real leads — or start approving everything blindly, leading to spam complaints.

**Why it happens:**
Keyword matching cannot distinguish context. A keyword like "recommend" can appear in "I'd recommend avoiding that tool" or "can anyone recommend a CRM?" — opposite intent signals. Builders often ship keyword lists that felt right in testing, then never recalibrate against real production data.

**How to avoid:**
- Use the two-tier approach as designed: structural keyword match first (cheap, filters volume), then Claude Sonnet classification only on ambiguous signals (not all signals)
- Include negative signal patterns in the prompt: train the classifier on "what this is NOT" — vent posts, academic questions, recommendations given not sought
- Add a per-customer feedback loop: "Mark as irrelevant" on the intent feed should feed a lightweight accuracy tracker; surface accuracy % in the dashboard to motivate engagement
- Set a confidence threshold floor: Sonnet must score ≥7/10 intent strength before adding to approval queue, not just >5

**Warning signs:**
- Approval queue accumulating faster than the user can process (>20 items/day for a solo founder target persona)
- Users clicking "Reject" on >50% of queue items in their first week
- Users going inactive on the dashboard within 14 days of signup

**Phase to address:**
Signal detection and intent feed phase — accuracy calibration must happen before showing the intent feed to users, using real Reddit data in staging.

---

### Pitfall 8: LinkedIn Apify Actor Breaks Without Warning on LinkedIn UI Changes

**What goes wrong:**
Apify's LinkedIn scrapers are third-party maintained and depend on LinkedIn's rendered HTML structure. LinkedIn regularly A/B tests layout changes and rolls out redesigns without notice. When the Apify actor breaks, LinkedIn monitoring silently stops — the cron runs, no results return, no error is surfaced to the user, and they assume repco is working when it isn't.

**Why it happens:**
Third-party scrapers have no SLA tied to platform changes. Failures are often silent `[]` empty result sets rather than thrown exceptions, making them indistinguishable from "no signals today."

**How to avoid:**
- Implement expected-result monitoring: if LinkedIn monitoring runs and returns 0 signals for >48 hours AND the account has keywords that historically returned signals, trigger a `MONITOR_HEALTH` alert in the dashboard
- Add a LinkedIn actor smoke test: run a known-good query (a generic high-volume term) on each monitoring cycle; if it returns 0 results, flag as `ACTOR_DEGRADED`
- Track `last_signal_received_at` per platform per user; surface staleness visually in the dashboard ("LinkedIn monitoring last returned signals 3 days ago")
- Have a fallback Apify actor pinned and tested — when primary breaks, swap to fallback without code changes

**Warning signs:**
- LinkedIn signal count drops to 0 while Reddit signals continue normally
- Apify dashboard showing actor run completions but 0 dataset records
- Users asking "is LinkedIn working?" in support

**Phase to address:**
LinkedIn monitoring phase — actor health monitoring is not optional; build it alongside the actor integration.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single global Reddit OAuth app for all customers | Simpler setup, no per-user credential mgmt | Rate limits are shared; hits wall at ~10 concurrent users | Never — design per-workspace from day 1 |
| Polling for action completion instead of DB state machine | Easier to implement | Orphaned states on timeout, duplicate actions | Never for action engine |
| Read-then-write for credit debit | Simpler code | Race conditions cause negative balances at any concurrency | Never — always atomic decrement |
| Skip shadowban detection, assume DM sent = DM delivered | Faster to build | No visibility into account health degradation; users churn silently | Never |
| Use single Apify actor version without health check | Less infra | Silent monitoring failures undetected for days | MVP only if manual daily check is performed |
| Deploy action worker on Vercel without testing at 90s+ durations | Simpler infra | Timeout failures in production require emergency Railway migration | Only acceptable if p95 action time <30s in testing |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| snoowrap | Using one OAuth client ID for all users | Register per-workspace OAuth app; store credentials in Supabase row per workspace |
| snoowrap | Trusting `continueAfterRatelimitError: true` to handle all limit cases | Implement your own exponential backoff wrapper; snoowrap's built-in handler has known issues |
| GoLogin API | Connecting to profile without verifying CDP endpoint is ready | Poll GoLogin's profile status endpoint until `status: ready` before calling `connect_over_cdp` |
| Playwright CDP | Using default 30s timeout for `connect_over_cdp` | Set explicit timeout to 60s; add post-connect page load verification before handing off to CU |
| Claude Haiku CU | No step limit on the agentic loop | Hard cap at 15 tool calls per action; implement screenshot hash-based stuck detection |
| Supabase Realtime | Subscribing to raw `postgres_changes` on tables with RLS under load | For high-frequency tables (intent feed), use Realtime Broadcast or a dedicated public log table without RLS |
| Supabase Realtime | Opening one subscription per dashboard component | Use a single channel per user session; multiplex events client-side |
| Stripe | Processing webhook events without idempotency keys | Always check `processed_event_ids` table before acting on webhook; Stripe retries on non-2xx |
| Apify | Treating empty result array as success | Distinguish between `actor succeeded, no results` (may be silent failure) vs `actor failed with error` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One GoLogin profile spawning Playwright + CU for each action serially | Actions queue up; 10 pending actions take 20+ minutes | Actions are already event-driven; ensure DB webhook fires one invocation per action, not batched | Day 1 with >5 pending actions |
| Supabase Realtime Postgres Changes with per-row RLS checks | Dashboard latency spikes; DB CPU spikes on signal inserts | Use Broadcast channel for intent feed; only use Postgres Changes for low-frequency events (account status) | ~50 concurrent dashboard users |
| snoowrap fetching full post data when only post ID is needed | Reddit API quota consumed on monitoring even without DM actions | Use `.id` and `.name` fields only during monitoring; fetch full post only when generating DM | ~500 subreddit monitored posts/cycle |
| Anthropic API synchronous calls inside Vercel function with no timeout | Function hangs on API slowdown; cascades to timeout | Set explicit `timeout` on all Anthropic SDK calls (30s max); catch timeout and mark action as RETRY | Any Anthropic infrastructure degradation event |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing GoLogin credentials or session cookies in env vars | Single compromise exposes all customer accounts | Store per-workspace GoLogin profile IDs in Supabase (encrypted column); never store cookies server-side |
| Exposing the /live public feed with raw prospect data | User's targets visible to competitors; privacy violation | /live page shows signal text + subreddit only, never prospect username, account, or company |
| No rate limit on DM approval endpoint | Malicious user or browser bug auto-approves entire queue | Approval endpoint must verify the action belongs to the authenticated user's workspace AND enforce 1 approval/second max |
| Logging DM message content in Vercel function logs | DM text may contain sensitive customer product details | Redact message body from logs; log only action ID, platform, and status |
| Shared GoLogin workspace between customers | One customer's account behavior affects another's trust score | Each customer gets isolated GoLogin sub-account or separate GoLogin API key |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing approval queue without intent strength score | Users can't prioritize; approve everything or nothing | Every signal in the queue shows intent score (1-10), post excerpt, and subreddit — decision context always visible |
| Warmup progress shown as days remaining only | User doesn't understand why they can't send DMs yet | Show warmup progress as a checklist: "Day 3/7 — upvoted 12 posts, commented 2 times" with what's happening automatically |
| Agent personality states ("Scanning", "Found") with no explanation | New users confused what the agent is doing | First-time tooltip on each state explains: "Scanning = checking Reddit every 15 min for new mentions of your keywords" |
| Credit balance shown only in header | User doesn't connect credit consumption to actions | Show credit cost per action type in the approval queue: "Approving this DM costs 5 credits (balance: 47)" |
| Email digest without link back to specific signals | User reads digest, has no way to act on it | Each digest item deep-links to the specific signal in the intent feed |

---

## "Looks Done But Isn't" Checklist

- [ ] **Reddit DM sending:** Often missing shadowban verification — confirm DM thread appears in sent items via unauthenticated secondary check
- [ ] **Warmup protocol:** Often missing organic behavioral variety — verify warmup includes upvotes/comments on unrelated content, not just account creation
- [ ] **Credit system:** Often missing race condition handling — verify concurrent action triggers don't overdraft by testing with simultaneous approvals
- [ ] **Action idempotency:** Often missing duplicate-send prevention — verify DB has unique constraint on `(prospect_id, campaign_id, action_type)` for completed actions
- [ ] **Supabase Realtime dashboard:** Often missing connection limit handling — verify client reconnects on disconnect and doesn't spawn multiple subscriptions
- [ ] **LinkedIn monitoring:** Often missing health check — verify 0-result runs are distinguished from actor failures
- [ ] **GoLogin CDP connect:** Often missing readiness check — verify profile status is `ready` before Playwright connect, not just profile existence
- [ ] **Stripe billing:** Often missing webhook idempotency — verify the same webhook event processed twice doesn't double-credit a user

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Shared Reddit OAuth rate limit hits wall | HIGH | Migrate to per-workspace OAuth apps; requires credential migration and customer re-auth flow |
| GoLogin CDP compatibility break after update | MEDIUM | Pin GoLogin version; add version check to smoke test; swap to Playwright's own Chromium as temporary fallback |
| Reddit account shadowbanned | HIGH | Account is unrecoverable; spin up fresh account, restart warmup from day 1; add shadowban detection to prevent silent loss |
| Duplicate DMs sent to prospects | MEDIUM | Apologize outreach template to affected prospects; add idempotency key table if missing; manually mark duplicates in prospect DB |
| Vercel function timeout migration to Railway | MEDIUM | Action worker is already designed as a separate invocation point (DB webhook → function); swap endpoint URL in DB webhook config |
| Apify actor silent failure (0 results) | LOW | Swap to pinned fallback actor; LinkedIn signals resume; surface 48h gap to affected users with explanation |
| Credit balance goes negative for users | MEDIUM | Reconcile via Supabase function; issue credit refund; fix atomic decrement pattern before re-enabling actions |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Shared Reddit OAuth rate limits | Reddit integration (action engine) | Test with 5 simultaneous snoowrap instances using different client IDs; verify independent rate limit buckets |
| GoLogin CDP silent failures | Action engine (GoLogin + Playwright) | CDP smoke test in CI; health check confirms profile `ready` state before connect |
| Haiku CU infinite loops | Action engine (CU orchestration) | Action execution never exceeds 15 steps; stuck detection triggers on 3 identical screenshots |
| Reddit behavioral fingerprinting | Anti-ban system + warmup scheduler | Warmup log shows mix of organic + promotional actions; shadowban check runs post-warmup |
| Vercel timeout orphaned state | Action engine (state machine) | Stale `EXECUTING` actions (>10 min) are auto-recovered by cleanup cron in integration test |
| Credit race conditions | Stripe billing + credit economy | Concurrent approval test: 10 simultaneous approvals with balance=5 credits results in exactly 1 success |
| Intent detection false positives | Signal detection + intent feed | Staging test with real Reddit data: classifier rejects >70% of venting/academic posts; only genuine buying intent passes |
| LinkedIn actor silent failure | LinkedIn monitoring | Smoke test query returns results; 0-result run for 48h triggers `MONITOR_HEALTH` alert in dashboard |

---

## Sources

- [Reddit shadowban detection patterns (Reddifier, 2025)](https://reddifier.com/blog/reddit-shadowbans-2025-how-they-work-how-to-detect-them-and-what-to-do-next)
- [BotBouncer on Reddit — how it works](https://reddifier.com/blog/what-is-botbouncer-on-reddit-how-it-works-and-how-marketers-can-avoid-bans)
- [Reddit account warmup guide (Multilogin, 2026)](https://multilogin.com/blog/how-to-warm-up-a-reddit-account/)
- [Reddit automation IP ban explained (Dicloak, 2025)](https://dicloak.com/blog-detail/reddit-ip-ban-explained-2025-why-reddit-blocked-your-ip-and-how-to-fix-it)
- [LinkedIn automation safety guide 2026 (GetSales)](https://getsales.io/blog/linkedin-automation-safety-guide-2026/)
- [LinkedIn automation ban avoidance rules (LigoAI, 2025)](https://www.ligoai.com/blog/how-to-avoid-linkedin-automation-ban-12-rules-2025)
- [LinkedIn automation crackdown (ConnectSafely, 2026)](https://connectsafely.ai/articles/linkedin-automation-crackdown-inbound-shift-2026)
- [GoLogin Reddit automation issues post-update (BlackHatWorld, 2025)](https://www.blackhatworld.com/seo/after-recent-update-the-best-anti-detect-browser-for-reddit.1721667/)
- [Claude Computer Use production deployment guide (Digital Applied)](https://www.digitalapplied.com/blog/claude-computer-use-production-deployment-guide)
- [Playwright connect_over_cdp timeout bug #35115 (GitHub)](https://github.com/microsoft/playwright/issues/35115)
- [Playwright connect_over_cdp stuck bug #35928 (GitHub)](https://github.com/microsoft/playwright/issues/35928)
- [Vercel long-running background functions (Inngest)](https://www.inngest.com/blog/vercel-long-running-background-functions)
- [Vercel function duration configuration (Official docs)](https://vercel.com/docs/functions/configuring-functions/duration)
- [Supabase Realtime limits (Official docs)](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Realtime Postgres Changes bottleneck (Official docs)](https://supabase.com/docs/guides/troubleshooting/realtime-concurrent-peak-connections-quota-jdDqcp)
- [snoowrap client ID rate limit issue #57 (GitHub)](https://github.com/not-an-aardvark/snoowrap/issues/57)
- [snoowrap continueAfterRatelimitError issue #105 (GitHub)](https://github.com/not-an-aardvark/snoowrap/issues/105)
- [Metered billing implementation pitfalls (Vayu)](https://www.withvayu.com/blog/implementing-metered-billing-software)

---
*Pitfalls research for: AI social outreach / intent detection platform (repco.ai)*
*Researched: 2026-04-16*
