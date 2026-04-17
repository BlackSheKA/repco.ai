# repco.ai — Final PRD v2.0

**Status:** Pre-build  
**Data:** 16 kwietnia 2026  
**Wersja:** 3.0 (uproszczona architektura: Vercel + Supabase + GoLogin, jeden vendor AI, bez Bright Data/Railway/OpenAI)  
**Scope:** MVP (V1) — Reddit + LinkedIn, human-in-the-loop  

---

## 1. Filozofia produktu

### Nie konfigurujesz narzędzia. Zatrudniasz sales repa.

To jest najważniejsza decyzja projektowa w całym dokumencie. Każdy element UX, copy, i architektura musi być widoczna przez ten pryzmat.

**Tradycyjne podejście (co robimy NIE):**
> "Skonfiguruj subreddity do monitorowania. Ustaw filtry keywords. Wybierz template sekwencji. Połącz integracje. Uruchom kampanię."

**repco podejście:**
> "Opisz swój produkt. repco znajdzie ludzi którzy go potrzebują i zapyta czy ma się odezwać."

Approval queue to nie "konfiguracja workflowu" — to **sales rep który pyta: znalazłem kogoś, dzwonię?**  
Warmup to nie "konfiguracja antidetect profiles" — to **nowy pracownik który poznaje biuro przed pierwszymi rozmowami.**  
Intent feed to nie "monitoring alertów" — to **codzienne podsumowanie kto szukał czegoś co sprzedajesz.**

Język aplikacji, onboarding, notyfikacje i microcopy muszą konsekwentnie mówić w tym rejestrze.

---

## 2. Jedno zdanie

**repco.ai** — AI sales rep który 24/7 monitoruje Reddit i LinkedIn, wykrywa ludzi szukających produktów jak Twój, i pyta czy się do nich odezwać.

---

## 3. Problem

Founderzy i sales repowie wiedzą że ich klienci są na Reddicie i LinkedIn. Widzą posty: "szukam narzędzia do X", "alternatywa dla Y?", komentarze pod postami konkurencji. Ale:

- Ręczne monitorowanie 2 platform = 2-3h/dzień
- DM do 20 osób = godzina pracy
- Follow-up = kolejna godzina
- Powtarzaj codziennie, na zawsze

Rezultat: 90% founderów nie robi konsekwentnego social outbound. Pipeline pusty lub nieprzewidywalny.

**Istniejące narzędzia nie rozwiązują tego:**

| Narzędzie | Co robi | Czego NIE robi |
|-----------|---------|----------------|
| Phantombuster / Expandi | LinkedIn DM automation | Tylko LinkedIn, brak intent detection |
| Apollo / Outreach | Email sequences | Email-first, wymaga adresu, brak social DM |
| Mention / Brand24 | Monitoring alertów | Mówi "ktoś napisał X", nic z tym nie robi |
| Buffer / Hootsuite | Scheduling postów | Zero outbound, zero DM |
| ManyChat | IG/FB DM | Inbound only, nie outbound |

**Zero narzędzi robi cross-platform intent detection + social DM outreach** — bo DM API na Reddicie i LinkedIn nie istnieje dla zewnętrznych aplikacji. Możliwe dopiero przez Computer Use.

---

## 4. Rozwiązanie — pełna pętla

1. **FIND** — agent skanuje Reddit i LinkedIn non-stop, szuka ludzi opisujących Twój problem
2. **ASK** — "znalazłem kogoś, czy chcesz żebym się odezwał?" → user zatwierdza jednym klikiem
3. **WARM** — agent obserwuje, like'uje, follow'uje — staje się znajomy przed DM
4. **DM** — spersonalizowana wiadomość odwołująca się do konkretnego posta
5. **FOLLOW** — sekwencja do 3 follow-upów aż do odpowiedzi
6. **REMEMBER** — baza prospektów z historią, pipeline status, intent data

---

## 5. Target Users

### Pierwotny ICP (MVP)
- **Indie hackerzy / solo founderzy** — mają produkt, potrzebują pierwszych 10-100 klientów. Nie mają SDR. $49/mo.
- **Małe SaaS (1-10 osób)** — SDR hire = $4-6K/mies. repco = od $49/mo. No-brainer ROI.

### Wtórny ICP (V1.5+)
- **Agencje growth** — obsługują 10-30 klientów. White-label. Agency credit pack $399 (15K credits).
- **Freelancerzy / consultants** — social selling na LinkedIn na autopilocie.

### Anti-ICP
- Enterprise (procurement cycles — za długo)
- Spamerzy (intent-only design + rate limits naturalnie ich odstraszają)

---

## 6. PLG Strategy — od D1

### Filozofia PLG

PLG = produkt sam pozyskuje, aktywuje, retencjonuje i ekspanduje. Największe wyzwanie repco: warmup konta trwa 7 dni. Rozwiązanie: **zdekompozycja AHA momentu**.

```
❌ Tradycyjny funnel:          ✅ repco PLG funnel:
Sign up                        Sign up (bez karty)
↓ tygodnie                     ↓ 3 minuty
Setup + warmup                 AHA #1: "34 osoby szukają dziś Twojego produktu"
↓                              ↓ same day
First DM                       AHA #2: "Masz 3 DM gotowe do zatwierdzenia"
↓                              ↓ dzień 8
Results                        AHA #3: Pierwszy DM wysłany
                               ↓
                               AHA #4: Pierwsza odpowiedź
```

### Acquisition

**A) "Scan my product" hook na landing page (główny mechanic)**

User wpisuje opis produktu na landing page — bez rejestracji — i widzi realne posty z Reddita z ostatnich 48h od ludzi szukających czegoś takiego:

```
[Landing page]

What does your product do?
[AI tool that helps freelancers find clients    ]

[Find people looking for it on Reddit →]

── 4 sekundy ──

Found 23 people in the last 48h:

  r/freelance · 2h ago
  "Any tool that automates client prospecting?"
  Intent: 9/10

  r/SaaS · 5h ago
  "Alternative to Apollo that works on social?"
  Intent: 8/10

  + 21 more

[Sign up to contact them →]
```

Implementacja: publiczny endpoint → PRAW search → Claude classification → wyniki w < 5s. Real data, nie mockup.

**B) /live page — główny viral mechanic**

`repco.ai/live` — publiczna strona pokazująca repco przy pracy w czasie rzeczywistym. Odpowiednik Polsia /live.

*Pełna specyfikacja w sekcji 6.9.*

**C) Weekly results card — shareable**

Co tydzień auto-generowana karta wyników którą user może opublikować na X/LinkedIn:

```
┌──────────────────────────────────┐
│  repco.ai · Week 3               │
│  ─────────────────────────────   │
│  847 posts scanned               │
│  34 intent signals               │
│  12 DMs sent                     │
│  4 replies · 33% reply rate      │
│  1 new customer                  │
│                                  │
│  repco.ai                        │
└──────────────────────────────────┘
```

Format 1200×630 (OG image). Jeden klik → share. Indie hackerzy kochają metryki.

**D) Waitlist z live counter (pre-launch)**

Landing z "Join waitlist" + licznik aktualizowany live (Supabase Realtime). Email do waitlisty: "12 founders ahead of you just found leads on Reddit." Pull mechanic przed launche.

**E) repco promuje repco — główny GTM od D1**

repco.ai uruchamia własne konto jako pierwszego klienta. Agent monitoruje Reddit i LinkedIn pod kątem sygnałów takich jak:
- *"how do I find my first customers"*
- *"looking for outreach tool"*
- *"alternative to Apollo for social"*
- *"how to automate lead generation"*

Gdy wykryje matching signal → DM od repco.ai konta:

> "Saw your post about [their specific pain]. I built something that does exactly this — finds people on Reddit/LinkedIn who are looking for products like yours, automatically. Want to try it free?"

Mechanizm jest samowalidujący: odbiorca **widzi że ktoś znalazł go przez jego post** zanim przeczyta jedno słowo pitcha. DM jest jednocześnie dowodem że produkt działa i ofertą sprzedażową.

**Dlaczego to jest unikalny GTM:**
- CAC dla pierwszych klientów ≈ koszt kilku kredytów własnego konta
- Każdy DM to live demo produktu — nie potrzeba pitch decku
- ICP (founders szukający klientów) = dokładnie ta sama osoba która wysłała ten post
- Conversion z "znaleziono mnie przez mój post" jest nieporównywalnie wyższa niż cold email
- Skaluje się: im więcej klientów, tym więcej kont, tym więcej własnych DM-ów

**Setup D1 po launchu:**
1. Skonfiguruj konto repco.ai na własnej instancji produktu
2. Product profile: "AI tool that finds people on Reddit/LinkedIn who are looking for products like yours"
3. Keywords: "find customers", "outreach tool", "lead generation social", "Apollo alternative", "first 100 customers"
4. Subreddits: r/SaaS, r/entrepreneur, r/startups, r/indiehackers, r/smallbusiness
5. Agent pracuje 24/7 — Ty zatwierdzasz DM-y

### Activation

**Activation metric:** user widzi ≥ 5 intent signals w < 10 minut od signup.

**Flow:**
```
Min 0:  Sign up (Google lub email, bez karty)
Min 1:  Onboarding — 3 pytania: produkt, klient, konkurent
Min 2:  "Looking for people who need [product]..."
Min 3-5: Intent feed pojawia się live (Supabase Realtime)
         "Found: u/dev_founder — 'looking for outreach tool'"
Min 5:  AHA #1 — pełny feed sygnałów
Min 6:  "Connect your Reddit account to reach them"
Min 7:  Pierwsze DM wygenerowane w approval queue
Min 8+: User przegląda sygnały, edytuje drafty
```

Warmup działa w tle — nie blokuje żadnego etapu. Approval queue wypełnia się od razu — user ma co robić przez 7 dni warmup.

### Retention

- **Daily pull email** (8:00 usera): "6 new people looking for [product] yesterday. 3 DMs waiting."
- **Streak mechanic**: "🔥 14-day streak — active leads every day"
- **Prospect database moat**: po 30 dniach = 200+ kontaktów z historią. Nikt nie chce zaczynać od zera.
- **Milestones**: first signal, first DM sent, 100 prospects, first conversion → konfetti + prompt do share

### Expansion (credit-driven, bez tierów)

| Moment | Message |
|--------|---------|
| Credit balance < 100 | "You're running low. Restock before your keywords stop scanning tonight." |
| Monitoring burn > 500/msc | "Your monitoring setup uses 520 credits/month — Growth pack covers the full month." |
| DM queue pełna, zero credits | "12 DMs ready. You're out of credits. Pack of 500 = $29." |
| Daily burn alert | "Burning 35 credits/day. Credits run out in 4 days." |
| First DM sent | "First DM sent. Scale up monitoring with the Growth pack." |

Expansion nie wymaga "upgrade do wyższego tieru" — user dokupuje credit packs when ready. ARPU rośnie organicznie wraz z aktywnością.

### Referral

- **Referral program**: "Give 1 month free, get 1 month free" — unique link per user
- **Agency viral loop**: Agency user zarządza 10 klientami → klienci mogą kupić własne konto

---

## 7. Feature Requirements — V1 MVP

### 7.1 Onboarding — one question per screen

```
Screen 1:  "What does your product do?"
           [One sentence input]

Screen 2:  "Who needs it most?"
           [One sentence: "founders who struggle with X"]

Screen 3:  "Any tools people might use instead?" (skip available)
           [Helps find "alternative to X" posts]

Screen 4:  "Connect your Reddit account"
           [Open Reddit Login in GoLogin profile]
           "We never store your password — only session cookies."

Screen 5:  [Auto-redirect after connect]
           "> Looking for people who need [product]..."
           [Live scan animation — real PRAW data]
           → Dashboard z pierwszymi sygnałami
```

Agent **automatycznie** generuje subreddity i keywords z opisu produktu. User nie konfiguruje nic — może edytować później w Settings.

### 7.2 Monitoring Engine

**Reddit (snoowrap — Node.js Reddit API client)**
- Darmowy, oficjalny Reddit API. Konto API zarejestrowane na repco.ai (nie wymaga konta usera)
- Co 15 minut (Vercel Cron → `/api/cron/monitor`): search po subredditach + keywords
- Subreddity: Claude sugeruje z product profile przy onboardingu (user może edytować)
- Deduplikacja: `intent_signals.post_url UNIQUE` — nie pokazujemy tego samego posta dwa razy
- Staleness: posty > 48h pomijamy

**LinkedIn (Apify LinkedIn Posts Scraper)**
- Co 2-4h (nie co 30 min — posty LinkedIn żyją dłużej, cache wyników)
- Alert wewnętrzny przy failure rate > 20% (job_logs)

**Signal detection — strukturalne, nie AI:**

Większość sygnałów to proste pattern matche, NIE wymagające klasyfikacji AI:

| Sygnał | Metoda wykrywania | AI? |
|--------|-------------------|-----|
| Post z naszym keyword | snoowrap search → keyword match | NIE |
| "Alternative to [competitor]" | snoowrap search → regex `alternative to\|instead of\|replacement for` + competitor name | NIE |
| Odpowiedź pod postem konkurencji | snoowrap/Apify → competitor brand mention w komentarzach | NIE |
| Engagement na naszym poście | Apify notification scraping | NIE |
| Ambiguousny post — nieoczywisty intent | Claude Sonnet 4.6 klasyfikacja | TAK (~10-20% sygnałów) |

**AI Classification (tylko ambiguous, Claude Sonnet 4.6):**
- Odpala się TYLKO dla postów które przeszły keyword/pattern match ale wymagają oceny jakości
- Output: `intent_type`, `intent_strength` (1-10), `reasoning` (1 zdanie), `suggested_angle`
- Threshold: ≥ 6 → feed usera (konfigurowalny)
- Szacowany wolumen: ~50-100 postów/dzień (nie 1,440) → ~$1-2/user/msc

### 7.3 Agent — persona i stany

Agent repco ma osobowość wyrażoną przez stany i language. Nie "Status: Running":

| Stan | Trigger | Display |
|------|---------|---------|
| Scanning | Monitoring aktywny | "Scanning Reddit for buyers..." |
| Found | Nowy sygnał ≥ 8 | "Found someone. Strong intent. Worth a look." |
| Waiting | Queue niepusta | "3 people waiting for your go-ahead." |
| Sent | DM wysłany | "Reached out to u/handle. Ball's in their court." |
| Reply | Odpowiedź | "They replied. Looks positive." |
| Cooldown | Warning na koncie | "Taking a break on @account — resumes tomorrow." |
| Quiet | Brak sygnałów 24h | "Quiet day. Keeping an eye out." |

### 7.4 Action Engine

Architektura akcji:
```
User approves action in dashboard
  → actions.status = 'approved'
  → Supabase Database Webhook → Vercel Function /api/webhooks/actions
  → SELECT ... FOR UPDATE SKIP LOCKED (jedna akcja atomowo)
  → GoLogin Cloud API: open profile (wbudowane proxy)
  → Playwright CDP connection
  → Claude Haiku 4.5 Computer Use (z prompt caching)
  → screenshot verification
  → result saved → Supabase Realtime push
  → job_logs entry (duration, status, errors)
```

**Event-driven, nie polling:** Vercel Function odpala się TYLKO gdy user zatwierdzi akcję (Database Webhook), nie co minutę. Zero pustych wywołań.

**Concurrency control:** `FOR UPDATE SKIP LOCKED` zapewnia że:
- Żadne dwa wywołania nie biorą tej samej akcji
- Żadne dwa wywołania nie używają tego samego GoLogin profilu jednocześnie
- Zombie recovery: Vercel Cron (co 5 min) przywraca akcje "stuck" w `executing` > 10 min

**Action types V1:**

| Akcja | Metoda | Max/dzień/konto | Approval? |
|-------|--------|-----------------|-----------|
| Like posta | Claude Haiku Computer Use | 20 | Auto |
| Follow/Connect | Claude Haiku Computer Use | 10 | Auto |
| Public reply | Claude Haiku Computer Use | 5 | Required |
| Send DM | Claude Haiku Computer Use | 8 | Required |
| Follow-up DM | Claude Haiku Computer Use | 5 | Required |

Approval timeout: 4h (post becomes stale).

**Dlaczego Computer Use zamiast Playwright selektorów:** CSS/XPath selektory łamią się przy każdym redesignie platformy i mogą być wykrywane jako automation patterns. Computer Use (Haiku) nawiguje UI jak człowiek — naturalnie, odpornie na zmiany layoutu, nieodróżnialnie od ręcznego użycia. Haiku jest wystarczająco szybki (~5s per krok) i tani (~$0.005/krok z caching).

**Vercel Function timeout monitoring:** Każda akcja loguje `duration_ms` do `job_logs`. Alert gdy p95 > 50s (blisko limitu Vercel Pro 60s). Przy ~100 userach — migracja action workera na Railway (~dzień pracy).

### 7.5 Message Generation (Claude API)

**DM generation:**
- `claude-sonnet-4-6` dla wszystkich DM-ów (Opus niepotrzebny — Sonnet jest wystarczająco dobry dla 3-zdaniowych wiadomości)
- Wymagania:
  - Odwołuje się do konkretnej rzeczy którą napisali
  - Nie zaczyna od "Hej widziałem Twój post"
  - Brak linku w pierwszej wiadomości
  - Max 3 zdania
  - Kończy pytaniem lub soft CTA
  - Strukturalnie różne wiadomości per konto (variation enforcement w prompcie)

**Quality control:**
- Osobny Claude prompt sprawdza przed pokazaniem userowi
- Odrzuca: zbyt spamerskie, generyczne, długie, link w wiadomości #1
- Output: `approved: bool`, `issue: string | null`

**Follow-up sequence:**
- Follow-up 1 (dzień 3): feature/benefit angle
- Follow-up 2 (dzień 7): value/insight angle
- Follow-up 3 (dzień 14): low-pressure check-in
- Stop przy każdej odpowiedzi (pozytywnej lub negatywnej)

### 7.6 Anti-ban System

**Izolacja per konto:**
- GoLogin Cloud profile: unikalny canvas, WebGL, fonts, timezone, OS, screen
- GoLogin wbudowane proxy (bez Bright Data — GoLogin Cloud ma własne IP per profil)
- Persistent cookies + browsing history

**Behavioral patterns:**

| Mechanizm | Implementacja |
|-----------|--------------|
| Rate limiting | Max akcji/dzień per konto (hardcoded ceiling) |
| Random delays | μ=90s, σ=60s, min 15s między akcjami |
| Behavioral noise | 60% akcji to "szum": scroll, read, like niezwiązane posty |
| Stochastic sequences | Losowa ścieżka per prospect z zestawu szablonów |
| Persona schedule | Timezone + aktywne godziny + random gaps |
| Non-deterministic timing | Losowe opóźnienie 0-4h po wykryciu sygnału |
| Target isolation | Żadne 2 konta nie kontaktują tej samej osoby |
| Content variation | LLM generuje strukturalnie różne wiadomości |

**Warmup protocol:**
- Dni 1-3: browse + read only
- Dni 4-5: likes + follows (max 5/dzień)
- Dzień 6-7: pierwsza public reply
- Dzień 8+: DM enabled

**Account health:** healthy / warning (auto-cooldown 48h) / cooldown / banned (alert usera)

**CAPTCHA:** GoLogin built-in solver (bez 2Captcha — GoLogin solver wystarczy na MVP)

### 7.7 Dashboard — layout

**Filozofia dashboardu:** agent jest na pierwszym planie. Widać co robi, czego znalazł, czego potrzebuje od Ciebie.

**Persistent terminal header (top, full width, stone-900):**
```
> Scanning r/SaaS... found 3 posts
> Intent detected: u/jakub_founder "looking for outreach tool" [9/10]  ← indigo
> Drafting DM...
✓ Ready for your approval                                              ← green
⠸ Scanning LinkedIn...
```

**Main layout (multi-column):**

```
┌─────────────┬──────────────────┬──────────────┬─────────────┐
│   AGENT     │   FOUND TODAY    │   APPROVAL   │   RESULTS   │
│             │                  │              │             │
│  [avatar]   │  r/SaaS · 4m ago │  DM draft #1 │  Prospects  │
│  Scanning   │  "need outreach" │  ──────────  │  247 total  │
│             │  intent: 9/10    │  "Hey, saw   │             │
│  Reddit ✓   │  [Contact] [Skip]│  your post.."│  Replied: 18│
│  LinkedIn ✓ │                  │  [✓][Edit][✕]│             │
│             │  LinkedIn · 12m  │              │  Converted  │
│  Today:     │  "alternative to │  DM draft #2 │  3          │
│  8 signals  │   Apollo"        │  ...         │             │
│  3 queued   │  intent: 7/10    │              │  Revenue    │
│             │  [Contact] [Skip]│              │  ~$297 MRR  │
└─────────────┴──────────────────┴──────────────┴─────────────┘
```

**Revenue counter** widoczny zawsze — agent wie po co pracuje. Liczony z `converted` × avg plan value (user ustawia ręcznie lub łączy Stripe).

**Dodatkowe widoki (tabs):**
- **Prospects** — pełna baza, kanban pipeline, search, CSV export
- **Accounts** — health status każdego konta, warmup progress, historia
- **Settings** — product profile, keywords, limits

### 7.8 Notifications

**Daily email (8:00 czasu usera):**
```
Subject: "[Name] found 6 people looking for [product] yesterday"

Your rep found 6 intent signals on Reddit & LinkedIn.

Top signal:
  u/saas_founder · r/SaaS · 3h ago
  "I need an alternative to Apollo that works on Twitter"
  Intent: 9/10

3 DMs waiting for your go-ahead.

[See who they are →]
```

**Real-time (optional):**
- Slack webhook: sygnał ≥ 9 lub nowa odpowiedź od prospekta

### 7.9 /live page — viral mechanic

`repco.ai/live` — publiczna strona dostępna bez logowania. Conversion funnel przebrany za entertainment.

**Co pokazuje:**

```
repco.ai  ● LIVE                              [Start free →]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

repco is scanning Reddit & LinkedIn right now.

Intent signals detected in the last hour: 847 ↑

─────────────────────────────────────────

r/SaaS · 2 min ago
"Does anyone know a tool that finds leads on social
automatically? Tried Apollo but it's email only..."

LinkedIn · 4 min ago
"Looking for alternatives to cold email for B2B.
What tools are people actually using?"

r/entrepreneur · 7 min ago
"I need help finding my first 100 customers.
Any tools that actually work on social?"

r/startups · 9 min ago
"How are you all finding leads without spending
$5k/month on ads?"

[Load more — 843 more signals today]

─────────────────────────────────────────

These people are looking for products like yours.

[  Find your buyers — free  ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Right now                    Past 24h
Active users: 234            Intent signals:    12,847
Scans/hour:   8,400          DMs sent:           2,341
                             Replies received:     287
                             Conversion rate:     4.2%
```

**Mechanika viralności:**
- Wszystkie posty są PUBLICZNE — zero privacy issues (Reddit/LinkedIn posts są indexowane przez Google)
- Counter rośnie w czasie rzeczywistym (Supabase Realtime) → psychologia momentum
- "Load more" pokazuje kolejne sygnały → infinite scroll experience
- CTA zawsze widoczny → strona jest landing page'em

**Jak user trafia na /live:**
1. Bezpośredni share od usera repco ("watch repco find leads right now")
2. Link w weekly results card
3. Link w email digest
4. Organic — SEO (tytuł strony: "Live: People Looking for Products Like Yours on Reddit & LinkedIn")

**Tech:** Polling (SWR/React Query z `refreshInterval: 10000`) na `/api/live` endpoint. NIE Supabase Realtime (limit concurrent WebSocket connections na publicznej stronie). Supabase Realtime zostaje TYLKO dla dashboard zalogowanych userów.

Endpoint `/api/live` czyta z `intent_signals WHERE is_public = true` + `live_stats`. Signals oznaczane jako public jeśli: posty publiczne (Reddit/LinkedIn posty są indexowane przez Google). Pokazujemy treść posta, platformę, czas. Nie pokazujemy: który user repco to znalazł, który produkt był targetem.

---

## 8. Architecture

### 8.1 High-level

```
┌──────────────────────────────────────────────────────────┐
│  VERCEL (Pro)                                             │
│                                                           │
│  Next.js 14 (App Router)                                  │
│  Dashboard · /live (polling) · Landing · Onboarding       │
│                                                           │
│  Cron Functions (Node.js/TypeScript):                     │
│  ├── /api/cron/monitor      co 15 min                     │
│  │   snoowrap (Reddit) + Apify (LinkedIn)                 │
│  │   Keyword/pattern match + Claude Sonnet (ambiguous)    │
│  ├── /api/cron/replies      co 2h                         │
│  │   GoLogin → Playwright CDP → read inbox                │
│  └── /api/webhooks/actions  Supabase Database Webhook     │
│      FOR UPDATE SKIP LOCKED → GoLogin → Playwright CDP    │
│      → Claude Haiku Computer Use                          │
│                                                           │
│  API Routes:                                              │
│  ├── /api/webhooks/stripe                                 │
│  └── /api/...                                             │
└─────────────────┬────────────────────────────────────────┘
                  │ REST + Supabase Realtime (dashboard only)
┌─────────────────▼────────────────────────────────────────┐
│  SUPABASE (Pro)                                           │
│  PostgreSQL · Auth · Realtime · Database Webhooks         │
└──────────┬───────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────┐
│  GOLOGIN CLOUD                                            │
│  Browser profiles + wbudowane proxy                       │
│  (połączenie przez Playwright CDP z Vercel Functions)     │
└──────────────────────────────────────────────────────────┘
```

**Zasada:** Monitoring i reply check to cykliczne crony (Vercel Cron). Akcje (DM, like, follow) to event-driven — Supabase Database Webhook odpala Vercel Function tylko gdy user zatwierdzi akcję. Zero pollingu, zero pustych wywołań.

**Fallback plan:** Jeśli przy ~100 userach Vercel Function duration przekroczy limit Pro (60s), action worker migruje na Railway (~dzień pracy). Monitoring i reply check zostają na Vercel.

### 8.2 Tech Stack

**Serwisy (zarządzasz kontem, płacisz):**

| Warstwa | Technologia | Koszt/msc |
|---------|------------|-----------|
| Frontend + Workers | Vercel Pro (Next.js 14 App Router + Cron Functions) | ~$20 |
| Database + Auth + Realtime | Supabase Pro (PostgreSQL + Auth + Realtime + DB Webhooks) | ~$25 |
| Browser profiles + Proxy | GoLogin Cloud API (wbudowane proxy) | ~$49-99 |
| Payments | Stripe (subscriptions + one-time credit packs) | per-transaction |
| Email | Resend (daily digest, transactional) | ~$0-20 |

**API pay-per-use:**

| API | Do czego | Model/Tier |
|-----|----------|------------|
| Claude API — Computer Use | Nawigacja UI: DM, like, follow, reply check | Haiku 4.5 (z prompt caching) |
| Claude API — Intelligence | DM generation + ambiguous intent classification | Sonnet 4.6 |
| Apify | LinkedIn Posts Scraper | pay-per-use |

**Biblioteki (npm, darmowe):**

| Biblioteka | Do czego |
|------------|----------|
| snoowrap | Reddit public API — monitoring (keyword search, nie wymaga konta usera) |
| Playwright | CDP client — łączy się z GoLogin Cloud profiles |

**Observability:**

| Narzędzie | Do czego | Koszt |
|-----------|----------|-------|
| Sentry | Error tracking + timeout alerts | Free tier |
| Axiom | Structured logging (correlation ID per action) | Free tier (500MB/msc) |

**Usunięte z architektury (vs v2.0):**
- ~~Railway~~ → Vercel Cron Functions (fallback na Railway przy ~100 userach)
- ~~Bright Data~~ → GoLogin wbudowane proxy
- ~~GPT Computer Use (OpenAI)~~ → Claude Haiku Computer Use (jeden vendor AI)
- ~~2Captcha~~ → GoLogin built-in CAPTCHA solver
- ~~PRAW (Python)~~ → snoowrap (Node.js) — jeden runtime TypeScript
- ~~Claude Opus 4.6~~ → Sonnet 4.6 wystarczy do DM generation

### 8.3 Supabase Schema

```sql
users (
  id uuid PK,
  email text,
  stripe_customer_id text,
  billing_period text,     -- 'monthly' | 'quarterly' | 'annual'
  trial_ends_at timestamp,
  subscription_active bool DEFAULT false,
  credits_balance int DEFAULT 500,   -- current available credits
  credits_included_monthly int DEFAULT 500, -- from plan
  created_at timestamp
)

credit_transactions (
  id uuid PK,
  user_id uuid → users,
  type text,               -- 'monthly_grant' | 'pack_purchase' | 'monitoring_burn' | 'action_spend' | 'refund'
  amount int,              -- positive = credit, negative = debit
  description text,        -- e.g. "Reddit keyword: 'outreach tool' daily burn"
  pack_size int,           -- if pack_purchase
  stripe_payment_id text,  -- if pack_purchase
  created_at timestamp
)

monitoring_signals (
  id uuid PK,
  user_id uuid → users,
  signal_type text,        -- 'reddit_keyword' | 'linkedin_keyword' | 'subreddit' | 'competitor' | 'profile_visitor'
  value text,              -- the keyword/subreddit/competitor name
  credits_per_day int,     -- burn rate
  active bool DEFAULT true,
  created_at timestamp
)

product_profiles (
  id uuid PK,
  user_id uuid → users,
  name text,
  description text,
  problem_solved text,
  competitors text[],
  keywords text[],           -- user-visible
  generated_queries jsonb,   -- AI-generated, editable
  subreddits text[],         -- AI-suggested, editable
  created_at timestamp,
  updated_at timestamp
)

social_accounts (
  id uuid PK,
  user_id uuid → users,
  platform text,             -- 'reddit' | 'linkedin'
  handle text,
  profile_url text,
  gologin_profile_id text,
  proxy_id text,
  health_status text,        -- 'warmup' | 'healthy' | 'warning' | 'cooldown' | 'banned'
  warmup_day int DEFAULT 0,
  warmup_completed_at timestamp,
  daily_dm_limit int DEFAULT 8,
  daily_engage_limit int DEFAULT 20,
  timezone text DEFAULT 'UTC',
  active_hours_start int DEFAULT 8,
  active_hours_end int DEFAULT 22,
  active bool DEFAULT true,
  created_at timestamp
)

intent_signals (
  id uuid PK,
  user_id uuid → users,
  platform text,
  post_url text UNIQUE,
  post_content text,
  author_handle text,
  author_profile_url text,
  intent_type text,          -- 'direct' | 'competitive' | 'problem' | 'engagement'
  intent_strength int,       -- 1-10
  intent_reasoning text,
  suggested_angle text,
  status text,               -- 'pending' | 'actioned' | 'dismissed'
  is_public bool DEFAULT true, -- dla /live page
  detected_at timestamp
)

prospects (
  id uuid PK,
  user_id uuid → users,
  platform text,
  handle text,
  profile_url text,
  display_name text,
  bio text,
  public_email text,
  public_website text,
  intent_signal_id uuid → intent_signals,
  pipeline_status text,      -- 'detected'|'engaged'|'contacted'|'replied'|'converted'|'rejected'
  assigned_account_id uuid → social_accounts,
  notes text,
  tags text[],
  created_at timestamp,
  updated_at timestamp
)

actions (
  id uuid PK,
  user_id uuid → users,
  prospect_id uuid → prospects,
  account_id uuid → social_accounts,
  action_type text,          -- 'like'|'follow'|'public_reply'|'dm'|'followup_dm'
  status text,               -- 'pending_approval'|'approved'|'rejected'|'executing'|'completed'|'failed'
  drafted_content text,
  final_content text,
  approved_at timestamp,
  executed_at timestamp,
  error text,
  sequence_step int,
  expires_at timestamp,      -- 4h od created_at dla HITL actions
  created_at timestamp
)

action_counts (
  account_id uuid → social_accounts,
  date date,
  dm_count int DEFAULT 0,
  engage_count int DEFAULT 0,
  reply_count int DEFAULT 0,
  PRIMARY KEY (account_id, date)
)

live_stats (                  -- dla /live page, agregowane co minutę
  id uuid PK,
  signals_last_hour int,
  signals_last_24h int,
  active_users int,
  dms_sent_24h int,
  replies_24h int,
  scans_per_hour int,
  updated_at timestamp
)

job_logs (                    -- monitoring timeoutów i success rate
  id uuid PK,
  job_type text,              -- 'monitor' | 'action' | 'reply_check'
  status text,                -- 'started' | 'completed' | 'failed' | 'timeout'
  user_id uuid → users,
  action_id uuid → actions,   -- jeśli dotyczy konkretnej akcji
  started_at timestamp,
  finished_at timestamp,
  duration_ms int,
  error text,                 -- treść błędu jeśli failed/timeout
  metadata jsonb              -- dodatkowy kontekst (account_id, platform, etc.)
)
```

**Monitoring job_logs:**
- Vercel Cron (co 24h) lub Supabase Edge Function liczy success/fail/timeout z ostatnich 24h
- Alert email (Resend) jeśli: action success rate < 80%, timeout rate > 5%, account banned
- Sentry automatycznie łapie exceptions i timeouty z Vercel Functions
- Axiom przechowuje structured logi z correlation ID per action flow

---

## 9. Core Flows

### 9.1 Monitoring (co 15 min Reddit, co 2-4h LinkedIn)

```
Vercel Cron → /api/cron/monitor

FOR EACH user WITH active plan:
  FOR EACH active platform:

    [Reddit — snoowrap, co 15 min]
    snoowrap.search(subreddits, keywords from product_profile)
    → filter: post age < 48h, not in intent_signals (deduplikacja)
    → STRUCTURAL match: keyword hit, competitor mention, regex patterns
    → IF ambiguous: Claude Sonnet classification (tylko ~10-20% postów)
    → save matched signals → intent_signals
    → Supabase Realtime push → dashboard update
    → update live_stats
    → job_logs entry

    [LinkedIn — Apify, co 2-4h]
    Apify actor.run(keywords) — z cache (nie scrapuj tych samych postów)
    → same structural match + save flow
    → IF apify_failure: log to job_logs, alert jeśli failure rate > 20%
```

### 9.2 Action Flow (HITL)

```
User clicks "Contact" on signal
→ system creates: engage actions (auto) + DM action (pending_approval)
→ auto actions (like/follow): status = 'approved' natychmiast
→ DM shows in approval queue

Action gets status = 'approved' (auto lub user click)
→ Supabase Database Webhook → Vercel Function /api/webhooks/actions
→ SELECT ... FOR UPDATE SKIP LOCKED (atomowe pobranie jednej akcji)
→ Vercel Function:
    GoLogin Cloud API: open profile (wbudowane proxy)
    Playwright CDP connect
    Claude Haiku 4.5 Computer Use (z prompt caching):
      navigate to prospect profile → click message → type → send
    screenshot verification (Playwright)
    status = completed
    prospect.pipeline_status = contacted
    Supabase Realtime push to dashboard
    job_logs entry (duration_ms, status)
    IF failed:
      categorize error:
        transient (GoLogin timeout, network) → retry 1x po 5 min
        permanent (account banned, profile deleted) → status = failed, alert user
```

### 9.3 Follow-up Flow

```
Cron (co godzinę):
  FOR prospect WHERE status = contacted:
    IF last_action + step.delay <= now:
      IF no reply detected:
        Claude: generate follow-up (different angle)
        create action: followup_dm, pending_approval
      IF reply detected:
        status = replied
        stop sequence
        notify user
```

### 9.4 Reply Detection

```
Vercel Cron (co 2h) → /api/cron/replies:
  FOR EACH active account:
    GoLogin Cloud: open profile
    Playwright CDP: navigate to DM inbox
    Claude Haiku Computer Use: scan for new replies
    IF yes: extract sender + content
    → match to prospect
    → status = replied
    → Supabase Realtime push
    → trigger email (Resend) / Slack notification
    → job_logs entry
```

**Dlaczego co 2h, nie co 30 min:** Odpowiedzi na DM nie są time-sensitive na poziomie minut. Co 2h = 12 sesji GoLogin/dzień/konto zamiast 48. Oszczędność ~75% kosztów GoLogin sessions i proxy. User i tak dostaje notification w ciągu max 2h od odpowiedzi.

---

## 10. Pricing & Billing

### Jeden plan, trzy okresy rozliczeniowe (Sintra-style)

| | Miesięczny | 3-miesięczny | 12-miesięczny |
|---|---|---|---|
| Cena | $49/msc | $35/msc | $25/msc |
| Rozliczenie | co miesiąc | $105 co kwartał | $300 z góry |
| Oszczędność | — | 29% | **49%** ← Most Popular |
| Included credits | 500/msc | 500/msc | 500/msc |

**Trial:** 3 dni free, bez karty, 500 kredytów, pełny produkt.

---

### Credit Economy — 3 warstwy

Kredyty mierzą trzy osobne wymiary aktywności agenta. Kluczowa zasada: **monitoring jest wspólny dla wszystkich kont na danej platformie** — koszt nie jest mnożony przez liczbę kont.

---

**WARSTWA 1: MONITORING (intelligence layer)**

Płacisz raz za typ sygnału, niezależnie ile masz kont na danej platformie. Wykryty sygnał nie kosztuje dodatkowych kredytów.

| Sygnał | Kredyty/dzień | ~Kredyty/msc |
|--------|--------------|-------------|
| Reddit keyword | 3/dzień | 90/msc |
| LinkedIn keyword | 6/dzień | 180/msc |
| Subreddit watch | 3/dzień | 90/msc |
| Competitor brand track | 10/dzień | 300/msc |
| Profile visitor alert | 5/dzień | 150/msc |

---

**WARSTWA 2: KONTA (execution layer)**

Plan zawiera **2 konta** (dowolna platforma, np. 1 Reddit + 1 LinkedIn). Każde kolejne konto to pasywny burn niezależny od monitoringu.

| Platforma | Kredyty/dzień/konto | ~Kredyty/msc/konto |
|-----------|--------------------|--------------------|
| Reddit | 3/dzień | 90/msc |
| LinkedIn | 5/dzień | 150/msc |

Konta można przypisywać do sygnałów w Settings:
```
Signal z Reddit → wyślij z @account_1
                  (lub round-robin: @r1, @r2, @r3)
Signal z LinkedIn → wyślij z @linkedin_main
```

---

**WARSTWA 3: AKCJE (jednorazowe)**

| Akcja | Kredyty |
|-------|---------|
| Like / Follow | **0** — bezpłatne (warmup) |
| Public reply | 15 |
| LinkedIn connect | 20 |
| DM | 30 |
| Follow-up DM | 20 |

Dashboard pokazuje live burn: `> -34 credits today (monitoring: 9, konta: 15, akcje: 10)`

---

**Profile userów — miesięczne zużycie:**

```
INDIE HACKER (2 konta wliczone w plan):
  3× Reddit keyword     =  9/dzień →  270/msc  (monitoring)
  1× LinkedIn keyword   =  6/dzień →  180/msc  (monitoring)
  Konta: 0 dodatkowych             →    0/msc
  10× DM                           →  300/msc  (akcje)
  5× public reply                  →   75/msc  (akcje)
  ──────────────────────────────────────────────
  TOTAL: 825 kredytów → Included 500 + Growth pack (~$13)
  Miesięczny spend: $49 + $13 ≈ $62/msc

SMALL SAAS (5 kont: 2 Reddit + 2 LinkedIn + 1 extra Reddit):
  4× Reddit keyword     = 12/dzień →  360/msc  (monitoring)
  2× LinkedIn keyword   = 12/dzień →  360/msc  (monitoring)
  Konta extra: 1 Reddit + 2 LinkedIn = 3 + 10/dzień → 390/msc
  20× DM                           →  600/msc  (akcje)
  ──────────────────────────────────────────────
  TOTAL: ~1,710 kredytów → dokupuje Growth pack ($59)
  Miesięczny spend: $49 + $59 ≈ $108/msc

GROWTH / AGENCY (10 kont: 3 Reddit + 4 LinkedIn + 3 extra):
  6× Reddit keyword     = 18/dzień →  540/msc  (monitoring)
  3× LinkedIn keyword   = 18/dzień →  540/msc  (monitoring)
  Konta extra: 1 Reddit + 4 LinkedIn = 3 + 20/dzień → 690/msc
  40× DM + 15× follow-up           → 1,500/msc (akcje)
  ──────────────────────────────────────────────
  TOTAL: ~3,270 kredytów → Scale pack ($149) + Starter ($29)
  Miesięczny spend: $49 + $178 ≈ $227/msc
```

---

### Credit packs (jednorazowe, nie wygasają)

| Pack | Kredyty | Cena | Per kredyt |
|------|---------|------|-----------|
| Starter | 500 | $29 | $0.058 |
| Growth | 1,500 | $59 | $0.039 |
| Scale | 5,000 | $149 | $0.030 |
| Agency | 15,000 | $399 | $0.027 |

---

### Dlaczego credits, nie DM tiers

Tradycyjne "150 DM/msc" mierzy tylko outreach. Credits mierzą całą aktywność agenta:
- Monitoring burn codziennie → pasywna wartość + pasywny przychód
- Konta burn codziennie → im więcej kont, tym więcej capacity, tym wyższy spend
- Brak "ceiling" który frustruje → user dokupuje ile potrzebuje
- Naturalny upgrade path: więcej kont = więcej DM-ów = więcej wyników = chęć skalowania

Psychological pricing: "3 credits/day per account" brzmi jak grosze. Ale 5 kont × 4/day × 30 = 600 kredytów/msc zanim wyślesz jeden DM.

---

### Unit Economics

| Metryka | Wartość |
|---------|---------|
| Blended ARPU | ~$140/msc (indie hacker $62 → agency $230+) |
| Gross margin | **80%** |
| Monthly churn | 4% |
| LTV (gross) | $2,450 |
| CAC | $100 |
| **LTV:CAC** | **24.5x** |
| **CAC Payback** | **0.7 msc** |

---

### Stripe Integration
- Subscription products (monthly/quarterly/annual billing periods)
- Credit packs jako one-time payments (Stripe Payment Intents)
- Webhook: `subscription.updated` → sync w Supabase
- Customer Portal: self-serve anulowanie + zmiana okresu rozliczeniowego

---

## 10.5 Projekcje finansowe i potencjał

### Założenia

| Parametr | Wartość | Źródło |
|----------|---------|--------|
| ARPU blended | $140/msc | 3-layer credit economy (indie $62 → agency $230+) |
| Gross margin | 80% | Po odjęciu: Claude API, GoLogin, Apify, Vercel, Resend |
| Monthly churn | 4% M1-M3, 3% M6+ | Prospect database moat obniża churn z czasem |
| CAC blended | $50 M1-M3 (self-promotion), $80 M6+ (paid ads) | Self-promotion GTM radykalnie obniża early CAC |
| Trial→paid | 20% | Benchmark: Gojiberry 100+ customers w 60 dni |
| NRR | 120% | Credit expansion — im więcej kont, tym wyższy spend |

### Compy walidacyjne

| Produkt | Co robi | ARR | Czas | ARPU | Źródło |
|---------|---------|-----|------|------|--------|
| **Gojiberry.ai** | LinkedIn intent + outreach (1 platforma) | $1.4M | 9 msc | $99-249 | YC, case studies |
| **Sintra.ai** | AI employees dla SMB | $12M | 12 msc | $39-97 | $17M seed, Tech.eu |
| **Polsia** | Autonomous AI company ops | $4.5M claimed | 3 msc | $49 + 20% rev share | Founder claims, nie zweryfikowane |

repco łączy intent detection Gojiberry (ale multi-platform) z AI employee framing Sintry (ale węższy scope = szybszy onboarding).

### Projekcja MRR — trzy scenariusze

| Miesiąc | Pessimistic | **Base** | Optimistic | Komentarz |
|---------|------------|---------|------------|-----------|
| M1 | $1.5K | $3K | $6K | Self-promotion + ProductHunt |
| M2 | $4K | $9K | $18K | Organic + first paid ads |
| M3 | $8K | $18K | $35K | $20K MRR target zone |
| M6 | $25K | $60K | $120K | Multi-account users driving ARPU |
| M9 | $60K | $150K | $300K | Agency tier + credit expansion |
| **M12** | **$110K** | **$280K** | **$600K** | Mature product |
| **M18** | **$250K** | **$700K** | **$1.8M** | Multi-platform (V1.5 platforms) |

### ARR ekwiwalent

| Scenariusz | M12 ARR | M18 ARR |
|-----------|---------|---------|
| Pessimistic | $1.3M | $3M |
| **Base** | **$3.4M** | **$8.4M** |
| Optimistic | $7.2M | $21.6M |

### Paying users (base case)

| Miesiąc | Paying users | ARPU | MRR |
|---------|-------------|------|-----|
| M1 | 21 | $140 | $3K |
| M3 | 129 | $140 | $18K |
| M6 | 400 | $150 | $60K |
| M12 | 1,750 | $160 | $280K |
| M18 | 4,100 | $170 | $700K |

ARPU rośnie z czasem bo established users dodają konta i keywords → wyższy credit burn.

### Koszty operacyjne (base case)

| Pozycja | M1 | M6 | M12 |
|---------|----|----|-----|
| GoLogin (profiles + proxy) | $50 | $400 | $2,000 |
| Claude API (Haiku CU + Sonnet) | $50 | $1,500 | $6,000 |
| Apify (LinkedIn) | $30 | $300 | $1,200 |
| Vercel Pro | $20 | $20 | $20 |
| Supabase Pro | $25 | $25 | $100 |
| Resend (emails) | $10 | $100 | $400 |
| Sentry + Axiom | $0 | $0 | $50 |
| Paid ads | $0 | $5,000 | $15,000 |
| **Total costs** | **$185** | **$7,345** | **$24,770** |
| **MRR** | **$3,000** | **$60,000** | **$280,000** |
| **Net margin** | **94%** | **88%** | **91%** |

### Exit potential

| Scenariusz | ARR at exit | Multiple | **Exit value** |
|-----------|------------|---------|---------------|
| Pessimistic M12 | $1.3M | 6x | **$8M** |
| **Base M12** | **$3.4M** | **8x** | **$27M** |
| Optimistic M12 | $7.2M | 10x | **$72M** |
| Pessimistic M18 | $3M | 7x | **$21M** |
| **Base M18** | **$8.4M** | **9x** | **$76M** |
| Optimistic M18 | $21.6M | 12x | **$259M** |

### Dlaczego 8-9x multiple (nie 5-6x)

1. **AI-native** — AI tools get premium multiples w 2026
2. **NRR 120%** — expanding revenue = premium
3. **Cross-platform** — Reddit + LinkedIn (+ X/IG post-MVP) = szeroki moat
4. **Proprietary intent data** — cross-user purchase signal patterns
5. **PLG motion** — self-promotion GTM + /live viral + low CAC
6. **Gross margin 80%** — strong SaaS efficiency
7. **Benchmark:** Gojiberry (YC, $1.4M/9msc), Sintra ($12M/12msc, $17M seed)

### Potencjalni acquirerzy

| Firma | Dlaczego kupi | Prawdopodobieństwo |
|-------|--------------|-------------------|
| **Apollo.io** ($100M+ ARR) | Mają email outreach, brakuje social DM + intent. repco = missing social layer. | 🟢 Wysokie |
| **HubSpot** ($2.6B rev) | Social selling gap w CRM. repco = plug-in intelligence. | 🟡 Średnie |
| **Outreach.io** ($200M+ ARR) | Email sequencing, brak social. repco = channel expansion. | 🟡 Średnie |
| **LinkedIn (Microsoft)** | Intent detection na własnej platformie + Reddit. Acqui-hire. | 🟡 Średnie |
| **PE (Vista, Thoma Bravo)** | Profitable AI SaaS z high NRR = PE dream. | 🟢 Wysokie |
| **Gojiberry** | Competitor elimination — repco robi to samo ale multi-platform. | 🟡 Średnie |

### Milestone do $20K MRR

```
Tydzień 1-5:  Build MVP
Tydzień 5:    Deploy + uruchom własne konto repco.ai
Tydzień 6-8:  Beta (10 userów, część z self-promotion DMs)
Tydzień 9-10: Public launch (PH + HN + Reddit + X)
M2-M3:        Organic + self-promotion + first paid ads
M3:           Target: ~130 paying users × $140 ARPU = $18K MRR
M3-M4:        $20K MRR ← CEL
```

Self-promotion GTM eliminuje chicken-and-egg problem: repco nie czeka na ruch — generuje go od D1 przez własne działanie.

---

## 11. Non-functional Requirements

### Performance
- Dashboard initial load: < 2s LCP
- Intent feed update latency: < 5s od wykrycia
- /live page: Realtime updates co 10s
- Action execution: < 60s od approval do wysłania

### Reliability
- Monitoring uptime: > 99%
- Action execution: retry 1x transient errors → failed + alert na permanent errors
- GoLogin timeout: 30s
- Apify failure → alert wewnętrzny (job_logs), manual review
- Zombie recovery: akcje stuck w `executing` > 10 min → przywrócone automatycznie (Vercel Cron co 5 min)

### Security
- Supabase RLS: user widzi tylko swoje dane
- Social credentials NIE przechowywane — tylko GoLogin session cookies
- API keys w Vercel env vars (Claude, GoLogin, Apify, Stripe, Resend)
- Stripe webhook signature verification
- Sentry error tracking + Axiom structured logging (bez logowania treści DM/cookies)

### Compliance
- GDPR: prospekty = dane publiczne z social media
- Disclaimer w onboardingu: użycie zgodne z ToS platform
- "Compliance mode": max 3 DM/dzień/konto (toggle)
- Prawo usunięcia: dane usunięte w 24h od żądania

---

## 12. V1 Scope

### Jest w V1
- Monitoring: Reddit (PRAW) + LinkedIn (Apify)
- Claude intent classification
- Human-in-the-loop: DM + public reply
- Auto: like + follow (toggle)
- DM sending (Computer Use + GoLogin)
- Follow-up sequence (3 wiadomości, HITL)
- Reply detection (inbox check)
- Prospect database + pipeline kanban
- CSV export
- Multi-column dashboard z terminal header
- Agent persona + stany emocjonalne
- Account health monitoring
- Daily email digest
- /live page z Realtime
- "Scan my product" hook na landing
- Weekly results card (shareable)
- Stripe billing (Trial + Starter + Pro)
- Warmup scheduler

### Nie ma w V1
- Autopilot (bez approval) → V2
- TikTok, Instagram, X, Facebook → V1.5+
- GeeLark (mobile) → V1.5
- Multilogin (enterprise) → V2
- A/B testing wiadomości → V2
- CRM integrations (HubSpot, Pipedrive) → V2
- White-label Agency → V1.5
- Team features → V2

---

## 13. Success Metrics

### Activation (tydzień 1)
- % userów którzy widzą ≥ 5 sygnałów w < 10 min: > 70%
- % userów którzy połączyli konto: > 70%
- % userów którzy zatwierdzili ≥ 1 DM: > 60%

### Engagement (miesiąc 1)
- DAU/MAU: > 40%
- Median DM approved/user/week: > 5
- Daily email open rate: > 45%

### Outcomes (miesiąc 3)
- % userów z ≥ 1 reply: > 70%
- Median reply rate: > 15%
- % userów z ≥ 1 conversion: > 30%
- Trial → paid: > 20%

### Business (miesiąc 3)
- Paying users: 80-120
- MRR: $8-12K
- Monthly churn: < 6%
- Credit attachment rate (% buying extra packs): > 60%
- Blended ARPU: > $100/msc
- /live page → signup conversion: > 5%

---

## 14. Ryzyka

| Ryzyko | Severity | Mitygacja |
|--------|----------|-----------|
| GoLogin profiles detektowane | Wysokie | Computer Use (naturalny jak człowiek) + behavioral noise + stochastic sequences + warmup + GoLogin wbudowane proxy. Multi-account: ban jednego ≠ ban wszystkich. |
| Vercel Function timeout (60s limit) | Średnie | Monitoring duration_ms w job_logs. Alert gdy p95 > 50s. Haiku CU jest szybszy niż Sonnet/Opus. Fallback: migracja action workera na Railway (~dzień pracy). |
| Reddit API zmiany | Średnie | snoowrap = oficjalny API (read-only, public data). |
| LinkedIn Apify actor failure | Średnie | Alert wewnętrzny (job_logs). Rzadszy scan (co 2-4h) zmniejsza exposure. |
| Computer Use (Haiku) jakość nawigacji | Średnie | Haiku jest mniejszy model — może mieć problemy ze złożonymi UI. Monitoring success rate w job_logs. Fallback: upgrade do Sonnet CU dla problematycznych flows. |
| GoLogin jako single vendor | Średnie | Cała warstwa execution zależy od GoLogin. Adapter pattern w kodzie umożliwia migrację na AdsPower/Multilogin. Plan response na breach/outage. |
| Spam perception | Wysokie | Intent-only (DM wyłącznie do osób z wykrytym sygnałem). Claude quality control. Rate limits. |
| Niskie reply rates → churn | Wysokie | HITL daje kontrolę jakości. Onboarding coaching. Beta feedback loop. |
| /live page ochrona prywatności | Niskie | Posty Reddit/LinkedIn są publiczne. Nie ujawniamy który user targetuje kogo. |
| Compliance (GDPR + ToS) | Wysokie | Computer Use przez GoLogin jest nieodróżnialny od ręcznego użycia. Rate limity i warmup zapobiegają detekcji masowej automatyzacji. Konsultacja z prawnikiem przed launch. |

---

## 15. Launch Plan

### Pre-launch (tydzień 1-5: build)
```
Tydzień 1-2: Supabase schema + Next.js shell (Vercel) + onboarding
             + "scan my product" landing hook
             + Sentry + Axiom setup
Tydzień 2-3: Monitoring (Vercel Cron + snoowrap + Apify + keyword match)
             + /live page (polling)
Tydzień 3-4: Action engine (Supabase Webhook → Vercel Function
             → GoLogin + Playwright + Claude Haiku CU)
             + job_logs + timeout monitoring
Tydzień 4-5: Approval queue UI + prospect DB + Stripe
             + daily email digest (Resend)
```

### D1 po deploy — self-promotion start

Zanim cokolwiek innego: skonfiguruj repco.ai's własne konto na własnej instancji produktu.

```
Konto: @repco_official (Reddit) + repco.ai LinkedIn
Product profile: "AI that finds people on Reddit/LinkedIn 
                  looking for products like yours"
Keywords: "find first customers", "outreach tool", 
          "lead generation", "Apollo alternative",
          "how to get first 100 customers"
Subreddits: r/SaaS, r/entrepreneur, r/startups, 
            r/indiehackers, r/smallbusiness
```

Agent pracuje od D1. Pierwsze paying customers przychodzą przez własne DM-y zanim uruchomisz jakikolwiek paid channel. CAC ≈ $0.

### Beta (tydzień 6-8)
- 10 beta userów z sieci (indie hackers) — część pozyskana przez własny agent
- Free w zamian za feedback
- Fokus: reply rates + agent persona language
- Iteracja przed public launch

### Public launch (tydzień 9-10)
- ProductHunt (wtorek 12:01 ET)
- HN Show HN: "repco.ai — AI that finds people looking for your product on Reddit/LinkedIn"
- r/SaaS post z case study z bety
- X thread z wynikami bety: "I used repco to find repco's first customers. Here's how."
- Target: 30 paying users M1, $3-5K MRR

---

## 16. Open Questions

**Rozwiązane (v2.1 → v3.0):**

1. ~~**GoLogin vs AdsPower**~~: **GoLogin** — lepsze API docs, wbudowane proxy. Review M2.
2. ~~**Computer Use provider**~~: **Claude Haiku 4.5** z prompt caching. Jeden vendor AI (Anthropic). Haiku dla CU (tani, szybki), Sonnet dla DM generation i klasyfikacji.
3. ~~**Hosting workers**~~: **Vercel Pro** (Cron Functions + Database Webhooks). Fallback na Railway przy ~100 userach jeśli timeout > 60s.
4. ~~**Proxy provider**~~: **GoLogin wbudowane proxy**. Bez Bright Data — GoLogin Cloud profiles mają własne IP. Dodaj residential proxy TYLKO jeśli konta zaczną być flagowane.
5. ~~**Jeden vs dwa runtime'y**~~: **Jeden — Node.js/TypeScript**. snoowrap zamiast PRAW. Cały stack w jednym języku.

**Otwarte:**

1. **Revenue counter**: user wpisuje ręcznie avg deal value? Łączy Stripe? V1: manual input.
2. **Agent nazwa**: repco ma "mieć imię"? Opcja: agent nazywa się "rep" — "your rep found 8 people today."
3. **Apify billing**: pay-per-use na start. Subscription przy 50+ userach.
4. **Credit deduction timing**: monitoring credits deductowane daily (midnight UTC). Action credits deductowane przy execution (completed). Failed/rejected akcje nie zużywają kredytów.
5. **Haiku CU quality**: Czy Haiku 4.5 jest wystarczająco dobry do nawigacji LinkedIn DM flow? Testuj w becie. Fallback: Sonnet CU (droższy ale lepszy).
6. **GoLogin Cloud session limits**: Ile jednoczesnych profili GoLogin Cloud pozwala otworzyć na danym planie? Testuj przed launch.
