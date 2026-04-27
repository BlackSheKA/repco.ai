# Mechanizmy komunikacji outbound — repco.ai

## Filozofia

- **Każdy typ akcji = osobny, w pełni niezależny mechanizm.** DM nie współdzieli kodu z komentarzem, like nie współdzieli z follow.
- **Każdy mechanizm ma własny generator treści, własny QC, własny executor, własny verifier, własną konfigurację UI, własny credit cost, własne dzienne limity.**
- **User aktywuje i konfiguruje każdy mechanizm osobno** — widzi listę dostępnych akcji per platforma i decyduje które używa.
- **User-configurable per mechanizm:** dzienne limity per konto, approval policy (auto vs manual), tone, blocklist fraz, opt-in/out per signal source.
- **AI generuje treść kontekstowo.** Każda wiadomość/komentarz odwołuje się do konkretnego sygnału z product contextem usera. Brak generic templates wysyłanych masowo.
- **Reply detection = cross-cutting concern.** Każda przychodząca odpowiedź (na DM, komentarz, connection request) cancele wszystkie pending follow-upy do tego samego prospekta — niezależnie od tego z którego mechanizmu pochodziły.

## Data access — twardy constraint

**Apify NIE używamy do write actions.** Apify to read-only scraping. Każda akcja outbound wymaga **zalogowanej sesji usera repco** w gologin profilu.

Hierarchia metod wykonania (każdy mechanizm wybiera najtańszą która działa):

1. **Deterministic DOM via CDP/Playwright** — preferowane. Tani, szybki, audytowalny. Używamy gdy LinkedIn/Reddit/X mają stabilny DOM dla danej akcji (np. like button selector).
2. **URL-hacks** — fallback dla flow gdzie CDP-dispatched click jest blokowany przez anti-bot (`isTrusted: false` check). Przykład: LinkedIn connection request via `/preload/custom-invite/?vanityName={slug}`.
3. **Haiku Computer Use** — ostatnia instancja. Drogi, wolny, niedeterministyczny. Tylko dla flow gdzie DOM jest non-deterministyczny lub anti-bot blokuje wszystkie CDP paths.

**Zasada wyboru:** każdy mechanizm w pierwszej iteracji startuje z DOM. Jeśli detection rate spada poniżej threshold → URL-hack. Jeśli URL-hack nie istnieje → Haiku CU. Decyzja per mechanizm udokumentowana w jego dziale poniżej.

**Implikacja:** outbound mechanizm = zawsze gologin + (DOM | URL-hack | Haiku CU). Brak Apify, brak oficjalnych API.

---

## Kontekst produktu (wspólny input dla generatora w każdym mechanizmie)

Te same `product_profiles` co przy detekcji + dodatkowe pola tone/voice:

- **Nazwa produktu, opis, ICP, keywords, konkurenci, negative keywords** (z signal detection)
- **Tone of voice** (casual / professional / playful — globalny default + per-mechanism override)
- **Banned phrases** (frazy które nigdy nie pojawią się w generated content — np. "I noticed you", "Just wanted to reach out")
- **Required disclosures** (np. "I'm the founder of..." — opt-in)
- **Outreach persona** (kto wysyła — auto-pulled z gologin account: imię, headline, company)

Cached prompt prefix per user (taniość) — generatory różnych mechanizmów dostają ten sam product context, ale różny mechanism-specific prompt na końcu.

---

## Wzorzec architektoniczny per mechanizm

Każdy mechanizm składa się z dokładnie tych komponentów (każdy w osobnym pliku):

1. **Generator** `lib/outbound/{mechanism-id}/generator.ts` — AI prompt specyficzny dla mechanizmu (DM ≠ comment ≠ connection note). Pomijany dla mechanizmów bez treści (like, follow, upvote).
2. **QC** `lib/outbound/{mechanism-id}/qc.ts` — walidacja długości, blocklist, link policy, spam heuristics. Per-mechanism (DM ma inne limity niż comment).
3. **Executor** `lib/outbound/{mechanism-id}/executor.ts` — DOM/URL-hack/Haiku CU. Każdy mechanizm wybiera własną metodę.
4. **Verifier** `lib/outbound/{mechanism-id}/verifier.ts` — post-action: screenshot URL, sprawdzenie stanu (np. czy DM faktycznie pojawił się w sent folder, czy connection request widoczny w invitation manager).
5. **Runner** `lib/outbound/{mechanism-id}/runner.ts` — orchestracja: pobierz action → check guards (account health, daily cap, approval) → generator → QC → executor → verifier → update status.
6. **UI config** `features/outbound/components/{mechanism-id}-config.tsx` — sekcja w `/outbound` z aktywacją + parametrami + cost preview + last action stats.

**Wspólna infrastruktura (reuse, nie duplikacja):**

- `actions` table + per-action status machine (`pending_approval → approved → executing → completed | failed`)
- `action_counts` (daily caps per account)
- `social_accounts.health_status` (warning/banned gate — żaden mechanizm nie wykonuje akcji jeśli warning/banned)
- Gologin profile resolver (per platform per user)
- Reply detection cron (cross-mechanism — patrz OC4)
- Logger + correlation IDs (każdy mechanizm loguje pod swoim `mechanism_id`)

**Co user widzi w UI** (`/outbound` analogiczny do `/signals`):

- Lista wszystkich mechanizmów outbound per platforma (Reddit OR1-OR9, LinkedIn OL1-OL11, X OX1-OX8)
- Per mechanizm: toggle on/off, daily cap, approval policy, tone override, blocklist, koszt szacunkowy, last action, success rate 7d
- Świadomość: "repco oferuje 28 mechanizmów akcji — aktywujesz te których potrzebujesz, każdy ma własny limit"

---

# REDDIT — mechanizmy outbound

## OR1 · DM (private message)

**Co robi:** Wysyła prywatną wiadomość do autora sygnału. Najsilniejszy outbound, najdroższy w kredytach, highest-friction (najłatwiej wpaść w spam filtr).

**User config:**
- Toggle on/off (domyślnie OFF — opt-in)
- Daily cap per konto (default 8)
- Approval policy: **manual approval required** (zawsze, nie da się disable — Reddit DM bany są szybkie)
- Tone override per-mechanism
- Max długość (default 600 znaków, hard cap 1000)
- Link policy: **no links in first DM** (hard rule, nie configurable)
- Opt-out per signal mechanism: który `mechanism_id` z signal detection NIE generuje DM (np. user może chcieć DM tylko z R7 own engagement, nie z R1 firehose)

**Mechanizm:**
1. Action utworzony z signal → generator (Sonnet 4.6) → QC → approval queue
2. User klika "approve" w `/feed` → status `approved`
3. Worker pobiera action → gologin sesja Reddit → nawigacja na profil prospekta → klik "Chat" lub "Send a message"
4. **Metoda wykonania:** Haiku CU (Reddit DOM dla chat jest non-deterministyczny, używamy CU)
5. Verifier: screenshot sent folder, sprawdzenie czy wiadomość widoczna
6. Sukces → `status='completed'`, `screenshot_url` zapisany. Failure → typed failure mode (`session_expired`, `target_blocked_dms`, `unknown`)

**Storage:** `actions` z `action_type='dm'`, `platform='reddit'`, `mechanism_id='reddit_dm'`.

**Credit cost:** 30 (high — odzwierciedla risk + LLM + Haiku CU).

**Niezależność:** OR1 nie współdzieli executora z OR2 (komentarz). Inny flow, inna metoda. Reply detection (OC4) nasłuchuje DM inbox i cancele follow-upy — to data sharing, nie code sharing.

---

## OR2 · Top-level comment (publiczny komentarz pod postem)

**Co robi:** Publikuje komentarz pod postem prospekta. Mniej intrusive niż DM, public visible, buduje reputację konta. Najsilniejszy "soft outbound".

**User config:**
- Toggle on/off
- Daily cap (default 5 — rate limit Reddit dla niezweryfikowanych kont)
- Approval policy: **manual approval required**
- Max długość (default 500 znaków)
- Link policy: **no links in first 7 days of account warmup**, potem opcjonalnie 1 link per komentarz
- Opt-out: lista subredditów gdzie OR2 jest wyłączony (subreddits z self-promo bans)
- Persona override (np. "respond as fellow user, not vendor")

**Mechanizm:**
1. Action z signal → generator (Sonnet 4.6, prompt podkreśla "value-add comment, NOT pitch") → QC (sprawdza czy nie brzmi jak reklama)
2. Approval queue
3. Worker → gologin Reddit → nawigacja na URL postu → klik "Reply"
4. **Metoda wykonania:** Haiku CU
5. Verifier: screenshot komentarza widocznego pod postem + URL fragment z comment ID

**Storage:** `actions` z `action_type='public_reply'`, `mechanism_id='reddit_top_level_comment'`, `parent_post_url`.

**Credit cost:** 15.

**Niezależność:** OR2 ≠ OR3 (reply do komentarza w threadzie). OR2 zawsze top-level pod postem, OR3 zawsze odpowiedź na konkretny komentarz. Inny generator (OR3 ma kontekst całego threada), inny prompt, inny executor flow.

---

## OR3 · Reply do komentarza (w threadzie pod cudzym postem)

**Co robi:** Odpowiedź na konkretny komentarz w threadzie (prospekt zostawił komentarz pod cudzym postem → repco user odpowiada na ten komentarz, nie na sam post).

**Use case:** sygnały z R2 (post-watch komentarze) i R6 (engagement on tracked users' content) — prospekt jest komentującym, nie autorem posta. Top-level comment pod cudzym postem nie ma sensu, musi być reply do konkretnego komentarza.

**User config:** podobnie do OR2; daily cap default 5 (wlicza się w ten sam pool co OR2 albo osobny — decyzja produktowa, default: osobny pool).

**Mechanizm:**
1. Generator dostaje: parent post + parent comment + product context. Prompt podkreśla że odpowiada na konkretny komentarz, nie post.
2. QC + approval
3. Worker → gologin → URL komentarza (`?context=3` żeby załadować thread) → klik "Reply" pod właściwym komentarzem
4. **Metoda:** Haiku CU (selektor zależny od pozycji w threadzie, niedeterministyczny)
5. Verifier: screenshot z reply visible + parent comment visible

**Storage:** `actions` z `action_type='public_reply'`, `mechanism_id='reddit_thread_reply'`, `parent_comment_url`.

**Credit cost:** 15.

---

## OR4 · Upvote

**Co robi:** Upvote na poście lub komentarzu prospekta. Najtańszy "engage" — buduje engagement signal, nie wymaga generacji treści.

**User config:**
- Toggle on/off
- Daily cap per konto (default 20, wspólny pool z OR8 follow)
- Approval policy: **auto** (low risk, no content)
- Source filter: tylko sygnały z `intent_strength >= X` (default 4) — nie upvotujemy każdego sygnału, tylko warm
- Cooldown per prospect (default 7d — nie upvotujemy tego samego usera 5× w tygodniu)

**Mechanizm:**
1. Action utworzony auto (no approval) → worker
2. Worker → gologin → URL postu/komentarza → klik upvote arrow
3. **Metoda:** Deterministic DOM (Reddit upvote button ma stabilny selektor)
4. Verifier: sprawdzenie aria-pressed=true na arrow + post score increment

**Storage:** `actions` z `action_type='like'`, `mechanism_id='reddit_upvote'`.

**Credit cost:** 0 (engage pool — wlicza się w daily cap, nie zużywa kredytów).

**Niezależność:** OR4 (upvote) ≠ OR5 (downvote) ≠ OR8 (follow). Każdy ma osobny executor, osobne metryki, osobny cap (lub wspólny pool z explicit konfigem).

---

## OR5 · Downvote

**Status:** **HARD EXCLUDE**. Downvote = negatywna interakcja, ban-magnet, brak business value w outbound playbooku. Lista exclude na dole dokumentu.

---

## OR6 · Submit post (publikacja własnego posta w subreddicie)

**Co robi:** Publikuje oryginalny post usera w docelowym subreddicie. Nie jest reakcją na sygnał — jest **standalone outbound** (lead magnet, value post, AMA).

**User config:**
- Toggle on/off (domyślnie OFF — high effort, high risk)
- Lista subredditów docelowych (white-listed manually — każdy subreddit ma inne self-promo rules)
- Frequency cap: max 1 post / subreddit / 7d (Reddit hard rule against self-promotion frequency)
- Content source: **user-authored** (nie AI-generated; AI tylko proponuje tytuł + body, user editsuje przed publikacją)
- Approval policy: **manual approval required** (zawsze, nie da się disable)
- Tags: `kind` (text post / link post — link wymaga 90-10 rule compliance)

**Mechanizm:**
1. User w UI tworzy draft posta → AI proponuje tytuł i body z product context → user edituje
2. Action `pending_approval` → user approve
3. Worker → gologin → `https://reddit.com/r/{sub}/submit` → wypełnia form
4. **Metoda:** Deterministic DOM (form submission, stabilny selektor)
5. Verifier: screenshot opublikowanego posta + URL z post ID

**Storage:** `actions` z `action_type='post_submit'` (nowy), `mechanism_id='reddit_post_submit'`, `subreddit`, `post_url` (po sukcesie).

**Credit cost:** 30 (drogo — risk + setup time).

**Niezależność:** osobny generator (post body ≠ DM ≠ comment), osobny QC (sprawdza self-promo ratio, banned link domains per subreddit), osobny executor. Brak współdzielenia z OR2/OR3.

---

## OR7 · Crosspost

**Co robi:** Crosspostuje istniejący post (własny lub cudzy) do innego subreddita.

**Use case:** user opublikował post w `r/saas` (własny lub klienta), chce go wyeksponować w `r/microsaas`. Reddit ma natywną feature crosspost.

**User config:**
- Toggle on/off
- Lista par `(source_sub, target_sub)` z whitelistą
- Daily cap (default 2)
- Approval: **manual**

**Mechanizm:**
1. User wskazuje post URL + target subreddit (lub auto-trigger jeśli OR6 publikuje post i user ma autocrosspost rule)
2. Approval queue
3. Worker → gologin → otwiera post URL → klika "Share" → "Crosspost" → wybiera target sub → submit
4. **Metoda:** Haiku CU (modal flow, niedeterministyczny)

**Storage:** `actions` z `action_type='crosspost'` (nowy), `mechanism_id='reddit_crosspost'`, `source_post_url`, `target_subreddit`.

**Credit cost:** 10.

---

## OR8 · User follow

**Co robi:** Follow profilu prospekta (Reddit user follow — pojawia się w jego notyfikacjach, soft signal że jesteśmy zainteresowani).

**User config:**
- Toggle on/off
- Daily cap (wspólny pool z OR4 upvote, default 20)
- Approval: **auto**
- Source filter: tylko prospekty z `pipeline_status='engaged'` lub wyżej (nie followujemy każdego sygnału)

**Mechanizm:**
1. Worker → gologin → URL profilu → klik "Follow"
2. **Metoda:** Deterministic DOM
3. Verifier: button state change (Follow → Following)

**Storage:** `actions` z `action_type='follow'`, `mechanism_id='reddit_user_follow'`.

**Credit cost:** 0 (engage pool).

---

## OR9 · Subreddit join (subscribe)

**Co robi:** Subskrybuje subreddit z którego pochodzą sygnały. Buduje wiarygodność konta (regular kontrybutor należy do społeczności w której się udziela).

**Use case:** account warm-up. Konto które komentuje w `r/saas` ale nie jest subskrybentem = red flag dla moderatorów. OR9 automatycznie subskrybuje subreddity gdzie OR2/OR3 publikują komentarze.

**User config:**
- Toggle on/off (default ON — recommended dla warm-up)
- Trigger: auto-subscribe gdy user pierwszy raz publikuje komentarz w nowym subreddicie

**Mechanizm:**
1. Worker (idle scheduler) sprawdza historię akcji → subreddity gdzie konto miało aktywność ale nie jest subskrybentem
2. Per subreddit → gologin → URL subreddita → klik "Join"
3. **Metoda:** Deterministic DOM

**Storage:** `actions` z `action_type='subreddit_join'` (nowy), `mechanism_id='reddit_subreddit_join'`.

**Credit cost:** 0.

---

# LINKEDIN — mechanizmy outbound

## OL1 · Connection request (z notą)

**Co robi:** Wysyła connection request do prospekta z personalizowaną notą.

**Krytyczne ograniczenie:** LinkedIn limit ~100 invites/tydzień per konto (soft, eskaluje do warning po przekroczeniu). Hard cap LinkedIn-side, nie nasz.

**User config:**
- Toggle on/off
- Daily cap (default 15, weekly cap 100)
- Approval policy: **manual approval required** (zawsze)
- Max długość noty (LinkedIn limit 300 znaków, hard cap)
- Tone: dedicated `connection_note_tone` (bardzo krótki format)
- Send WITHOUT note: opcja per-mechanism (czasem bez noty ma wyższy accept rate, ale traci kontekst)

**Mechanizm:**
1. Action z signal (zwykle z L1/L2/L3/L4/L5/L7 detection) → generator (Sonnet, max 250 znaków, prompt podkreśla "must reference specific signal context") → QC
2. Approval queue
3. Worker → gologin → **URL hack** `https://www.linkedin.com/in/{slug}/preload/custom-invite/?vanityName={slug}` (omija anti-bot block na CDP click "Connect")
4. Wypełnia notę → klik "Send invitation"
5. **Metoda:** URL-hack + Deterministic DOM (form fill)
6. Verifier: redirect na profil + button state "Pending"

**Storage:** `actions` z `action_type='connection_request'`, `mechanism_id='linkedin_connection_request'`, `invitation_note`.

**Credit cost:** 20.

**Niezależność:** OL1 jest **gateway** do OL2 (DM 1° only). Sequencing (OC1) automatycznie kolejkuje OL2 po acceptance OL1, ale są to dwa osobne mechanizmy z osobnymi executorami.

---

## OL2 · DM (1° connection only)

**Co robi:** Wysyła wiadomość prywatną do prospekta. **Działa TYLKO dla 1° connections** (po akcept invite).

**User config:**
- Toggle on/off
- Daily cap (default 8)
- Approval policy: **manual approval**
- Max długość (default 1000 znaków, hard cap 1900)
- Link policy: configurable (LinkedIn pozwala na linki, ale link w pierwszym DM obniża delivery rate)

**Mechanizm:**
1. Action z signal → generator → QC → approval
2. Worker → gologin → check `pipeline_status='connected'` (jeśli nie 1°, fail z `not_connected`)
3. Nawigacja na profil → klik "Message" → DOM fill → submit
4. **Metoda:** Deterministic DOM (LinkedIn messaging UI ma stabilne selectory; deterministyczny flow per [linkedin-dm-executor.ts](src/lib/action-worker/actions/linkedin-dm-executor.ts))
5. Verifier: screenshot konwersacji + ostatnia wiadomość = treść wysłana

**Storage:** `actions` z `action_type='dm'`, `mechanism_id='linkedin_dm'`.

**Credit cost:** 30.

---

## OL3 · InMail (płatny DM bez connection)

**Status:** **HARD EXCLUDE w v1.x.** Wymaga LinkedIn Premium na koncie outreachowym; ścieżka v2+. Patrz lista exclude.

---

## OL4 · Reaction (Like / Praise / Insightful / Empathy / Curious / Funny)

**Co robi:** Reaguje na post prospekta (lub post na którym prospekt zareagował). LinkedIn ma 6 typów reakcji — każda niesie inny semantic.

**User config:**
- Toggle on/off
- Daily cap (default 30, wspólny pool z OL6 follow)
- Approval: **auto**
- **Reaction type strategy:** auto (AI wybiera typ na podstawie treści posta — biznesowy → Insightful, casual → Like) lub fixed (zawsze Like)
- Source filter: tylko posty z `intent_strength >= X`

**Mechanizm:**
1. Action auto-utworzony → worker
2. Generator (jeśli reaction_type=auto): Haiku ocenia post i zwraca jeden z 6 typów. Jeśli fixed: skip.
3. Worker → gologin → URL postu → hover na "Like" → wybiera reakcję
4. **Metoda:** Deterministic DOM
5. Verifier: aria-pressed=true + reaction icon visible

**Storage:** `actions` z `action_type='like'`, `mechanism_id='linkedin_reaction'`, `reaction_type` (LIKE/PRAISE/INSIGHTFUL/EMPATHY/CURIOUS/FUNNY).

**Credit cost:** 0 (engage pool).

---

## OL5 · Comment (top-level pod postem)

**Co robi:** Publikuje komentarz pod postem prospekta. Public, visible to entire network — buduje reputację.

**User config:**
- Toggle on/off
- Daily cap (default 10)
- Approval policy: **manual approval**
- Max długość (LinkedIn limit 1250 znaków, default 800)
- Link policy: domyślnie no links (LinkedIn deprioritises posts/comments z linkami)
- Tone override

**Mechanizm:**
1. Action z signal → generator (Sonnet, prompt: "value-add comment, professional but not corporate") → QC
2. Approval
3. Worker → gologin → URL postu → klik comment box → fill → submit
4. **Metoda:** Deterministic DOM ([linkedin-comment-executor.ts](src/lib/action-worker/actions/linkedin-comment-executor.ts))
5. Verifier: comment widoczny pod postem + URL fragment

**Storage:** `actions` z `action_type='comment'`, `mechanism_id='linkedin_comment'`, `parent_post_url`.

**Credit cost:** 15.

---

## OL6 · Reply do komentarza (w threadzie)

**Co robi:** Reply na konkretny komentarz w threadzie. Analog OR3.

**Use case:** sygnały z L3/L5 — prospekt jest komentującym, nie autorem posta.

**User config:** osobna sekcja od OL5; daily cap default 10 (osobny pool).

**Mechanizm:**
1. Generator dostaje parent post + parent comment + product context
2. Approval
3. Worker → gologin → URL posta → ekspansja threada → klik reply pod właściwym komentarzem
4. **Metoda:** Haiku CU (selektor reply zależny od głębokości threada)

**Storage:** `actions` z `action_type='comment'`, `mechanism_id='linkedin_thread_reply'`, `parent_comment_url`.

**Credit cost:** 15.

---

## OL7 · Profile follow

**Co robi:** Follow profilu (NIE connection — follow to mniejszy commitment, asymetryczny). Subskrybuje content prospekta bez wymagania akceptacji.

**User config:**
- Toggle on/off
- Daily cap (default 30, wspólny pool z OL4 reaction)
- Approval: **auto**
- Source filter: prospekty z `pipeline_status='detected'` lub wyżej

**Mechanizm:**
1. Worker → gologin → URL profilu → klik "Follow" (jeśli nie ma "Connect" jako primary CTA — niektóre profile mają tylko "Follow")
2. **Metoda:** Deterministic DOM, **detekcja Premium-gate** (niektórzy creators wymagają Premium do follow — typed failure `follow_premium_gated`)

**Storage:** `actions` z `action_type='follow'`, `mechanism_id='linkedin_profile_follow'`.

**Credit cost:** 0.

---

## OL8 · Repost (z thoughts lub simple)

**Co robi:** Repostuje cudzy post — albo "as is" (simple repost) albo z dodanym komentarzem (repost with thoughts).

**Use case:** post influencera w niszy → repco user repostuje z thoughts → buduje thought leadership + zwiększa szansę że influencer zauważy → warm intro.

**User config:**
- Toggle on/off (default OFF — high-friction, użytkownik musi rozumieć)
- Daily cap (default 2 — repost spam jest oczywisty)
- Approval policy: **manual approval**
- Variant: simple repost vs with thoughts (z thoughts wymaga generatora)

**Mechanizm:**
1. Action utworzony manualnie przez usera (lub auto z signal jeśli `intent_strength >= 5`) → jeśli with thoughts: generator (Sonnet) → QC → approval
2. Worker → gologin → URL postu → klik "Repost" → wybiera typ → fill thoughts (jeśli applicable) → submit
3. **Metoda:** Haiku CU (modal flow)

**Storage:** `actions` z `action_type='repost'` (nowy), `mechanism_id='linkedin_repost'`, `repost_variant` (simple | with_thoughts), `thoughts_text`.

**Credit cost:** 20 (with_thoughts) / 5 (simple).

---

## OL9 · Original post publish

**Co robi:** Publikuje oryginalny post usera na LinkedIn (text / image / link / poll). Standalone outbound — nie reaguje na sygnał.

**User config:**
- Toggle on/off (default OFF)
- Frequency cap (default max 1/dzień — LinkedIn deprioritises high-frequency posters)
- Content source: user-authored z AI assist (AI proponuje treść, user editsuje)
- Approval policy: **manual approval** (always)
- Post types: text / image / link / poll / video (per-type subprefs)

**Mechanizm:**
1. User tworzy draft → AI assist → user edytuje → submit do approval
2. Worker → gologin → klik "Start a post" → fill → submit
3. **Metoda:** Deterministic DOM (form submission)
4. Verifier: post URL po publikacji + screenshot

**Storage:** `actions` z `action_type='post_publish'` (nowy), `mechanism_id='linkedin_post_publish'`, `post_kind`, `post_url` (po sukcesie).

**Credit cost:** 25.

---

## OL10 · Endorse skill

**Co robi:** Endorsuje skill prospekta na jego profilu (1° connection only). Soft signal, podnosi visibility w jego networku.

**User config:**
- Toggle on/off
- Daily cap (default 15)
- Approval: **auto**
- Skill selection: AI proponuje na podstawie skills listed (default top 3) lub user może wskazać konkretny

**Mechanizm:**
1. Worker → gologin → URL profilu → scroll do "Skills" → klik "+" przy wybranym skillu
2. **Metoda:** Deterministic DOM
3. Verifier: button state change

**Storage:** `actions` z `action_type='endorse'` (nowy), `mechanism_id='linkedin_endorse_skill'`, `skill_endorsed`.

**Credit cost:** 0 (engage pool).

---

## OL11 · Recommendation request / write

**Co robi:** Wysyła prośbę o rekomendację LUB pisze rekomendację dla 1° connection.

**Use case:** zaawansowany, low-volume. Buduje reputację w długim horyzoncie.

**User config:**
- Toggle on/off (default OFF)
- Mode: `request` (prosi prospekta o rekomendację) lub `write` (pisze rekomendację dla prospekta)
- Daily cap (default 1 — bardzo low volume)
- Approval policy: **manual approval**

**Mechanizm:**
1. User wskazuje prospekta + mode → jeśli `write`: generator drafts text → user edytuje
2. Approval
3. Worker → gologin → profile → "More" menu → "Request a recommendation" lub "Write a recommendation" → fill → submit
4. **Metoda:** Haiku CU (rzadki flow, niedeterministyczny)

**Storage:** `actions` z `action_type='recommendation'` (nowy), `mechanism_id='linkedin_recommendation'`, `mode`, `text`.

**Credit cost:** 30.

---

# X / TWITTER — mechanizmy outbound

## OX1 · Reply do tweeta

**Co robi:** Odpowiada na tweet prospekta. Public, visible — najsilniejszy soft outbound na X (DM rzadziej czytane, reply pojawia się w jego notyfikacjach).

**User config:**
- Toggle on/off
- Daily cap (default 30 — X tolerates wyższy throughput niż LinkedIn)
- Approval policy: **manual approval** (default; opcja auto dla low-risk replies typu agreement/question)
- Max długość (X limit 280 znaków non-Premium, 4000 Premium — default 270)
- Threading: opcja split na thread jeśli treść > limit

**Mechanizm:**
1. Action z signal → generator (Sonnet, prompt: "concise, X-native voice, no corporate") → QC
2. Approval
3. Worker → gologin → URL tweeta → klik reply → fill → submit
4. **Metoda:** Deterministic DOM (X reply UI stabilne)
5. Verifier: reply visible w threadzie + tweet ID nowej odpowiedzi

**Storage:** `actions` z `action_type='public_reply'`, `mechanism_id='twitter_reply'`, `parent_tweet_url`.

**Credit cost:** 10.

---

## OX2 · Quote tweet

**Co robi:** Cytuje tweet prospekta z dodanym komentarzem. Bardziej eksponowany niż reply — pojawia się na własnym profilu jako standalone tweet z embedded quote.

**Use case:** post influencera który chcemy wyeksponować + dodać własną perspektywę.

**User config:**
- Toggle on/off
- Daily cap (default 5)
- Approval: **manual**
- Tone: domyślnie "agree and extend" lub "respectful disagree" — nie "ratio/dunk"

**Mechanizm:**
1. Generator → QC → approval
2. Worker → gologin → URL tweeta → klik "Repost" → wybiera "Quote" → fill → submit
3. **Metoda:** Deterministic DOM

**Storage:** `actions` z `action_type='quote_tweet'` (nowy), `mechanism_id='twitter_quote'`, `parent_tweet_url`.

**Credit cost:** 15.

---

## OX3 · Like tweet

**Co robi:** Lajk tweeta prospekta. Najtańszy engage. Pojawia się w jego notyfikacjach (chyba że ma muted).

**User config:**
- Toggle on/off
- Daily cap (default 50, wspólny pool z OX6 follow)
- Approval: **auto**
- Source filter: tylko `intent_strength >= 4`

**Mechanizm:** Worker → DOM click heart icon. **Metoda:** Deterministic DOM.

**Storage:** `actions` z `action_type='like'`, `mechanism_id='twitter_like'`.

**Credit cost:** 0.

---

## OX4 · Retweet (simple repost)

**Co robi:** Retweetuje tweet bez dodawania własnej treści. Pokazuje się na profilu retweetującego.

**User config:**
- Toggle on/off (default OFF — retweet bez kontekstu = niski ROI)
- Daily cap (default 5)
- Approval: **manual** (retweet jest publicznym endorsementem, wymaga oczu)

**Mechanizm:** Worker → klik "Repost" → wybiera "Repost" (nie "Quote"). **Metoda:** Deterministic DOM.

**Storage:** `actions` z `action_type='retweet'` (nowy), `mechanism_id='twitter_retweet'`, `tweet_url`.

**Credit cost:** 5.

---

## OX5 · DM

**Co robi:** Wysyła wiadomość prywatną na X. Działa tylko jeśli prospekt ma DM open lub follow nas (asymmetric).

**User config:**
- Toggle on/off (default OFF — X DMs są rzadziej czytane niż LinkedIn DMs, niski ROI)
- Daily cap (default 5)
- Approval policy: **manual approval**
- Pre-flight check: czy DMs są open dla prospekta (jeśli nie — fail fast bez wysyłania, oszczędza próby)

**Mechanizm:**
1. Generator → QC → approval
2. Worker → gologin → profil prospekta → klik "Message" → DOM fill → submit
3. **Metoda:** Deterministic DOM, **detekcja DMs-closed** (typed failure `dms_closed`)
4. Verifier: konwersacja w sent folder

**Storage:** `actions` z `action_type='dm'`, `mechanism_id='twitter_dm'`.

**Credit cost:** 25.

---

## OX6 · Follow profile

**Co robi:** Follow na X. Asymmetric (nie wymaga akceptacji). Buduje warm signal.

**User config:**
- Toggle on/off
- Daily cap (default 50, wspólny pool z OX3 like)
- Approval: **auto**
- **Anti-follow-spam:** cooldown per user 30d, hard cap follows/follow ratio (jeśli followujemy 1000 a tylko 50 nas followuje, spamerski profil).

**Mechanizm:** Worker → DOM click "Follow". **Metoda:** Deterministic DOM.

**Storage:** `actions` z `action_type='follow'`, `mechanism_id='twitter_follow'`.

**Credit cost:** 0.

---

## OX7 · Original tweet publish

**Co robi:** Publikuje oryginalny tweet (lub thread).

**User config:**
- Toggle on/off (default OFF)
- Frequency: configurable (X tolerates wyższe niż LinkedIn — default max 5/dzień)
- Content source: user-authored z AI assist
- Approval policy: **manual** (always)
- Variants: single tweet / thread (kilka tweetów połączonych) / poll

**Mechanizm:**
1. User draft + AI assist → approval
2. Worker → gologin → klik compose → fill → (jeśli thread: chain of replies do siebie) → submit
3. **Metoda:** Deterministic DOM (single) / Haiku CU (thread, jeśli flow zmienny)

**Storage:** `actions` z `action_type='post_publish'`, `mechanism_id='twitter_post_publish'`, `tweet_kind`, `tweet_url` (po publikacji).

**Credit cost:** 20.

---

## OX8 · List add

**Co robi:** Dodaje prospekta do prywatnej X listy (np. "potential customers", "competitors"). Public-by-default lists pojawiają się w notyfikacjach prospekta — soft signal.

**Use case:** organizacja własnego widoku prospektów + ewentualny soft outreach (jeśli lista public, prospekt dostaje notyfikację że został dodany do listy z konkretną nazwą — to jest mini-DM).

**User config:**
- Toggle on/off
- List visibility (private / public — default private dla bezpieczeństwa)
- List name (per user-defined)
- Daily cap (default 20)
- Approval: **auto** dla private, **manual** dla public

**Mechanizm:** Worker → profile → "More" menu → "Add to List" → wybiera/tworzy listę. **Metoda:** Haiku CU.

**Storage:** `actions` z `action_type='list_add'` (nowy), `mechanism_id='twitter_list_add'`, `list_name`, `list_visibility`.

**Credit cost:** 5.

---

# Cross-mechanism enhancements

## OC1 · Sequence orchestration

**Co robi:** Łańcuchy multi-step, multi-mechanism, multi-platform. "Sygnał R1 → OL7 (follow) day 0 → OL5 (comment) day 2 → OL1 (connection request) day 5 → OL2 (DM) day 7 po acceptance → OL2 followup day 14".

**Architectural rule:** OC1 NIE zawiera logiki wykonania akcji. To **scheduler** który tworzy actions w `actions` table z `scheduled_for` timestamp + `sequence_id`. Każdy actions wykonywany przez własny mechanizm (OL1/OL2/OL5/OL7) niezależnie.

**Templates:** user może utworzyć custom sequence template lub wybrać z presetów (`linkedin_warm_intro`, `reddit_value_first`, `cross_platform_full_funnel`).

**User config:**
- Toggle on/off per template
- Edycja step delays
- Per-step skip conditions (np. "skip OL2 jeśli prospekt nie zaakceptował OL1 w 14d")
- Approval policy: per-step (każdy mechanizm zachowuje swój approval mode)

**Mechanizm:**
1. Signal trigger → utworzenie sequence record z `template_id`
2. Per step: action utworzony z `scheduled_for = signal.detected_at + step.delay`, `sequence_id` powiązanie
3. Cron `schedule-sequences` co 1h: znajduje actions z `scheduled_for <= now()` i `status='scheduled'` → flippuje na `pending_approval` (lub bezpośrednio `approved` jeśli auto)

**Storage:** nowe tabele `sequences` (template, prospect_id, started_at, status) + `sequence_steps` (sequence_id, mechanism_id, delay, status). Linkowanie do `actions` przez `actions.sequence_id`.

**Niezależność:** OC1 nie modyfikuje executorów. Tylko tworzy actions w odpowiednim czasie.

---

## OC2 · Approval queue

**Co robi:** UI do bulk approve/reject pending actions. Cross-mechanism (DM, comment, connection request — wszystko w jednej kolejce).

**Use case:** user otwiera `/feed` rano, widzi 30 pending actions z 5 różnych mechanizmów, approve'uje 25, rejectuje 5.

**Features:**
- Filter per mechanism / platform / source signal
- Bulk approve / reject
- Edit before approve (modify generated content)
- Reason capture per reject (feeds OC3 variant analytics + signal feedback)

**Storage:** `actions.status` flow + `action_rejections` (action_id, reason, marked_at).

---

## OC3 · Variant pool / A/B testing

**Co robi:** Per-mechanism multiple message variants. System rotuje variants i mierzy reply rate per variant. Variants z lepszym performance są częściej używane.

**Architectural rule:** OC3 nie zmienia logiki generatora. Generator zawsze produkuje treść AI, ale OC3 może zastąpić output predefined variantem (template-based) jeśli user tak skonfigurował.

**User config:**
- Per mechanism: enable variant pool (default OFF — AI-generated content)
- Variants list (text + variables `{first_name}`, `{signal_context}`)
- Selection strategy: round-robin / weighted by reply rate / explore-exploit (Thompson sampling)

**Mechanizm:**
1. Action utworzony → check czy mechanism ma variant pool enabled
2. Jeśli tak: wybór wariantu wg strategii → fill variables z signal context → skip generator
3. Jeśli nie: generator AI jak normalnie
4. Po `replied=true` (z OC4 reply detection): increment `variant.reply_count`

**Storage:** nowe `outbound_variants` (mechanism_id, user_id, text_template, variables, sent_count, reply_count) + `actions.variant_id`.

---

## OC4 · Reply detection & cancellation

**Co robi:** Cross-cutting cron który nasłuchuje przychodzące odpowiedzi (DM inbox, post comments, mentions) per platforma. Każda odpowiedź od prospekta:
1. Aktualizuje `prospects.pipeline_status='replied'`
2. Cancele wszystkie pending follow-upy (any mechanism, any platform) do tego samego prospekta
3. Triggeruje email alert do usera (Resend, <10min)

**Mechanizm:**
1. Reuse signal detection R7/L6/L11/T3 (own engagement / mentions) — te sygnały są już zbierane
2. Dodatkowy parser inbox per platform via gologin (dedicated cron `detect-replies` co 5min)
3. Match przychodzących wiadomości → `actions` table per prospect → cancel pending

**Niezależność:** OC4 to konsument signal detection outputu + writer do `actions`. Nie ma własnego executora.

**Storage:** rozszerzenie `actions.status` o `cancelled_due_to_reply`. Nowa tabela `reply_events` (prospect_id, platform, message_url, detected_at, content).

---

# Modifiers / Enhancers (analog M1-M3 z signal detection)

## N1 · Anti-spam content guard

**Co robi:** Pre-execution filter. Sprawdza wygenerowaną treść przed wysłaniem przeciwko regułom anti-spam.

**Reguły (configurable per user):**
- Banned phrases (defaults: "I noticed you", "Just wanted to reach out", "Quick question")
- Link policy per mechanism (np. no links in first DM)
- Generic-detection: cosine similarity treści do ostatnich 50 wysłanych — jeśli > 0.8, flag jako "too similar to recent" (możliwy boilerplate)
- Length bounds per mechanism
- Language detection (treść musi być w języku product profile)

**Implementacja:** moduł `lib/outbound/modifiers/anti-spam.ts`, importowany inline przez QC każdego mechanizmu (OR1/OR2/OR3/OL1/OL2/OL5/OL6/OX1/OX2/OX5).

**User config:** per mechanizm override defaults; toggle on/off (rekomendowane on).

---

## N2 · Account health gate

**Co robi:** Hard gate przed każdą akcją: jeśli `social_accounts.health_status IN ('warning', 'banned')`, akcja NIE wykonuje się, nawet jeśli zatwierdzona.

**Reguły:**
- `healthy` → wszystkie akcje passują
- `warning` → tylko low-risk akcje (likes, follows, upvotes); DM/comment/post blocked
- `banned` → wszystkie akcje blocked

**Triggery zmiany statusu:**
- Auto: detection captcha / rate limit / login challenge w executor → set `warning`
- Auto: gologin session expired N times w 24h → `warning`
- Manual: user może ustawić w UI

**Implementacja:** `lib/outbound/modifiers/account-health.ts`, sprawdzany inline przez każdy runner PRZED executor call.

---

## N3 · Tone / persona matcher

**Co robi:** Pre-generator enhancer. Czyta signal source + product profile + prospect persona (jeśli enrichment dostępny) i dostosowuje system prompt generatora.

**Inputy:**
- Signal source mechanism (R1 firehose vs R7 own engagement → różny tone — drugi jest warmer)
- Subreddit/topic (r/saas → bardziej formalne, r/devops → bardziej geek-friendly)
- Prospect headline (jeśli dostępne — "VP Sales" → professional, "indie hacker" → casual)
- Time of day in prospect's timezone (jeśli enrichment) — DM o 23:00 w pn brzmi inaczej niż o 10:00 we wt

**Output:** dodatkowe instrukcje w system prompt: `tone_modifier: "casual peer"` lub `tone_modifier: "professional vendor disclosed"`.

**Implementacja:** `lib/outbound/modifiers/tone-matcher.ts`, importowany przez generatory OR1/OR2/OL1/OL2/OL5/OX1.

---

# Operations

## O1 · Daily caps + rate limiting per account/channel

**Co robi:** Per `(user_id, account_id, mechanism_id, date)` enforce daily cap. Reuse istniejącej `action_counts` table z rozszerzeniem o `mechanism_id`.

**Pools:**
- `engage` pool: likes + follows + upvotes (cross-mechanism shared cap)
- `dm` pool: DM + followup_dm (per platform osobny)
- `public_reply` pool: comments + replies (per platform osobny)
- `connection_request` pool: osobny dla LinkedIn (weekly cap 100)
- Per-mechanism pool: granularne capy gdy mechanizm ma własny cap (np. OL11 recommendation 1/dzień)

**Mechanizm:**
1. Pre-execution check: `count(actions where account_id, mechanism_id, date=today) < cap`
2. Jeśli przekroczone: action stays w `approved` ale z `delayed_until=tomorrow_00:00`
3. UI w `/outbound` pokazuje dzienny burndown per mechanizm

**Niezależność:** każdy runner pyta `lib/outbound/operations/cap-checker.ts`. Centralna logika ale per-mechanism konfiguracja.

---

## O2 · Account warm-up scheduling

**Co robi:** Nowe konto (Reddit / LinkedIn / X) ma automatyczny warm-up plan — ograniczone akcje przez pierwsze X dni żeby nie wpaść w spam filtr.

**Plan (default, configurable):**
- Day 1-3: tylko OR4/OL4/OX3 (likes/reactions/upvotes), max 5/dzień, OL7 follow max 3/dzień
- Day 4-7: + OR2/OL5/OX1 (komentarze/replies), max 2/dzień
- Day 8-14: + connection requests (OL1) max 5/dzień
- Day 15+: full caps unlock

**Mechanizm:**
1. Account onboarding ustawia `social_accounts.warmup_started_at`
2. Pre-execution check w każdym runnerze: jeśli account w warmup, użyj warmup-cap zamiast standard cap (lower of two)
3. UI pokazuje progress warmup

**Implementacja:** `lib/outbound/operations/warmup.ts`, sprawdzany inline.

---

## O3 · Health monitoring per mechanism

**Co robi:** Analog O1 z signal detection. Alert gdy mechanizm:
- Ma 0 successful actions przez 7d mimo aktywnej konfiguracji → możliwy executor breakage (DOM zmienił się)
- Failure rate >50% w ostatnich 24h → DOM/CU drift
- Avg execution time > 2× baseline → detection challenges (captcha, slow loading)

**Mechanizm:**
- Cron daily: per `(user_id, mechanism_id)` policz success/failure ratio
- Threshold breach → flag w `mechanism_health_alerts`
- Sentry event z fingerprintem `outbound_{mechanism_id}_{user_id}_failure_spike`
- UI banner per mechanizm w `/outbound`

---

## O4 · Variant analytics

**Co robi:** Per `(mechanism_id, variant_id)` policz reply rate, conversion rate (replied → converted z prospects pipeline). Wyświetla w UI tabelę "best performing variants".

**Storage:** `outbound_variants` z dodatkowymi polami `replied_count`, `converted_count`, `last_used_at`.

**Mechanizm:** cron daily aggregator + UI view.

---

# Mapping do schematu DB

## `actions` table — rozszerzenia

Płaska tabela; nowe kolumny:

- `mechanism_id` (text, NOT NULL) — który mechanizm wykonał akcję (jeden source-of-truth dla per-mechanism filtering, capping, analytics)
- `sequence_id` (uuid, nullable) — link do `sequences` (OC1)
- `variant_id` (uuid, nullable) — link do `outbound_variants` (OC3)
- `delayed_until` (timestamptz, nullable) — gdy cap exceeded (O1) lub warmup gate (O2)
- `failure_mode` (text, typed enum) — typed failure modes per mechanizm
- `execution_method` (enum: `dom` | `url_hack` | `haiku_cu`) — audit którą metodą wykonano
- Per-mechanism specific fields: `parent_post_url`, `parent_comment_url`, `reaction_type`, `tweet_kind`, `list_name`, etc. (te które są)

## `action_type` ENUM — rozszerzenia

Istniejące: `dm`, `followup_dm`, `like`, `follow`, `comment`, `public_reply`, `connection_request`.

Nowe:
- `post_submit` (OR6)
- `crosspost` (OR7)
- `subreddit_join` (OR9)
- `repost` (OL8)
- `post_publish` (OL9, OX7)
- `endorse` (OL10)
- `recommendation` (OL11)
- `quote_tweet` (OX2)
- `retweet` (OX4)
- `list_add` (OX8)

## `mechanism_id` ENUM (outbound) — pełna lista

- `reddit_dm` (OR1)
- `reddit_top_level_comment` (OR2)
- `reddit_thread_reply` (OR3)
- `reddit_upvote` (OR4)
- `reddit_post_submit` (OR6)
- `reddit_crosspost` (OR7)
- `reddit_user_follow` (OR8)
- `reddit_subreddit_join` (OR9)
- `linkedin_connection_request` (OL1)
- `linkedin_dm` (OL2)
- `linkedin_reaction` (OL4)
- `linkedin_comment` (OL5)
- `linkedin_thread_reply` (OL6)
- `linkedin_profile_follow` (OL7)
- `linkedin_repost` (OL8)
- `linkedin_post_publish` (OL9)
- `linkedin_endorse_skill` (OL10)
- `linkedin_recommendation` (OL11)
- `twitter_reply` (OX1)
- `twitter_quote` (OX2)
- `twitter_like` (OX3)
- `twitter_retweet` (OX4)
- `twitter_dm` (OX5)
- `twitter_follow` (OX6)
- `twitter_post_publish` (OX7)
- `twitter_list_add` (OX8)

## Nowe tabele

- `sequences` — dla OC1 (template_id, prospect_id, user_id, started_at, current_step, status)
- `sequence_steps` — dla OC1 (sequence_id, step_order, mechanism_id, delay_minutes, skip_condition jsonb, status)
- `outbound_variants` — dla OC3 (user_id, mechanism_id, text_template, variables jsonb, sent_count, replied_count, converted_count, last_used_at)
- `reply_events` — dla OC4 (prospect_id, platform, message_url, detected_at, content)
- `action_rejections` — dla OC2 (action_id, reason, marked_at)
- `mechanism_health_alerts` (outbound) — dla O3 (analogicznie do signal detection O1, osobne wpisy `mechanism_kind='outbound'`)

---

# Per-mechanism cost matrix (estimation)

| ID | Approval | Daily cap | Method | LLM cost | Credit cost | Risk |
|---|---|---|---|---|---|---|
| OR1 (Reddit DM) | manual | 8 | Haiku CU | ~$0.02 | 30 | high |
| OR2 (Reddit top comment) | manual | 5 | Haiku CU | ~$0.015 | 15 | medium |
| OR3 (Reddit reply) | manual | 5 | Haiku CU | ~$0.015 | 15 | medium |
| OR4 (Reddit upvote) | auto | 20 (engage pool) | DOM | $0 | 0 | low |
| OR6 (Reddit post submit) | manual | 1/sub/7d | DOM | ~$0.02 | 30 | high |
| OR7 (Reddit crosspost) | manual | 2 | Haiku CU | $0 | 10 | medium |
| OR8 (Reddit user follow) | auto | 20 (engage pool) | DOM | $0 | 0 | low |
| OR9 (Reddit subreddit join) | auto | unlimited | DOM | $0 | 0 | low |
| OL1 (LinkedIn connection req) | manual | 15 (weekly 100) | URL-hack + DOM | ~$0.01 | 20 | high |
| OL2 (LinkedIn DM) | manual | 8 | DOM | ~$0.02 | 30 | high |
| OL4 (LinkedIn reaction) | auto | 30 (engage pool) | DOM | ~$0.001 (auto-type) | 0 | low |
| OL5 (LinkedIn comment) | manual | 10 | DOM | ~$0.015 | 15 | medium |
| OL6 (LinkedIn thread reply) | manual | 10 | Haiku CU | ~$0.015 | 15 | medium |
| OL7 (LinkedIn profile follow) | auto | 30 (engage pool) | DOM | $0 | 0 | low |
| OL8 (LinkedIn repost) | manual | 2 | Haiku CU | ~$0.01 (with thoughts) | 20/5 | medium |
| OL9 (LinkedIn post publish) | manual | 1/dzień | DOM | ~$0.02 (assist) | 25 | high |
| OL10 (LinkedIn endorse) | auto | 15 | DOM | ~$0.001 | 0 | low |
| OL11 (LinkedIn recommendation) | manual | 1 | Haiku CU | ~$0.02 | 30 | medium |
| OX1 (X reply) | manual | 30 | DOM | ~$0.005 | 10 | medium |
| OX2 (X quote) | manual | 5 | DOM | ~$0.005 | 15 | medium |
| OX3 (X like) | auto | 50 (engage pool) | DOM | $0 | 0 | low |
| OX4 (X retweet) | manual | 5 | DOM | $0 | 5 | medium |
| OX5 (X DM) | manual | 5 | DOM | ~$0.01 | 25 | high |
| OX6 (X follow) | auto | 50 (engage pool) | DOM | $0 | 0 | low |
| OX7 (X post publish) | manual | 5 | DOM/Haiku CU | ~$0.01 (assist) | 20 | medium |
| OX8 (X list add) | auto/manual | 20 | Haiku CU | $0 | 5 | low |
| OC1 (sequencing) | inline | n/a | n/a | $0 | 0 | n/a |
| OC4 (reply detection) | n/a | n/a | gologin parse | $0 | 0 | n/a |

**Uwagi:**
- "Risk" = ryzyko bana konta. High-risk mechanizmy MUSZĄ mieć manual approval i niskie capy.
- Haiku CU compute (~$0.05-0.20 per execution) nie jest w LLM cost — to osobny bucket execution costs.
- Credit cost odzwierciedla user-facing koszt w platformie (różny od raw API costs — zawiera margin + risk premium).
- LinkedIn weekly cap 100 invites jest hard cap LinkedIn-side, nie nasz.

---

# Fazy wdrożenia

Zakładamy że mamy działający signal detection (P1-P11 z `SIGNAL-DETECTION-MECHANISMS.md` lub jego subset). Każda faza outbound = osobny PR na `development` → review → merge → deploy. Sekwencyjne (single dev).

Cel: po każdej fazie produkt działa, user widzi nową wartość, można pauzować po każdej fazie bez połowicznego stanu.

---

## OP1 · Fundament + LinkedIn baseline (~2 tygodnie)

**Co user dostaje:** Pierwszy działający outbound — LinkedIn connection request + DM + comment + like/follow. Najlepszy ROI per mechanizm na wejście.

**Zakres:**
- DB schema: `actions` (+`mechanism_id`, `sequence_id`, `variant_id`, `delayed_until`, `execution_method`)
- Nowy ENUM `outbound_mechanism_id` (płaska lista)
- Backfill istniejących wierszy → `mechanism_id='legacy_*'`
- **OL1 (Connection request)** — generator + QC + URL-hack executor + verifier + UI
- **OL2 (DM)** — generator + QC + DOM executor + verifier + UI
- **OL5 (Comment)** — generator + QC + DOM executor + verifier + UI
- **OL4 (Reaction)** — auto-type generator + DOM executor + UI
- **OL7 (Profile follow)** — DOM executor + UI
- **N1 (Anti-spam content guard)** — moduł reużywany przez QC
- **N2 (Account health gate)** — moduł sprawdzany inline
- **O1 (Daily caps)** — rozszerzenie `action_counts` o `mechanism_id`
- Refactor `/feed` UI: per-mechanism filtering w approval queue
- Refactor `/outbound` UI: per-mechanism card pattern (toggle + cap + approval policy + cost preview)

**Verification:**
- Test sygnał z L1 → utworzenie OL1 action → manual approve → wysłanie connection request widoczne w invitation manager
- Po acceptance → automatic OL2 trigger → manual approve → DM widoczny w sent folder
- OL4 like z sygnału auto-execute w ciągu 1h
- N2 blokuje wysłanie gdy account `warning`

---

## OP2 · Reddit baseline (~1.5 tygodnia)

**Co user dostaje:** Outbound na Reddit — DM + komentarz + reply + upvote + follow.

**Zakres:**
- **OR1 (Reddit DM)** — generator + QC + Haiku CU executor + verifier + UI
- **OR2 (Reddit top comment)** — generator + QC + Haiku CU executor + UI
- **OR3 (Reddit thread reply)** — generator z parent comment context + executor + UI
- **OR4 (Upvote)** — DOM executor + UI
- **OR8 (User follow)** — DOM executor + UI
- **OR9 (Subreddit join)** — auto-trigger inline gdy OR2/OR3 publikuje w nowym subreddicie
- N1/N2 reuse z OP1
- Reddit-specific generator prompts (różne od LinkedIn — krótsze, casual, no corporate)

**Verification:**
- Sygnał R1 → OR1 DM action → approve → wiadomość w Reddit chat
- Sygnał R2 (komentarz pod cudzym postem) → OR3 reply → komentarz widoczny w threadzie
- OR4 upvote auto na warm sygnałach
- OR9 auto-subscribe gdy OR2 publikuje w nowym sub

---

## OP3 · Twitter / X baseline (~1.5 tygodnia)

**Co user dostaje:** Outbound na X — reply + quote + like + follow + DM.

**Zakres:**
- **OX1 (Reply)** — generator + QC + DOM executor + UI
- **OX2 (Quote tweet)** — generator + QC + DOM executor + UI
- **OX3 (Like)** — DOM executor + UI
- **OX5 (DM)** — generator + QC + DOM executor + DMs-closed detection + UI
- **OX6 (Follow)** — DOM executor + UI
- X-specific generator prompts (280 char limit, X-native voice)
- UI nowa zakładka `/outbound/twitter`

**Verification:**
- Sygnał T1 (keyword tweet) → OX1 reply approve → reply widoczny w threadzie
- OX3 like auto na warm sygnałach
- OX5 DM action z sygnału — fail-fast jeśli DMs closed

---

## OP4 · Sequencing + reply detection (~1.5 tygodnia)

**Co user dostaje:** Multi-step sequences across mechanizmów + automatyczne anulowanie follow-upów po reply.

**Zakres:**
- Tabela `sequences` + `sequence_steps`
- **OC1 (Sequence orchestration)** — scheduler cron, template engine, skip conditions
- 3 default templates: `linkedin_warm_intro` (OL7→OL5→OL1→OL2), `reddit_value_first` (OR4→OR2→OR1), `cross_platform_full_funnel` (OL7+OR4→OL5+OR2→OL1→OL2+OR1)
- **OC4 (Reply detection)** — cron `detect-replies` co 5min per platforma, gologin inbox parse, mass-cancel pending follow-upów
- Tabela `reply_events`
- UI: sequence templates editor + active sequences view

**Verification:**
- Test sygnał → start template → kolejne kroki tworzą się w `actions` z poprawnymi `scheduled_for`
- Po reply prospekta wszystkie pending steps (z różnych mechanizmów) → `status='cancelled'`
- Reply alert email do usera w <10min

---

## OP5 · Standalone publishing (OL9 + OX7 + OR6) (~1 tydzień)

**Co user dostaje:** Original content publishing — LinkedIn posts, X tweets/threads, Reddit posts.

**Zakres:**
- **OL9 (LinkedIn post publish)** — DOM executor, draft editor UI z AI assist, post_kind variants
- **OX7 (X post publish)** — DOM/Haiku CU executor, single tweet vs thread variants
- **OR6 (Reddit post submit)** — DOM executor, per-subreddit form (text/link/poll), self-promo ratio guard
- UI: nowy widok `/outbound/publishing` z draft editor + scheduled queue
- Generator AI assist (proponuje treść, user edytuje)

**Verification:**
- Draft LinkedIn post → publish → post visible na profilu
- Draft X thread → publish → wszystkie tweety w thread chain
- Reddit post w wybranym subreddicie → visible

---

## OP6 · Engagement extras (OL6/OL8/OL10/OL11 + OX2/OX4/OX8 + OR3/OR7) (~1 tydzień)

**Co user dostaje:** Pełne pokrycie pomocniczych akcji — endorsments, recommendations, reposts, list adds, crossposts.

**Zakres:** mechanizmy z mniejszym ROI per akcja ale całościowo budują warm-up i thought leadership.

- **OL6** Reply do komentarza
- **OL8** Repost (simple + with thoughts)
- **OL10** Endorse skill
- **OL11** Recommendation request/write
- **OX2** Quote tweet
- **OX4** Retweet
- **OX8** List add
- **OR7** Crosspost

**Verification:** każda akcja per mechanism wykonuje się end-to-end na test prospekcie.

---

## OP7 · Variants + analytics (OC3 + OC2 + O4) (~1 tydzień)

**Co user dostaje:** A/B testing variants + bulk approval queue + reply rate analytics.

**Zakres:**
- Tabela `outbound_variants` + `action_rejections`
- **OC3 (Variant pool)** — variant editor UI, selection strategies (round-robin / weighted / Thompson)
- **OC2 (Approval queue)** — bulk approve/reject UI, filter per mechanism, edit before approve
- **O4 (Variant analytics)** — daily aggregator + UI view "best performing variants"

**Verification:**
- 3 variants per OL2 → po 50 akcjach widzi reply rate per variant
- Bulk approve 30 actions w 1 kliknięciu

---

## OP8 · Operations + warm-up + tone matcher (~1 tydzień)

**Co user dostaje:** Production-grade observability + automatyczny warm-up nowych kont + smarter generator.

**Zakres:**
- **O2 (Account warm-up)** — warmup plan engine + UI progress
- **O3 (Health monitoring per mechanism)** — daily cron + Sentry alerts + UI banner
- **N3 (Tone matcher)** — moduł importowany przez generatory, prompt enhancement

**Verification:**
- Nowe konto → action OL1 day 1 → blocked (warmup), action OL4 day 1 → allowed
- Mechanism z >50% failure rate w 24h → Sentry alert + UI banner
- Generator OL2 do prospekta z headline "VP Sales" produkuje inny tone niż do "indie hacker"

---

## Zależności między fazami

```
OP1 (LinkedIn baseline + N1+N2+O1)
   ├── OP2 (Reddit baseline)
   ├── OP3 (X baseline)
   └── OP4 (Sequencing + reply detection)
          ├── OP5 (Standalone publishing)
          └── OP6 (Engagement extras)
                 └── OP7 (Variants + approval queue + analytics)
                        └── OP8 (Operations + warmup + tone)
```

**Kolejność uzasadnienie:**
- OP1 first (LinkedIn = highest ROI per mechanizm, większość MVP value)
- OP2/OP3 paralelne po OP1 (różne platformy, brak deps)
- OP4 sensowne po OP1+OP2+OP3 (reply detection wymaga inboxów per platforma; sequencing wymaga >2 mechanizmy)
- OP5/OP6 paralelizowalne po OP4
- OP7 wymaga większości mechanizmów (variant testing nie ma sensu z 2 mechanizmami)
- OP8 zamyka — observability + warmup po pełnym pokryciu

**Podsumowanie czasowe:**
- OP1-OP3 = MVP outbound (~5 tygodni, 3 platformy podstawowe)
- OP4 = sequencing (~1.5 tygodnia)
- OP5-OP6 = pełne pokrycie akcji (~2 tygodnie)
- OP7-OP8 = quality + ops (~2 tygodnie)
- **Total ~10-11 tygodni do pełnej wizji outbound**

**Możliwe pauzy:** po OP1 (LinkedIn działa), po OP3 (3 platformy podstawowe), po OP4 (sequencing + reply cancel), po OP6 (pełne pokrycie). Każdy punkt oddaje sensowną wartość.

---

# Hard exclude

- **LinkedIn InMail** — wymaga Premium na koncie; v2+
- **LinkedIn Sales Navigator** — SNAP zamknięte; decyzja produktowa, nie integrujemy
- **Reddit downvote (OR5)** — negatywna interakcja, ban-magnet, brak business value
- **Reddit awards** — paid feature, nie w scope
- **X bookmarks** — private action, prospekt nie widzi, brak outbound value
- **Mass actions / spam** — żaden mechanizm nie wykonuje >cap dziennego, brak bulk send-all
- **Auto-acceptance przychodzących connection requests** — repco jest outbound system, accept logic to inbound (osobny scope)
- **Oficjalne LinkedIn/Reddit/X API dla write actions** — nie używamy. Wszystko gologin + DOM/CU
- **Apify dla write actions** — Apify to read-only, nie nadaje się do akcji write

---

# Known limitations / risks

## Techniczne ryzyka

### DOM-fragility executorów
LinkedIn/Reddit/X często zmieniają DOM. Executory deterministic-DOM (większość OL/OX, OR4/OR8/OR9) mogą wybuchnąć w każdej chwili.
- **Mitygacja:** O3 health monitoring alertuje po >50% failure rate w 24h.
- **Fallback:** wersjonowanie executorów per mechanism (`v1`, `v2`...), feature flag do przełączenia z DOM na Haiku CU jeśli DOM breakage.

### Anti-bot detection eskalacja
Połączenie wielu mechanizmów na jednym koncie (DM + connection requests + komentarze + likes — 4 różnych typów akcji w 1h) może triggerować anti-bot. Każdy mechanizm osobno OK, kombinacja podejrzana.
- **Mitygacja:** O2 warmup + N2 health gate + per-account global rate limiter (cross-mechanism cap "max N akcji łącznie / godzina"). Phase 2 feature.

### Reply detection latency vs follow-up timing
OC4 cron co 5min — może wysłać follow-up DM 2 min po przeczytaniu (ale zanim cron zauważy reply). User dostaje "creep" experience.
- **Mitygacja MVP:** pre-execution check w każdym DM/comment runnerze: jeszcze raz sprawdza `prospects.pipeline_status` w czasie wykonania (T-15s przed wysłaniem). Jeśli `replied`, abort.

### Generated content spam-like
Sonnet z context może wygenerować treść która brzmi jak spam (boilerplate "I noticed your post about X" patterns).
- **Mitygacja:** N1 anti-spam content guard z banned phrases + similarity check + manual approval (gating dla high-risk mechanizmów).

### Multi-account per platform
v1.x: 1 account per platform per user. User z 5 LinkedIn kontami nie obsłużony.
- **Phase 2:** multi-account schema — `social_accounts` już ma `gologin_profile_id`, ale UI/runner zakłada single. Refactor wymagany.

### Approval queue overflow
User aktywuje 8 mechanizmów manual-approval, dostaje 100 pending actions / dzień, demoralizujące.
- **Mitygacja:** OC2 bulk approve + filtering + smart defaults (rekomendowane mechanizmy z auto approval gdzie ryzyko niskie).

### Sequence template rigidity
Template `connection_request → DM po 7d` nie pasuje do każdego prospekta (niektórzy potrzebują 2 dni, inni 14).
- **Phase 2:** dynamic delays based on prospect signals (jeśli prospekt aktywny w ostatnich 24h — szybciej, jeśli nie — wolniej).

### Credit consumption surprise
Drogi mechanizm (OR1 30 credits) wykonany 8 razy = 240 credits/dzień. User może nie zauważyć przed end of month.
- **Mitygacja:** UI cost preview per mechanizm na podstawie liczby źródeł sygnałów × cap × credit cost. Daily/monthly burndown widoczny w `/outbound`. (Pamiętaj: end-user UI wskazuje BALANCE, nie burn-rate days remaining — patrz feedback memory.)

### Haiku CU drift
Computer Use models się update'ują — to co działa dziś dla OR1 DM może nie działać za 3 miesiące.
- **Mitygacja:** każdy CU executor ma e2e test w CI z fixture screen captures + canary run (jeden test prospect daily) + version-pin Haiku model.

---

# Otwarte pytania (do rozstrzygnięcia przed startem fazy)

1. **Engage pool granularity:** czy OR4+OR8 dzielą cap z OL4+OL7+OX3+OX6 (cross-platform engage) czy każda platforma osobny pool? Default plan: per-platform pools. Decyzja produktowa.
2. **OR5 downvote:** hard exclude przyjęty. Otwarta opcja: czy w ogóle pokazujemy w UI jako "disabled feature" dla świadomości produktu czy całkowicie ukrywamy? Default: ukrywamy.
3. **OL3 InMail:** v2 timing — czy czekamy z Premium support do post-v2 czy dodajemy w v1.5 jako paid-tier feature?
4. **OL11 recommendation:** czy obie modes (`request` i `write`) MVP czy tylko jeden? Default: oba, ale `write` częściej ma sens (bardziej genuine).
5. **OX7 thread support:** thread chain (kilka tweetów połączonych) wymaga sekwencji DOM clicków — czy MVP single tweet only, thread w P9.5? Default: single only w OP5, thread w OP6.
6. **OC3 selection strategy default:** round-robin (deterministic, fair) czy Thompson sampling (smart, opacityous)? Default: round-robin w MVP, Thompson w OP7.5 jako enhancement.
7. **OC4 reply detection — gologin per platform:** parser inbox musi działać dla każdej z 3 platform. Czy reuse inbox parsers z R8/L11 (signal detection) czy osobne dla outbound? Default: reuse — to są te same DOM parsers, tylko inny consumer.
8. **Per-user credit cost defaults:** wartości w cost matrix są szacunkowe. Otwarte: revize przed OP1 launch na podstawie realnych Haiku CU compute time + LLM token usage.
9. **Anti-spam similarity threshold:** N1 cosine 0.8 — czy to dobry default? Wymaga calibration na pierwszych 1000 wysłanych wiadomości.
10. **Subreddit join (OR9) — auto vs ask:** czy auto-subscribe bez pytania (build-up reputacji) czy z explicit consent w UI (user świadomy)? Default: auto z banner notyfikacją "repco automatycznie dołącza do subredditów w których publikujesz, dla ochrony konta".
