# repco.ai — PLG Strategy + Design Language

**Data:** 15 kwietnia 2026  
**Inspiracja:** polsia.com  

---

## Część 1: Design Language (modern SaaS)

### Co Polsia robi designowo

Po analizie polsia.com (landing + pełny dashboard):

1. **Terminal header jako primary feedback** — czarny pasek na górze pokazuje na żywo co agent robi: "> Posting to Twitter... Tweet posted". Nie loading spinner. Nie "Please wait". Prawdziwe akcje w czasie rzeczywistym.

2. **Agent ma osobowość** — nastój zmienia się dynamicznie: Curious → Pumped. ASCII art avatar zmienia wyraz twarzy. Notki muzyczne ♪ ♪ przy "Pumped". To nie jest "Status: Running". To jest postać.

3. **Agent działa bez pytania** — zanim użytkownik cokolwiek napisał, Polsia już wysłała email i opublikowała tweet. Time-to-value = sekundy od onboardingu.

4. **Autonomous first, chat secondary** — główny UI to oglądanie agenta przy pracy. Chat to korekta, nie sterowanie.

5. **Skrajny minimalizm** — zero sidebarsów z 47 opcjami. Jeden agent, jeden viewport, terminal log.

6. **Warm stone + indigo** — zero gradientów, zero glassmorphism. Wysoki kontrast, konfidens.

---

### repco.ai Design System

#### Paleta (shadcn preset b3QwALGmg — radix-nova)

```
Stone-900: #1C1917 (terminal, header, primary buttons)
Biały:     #FFFFFF (background, content)
Indigo:    #4338CA / oklch(0.457 0.24 277) (akcenty, live dot, CTA hover, alerts)
Stone-100: #F5F5F4 (secondary bg, cards)
Stone-500: #78716C (secondary text, labels)
Stone-800: #292524 (elevated surfaces)
Stone-400: #A8A29E (muted text, placeholders)
Stone-200: #E7E5E4 (borders, dividers)
Stone-700: #44403C (subtle backgrounds)
Zielony:   #22C55E (success, "replied", converted)
Czerwony:  #EF4444 (banned account, error)
```

#### Typografia

```
Headline:  "Inter" — clean, modern sans-serif
Body:      "Inter" lub "Geist" (UI sans) — clean, readable
Mono:      "Geist Mono" — terminal log, handles, code
```

#### Komponenty kluczowe

**Terminal header (persistent, top)**
```
Stone-900 tło, monospace font, indigo akcenty na statusach
Animacja: tekst wpisuje się od lewej, starsze linie przesuwają się w górę
Pokazuje: ostatnie 5 akcji agenta
Przykład:
  > Scanning r/SaaS... found 12 posts
  > Intent detected: "looking for outreach tool" (strength: 9)  [indigo]
  > Drafting DM for u/founder_guy...
  ✓ DM queued for approval                                       [green]
  ⠸ Scanning LinkedIn...                                         [spinner]
```

**Agent card (primary dashboard element)**
```
┌─────────────────────────────────────────┐
│  ╭──────────╮                           │
│  │  r   e   │   ● Active               │
│  │  p   c   │                           │
│  │    o     │   Scanning                │
│  ╰──────────╯   Found 8 signals today   │
│                                         │
│  Today: 8 signals · 3 DMs queued        │
└─────────────────────────────────────────┘
```

Agent ma stan emocjonalny:
- **Scanning** — standardowy stan, spinner
- **Found something** — podekscytowany (zmiana ikonki/koloru)
- **Waiting for approval** — cierpliwy, pulsujący dot
- **Reply received** — excited, zielony dot, animacja
- **Account warning** — zaniepokojony, żółty dot

**Intent feed card**
```
┌─────────────────────────────────────────────────────┐
│  r/SaaS  ·  u/jakub_founder  ·  4 min ago           │
│  ────────────────────────────────────────────────── │
│  "Anyone know a good tool for finding leads on      │
│   social? Tried Apollo but it's email-only..."      │
│                                                      │
│  ████████░░  Intent: 9/10  ·  Direct                │
│                                                      │
│  [Start Sequence]  [Respond Publicly]  [Dismiss]    │
└─────────────────────────────────────────────────────┘
```

**DM approval card**
```
┌─────────────────────────────────────────────────────┐
│  DM · u/jakub_founder · via Reddit account @repco1  │
│  ────────────────────────────────────────────────── │
│  Context: "Anyone know a good tool for finding      │
│  leads on social?"                                  │
│  ────────────────────────────────────────────────── │
│  ┌─────────────────────────────────────────────┐   │
│  │ Hey, saw your post about lead gen tools —   │   │
│  │ built exactly this. repco.ai monitors       │   │
│  │ Reddit/LinkedIn for people like you and     │   │
│  │ handles the outreach. Want early access?    │   │
│  └─────────────────────────────────────────────┘   │
│                                                      │
│  [✓ Approve]  [Edit]  [✕ Reject]                   │
└─────────────────────────────────────────────────────┘
```

#### Landing page (modern SaaS)

```
[TERMINAL HEADER - stone-900, full width]
> Scanning r/SaaS...
> Intent detected: "looking for cold outreach alternative" (3 min ago)
> Drafting personalized DM...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[INDIGO BANNER]
● repco found 1,247 intent signals on Reddit & LinkedIn today  →

[WHITE CONTENT]
repco.ai                                              Sign in

Find your next customer
before they find your competitor.

repco monitors Reddit and LinkedIn 24/7, detects people
looking for products like yours, and sends personalized DMs
on autopilot — from your accounts, with your voice.

[  Get Started Free  ]

No credit card required · 7-day free trial

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
About  ·  Privacy  ·  Terms  ·  contact@repco.ai
```

#### Onboarding (one-question-per-screen, jak Polsia)

```
Screen 1:
  > Tell me about your product.
  ─────────────────────────
  What does your product do?
  [                              ]
  Continue →

Screen 2:
  > Who are your customers?
  ─────────────────────────
  Who needs your product? (one sentence)
  [                              ]
  Continue →

Screen 3:
  > Any competitors?
  ─────────────────────────
  Name a tool people might use instead
  (helps repco find "alternative to X" posts)
  [                              ]  Skip
  Continue →

Screen 4:
  > Connect your Reddit account
  ─────────────────────────
  repco will use your account to monitor and respond.
  Your credentials are never stored — only session cookies.
  
  [ Open Reddit Login ]
  
  ← Back

Screen 5 (immediate, after connect):
  > ⠸ Scanning Reddit for people looking for [product]...
  ─────────────────────────
  [Live scanning animation]
  Found 3 signals in the last 48 hours.
  → Redirects to dashboard automatically
```

**Kluczowe:** użytkownik widzi pierwsze sygnały ZANIM skończy onboarding. Aha moment na screen 5, nie tydzień później.

---

## Część 2: PLG Strategy — od D1

### Definicja PLG dla repco

PLG = produkt sam pozyskuje, aktywuje, retencjonuje i ekspanduje userów — bez sales team.

Główne wyzwanie repco: wartość materialna (DM sent → reply) pojawia się po 7 dniach warmup. PLG wymaga wartości w < 10 minut.

**Rozwiązanie: zdekompozycj AHA moment**

```
Tradycyjny funnel:        repco PLG funnel:
Sign up                   Sign up
↓ (dni)                   ↓ (minuty)
Setup                     Onboarding (3 ekrany)
↓ (dni)                   ↓ (sekundy)
Warmup                    AHA #1: "34 people looking for your product RIGHT NOW"
↓ (tygodnie)              ↓ (same day)
First DM sent             AHA #2: First DM drafted & ready to approve
↓                         ↓ (day 8, after warmup)
Results                   AHA #3: First DM actually sent
                          ↓
                          AHA #4: First reply received
```

Każdy AHA to osobny moment retencji. Użytkownik nie czeka tygodnia na cokolwiek.

---

### 1. ACQUISITION (jak repco rośnie bez płatnych reklam)

#### A) "Scan my product" hook na landing page

Najsilniejszy PLG acquisition mechanic. Zamiast statycznej strony:

```
[Landing page - interactive]

Describe your product in one line:
[AI tool that helps freelancers find clients    ]

[Scan Reddit & LinkedIn now →]

--- 3 sekundy ---

Found 23 people looking for something like yours in the last 48h:

  r/freelance · u/mark_dev · 2h ago
  "Any tool that automates client prospecting? tired of cold email"
  Intent: 9/10 ████████░░

  r/SaaS · u/consultant_jane · 5h ago  
  "Alternative to Apollo that works on social media?"
  Intent: 8/10 ████████░░

  + 21 more

[Sign up to contact them →]
```

Użytkownik widzi wartość PRZED rejestracją. Conversion rate > standardowy "Get Started".

Implementacja: publiczne endpoint do Reddit API (PRAW) bez auth, wyniki po 5 sekund. Pokazuje real data, nie mockup.

#### B) Wyniki są shareowalne — results card

Po tygodniu użytkowania repco generuje "Weekly Results Card":

```
┌──────────────────────────────────┐
│  repco.ai · Weekly Report        │
│  ─────────────────────────────   │
│  🔍 847 posts scanned            │
│  📡 34 intent signals            │
│  💬 12 DMs sent                  │
│  📬 4 replies (33% reply rate)   │
│  ✅ 1 converted                  │
│                                  │
│  powered by repco.ai             │
└──────────────────────────────────┘
```

Shareable na X/LinkedIn. Indie hackers KOCHAJĄ metryki. Każdy share = organic acquisition z targetowej grupy.

#### C) Public replies jako discovery

Gdy agent odpowiada publicznie na Reddit/LinkedIn — odpowiedź jest widoczna. Tone jest helpowy, nie spamerski. Inni founderzy widzą jakość odpowiedzi. Część zapyta "jak to robisz?" — natural referral.

Nie ma "powered by repco" w publicznych odpowiedziach (wyglądałoby jak bot), ale user może to robić organicznie.

#### D) Waitlist mechanic (pre-launch)

Landing page z "Join waitlist" + licznik: "847 founders already waiting." Licznik aktualizuje się na żywo (Supabase Realtime). Nawet jeśli nie wszystkie numery są realne — psychologia kolejki działa.

Email na waitliście dostaję "3 people ahead of you just found leads on Reddit. You're up next." — pull mechanic przed oficjalnym launche.

---

### 2. ACTIVATION (pierwsze 10 minut)

**Activation metric:** user widzi ≥ 5 intent signals w < 10 minut od signup.

#### Decoupled activation flow

```
Minuta 0: Sign up (email lub Google, bez karty)
Minuta 1: Onboarding — 3 pytania: produkt, klient, konkurent
Minuta 2: "Scanning now..." — live animation
Minuta 3-5: Intent feed pojawia się na żywo (Supabase Realtime)
            "Found: u/dev_founder — 'looking for outreach tool' (4h ago)"
Minuta 5: Dashboard pełny sygnałów — AHA #1
Minuta 6: "Connect Reddit account to start contacting them"
           → User łączy konto (warmup zaczyna się w tle)
Minuta 7: Pierwsze DM wygenerowane, w approval queue
           "Ready to send when your account warms up (7 days)"
Minuta 8-10: User przegląda sygnały, edytuje DM drafty
```

**Kluczowe zasady:**
- Intent feed pokazuje PRAWDZIWE posty, bez signup. Nie "example data."
- Warmup działa w tle — nie blokuje żadnego etapu onboardingu
- Approval queue wypełnia się od razu — user ma co robić przez 7 dni warmup

#### Empty state design

Nie ma momentu gdy ekran jest pusty. Każdy "czekający" ekran ma progress:

```
[Zamiast białego ekranu]

> ⠸ Scanning r/SaaS for "outreach tool"...
> ⠸ Scanning r/entrepreneur for "find customers"...
> ✓ Found: 3 signals
> ⠸ Scanning r/startups...

Signals found: ████░░░░░░ 3 / ~20 estimated
```

---

### 3. RETENTION (dlaczego user wraca codziennie)

#### A) Daily pull mechanic — email digest

Codziennie o 8:00 czasu usera:

```
Subject: "6 new people looking for [product name] yesterday"

repco found 6 high-intent signals on Reddit & LinkedIn.

Top signal:
  u/saas_founder · r/SaaS · 3h ago
  "I need an alternative to Apollo that works on Twitter/X"
  Intent: 9/10

3 DMs waiting for your approval.

[Review signals →]  [Approve DMs →]
```

Email bez linku do unsubscribe na pierwszym ekranie (dark pattern — nie robimy). Ale email jest wartościowy więc churn emailowy niski.

#### B) Streak mechanic

```
Dashboard header:
  🔥 14-day streak — you've had active leads every day this week
```

Gamification. Indie hackers są podatni na streaki (patrz: GitHub contributions).

#### C) Prospect database jako retention moat

Po 30 dniach user ma 200+ prospektów z historią konwersacji, intent data, pipeline statusem. To jest JEGO dane, które zbudował z repco.

Widoczny milestone: "Your prospect database: 247 contacts"

Switching cost nie jest techniczny — jest data. Nikt nie chce zaczynać od zera.

#### D) Milestones & progress

```
Tydzień 1: "First intent signal detected" → konfetti
Tydzień 2: "First DM sent" → konfetti + email
Miesiąc 1: "100 prospects in your database" → shared results card
Miesiąc 3: "First conversion via repco" → case study prompt
```

---

### 4. EXPANSION (naturalne upgrady)

Zasada: expansion musi czuć się jak "usunięcie sufitu", nie "płacenie za podstawy."

#### Expansion triggers

| Moment | Message |
|--------|---------|
| Credit balance < 100 | "You're running low on credits. Restock before your keywords stop scanning tonight." |
| Monitoring burn > 500/msc | "Your monitoring setup uses 520 credits/month — buy the Growth pack to cover the full month." |
| DM queue growing, zero credits | "12 DMs ready and waiting. You're out of credits. Pack of 500 = $29." |
| Daily burn alert | "You're burning 35 credits/day. At this rate, your credits run out in 4 days." |
| First DM sent milestone | "First DM sent! You've got momentum. Scale up your monitoring with the Growth pack." |

#### Credit model jako expansion engine

Credit economy tworzy naturalny expansion bez tierów:

```
Trial (3 dni, bez karty):
  - 500 kredytów included
  - Pełny dostęp do produktu
  - Typowy setup: 2 keywords Reddit + 5 DMs
  - Wystarczy żeby zobaczyć pierwsze wyniki

Plan $49/msc (500 kredytów/msc):
  - Typowy setup: 3-4 keywords + 10-15 DMs/msc
  - Monitoring burns ~300 kredytów pasywnie
  - Zostaje ~200 na akcje = 6-7 DMs
  - Natural trigger: "I want more DMs" → buy Growth pack $29

Expansion przez credit packs:
  Pack $29 (500)  → +16 DMs lub +5 dni więcej monitoringu
  Pack $59 (1500) → pełny miesiąc z 5 keywords + 20 DMs
  Pack $149 (5000)→ heavy user: 10 keywords + 50 DMs/msc
  Pack $399 (15000)→ agency: 20+ keywords + 150+ DMs/msc
```

**Kluczowa psychologia:** monitoring credits wypalają się CODZIENNIE — nawet gdy user nie loguje się. Dashboard pokazuje live burn. To tworzy urgency do zakupu bez żadnego upsell modala.

---

### 5. REFERRAL (jak repco rośnie przez użytkowników)

#### A) Referral program

Klasyczny Dropbox model:
- "Give 1 month free, get 1 month free"
- Unique referral link per user
- Visible in dashboard: "Invite founders you know — you'll both get a free month"

Targetowa grupa (indie hackers) ma silne sieci między sobą. Jeden happy user → 3-5 referrals.

#### B) Results card sharing

Po każdym tygodniu / każdym miesiącu: auto-generowany shareable card (jak Spotify Wrapped). User może opublikować na X/LinkedIn.

```
"This month with repco.ai:
  847 posts scanned · 12 DMs sent · 4 replies · 1 new customer
  reply rate: 33% (avg cold email: 2-3%)
  
  repco.ai — AI SDR for social media"
```

Format: landscape 1200×630 (OG image size). Jeden klik share.

#### C) Agency viral loop

Agency user (Agency pack $399/15K credits) zarządza 10 klientami. Każdy klient WIDZI wyniki repco (user może dać read-only dostęp). Klienci którym się podoba mogą kupić własne konto. Agency user = akwizytor.

---

### 6. PLG Design Principles (implementation rules)

#### Zasada 1: Show the agent working, not just results

```
❌ "You have 8 new leads"
✅ Terminal log: "> Scanning r/SaaS... found intent signal..."
   Potem: "8 new leads added to your pipeline"
```

Polsia to rozumie doskonale. Agent przy pracy = entertainment + trust + proof of value.

#### Zasada 2: Personality drives retention

repco agent powinien mieć imię i stany emocjonalne:

```
Stan: Scanning        — "Looking for leads..."
Stan: Found signal    — "Got one. Strong intent. Drafting now."  
Stan: Waiting         — "6 DMs queued, waiting for your approval."
Stan: Reply received  — "They replied. This looks positive."
Stan: Account warning — "One account hit a rate limit. Cooling down."
```

Nie "Status: Active." Osobowość.

#### Zasada 3: Time-to-value < 10 minut, no exceptions

Każdy nowy feature musi mieć pytanie: "jak szybko user zobaczy wartość tego feature?"

Warmup trwa 7 dni — akceptowalne BO intent feed działa od sekundy 1. User ma co robić przez 7 dni.

#### Zasada 4: Frictionless trial

- No credit card
- Google signup (1 klik)
- Trial = pełny produkt, nie ograniczony demo
- Upgrade prompt tylko gdy trafisz w naturalny limit — nie wcześniej

#### Zasada 5: Upgrade prompts muszą być helpful, nie pushy

```
❌ "Buy more credits to unlock this feature"
✅ "12 DMs queued and ready. You're out of credits.
   Pack of 500 = $29. Your prospects won't wait long."
```

Kontekst + urgency + konkretna akcja + cena. Nie wall.

#### Zasada 6: Empty states są aktywne, nie puste

```
❌ [Blank screen z "No signals yet"]
✅ "> ⠸ Scanning r/SaaS for your keywords...
   > ⠸ Scanning r/entrepreneur...
   > ✓ First scan completes in ~2 minutes"
```

---

### 7. PLG Metrics Dashboard (internal)

Metryki które mierzymy jako team:

| Metric | Target M1 | Target M3 |
|--------|-----------|-----------|
| Time to first intent signal | < 5 min | < 3 min |
| % users who see ≥5 signals in first session | > 70% | > 85% |
| % users who connect account day 1 | > 50% | > 65% |
| % users who approve ≥1 DM in week 1 | > 60% | > 75% |
| % users who get ≥1 reply in month 1 | > 50% | > 70% |
| Trial → paid conversion | > 15% | > 25% |
| Month 1 churn | < 10% | < 6% |
| Credit attachment rate (% buying extra packs) | > 40% | > 60% |
| Referral rate (% users who refer ≥1) | > 10% | > 20% |

---

### 8. Launch PLG Sequence

#### Pre-launch (tydzień -4 do -1)

1. Landing page z "Scan my product" hook (live Reddit search, no auth)
2. Waitlist z live counter
3. Daily email do waitlisty: "X people found leads on Reddit today while you waited"
4. Post na r/SaaS, r/indiehackers: "I built a tool that finds people looking for your product on Reddit. DM if you want beta access." — nie link, DM only. Organic, not spammy.

#### Launch week

1. ProductHunt launch (wtorek rano, 12:01 ET)
2. X/Twitter thread: "I automated my entire social outreach. Here's how repco.ai works + results from beta."
3. HN Show: "Show HN: repco.ai — AI that finds people looking for your product on Reddit/LinkedIn"
4. Post na r/SaaS z case study: "Got 12 leads from Reddit in week 1 without manual browsing"

#### Post-launch (miesiąc 1-3)

1. Każdy user który dostanie pierwszą odpowiedź → prompt do napisania case study
2. Weekly "results cards" shareable → organic X/LinkedIn
3. Referral program aktywowany po 30 dniach
4. Outreach do agencji growth (natural Agency tier users)

---

## Podsumowanie: kluczowe PLG decyzje dla repco

| Decyzja | Wybór | Dlaczego |
|---------|-------|---------|
| Free trial | 7 dni, bez karty | Maksymalna konwersja z landing page |
| Trial limits | 10 DM, 1 konto | Daje realną wartość, naturalnie prowadzi do upgradu |
| AHA moment | Intent feed w < 5 min | Nie czekamy na warmup — wartość od sekundy 1 |
| Referral | 1 miesiąc za miesiąc | Klasyczny mechanic, działa w B2B SaaS |
| Results sharing | Auto-generated card | Shareable, brandable, organic acquisition |
| Upgrade prompts | Tylko przy naturalnym limicie | Nie irytuje, konwertuje gdy user widzi wartość |
| Agent personality | Nastroje + terminal log | Retention przez engagement, nie tylko przez wyniki |
| Landing page hook | Live "scan my product" | Pokazuje wartość przed rejestracją |
