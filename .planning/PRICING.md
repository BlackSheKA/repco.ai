# Pricing Spec — repco.ai

**Wersja:** 1.1 · **Data:** 2026-04-27 · **Owner:** Kamil
**Cel dokumentu:** kompletna specyfikacja cennika — plany, free tier (PLG), wycena per-mechanism, model burn'u kredytów. Source-of-truth dla migracji DB, Stripe products i UI billing/`/signals`.

> **Status:** SPEC do implementacji. Aktualne ceny w kodzie (3-6 cr/day flat) są niedoszacowane i nie pokrywają wszystkich 27 mechanizmów z [SIGNAL-DETECTION-MECHANISMS.md](SIGNAL-DETECTION-MECHANISMS.md).

> **v1.1 zmiana:** porzucono model 3 cyklów rozliczeniowych (Monthly/Quarterly/Annual) na rzecz **3 volume tierów** (Starter/Growth/Scale) z ortogonalnym annual billing toggle. Powód: stary model dawał Annual user'owi $0.006/credit = równe kosztowi infra (0% margin), a Annual credits były 4× tańsze niż najtańszy credit pack. Volume tiers są spójne z pack pricing i każdy tier ma zdrową marżę.

---

## 1. Model cenowy: per-scan × cadence

**Jednostka rozliczenia:** każdy scan każdego mechanizmu deduktuje określoną liczbę credits.

```
daily_burn = cr_per_scan × scans_per_day(cadence) × num_sources
```

To jest **server-side burn engine** — niewidoczny dla użytkownika.

**Cadence → scans/day:**

| Cadence | Scans/day | Use case |
|---|---|---|
| 24h | 1 | low-signal sources (L8 job change, L9 hiring) |
| 6h | 4 | **economy default** — większość mechanizmów |
| 4h | 6 | balanced |
| 2h | 12 | active monitoring |
| 1h | 24 | high-priority |
| 30min | 48 | inbound mentions (R8, L10, L11) |
| 15min | 96 | premium / time-sensitive |

**Anchor wyceny:** 1 credit ≈ $0.030 retail (mid-pack). Markup ~5× nad realnym kosztem operacyjnym Apify+LLM (target gross margin 80%).

---

## 2. Plany subskrypcyjne — volume tiers

**Filozofia:** plany różnią się **objętością kredytów**, nie cyklem rozliczeniowym. Ten sam tier ma identyczne features (gates są tylko między Free a paid). Annual billing = orthogonal **20% off** toggle (osobny Stripe price per tier × cycle).

### Tiers (monthly billing)

| Tier | Monthly credits | Cena/m | $/cr | Margin | Cap balansu | Stripe env |
|---|---|---|---|---|---|---|
| **Free** | 250 | $0 | — | — | 500 | — |
| **Starter** | 1 000 | **$25** | $0.025 | 76% | 2 000 | `STRIPE_PRICE_STARTER_MONTHLY` |
| **Growth** ⭐ | 3 000 | **$59** | $0.0197 | 70% | 6 000 | `STRIPE_PRICE_GROWTH_MONTHLY` |
| **Scale** | 8 000 | **$129** | $0.0161 | 63% | 16 000 | `STRIPE_PRICE_SCALE_MONTHLY` |

⭐ Growth = recommended default, Stripe `marketing_features` flag.

### Annual billing toggle (-20%)

Pay yearly upfront → 20% off effective monthly price:

| Tier | Annual price | Effective $/m | $/cr (annual) | Margin (annual) | Stripe env |
|---|---|---|---|---|---|
| Starter | **$240/yr** | $20/m | $0.020 | 70% | `STRIPE_PRICE_STARTER_ANNUAL` |
| Growth ⭐ | **$566/yr** | $47/m | $0.0157 | 62% | `STRIPE_PRICE_GROWTH_ANNUAL` |
| Scale | **$1 238/yr** | $103/m | $0.0129 | 54% | `STRIPE_PRICE_SCALE_ANNUAL` |

Najgorszy case (Scale annual) wciąż **54% margin** — zdrowo nad infra cost ($0.006/cr).

### Sanity vs credit packs

Subscription per-credit pricing musi być **lekko korzystniejsze niż packs** (lock-in benefit) ale nie totalnie deklasować packs (które są emergency top-up).

| Tier | $/cr (annual) | vs najbliższy pack |
|---|---|---|
| Starter | $0.020 | ≈ Growth pack ($0.039) — sub 50% taniej, OK lock-in benefit |
| Growth | $0.0157 | ≈ Scale pack ($0.030) — sub 47% taniej |
| Scale | $0.0129 | ≈ Agency pack ($0.027) — sub 52% taniej |

Packs pozostają jako emergency top-up (one-time, no commitment); sub jest naturalnie tańszy bo bring recurring revenue.

### Grant rollover

ADDITIVE z cap kumulacji = **2× monthly grant** per tier. Nagradza ciągłość bez "use it or lose it" frustration; blokuje stockpiling roczny.

Cron `monthly-credit-grant` 1 dnia miesiąca o 00:00 UTC: `balance = min(balance + monthly_grant, tier_cap)`.

### Brak trialu

Free tier zastępuje 3-day trial całkowicie. Signup → automatycznie `subscription_tier='free'` + 250 cr balance.

### Anchor messaging (vs broken old model)

Stary model "Annual $25/mies" jako anchor message był mocny ale ekonomicznie broken. Nowy anchor:

> **Growth annual = $47/mes effective.** Tyle co kawa dziennie, vs $4k/mes SDR agency.

Albo per-tier:
- Starter ($25/m): "for solo founders sending ~25 DMs/m"
- Growth ($59/m): "for steady operators sending ~80 DMs/m"
- Scale ($129/m): "for agencies running multi-platform funnels"

---

## 3. Free tier (PLG hook)

### Co user dostaje

- **250 credits / miesiąc** (additive, cap 500)
- **1 social account** (Reddit ALBO LinkedIn — wybór)
- **2 mechanizmy aktywne max** z white-listy: R1, R3, R4, L1, L7, T1, T2
- **Forced cadence ≥4h** (max 6 scans/day)
- **Modifiers M1/M2/M3 free** (jak dla wszystkich)
- Onboarding presets (O2) dostępne

### Czego NIE dostaje (gates upgrade)

- ❌ **Wszystkie akcje LOCKED** — 0 DMs, 0 replies, 0 connection requests, 0 follow-ups
- ❌ Mechanizmy gologin: R7, R8, L6, L10, L11, T3
- ❌ Ciężkie mechanizmy: L2, L3, L4, L5, T4
- ❌ Cadence < 4h (15min/30min/1h zablokowane w UI)
- ❌ E1 signal stacking
- ❌ Multi-account (2 free accounts są tylko dla paid)
- ❌ Top-up packs (musi upgrade na sub)

### UX flow (PLG)

1. Signup → automatycznie free tier
2. Dashboard pokazuje feed sygnałów + watermark "🔒 Upgrade to start outreach"
3. Każda akcja DM/reply/connection → paywall modal: "Connect with leads — upgrade plan"
4. Banner: "Unlock outreach + multi-account + premium mechanisms" (BEZ countdown / burn math)
5. Po wyczerpaniu 250 cr: monitoring pauses; "Buy credits" + "Upgrade plan" CTA (binarny)

### Conversion psychology

- Free user widzi **wartość feedu** (relevant prospects) ale **nie może zadziałać** → silny push do paid.
- Brak top-up packs na free → musi sub (pull do recurring revenue).
- "Watch them appear, but you need plan to message" = klasyczny PLG hook.

### Anti-abuse

- 1 free tier per email + IP (sprawdzane w `handle_new_user` trigger)
- Browser fingerprint via gologin metadata
- Hard-cap 250 cr/m per `user_id` (audit log dla manualnego review)

---

## 4. Credit packs (one-time)

Top-up dostępny **tylko dla paid** subscribers.

| Pack | Credits | Cena | $/cr | Stripe env |
|---|---|---|---|---|
| Starter | 500 | $29 | 0.058 | `STRIPE_PRICE_PACK_STARTER` |
| Growth | 1 500 | $59 | 0.039 | `STRIPE_PRICE_PACK_GROWTH` |
| Scale | 5 000 | $149 | 0.030 | `STRIPE_PRICE_PACK_SCALE` |
| Agency | 15 000 | $399 | 0.027 | `STRIPE_PRICE_PACK_AGENCY` |

Pack credits: additive, NIE wliczają się do cap balansu (cap dotyczy tylko grantów subskrypcji). Power user na Scale tier może mieć 16 000 cr (Scale cap) + 5 000 cr (Scale pack) = 21 000 cr balance.

**Relacja pack ↔ subscription:** packs są naturalnie droższe per-credit niż sub tiers (zob. §2 sanity vs packs). To celowe — packs to emergency top-up (one-time, no commitment); sub bring recurring revenue więc ma rabat. User który regularnie kupuje packs powinien upgrade'ować na wyższy sub tier.

---

## 5. Cennik per mechanism

Bazuje na "Per-mechanism cost matrix" z [SIGNAL-DETECTION-MECHANISMS.md:751-794](SIGNAL-DETECTION-MECHANISMS.md), markup 5×, 1 cr = $0.030 retail.

### Reddit (R1-R9)

| ID | Mechanizm | cr/scan | Jednostka | Premium |
|---|---|---|---|---|
| R1 | Subreddit firehose | **1** | per subreddit | — |
| R2 | Post-watch comments | **2** | per active watch (R1 dependant) | — |
| R3 | Competitor mention | **1** | per competitor name | — |
| R4 | Question pattern (custom) | **1** | per custom pattern | system patterns w pakiecie |
| R5 | Tracked user activity | **1** | per username | — |
| R6 | Tracked user engagement | **2** | per username | — |
| R7 | Own Reddit engagement | **1** | per scan | gologin (1 instance/user) |
| R8 | Reddit mentions/tags | **1** | per scan | gologin (1 instance/user) |
| R9 | Trending posts modifier | **0** | — | free enhancer na R1 |

### Reddit Modifiers (M1-M3)

| ID | Modifier | cr/scan | Notes |
|---|---|---|---|
| M1 | Author quality (pre-filter) | **0** | free, recommended on |
| M2 | Cross-subreddit ICP | **0** | free, opcjonalny |
| M3 | Subreddit tier multiplier | **0** | free, default on |

### LinkedIn (L1-L11)

| ID | Mechanizm | cr/scan | Jednostka | Premium |
|---|---|---|---|---|
| L1 | Keyword post search | **1** | per keyword | — |
| L2 | Auto-disc reactions | **1** | per scan **per active tracked post** | — |
| L3 | Auto-disc comments | **1** | per scan **per active tracked post** | — |
| L4 | Profile reactions | **1** | per scan **per active post per profile** | ⚠️ skaluje się szybko z `last_n_posts_to_track` |
| L5 | Profile comments | **1** | per scan **per active post per profile** | — |
| L6 | Own LinkedIn engagement | **3** | per scan | gologin (1 instance) |
| L7 | New posts from profile | **1** | per profile | — |
| L8 | Job change detection | **1** | per profile (24h cadence) | — |
| L9 | Hiring signals | **1** | per company (24h cadence) | — |
| L10 | Connection requests | **1** | per scan | gologin (1 instance) |
| L11 | LinkedIn mentions | **1** | per scan | gologin (1 instance) |

**Brak hard cap na L2/L3/L4/L5.** User wybiera ile postów monitorować (parametr config), credits skalują się 1:1 z liczbą tracked postów. Im agresywniej user chce monitorować, tym więcej kosztuje. Credit budget = naturalny ogranicznik.

### Twitter / X (T1-T5)

| ID | Mechanizm | cr/scan | Jednostka | Premium |
|---|---|---|---|---|
| T1 | Keyword tweet search | **1** | per keyword | — |
| T2 | Competitor mention X | **1** | per competitor | — |
| T3 | Own tweets engagement | **2** | per scan | gologin opcjonalne |
| T4 | Tracked X profile | **3** | per handle | — |
| T5 | Trending topic | **2** | per topic | — |

### Cross-mechanism enhancements + Operations

| ID | Item | Koszt | Notes |
|---|---|---|---|
| E1 | Signal stacking (composite scoring) | **5 cr/day flat** | jeśli on, niezależnie od liczby sygnałów |
| E2 | Negative feedback loop | **0** | free, default on |
| O1 | Health monitoring | **0** | free infrastructure |
| O2 | Onboarding presets | **0** | one-time AI gen, w cenie |

---

## 6. Outreach mechanisms (outbound pricing)

Każda akcja outbound = osobny mechanizm wg [OUTBOUND-COMMUNICATION-MECHANISMS.md](OUTBOUND-COMMUNICATION-MECHANISMS.md). Credit cost = per-action (deduktowany przy `status='completed'`, NIE przy `pending_approval`).

**Trzy bucket-y kosztowe:**

- **Engage pool (0 cr):** likes / upvotes / follows / reactions / endorse / subreddit join. Wlicza się w daily cap, **nie zużywa kredytów** — wartość = warming kont, nie outreach.
- **Soft outbound (5-20 cr):** komentarze, repost, retweet, quote, list add, post submit/publish. Tańsze niż DM, public visibility.
- **Hard outbound (20-30 cr):** DM, connection request, recommendation, post publish. Highest risk + LLM + Haiku CU.

### Reddit outbound (OR1-OR9)

| ID | Akcja | Credits | Daily cap | Risk | Method |
|---|---|---|---|---|---|
| OR1 | DM | **30** | 8 | high | Haiku CU |
| OR2 | Top-level comment | **15** | 5 | medium | Haiku CU |
| OR3 | Reply do komentarza | **15** | 5 | medium | Haiku CU |
| OR4 | Upvote | **0** | 20 (engage pool) | low | DOM |
| OR5 | Downvote | — | — | hard exclude (UI hidden) | — |
| OR6 | Submit post (własny) | **30** | 1/sub/7d | high | DOM |
| OR7 | Crosspost | **10** | 2/dzień | medium | Haiku CU |
| OR8 | User follow | **0** | 20 (engage pool) | low | DOM |
| OR9 | Subreddit join | **0** | unlimited | low | DOM |

### LinkedIn outbound (OL1-OL11)

| ID | Akcja | Credits | Daily cap | Risk | Method |
|---|---|---|---|---|---|
| OL1 | Connection request (z notą) | **20** | 15 (weekly hard cap 100) | high | URL-hack + DOM |
| OL2 | DM (1° connection only) | **30** | 8 | high | DOM |
| OL3 | InMail (płatny, post-MVP) | TBD | TBD | TBD | TBD |
| OL4 | Reaction (Like/Praise/Insightful/Empathy/Curious/Funny) | **0** | 30 (engage pool) | low | DOM |
| OL5 | Top-level comment | **15** | 10 | medium | DOM |
| OL6 | Reply do komentarza w threadzie | **15** | 10 | medium | Haiku CU |
| OL7 | Profile follow | **0** | 30 (engage pool) | low | DOM |
| OL8 | Repost | **20** (with thoughts) / **5** (simple) | 2/dzień | medium | Haiku CU |
| OL9 | Original post publish | **25** | 1/dzień | high | DOM |
| OL10 | Endorse skill | **0** | 15 | low | DOM |
| OL11 | Recommendation request/write | **30** | 1/dzień | medium | Haiku CU |

### Twitter / X outbound (OX1-OX8)

| ID | Akcja | Credits | Daily cap | Risk | Method |
|---|---|---|---|---|---|
| OX1 | Reply do tweeta | **10** | 30 | medium | DOM |
| OX2 | Quote tweet | **15** | 5 | medium | DOM |
| OX3 | Like tweet | **0** | 50 (engage pool) | low | DOM |
| OX4 | Retweet (simple) | **5** | 5 | medium | DOM |
| OX5 | DM | **25** | 5 | high | DOM |
| OX6 | Follow profile | **0** | 50 (engage pool) | low | DOM |
| OX7 | Original tweet publish | **20** | 5 | medium | DOM/Haiku CU |
| OX8 | List add | **5** | 20 | low | Haiku CU |

### Cross-mechanism orchestration (OC1-OC4)

| ID | Item | Credits | Notes |
|---|---|---|---|
| OC1 | Sequence orchestration | **0** | scheduler tylko — credits płaci się za każdy krok osobno wg jego mechanism cost |
| OC2 | Approval queue | **0** | UI, no execution |
| OC3 | Variant pool / A/B testing | **0** | logika selekcji; AI generator skipowany jeśli variant = oszczędność LLM ale credit cost akcji bez zmian |
| OC4 | Reply detection & cancellation | **0** | gologin inbox parse, infrastructure |

### Modifiers (N1-N3) + Operations (O1-O4)

| ID | Item | Credits | Notes |
|---|---|---|---|
| N1 | Anti-spam content guard | **0** | free, default on, recommended |
| N2 | Account health gate | **0** | free, hard gate (warning/banned blocks akcje) |
| N3 | Tone / persona matcher | **0** | free, pre-generator enhancer |
| O1 | Daily caps + rate limiting | **0** | free infrastructure |
| O2 | Account warm-up scheduling | **0** | free, auto na nowe konta |
| O3 | Health monitoring per mechanism | **0** | free, alerty failure rate |
| O4 | Variant analytics | **0** | free, dashboard metrics |

### Follow-up DM (legacy mapping)

`followup_dm` jako osobny `action_type` (sequencowy DM po D3/D7/D14) = **20 cr** dla Reddit + LinkedIn. Trzeźwo: to OR1/OL2 wykonany w sequencu OC1 z `is_followup=true` flag — niższy credit cost odzwierciedla, że LLM ma już context z poprzedniego DM-a w threadzie (cached prompt prefix, mniej tokenów).

### Free tier — outbound restrictions

Free user dostaje **0 outbound mechanizmów aktywnych**. Wszystkie akcje powyżej 0 cr są LOCKED (paywall modal "Upgrade to start outreach").

**Wyjątek:** engage pool (likes / follows / upvotes / reactions / endorse / subreddit join) **też locked dla free**, mimo 0 cr cost. Reasoning: te akcje wymagają gologin sesji konta usera, a free tier ma 1 social account ale **bez prawa do akcji** (account = read-only dla pull'owania własnego engagementu R7/L6 — które też locked dla free, więc faktycznie account jest tylko placeholder).

→ Free tier = pure monitoring. Każda forma interakcji = paid only.

### Anti-surprise mitigation

Drogie mechanizmy (OR1 = 30 cr × 8 cap = 240 cr/dzień) mogą zaskoczyć kosztem. Mitygacja:
- Każdy mechanizm wymaga **explicit toggle on** (default OFF, opt-in)
- Wszystkie hard outbound (DM, post publish, recommendation) mają **manual approval required** — user widzi treść + cost w `/feed` przed kliknięciem "approve"
- N2 health gate blokuje wykonanie przy warning/banned (dodatkowy guardrail)
- **Brak countdownu w UI** (zgodnie z `credit_ui_no_burn_math`) — user widzi tylko balance + statyczny per-action cost przy approve.

---

## 7. Account burn (gologin)

Bez zmian.

- **Pierwsze 2 konta gratis** (`INCLUDED_ACCOUNTS = 2`)
- 3rd+ Reddit account: **3 cr/day**
- 3rd+ LinkedIn account: **5 cr/day**
- Free tier: max 1 account total (Reddit lub LinkedIn)

Koszt = utrzymanie sesji gologin per profile.

---

## 8. Sanity check — przykładowe profile użytkownika

### "Solo founder · light outreach" (Starter tier)

Lekki user — testuje model, niewielki volume.

| Aktywne | Konfiguracja | Cadence | Daily |
|---|---|---|---|
| R1 | 1 subreddit | 6h | 4 cr |
| R3 | 1 konkurent | 6h | 4 cr |
| L1 | 1 keyword | 6h | 4 cr |
| **TOTAL monitoring** | | | **12 cr/day = ~360 cr/m** |
| OL1 connection requests | 1/dzień × 20 cr | | 600 cr/m |
| OL5 LinkedIn comments | 0.5/dzień × 15 cr | | 225 cr/m |
| **TOTAL** | | | **~1 185 cr/m** ✅ mieści się w Starter 1 000 + ewentualny mały overflow |

→ **Starter annual $20/m effective** ($240/yr) — wystarczy dla większości miesięcy; w heavy month dokupi Starter pack ($29).

### "Indie hacker · steady operator" (Growth tier — typowy paid user)

| Aktywne | Konfiguracja | Cadence | Daily |
|---|---|---|---|
| R1 | 3 subredditów | 6h (4 scans) | 1 × 4 × 3 = 12 cr |
| R3 | 2 konkurentów | 6h | 8 cr |
| L1 | 3 keywords | 6h | 12 cr |
| L7 | 2 profile | 6h | 8 cr |
| L6 | own engagement | 6h | 12 cr |
| 1 LinkedIn account (3rd+) | — | — | 5 cr |
| **TOTAL monitoring** | | | **57 cr/day = ~1 700 cr/m** |
| OL1 connection requests | 3/dzień × 20 cr | | 1 800 cr/m |
| OL2 LinkedIn DMs | 3/dzień × 30 cr | | 2 700 cr/m |
| OR2 Reddit comments | 2/dzień × 15 cr | | 900 cr/m |
| OL4/OL7 engage pool | 10/dzień × 0 cr | | 0 cr |
| **TOTAL outbound** | | | **~5 400 cr/m** |
| **TOTAL** | | | **~7 100 cr/m** |

→ **Growth annual $47/m effective** + 1× Growth pack ($59) = **~$106/m total**. Dostaje 4 500 cr/m. Average across heavy/light months: **~$60-80/m effective**. (Albo Scale annual $103/m solo, 8 000 cr/m → comfortable bez packs.)

### "Agency · multi-platform full funnel" (Scale tier + packs)

| Aktywne | Konfiguracja | Cadence | Daily |
|---|---|---|---|
| R1 | 5 subredditów | 4h (6 scans) | 30 cr |
| R3 | 3 konkurentów | 4h | 18 cr |
| R5 | 5 tracked users | 6h | 20 cr |
| L1 | 5 keywords | 4h | 30 cr |
| L4 | 2 profile × 3 last posts each | 1h | 1 × 24 × (2×3) = 144 cr |
| L9 | 10 firm hiring | 24h | 10 cr |
| L10/L11 | gologin inbound | 30min | 96 cr |
| E1 signal stacking | flat | — | 5 cr |
| **TOTAL monitoring** | | | **~353 cr/day = ~10 600 cr/m** |
| OL1 connection requests | 10/dzień × 20 cr | | 6 000 cr/m |
| OL2 LinkedIn DMs | 8/dzień × 30 cr | | 7 200 cr/m |
| OR1 Reddit DMs | 5/dzień × 30 cr | | 4 500 cr/m |
| OR2/OL5 comments | 6/dzień × 15 cr | | 2 700 cr/m |
| OX1/OX2 X engagement | 10/dzień × 12 cr avg | | 3 600 cr/m |
| OL9 LinkedIn post publish | 1/dzień × 25 cr | | 750 cr/m |
| Engage pool | 30+/dzień × 0 cr | | 0 cr |
| **TOTAL outbound** | | | **~24 750 cr/m** |
| **TOTAL** | | | **~35 350 cr/m** |

→ **Scale annual $103/m** + 4× Scale pack ($149 × 4 = $596) = **~$699/m total**. Dostaje 8 000 + 20 000 = 28 000 cr/m + zaoszczędzone z poprzednich miesięcy (cap 16 000 + packs poza cap). Wciąż znacznie taniej niż SDR agency $4k/mes.

### "Free tier user" (PLG)

| Aktywne | Konfiguracja | Cadence | Daily |
|---|---|---|---|
| R1 | 1 subreddit | 6h | 4 cr |
| L1 | 1 keyword | 6h | 4 cr |
| **TOTAL monitoring** | | | **8 cr/day = 240 cr/m** ✅ mieści się w 250 cr |
| Akcje | LOCKED (paywall) | — | 0 |

---

## 9. UI principles

**Twardy zakaz:** burn math w UI końcowego użytkownika (zgodnie z feedback `credit_ui_no_burn_math`).

✅ **Wolno** pokazywać:
- Credit balance ("1 247 credits")
- Unit cost przy mechanizmie ("1 credit per scan, per source")
- Statyczny cost-to-enable jako pojedynczą liczbę ("Activate this mechanism")
- "Buy credits" CTA gdy balance < threshold (binarny)
- "Upgrade plan" CTA z benefitami (bez countdownu)

❌ **NIE wolno** pokazywać:
- "X cr/day", "Y cr/month" — ani na dashboardzie, ani w mechanism configuratorze
- Live ticker przy zmianie cadence/keywords ("teraz 72 cr/day")
- "Wystarczy na N dni" / "Skończą się 2026-05-12"
- Projected exhaustion countdown
- Daily burn breakdown ("Monitoring -45 / Actions -90")

**Reasoning:** doomsday clock kills PLG activation. User ma działać free, nie liczyć ile mu zostało dni.

---

## 10. Migracja / hard switch

**Wszyscy aktualni userzy są testowi** (pre-launch). Wipe `auth.users` + cascading + clean slate ENUM rebuild zamiast migration legacy data.

### Cleanup plan

1. **Confirmation gate** — explicit user OK przed `DELETE FROM auth.users` na prod (`cmkifdwjunojgigrqwnr`)
2. Wipe DB (dev + prod):
   ```sql
   DELETE FROM auth.users; -- cascading przez wszystkie FK
   ```
3. Drop legacy ENUM `signal_source_type`, odbuduj jako nowy `mechanism_id` (płaska lista 27 wartości)
4. Stripe: cancel test subs, delete test customers, delete old test prices (jeśli zmieniamy granty)
5. Brak migration script dla legacy `signal_type` → `mechanism_id`

Po wipe: clean slate, nowi userzy idą od razu na nowy cennik.

---

## 11. Implementacja — fazy

### Faza A: Schema + cost engine (~1 tydzień)

- Nowa tabela `mechanism_costs` (mechanism_id PK, cr_per_scan, premium boolean, requires_gologin boolean, free_tier_allowed boolean)
- Seed `mechanism_costs` z tabeli §5 (27 wierszy)
- `monitoring_signals` rozszerzenie:
  - `frequency` (interval, NOT NULL, default `6 hours`)
  - `mechanism_id` (text, FK → `mechanism_costs.mechanism_id`)
  - `config` (jsonb, parametry per-mechanism: window_days, soft_cap, last_n_posts, etc.)
- Refaktor [src/features/billing/lib/credit-burn.ts](../src/features/billing/lib/credit-burn.ts) — formuła per-scan × cadence z DB lookup
- Update [src/features/billing/lib/types.ts](../src/features/billing/lib/types.ts) — usunąć `MONITORING_COSTS`, dodać `getMechanismCost()` z cache

### Faza B: Free tier + volume tiers infrastructure (~1 tydzień)

- ENUM `subscription_tier`: `free`, `starter`, `growth`, `scale`
- ENUM `billing_cycle`: `monthly`, `annual` (orthogonal — applies tylko do paid tiers)
- `users.subscription_tier` (default `free`)
- `users.billing_cycle` (nullable dla free, NOT NULL dla paid)
- `users.credits_included_monthly` per tier (250 / 1 000 / 3 000 / 8 000)
- `users.credits_balance_cap` per tier (500 / 2 000 / 6 000 / 16 000)
- Nowy cron `/api/cron/monthly-credit-grant` (`0 0 1 * *`) — additive z cap
- Usuń trial: `handle_new_user` ustawia `subscription_tier='free'` + initial 250 cr (NIE `trial_ends_at`)
- Akcja gates w [src/features/dashboard/](../src/features/dashboard/) — guard `subscription_tier === 'free'` blokuje DM/reply/connection
- Mechanism gates w `/signals` UI — premium mechanizmy z lockiem dla free
- Stripe products: 6 nowych prices (Starter/Growth/Scale × monthly/annual). Annual = 80% wartości monthly × 12 (tj. 20% off built-in).

### Faza C: UI redesign (~1.5 tygodnia)

- `/signals` redesign — 27 mechanizmów (nie 5 typów)
- Per mechanism card: toggle, konfiguracja, **unit cost label** (statyczny "1 credit per scan"), upgrade badge dla locked, status (last_scan_at, signals_24h)
- **NIE pokazujemy** daily/monthly burn ticker
- Pricing page (publiczna `/pricing`): comparison table 4 kolumny (Free / Starter / Growth ⭐ / Scale) + **monthly/annual toggle** above the table (-20% on annual). Reference sketch: [.planning/sketches/001-pricing-page/](sketches/001-pricing-page/) (potrzebuje update na nowe tiery).
- Optional slider "How many DMs/month?" → highlight rekomendowany tier (≤5 → Free, 6-30 → Starter, 31-100 → Growth, 101+ → Scale)
- Free tier landing copy w `src/app/(app)/page.tsx` lub `/pricing`

### Faza D: Hard switch / wipe (~1 dzień)

- Confirmation gate przed wipe
- DB cleanup script (dev + prod)
- ENUM rebuild
- Stripe products refresh (jeśli granty się zmieniają)

### Faza E: Stripe products refresh

- Stworzyć **6 subscription prices** w Stripe (Starter/Growth/Scale × monthly/annual) + 4 pack prices (bez zmian)
- Env vars: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUAL`, `STRIPE_PRICE_SCALE_MONTHLY`, `STRIPE_PRICE_SCALE_ANNUAL`
- Wywalić stare price IDs (`STRIPE_PRICE_MONTHLY/QUARTERLY/ANNUAL`) — w hard switch i tak nie ma userów na nich
- Webhook handler [src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) — match price ID → `(subscription_tier, billing_cycle)` lookup → update `credits_included_monthly` + `credits_balance_cap` per subscription event
- Stripe `marketing_features` flag na Growth tier (recommended badge)

### Faza F: Outbound mechanism cost engine (~3-5 dni)

Powiązane z [OUTBOUND-COMMUNICATION-MECHANISMS.md](OUTBOUND-COMMUNICATION-MECHANISMS.md) fazami OP1-OP8.

- Rozszerzenie `mechanism_costs` table o 26 outbound mechanizmów (OR1-OR9, OL1-OL11, OX1-OX8) z `cr_per_action` (zamiast `cr_per_scan` jak dla signal detection)
- Dyskryminator `mechanism_kind ENUM ('signal' | 'outbound')`
- `actions.mechanism_id` (text, FK → `mechanism_costs`) zamiast tylko `action_type`
- `actions.execution_method` (enum: `dom` | `url_hack` | `haiku_cu`) — audit metody wykonania
- Update [src/features/billing/lib/credit-costs.ts](../src/features/billing/lib/credit-costs.ts) — `getActionCreditCost(mechanism_id)` z DB lookup
- Credit deduction:
  - **Engage pool** (0 cr): brak deduct — tylko increment `action_counts`
  - **Soft outbound** (5-20 cr): deduct on `status='completed'`
  - **Hard outbound** (20-30 cr): deduct on `status='completed'`, refund na failure (typed failure modes z [OUTBOUND-COMMUNICATION-MECHANISMS.md:91](OUTBOUND-COMMUNICATION-MECHANISMS.md#L91))
- Free tier outbound gates w `/outbound` UI — wszystkie mechanizmy zamknięte (paywall)
- N2 health gate: blokuje wykonanie przy `health_status IN ('warning','banned')` — credit nie deduktowany

### Faza G: Sequence + variants billing semantics

Powiązane z OP4 (sequencing) + OP7 (variants).

- OC1 sequence orchestration:
  - Każdy step = osobny action z własnym credit cost
  - Cancel sequence (z OC4 reply detection) → refund pending steps które nie były jeszcze approved
- OC3 variant pool:
  - AI generator skipowany dla template variant → reduced LLM cost (server-side oszczędność)
  - Credit cost akcji **bez zmian** — user płaci za execution risk + Haiku CU, nie za LLM
- UI w `/outbound` pokazuje per-mechanism: toggle, daily cap, current cap usage (X/cap), unit cost — **bez** monthly burndown / projected exhaustion

---

## 12. Otwarte / TODO post-launch

### Pricing experiments
- "Pay per DM" pricing model jako alternatywa flat sub — flagged w [MARKETING.md:386](MARKETING.md#L386), niezdecydowane
- A/B testy cenowe (price sensitivity per ICP segment) — szczególnie czy Growth $59 jest sweet spot vs $49 vs $69
- Annual discount calibration (20% może być za skromnie vs Linear 25-30%, lub za hojnie — A/B test po 6 mies)
- Custom enterprise tier (>$200/mies, dedicated support, custom credit limits, team seats) — out of scope v1, naturalna ewolucja gdy pierwszy agency request
- Tier upgrade prompts: trigger gdy user przekracza grant 2 mies pod rząd → "Upgrade to Growth saves you $X/m"

### Outbound calibration
- **Per-user credit cost defaults:** wartości w cost matrix są szacunkowe; revize przed OP1 launch na podstawie realnych Haiku CU compute time + LLM token usage ([OUTBOUND-COMMUNICATION-MECHANISMS.md:1258](OUTBOUND-COMMUNICATION-MECHANISMS.md#L1258))
- **OL3 InMail timing:** v1.5 jako paid-tier feature czy v2 z Premium? Decyzja produktowa.
- **OL8 repost pricing:** czy `with_thoughts=20cr` / `simple=5cr` to dobry split? Calibration na pierwszych 100 repostach.
- **Engage pool granularity:** OR4+OR8 dzielą cap z OL4+OL7+OX3+OX6 (cross-platform engage) czy każda platforma osobny pool? Default: per-platform pools.
- **OC3 variant savings:** czy variant pool obniża credit cost o oszczędność LLM (np. -2 cr per akcja jeśli variant wybrany)? Default: NIE — credit cost stały, oszczędność LLM = margin uplift dla nas.
- **Sequence refund semantics:** OC4 reply cancel na sequence step `approved` ale `executing` — refund czy nie? Default: refund tylko na `pending_approval` cancel.
