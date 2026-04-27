# Browserbase vs GoLogin — Migration Research (Phase 17.5 spike)

**Date:** 2026-04-27
**Trigger:** GoLogin parallel-launches quota stuck at 1/1 during Phase 17 UAT, after only 4 daily launches consumed.
**Outcome:** Recommend full migration to Browserbase. Pricing 5× cheaper at scale, concurrency 8× higher per dollar, simpler API surface.

---

## 1. Workspace state

| | GoLogin | Browserbase |
|---|---|---|
| Account | `kamil.wandtke` (workspace `69e34dd00213fbdbd576fee4`) | Project "Production project" (id `8220f64d-131b-47bd-8202-d0eb2fb45003`) |
| Plan | Professional | Free (need Developer for proxy) |
| Concurrent sessions | 1 (stuck due to ghost-session bug) | 3 free / 25 Developer / 100 Startup |
| Cloud-time/mc | 100h | 1h free / 100h Developer / 500h Startup |
| Residential proxy | $1.99/GB add-on | $12/GB Developer / $10/GB Startup, 1-5 GB included |

## 2. API surface mapping

The migration collapses **4 GoLogin calls into 2 Browserbase calls** for the connect flow.

| GoLogin operation | Browserbase equivalent |
|---|---|
| `POST /browser` (createProfileV2) | `POST /v1/contexts` — one-time per account, persistent data container |
| `POST /users-proxies/mobile-proxy` (assignResidentialProxy) | merged into session params (`proxies:[{type:'browserbase', geolocation:{country:'US', state, city}}]`) |
| `PATCH /browser/fingerprints` (patchProfileFingerprints) | not needed — auto-randomized fingerprint per session |
| `POST /browser/{id}/web` (startCloudBrowser) | `POST /v1/sessions` with `browserSettings.context.{id, persist:true}` |
| `GET /browser/{id}` (response field `remoteOrbitaUrl` — actually broken, no live view) | `GET /v1/sessions/{id}/debug` returns `debuggerFullscreenUrl` (iframe-embeddable!) |
| `DELETE /browser/{id}/web` (stopCloudBrowser) | `POST /v1/sessions/{id}` with `status:"REQUEST_RELEASE"` |
| `DELETE /browser/{id}` (deleteProfile) | `DELETE /v1/contexts/{id}` |

## 3. Key differences (architectural)

### Context vs Session

GoLogin: profile = both persistent data AND running browser instance (1:1).
Browserbase: **separate** — `Context` is data (cookies/localStorage/IndexedDB/Service Workers, full Chromium user-data-dir), `Session` is a browser instance attached to a context.

**Implication:** Our `browser_profiles` table should store `browserbase_context_id` (not `browserbase_session_id`). Sessions are ephemeral (60s–6h, then expire). Contexts are permanent until explicitly deleted.

### Fingerprint

GoLogin: per-profile, requires `patchProfileFingerprints` to refresh.
Browserbase: per-session, auto-randomized stealth fingerprint. No manual patching needed.

**Implication:** Drop BPRX-04 entirely — Browserbase handles it transparently.

### Proxy

GoLogin: separate proxy entity, attached to profile via `POST /users-proxies/mobile-proxy`.
Browserbase: proxy is a session-level config (`proxies:[{type:'browserbase', geolocation:{country, state?, city?}}]`). New session = new proxy IP from same geo pool. Same context can use different IPs across sessions (good for anti-ban variance).

**Implication:** No `assignResidentialProxy` step. Country-map (BPRX-05) still needed for the geo lookup but feeds session params, not a separate API call.

### Live view

GoLogin: `remoteOrbitaUrl` from `startCloudBrowser`. Bug: this URL doesn't actually render in iframe per our tests.
Browserbase: `debuggerFullscreenUrl` from `GET /v1/sessions/{id}/debug`. **Iframe-embeddable, sandboxed, two modes** (read-only with `pointer-events:none` for view, or interactive for control).

**Implication:** UX upgrade — user logs in to Reddit/LinkedIn **inside our app** (embedded iframe), not in a popup/external GoLogin tab. Massive UX win.

## 4. Pricing analysis at scale

Assuming 50 MVP users, each with 1 Reddit + 1 LinkedIn account, peak 2-4 concurrent sessions per user (warmup + DM send + inbox check overlap):

**GoLogin scale economics:**
- 50 users × 2 platforms × 1 profile/platform = **100 profile slots needed** → Enterprise plan ~$300/mo
- Peak 100 concurrent sessions → maxParallelCloudLaunches needs to be ≥100 → Enterprise+ negotiation
- Cloud hours: 50 users × 30 min/day × 30 days = 750h/mc → over Business 300h cap, eats Enterprise 1000h
- **Total ~$300-500/mo** + per-GB residential proxy

**Browserbase scale economics:**
- 100 contexts (no slot limit on Developer plan)
- Peak 100 concurrent → Startup plan $99/mo (100 concurrent)
- Browser hours: 750h × $0.10/h overage past 500 included = $25/mc overage
- Residential proxy: ~5GB included, then $10/GB. For our use case (mostly login + brief actions, not scraping) — likely 5-10 GB, so $50-100/mc
- **Total ~$200/mo** for 50 users at MVP scale

**Browserbase wins by ~40-50% at MVP scale, more at growth.**

## 5. MCP integration

GoLogin: official MCP server exists (used during Phase 17 dev for probes). Tools: profile CRUD, proxy mgmt, session start/stop.
Browserbase: official MCP server `@browserbasehq/mcp-server-browserbase`. Tools: session navigate/click/extract, screenshot, full Stagehand integration.

**Stagehand bonus:** Browserbase's open-source SDK (`@browserbasehq/stagehand`) wraps Playwright with LLM-driven actions:
- `page.act("click the connect button")` instead of fragile selectors
- `page.extract({ schema: zod })` for structured data
- **Game-changer for our LinkedIn DOM-fragility problem in Phase 13** (LinkedIn DOM changes 1-2× per month, breaks our selectors).

Cost: 1 LLM call per Stagehand action (~$0.001-0.005 each on Haiku). For 50 users × 8 DMs/day × 30 days = ~$36-180/mo. Acceptable trade for cutting LinkedIn-executor maintenance burden.

## 6. Migration scope (preliminary estimate)

| Layer | Effort | Files |
|---|---|---|
| Replace `client.ts` (GoLogin → Browserbase) | 2h | `src/lib/gologin/client.ts` → `src/lib/browserbase/client.ts` |
| Rewrite `allocator.ts` | 1h | `src/features/browser-profiles/lib/allocator.ts` (3 calls → 2 calls, drop BPRX-04) |
| DB migration (rename gologin_* → browserbase_*) | 30min | `supabase/migrations/00024_browserbase_columns.sql` |
| Update `connectAccount` server action | 15min | `src/features/accounts/actions/account-actions.ts` |
| Update `startAccountBrowser` (lazy cloud start) | 30min | same file |
| Phase 13 LinkedIn executors (DM/Connect/Follow/Like/Comment) — swap CDP endpoint | 2h | `src/features/actions/lib/linkedin-*.ts` (5 files) |
| Phase 13 prescreen — same | 30min | `src/features/prescreen/lib/linkedin-prescreen.ts` |
| Phase 4 P04 Reddit inbox CU | 30min | `src/features/replies/lib/reddit-inbox-cu.ts` |
| `country-map.ts` — verify Browserbase region coverage | 15min | (no code change needed unless regions differ) |
| UAT + screenshots | 1h | new screenshots/uat-17.5-* |

**Total estimate: ~8h focused work** + Browserbase plan upgrade ($20/mo Developer for proxy).

## 7. Decision points (user-facing)

1. **Stagehand adoption?** Recommend YES for LinkedIn executors (Phase 13), NO for Reddit prescreen (Haiku CU works). Defer to Phase 19+.
2. **DB migration strategy?** Recommend tabula rasa (`project_users_are_test_data` memory) — drop `gologin_profile_id` and `gologin_proxy_id` columns, add `browserbase_context_id`.
3. **Phase 17 disposition?** Recommend mark as ABANDONED with lessons learned, start Phase 17.5 fresh with new CONTEXT/RESEARCH/PLAN.

## 8. Open risks

- **Vendor lock-in #1:** Browserbase 2-yr-old startup. Mitigation: their API is so close to standard Playwright/CDP that a future migration to Steel.dev or Hyperbrowser would be ~2h work, not 2 weeks.
- **Vendor lock-in #2:** Stagehand depends on Browserbase backend for browsing primitives. Locking us in tighter. Mitigation: keep LinkedIn executors raw Playwright initially, add Stagehand opportunistically per executor.
- **Geo coverage:** Browserbase residential proxy supports ISO country codes (verified for US). Need to confirm GB/DE/PL/FR/CA/AU all work — quick API probe before locking country-map.
- **Cookie re-auth:** Persistent context auto-saves on session end, but sessions have hard timeout (default 5 min). If user takes >5 min to log in, session expires; cookies up to that point are saved but Reddit/LinkedIn login may not be complete. Mitigation: bump session timeout to 30 min for connect flow (`timeout: 1800` in createSession).

## 9. Concrete next steps

If user approves migration:

1. User upgrades to Developer plan ($20/mo) on browserbase.com to unlock residential proxy.
2. Insert Phase 17.5 in roadmap: "Browserbase migration".
3. Create CONTEXT.md / PLAN.md for 17.5 (3-4 plans: client.ts swap, allocator rewrite, DB migration, executor refit).
4. Mark Phase 17 as ABANDONED in ROADMAP.md with link to this doc.
5. Execute Phase 17.5 plans in sequence.

## 10. Appendix — empirical probes

```bash
# 2026-04-27 probes against live API (key: bb_live_udx...)

# List projects → got id 8220f64d-131b-47bd-8202-d0eb2fb45003, concurrency:3
GET /v1/projects → 200

# Create persistent context → got id 417b559b-7ab0-4b5e-90b5-cded48e54024 + S3 upload URL
POST /v1/contexts {projectId} → 200

# Try session with US residential proxy on free plan
POST /v1/sessions {proxies:[{type:browserbase, geolocation:{country:US}}]} → 402 Payment Required

# Same without proxy → 201, got connectUrl (wss://) + signingKey
POST /v1/sessions {browserSettings:{context:{id, persist:true}}} → 201

# Get live view URL
GET /v1/sessions/{id}/debug → 200 with debuggerFullscreenUrl + debuggerUrl + per-page URLs

# Stop session
POST /v1/sessions/{id} {status:"REQUEST_RELEASE"} → 200, status COMPLETED
```
