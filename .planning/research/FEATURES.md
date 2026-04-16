# Feature Research

**Domain:** AI social outreach / intent detection platform (Reddit + LinkedIn)
**Researched:** 2026-04-16
**Confidence:** MEDIUM-HIGH (competitor product pages + G2 reviews + industry analysis; no direct API access to internal roadmaps)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Keyword/subreddit monitoring | Every monitoring tool does this; it's the entry point | LOW | snoowrap for Reddit, Apify for LinkedIn; poll cadence matters |
| Intent scoring per signal | Users need to know what's worth acting on — raw volume is noise | MEDIUM | Binary "yes/no" is too blunt; 1–10 scale or high/medium/low tiers expected |
| Personalized outreach message per signal | Generic blasts kill reply rates; "relevant to their post" is the minimum bar | MEDIUM | Must reference specific post content, not just prospect's name |
| Follow-up sequence | One-touch outreach is table stakes — competitors all do 3–5 touch sequences | MEDIUM | Stops on reply; day 3/7/14 is the standard cadence |
| Reply detection | If the tool misses replies and keeps sending, users get flagged and lose trust in it | MEDIUM | Inbox polling via automation; must be near-real-time (2h window acceptable) |
| Prospect pipeline / status tracking | Users need to know who was contacted, replied, converted — no black box | MEDIUM | Kanban-style (detected → contacted → replied → converted) is standard mental model |
| Account health and rate limiting | LinkedIn bans are the #1 complaint about automation tools; basic safety is non-negotiable | HIGH | Daily limits, warmup awareness, per-account health status visible to user |
| Approval queue for DMs | "Human in the loop" is now expected by SMB users who fear brand damage from bad AI messages | LOW | Simple approve/reject; edit before send is the gold standard |
| Basic analytics / digest | Users need proof the tool is working — open rates, reply rates, signals found | LOW | Daily email digest minimum; dashboard metrics preferred |
| Export (CSV) | Sales teams paste data into their existing tools; no export = locked in | LOW | One-click CSV of detected leads and pipeline status |
| Billing transparency | Credit systems require clear usage visibility — users get anxious about runaway costs | LOW | Per-action cost display; remaining credits visible at all times |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but create stickiness and word-of-mouth.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cross-platform intent (Reddit + LinkedIn) | No competitor does both — Gojiberry is LinkedIn-only, Octolens monitors but doesn't act | HIGH | The white space: detection + action across two platforms from one dashboard |
| Agent persona with emotional states | Makes the product feel alive; "repco found 8 people" is inherently shareable | MEDIUM | Emotional states (Scanning, Found, Waiting, Sent, Cooldown) create narrative that users tweet about |
| Signal classification via LLM (not just keyword) | Reduces false positives dramatically; competitors use keyword matching only | HIGH | Claude Sonnet for ambiguous signals; structural matching first to control API cost |
| "Scan my product" landing page hook | Shows real Reddit results before signup — removes skepticism at point of conversion | LOW | Unauthenticated Reddit search; major trust signal for cold traffic |
| Public /live feed | Social proof + virality mechanic — users share the URL; journalists discover it | LOW | Polling, no auth; shows anonymized signals in real-time |
| Weekly shareable results card | "Your repco found 42 leads this week" as a 1200x630 image makes self-promotion trivial | LOW | Drives organic Twitter/LinkedIn growth for repco itself |
| Auto-generated onboarding (3-question → keywords + subreddits) | Competitors require manual keyword setup; this removes the biggest setup friction | MEDIUM | Uses Claude to generate initial config from product/customer/competitor input |
| Browser-based DM delivery (GoLogin + Playwright) | DM APIs don't exist — this is the only way to deliver DMs at scale legally | HIGH | The moat: most competitors email-only or LinkedIn InMail only |
| Credit economy measuring full agent activity | Aligns pricing with value delivered; no arbitrary message-count caps | MEDIUM | 3-layer model (monitoring + account burn + action cost) is novel in this space |
| Warmup scheduler with progress visibility | Every tool warns about warmup but none automate it; visible progress builds confidence | MEDIUM | 7-day progressive protocol per account, shown in dashboard |
| Agent "on my behalf, in my voice" framing | Positions the product as an employee, not a tool — higher perceived value and retention | LOW | Copy and UI decisions more than engineering |
| Self-promotion GTM (repco uses repco) | Live proof the product works; no other sales automation tool publicly dogfoods itself | LOW | Use repco's own /live feed + results card as primary marketing content |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create real problems for this product at this stage.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full autopilot (zero approval) | Users want to set-and-forget | Bad AI messages destroy the sender's brand reputation on their own account; at V1, quality variance is too high. Gartner: HITL reps 3.7x more likely to hit quota | Ship approval queue; offer autopilot as V2 once message quality is validated |
| CRM integrations (HubSpot, Pipedrive) | Power users want data in their existing stack | Integration surface is enormous; each CRM needs its own connector, webhook schema, and OAuth flow. Maintenance tax is severe at solo-founder pace | CSV export covers 80% of use cases; API webhooks for V2 |
| A/B testing message variants | Marketers expect this from outreach tools | Requires statistical significance infrastructure, variant tracking, and attribution logic; burns credits on low-signal experiments at small scale | Ship one high-quality default prompt; let users customize the system prompt as a proxy for variant testing |
| X/Twitter, Instagram, TikTok | "You're leaving money on the table" | Each platform requires new automation infra, new anti-ban research, new rate limit models. Spreading thin kills the core product | Dominate Reddit + LinkedIn first; add platforms only after $20K MRR |
| Team / multi-user accounts | Agencies and SDR teams want this | Per-seat billing, permissions model, audit logs, and shared approval queues add weeks of auth infrastructure | Single-user V1; white-label agency tier as V1.5 |
| Email sequences | Apollo/Outreach users expect email as a channel | Email deliverability is a solved but expensive problem (domain warmup, DMARC/SPF/DKIM, bounce handling); it's a different product category from social DM | Explicitly position as "social outreach only" — email is the crowded market you're not competing in |
| Real-time everything (WebSockets on /live) | Feels premium and live | WebSocket connection limits on serverless edge become a scaling wall on free/public pages; LinkedIn and Reddit data is not actually real-time (polling cadence is 15min/2h) | Polling every 10-30s is imperceptible to users; use Supabase Realtime only for authenticated dashboard |
| Mobile app | Users want to approve DMs on the go | React Native or Expo adds a separate release pipeline; push notifications require Apple/Google developer accounts; the approval queue works fine on mobile web | Mobile-responsive web first; PWA if demand emerges |
| Chrome extension | "I want it in my browser" | Browser extensions are the most detectable automation vector — LinkedIn's detection rate for extensions vs. cloud automation differs by 60%; shipping an extension undermines the anti-ban story | Cloud-only architecture is the safety story; never ship an extension |

---

## Feature Dependencies

```
Onboarding (3-question flow)
    └──generates──> Keyword config + subreddit list
                       └──required by──> Monitoring workers (Reddit + LinkedIn)
                                           └──produces──> Intent signals
                                                            └──required by──> Intent feed / dashboard
                                                            └──required by──> Approval queue
                                                                                └──triggers──> Action engine (DM send)
                                                                                                   └──requires──> GoLogin account with warmup complete
                                                                                                   └──produces──> Prospect pipeline entry

Warmup scheduler
    └──required before──> Action engine can send DMs
    └──feeds into──> Account health monitoring

Reply detection
    └──requires──> Action engine (same GoLogin session)
    └──terminates──> Follow-up sequence

Follow-up sequence
    └──requires──> Initial DM sent (pipeline entry)
    └──stops on──> Reply detection

Credit economy
    └──tracks──> Monitoring burn + account burn + action cost
    └──required by──> Billing (Stripe)
    └──displayed in──> Dashboard header

/live page
    └──reads from──> Intent signals (public, anonymized)
    └──no dependency on──> Auth or approval queue

"Scan my product" landing hook
    └──uses──> Reddit API (unauthenticated public search)
    └──no dependency on──> Any core infra (ships before onboarding)
```

### Dependency Notes

- **Warmup is a hard prerequisite for action engine:** Attempting to send DMs before warmup protocol completes triggers LinkedIn ban. Warmup scheduler must be phase 1, action engine phase 2.
- **Intent feed requires monitoring workers:** No signals = empty dashboard. Monitoring must be live before dashboard has any value to show.
- **Approval queue gates action engine:** The human-in-the-loop architecture means nothing sends without approval. This is a trust feature, not a limitation.
- **Reply detection and follow-up are tightly coupled:** Both share the same GoLogin session; they must be built together to avoid conflicts.
- **/live and "Scan my product" are independent of core pipeline:** These can ship earlier as marketing mechanics without blocking the core product.

---

## MVP Definition

### Launch With (v1)

Minimum to validate: "AI finds people looking for my product and sends them a DM that gets replies."

- [x] 3-question onboarding → auto-generated keywords + subreddits
- [x] Reddit monitoring (snoowrap, 15min poll) + LinkedIn monitoring (Apify, 2-4h poll)
- [x] Structural keyword matching + Claude Sonnet classification for ambiguous signals
- [x] Intent feed dashboard with signal scoring (1–10)
- [x] Approval queue (DMs require approval; likes/follows auto-approved)
- [x] DM generation (Claude Sonnet 4.6, max 3 sentences, references specific post)
- [x] Follow-up sequence (day 3/7/14, stops on reply)
- [x] Reply detection (GoLogin + Playwright inbox check every 2h)
- [x] Account warmup (7-day progressive protocol, visible progress)
- [x] Anti-ban system (GoLogin Cloud profiles, rate limiting, behavioral noise)
- [x] Prospect pipeline kanban (detected → engaged → contacted → replied → converted → rejected)
- [x] Account health monitoring (warmup progress, daily limits, health status)
- [x] Daily email digest (Resend)
- [x] CSV export
- [x] Stripe billing (subscription + credit packs)
- [x] Credit economy display (remaining credits, per-action cost)
- [x] Agent persona with emotional states ("repco" — Scanning, Found, Waiting, Sent, Reply, Cooldown)

### Add After Validation (v1.x — trigger: paying users or $5K MRR)

- [ ] White-label agency mode — trigger: agency inquiries
- [ ] Additional platforms (X, TikTok) — trigger: Reddit+LinkedIn saturated for early users
- [ ] GeeLark mobile profiles — trigger: GoLogin reliability issues at scale
- [ ] Public API / webhooks — trigger: users asking for CRM push without CSV

### Future Consideration (v2+ — trigger: product-market fit established, $20K MRR)

- [ ] Autopilot mode (no approval required) — defer until message quality is validated at scale
- [ ] CRM integrations (HubSpot, Pipedrive, Salesforce) — defer; CSV covers 80% of V1 use cases
- [ ] A/B testing message variants — defer; requires statistical infrastructure not justified at <$20K MRR
- [ ] Team / multi-user accounts — defer; solo-user SaaS is simpler to support and sell
- [ ] Multilogin enterprise profiles — defer; GoLogin sufficient for V1-V1.5

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Reddit + LinkedIn monitoring | HIGH | MEDIUM | P1 |
| Intent scoring + LLM classification | HIGH | HIGH | P1 |
| Approval queue + DM generation | HIGH | MEDIUM | P1 |
| Account warmup scheduler | HIGH | MEDIUM | P1 |
| Anti-ban system (GoLogin + rate limits) | HIGH | HIGH | P1 |
| Follow-up sequence + reply detection | HIGH | HIGH | P1 |
| Intent feed dashboard | HIGH | MEDIUM | P1 |
| Prospect pipeline kanban | HIGH | MEDIUM | P1 |
| 3-question onboarding → auto-config | HIGH | MEDIUM | P1 |
| Stripe billing + credit economy | HIGH | MEDIUM | P1 |
| Agent persona (repco + emotional states) | MEDIUM | LOW | P1 — low cost, high differentiation |
| Daily email digest | MEDIUM | LOW | P1 |
| Account health monitoring | MEDIUM | LOW | P1 |
| CSV export | MEDIUM | LOW | P1 |
| "Scan my product" landing hook | MEDIUM | LOW | P1 — marketing mechanic, ships early |
| /live public feed | MEDIUM | LOW | P2 — virality, not required for core |
| Weekly shareable results card | MEDIUM | LOW | P2 — GTM, not core |
| CRM integrations | HIGH | HIGH | P3 — defer to V2 |
| Autopilot mode | MEDIUM | HIGH | P3 — defer until quality validated |
| A/B message testing | LOW | HIGH | P3 |
| Multi-user / team accounts | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — without these, the product doesn't work or doesn't sell
- P2: Should have — add before scaling marketing; doesn't block initial users
- P3: Nice to have — future consideration, deferred deliberately

---

## Competitor Feature Analysis

| Feature | Gojiberry.ai | Octolens | Phantombuster / Expandi | Apollo / Outreach | repco.ai approach |
|---------|--------------|----------|------------------------|-------------------|-------------------|
| Reddit monitoring | No | Yes (monitor only, no action) | Partial (scraping, no intent AI) | No | Yes — 15min poll + LLM classification |
| LinkedIn monitoring | Yes (30+ signals) | Yes (keyword only) | Yes (scraping) | Yes (engagement tasks) | Yes — Apify 2-4h + LLM classification |
| Cross-platform (Reddit + LinkedIn) | No | Monitors both, acts on neither | No | No | Yes — the only tool to detect AND act on both |
| Intent scoring / AI classification | Yes (ICP scoring) | Yes (relevance score) | No | Yes (intent data) | Yes — 1-10 scale, Claude Sonnet for ambiguous signals |
| Automated DM delivery | Yes (LinkedIn) | No — monitoring only | Yes (LinkedIn) | No (email + LinkedIn tasks) | Yes — GoLogin + Playwright, both platforms |
| Browser automation (not API) | Unknown / likely API | No | Extension + cloud | No | Yes — required because DM APIs don't exist |
| Approval queue (human-in-loop) | No — fully auto | N/A | No | Optional (Salesforce) | Yes — required for V1 trust |
| Follow-up sequences | Yes | No | Yes | Yes | Yes — 3-touch (day 3/7/14) |
| Reply detection | Yes | No | Yes | Yes | Yes — GoLogin inbox check every 2h |
| Account warmup | Unknown | N/A | Yes (Expandi) | N/A | Yes — 7-day progressive protocol |
| Anti-ban / rate limiting | Yes | N/A | Yes | N/A | Yes — behavioral noise, daily limits, GoLogin Cloud |
| Agent persona / emotional UI | No | No | No | No | Yes — "repco" with states; unique differentiator |
| Prospect pipeline | Basic | No | No | Yes (full CRM) | Yes — kanban, 6 stages |
| Credit economy | No (seat-based) | No | No | No (seat-based) | Yes — 3-layer credit model |
| Public /live feed | No | No | No | No | Yes — virality mechanic |
| Shareable results card | No | No | No | No | Yes — word-of-mouth mechanic |
| CRM integrations | No | Slack alerts | Zapier/HubSpot | Yes (native) | V2 only; CSV export for V1 |

---

## Sources

- [Gojiberry AI review — Salesforge (2026)](https://www.salesforge.ai/blog/gojiberry-ai-review)
- [Gojiberry AI — official site](https://gojiberry.ai/)
- [Octolens — Reddit monitoring features](https://octolens.com/reddit-monitoring)
- [7 Best Octolens Alternatives — Clearcue (2026)](https://clearcue.ai/blog/octolens-alternatives-b2b-social-listening-intent-signals)
- [LinkedIn automation safety guide 2026 — GetSales](https://getsales.io/blog/linkedin-automation-safety-guide-2026/)
- [PhantomBuster vs Expandi — PhantomBuster blog](https://phantombuster.com/blog/ai-automation/phantombuster-vs-expandi/)
- [Apollo: what features define best-in-class sales engagement](https://www.apollo.io/insights/what-features-define-a-best-in-class-sales-engagement-platform)
- [Human-in-the-loop automation tools 2026 — Moxo](https://www.moxo.com/blog/human-in-the-loop-automation-software)
- [AI personalization trends in cold outreach 2025 — Salesforge](https://www.salesforge.ai/blog/ai-personalization-trends-in-cold-outreach-2025)
- [SaaS credits system guide 2026 — Colorwhistle](https://colorwhistle.com/saas-credits-system-guide/)
- [LinkedIn automation ban risk 2026 — Growleads](https://growleads.io/blog/linkedin-automation-ban-risk-2026-safe-use/)

---

*Feature research for: AI social outreach / intent detection platform (repco.ai)*
*Researched: 2026-04-16*
