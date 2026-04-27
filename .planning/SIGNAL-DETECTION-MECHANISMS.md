# Mechanizmy detekcji sygnałów — repco.ai

## Filozofia

- **Każdy typ sygnału = osobny, w pełni niezależny mechanizm.**
- **Każdy mechanizm ma własną funkcję, własny runner, własny log, własną konfigurację UI.** Brak współdzielenia logiki między mechanizmami.
- **User aktywuje i konfiguruje każdy mechanizm osobno** — widzi listę dostępnych mechanizmów (świadomość zakresu produktu) i decyduje które używa.
- **User-configurable frequency per mechanizm.** Każde uruchomienie kosztuje kredyty, więc user kontroluje ile go to kosztuje.
- **Time-bounded queries.** Zapytanie do źródła zewnętrznego jest ograniczone do okna czasowego = częstotliwość crona. Cron co 15 min → query za ostatnie 15 min. Brak overlapu.
- **AI ocenia kontekstowo.** Każdy element idzie do LLM z product contextem; decyzja "lead/nie lead" jest semantyczna, nie keyword-matchowa.

## Data access — twardy constraint

**Nie używamy oficjalnego Reddit API ani LinkedIn API.** Wszystkie dane pobieramy dwoma drogami:

1. **Apify actors** — dla danych publicznych (posty, komentarze, reakcje, profile firm, posty profili). Apify używa residential proxies + browser automation, omija rate limity API i nie wymaga kluczy. Każdy mechanizm = jeden lub więcej Apify actors w `lib/{mechanism-id}/adapter.ts`.

2. **Gologin sesje** — dla danych wymagających zalogowania user'a repco (jego skrzynka odbiorcza, jego notyfikacje, jego connection requests, jego "kto wszedł na profil"). User ma w gologin profile zalogowane konto Reddit i LinkedIn — wykorzystujemy istniejącą sesję, NIE robimy dodatkowego OAuth.

**Implikacja:** mechanizmy które dotyczą "własnych danych usera" (R7, R8, L6, L10, L11) MUSZĄ używać gologin. Mechanizmy publiczne (R1-R6, R9, L1-L5, L7-L9) używają Apify.

---

## Kontekst produktu (wspólny input dla AI w każdym mechanizmie)

`product_profiles` row per user:
- **Nazwa produktu**
- **Opis biznesu** (co robi, dla kogo, jaki problem rozwiązuje, ICP)
- **Keywords** (lista pojęć / use-case'ów)
- **Konkurenci** (nazwy produktów konkurencyjnych)
- **Negative keywords** (frazy do ignorowania)

Dostarczany jako system prompt do każdego AI call (cached prompt prefix dla taniości).

---

## Wzorzec architektoniczny per mechanizm

Każdy mechanizm składa się z dokładnie tych komponentów (każdy w osobnym pliku):

1. **Adapter** `lib/{mechanism-id}/adapter.ts` — wrap Apify/API, normalizacja outputu
2. **Ingestion** `lib/{mechanism-id}/ingestion.ts` — dedup, freshness, upsert do DB
3. **Classifier** `lib/{mechanism-id}/classifier.ts` — AI prompt specyficzny dla mechanizmu
4. **Runner** `lib/{mechanism-id}/runner.ts` — orchestracja: pobierz konfigurację usera → adapter → ingestion → classifier
5. **Cron** `app/api/cron/{mechanism-id}/route.ts` — schedule, batching per user, async webhook
6. **UI source config** `features/monitoring/components/{mechanism-id}-config.tsx` — sekcja w `/signals` z aktywacją + parametrami

**Wspólna infrastruktura (reuse, nie duplikacja):**
- `apify_runs` table + zombie cleanup
- Webhook handler `/api/webhooks/apify` (branching per `metadata.mechanism_id`)
- Logger + correlation IDs (każdy mechanizm loguje pod swoim `mechanism_id`)
- Per-user credit middleware (sprawdza saldo przed runem)

**Co user widzi w UI** (`/signals` redesign):
- Lista wszystkich dostępnych mechanizmów (Reddit R1-R9, LinkedIn L1-L11, Twitter T1-T5, modyfikatory M1-M3)
- Per mechanizm: toggle on/off, parametry konfiguracyjne, koszt szacunkowy, ostatni run
- Świadomość: "repco oferuje 25 mechanizmów monitoringu — aktywujesz te których potrzebujesz"

---

# REDDIT — mechanizmy

## R1 · Subreddit firehose (nowe posty)

**Co robi:** Pobiera WSZYSTKIE nowe posty z monitorowanego subreddita (bez keyword filter na wejściu). AI ocenia każdy vs product context.

**User config:**
- Lista subredditów (`r/saas`, `r/msp`, ...)
- **Częstotliwość crona** (15min / 30min / 1h / 6h / 24h — domyślnie 1h)
- Soft cap postów per run (default 200)
- Toggle on/off

**Mechanizm:**
1. Cron tick → pobierz konfig usera (subreddity + freq)
2. Apify `fatihtahta/reddit-scraper-search-fast`: `subredditName=saas`, `subredditSort=new`, `subredditTimeframe=hour`, **brak `subredditKeywords`**
3. **Time window = freq** — np. cron co 30min → filtruj posty z ostatnich 30 min na poziomie ingestion (Apify nie ma minutowej granularności, więc filtrujemy po `created_utc`)
4. Dedup po `permalink` (per-user)
5. M1 modifier (author quality) — odrzuć autorów < threshold
6. AI scoring batch (10 postów / call) z product contextem
7. Tylko `is_relevant=true && intent_strength>=4` → `intent_signals`. Reszta logged + odrzucona.

**Storage:** `intent_signals` z `mechanism_id='reddit_subreddit_firehose'`, autor posta = prospect.

**Niezależny od:** wszystkich innych. Nie współdzieli kodu z R2-R9. Inne mechanizmy mogą czytać outputy R1 (np. R2 pobiera posty z `post_watches` zasilonych przez R1) — to data sharing, nie code sharing.

---

## R2 · Post-watch for comments (zależny od R1)

**Co robi:** Obserwuje posty które **R1 zakwalifikował jako relewantne** pod kątem nowych komentarzy. Każdy nowy komentujący → AI ocena czy ICP fit.

**Zależność:** **R2 wymaga aktywnego R1.** Bez R1 nie ma postów do obserwowania. UI powinien:
- Blokować aktywację R2 jeśli R1 jest wyłączony (z tooltipem "wymaga R1")
- Automatycznie deaktywować R2 jeśli user wyłącza R1 (z confirmation dialogiem)

**User config:**
- Window obserwacji per post (default 72h, opcje: 24h / 48h / 72h / 7d)
- Częstotliwość crona (default 1h)
- Toggle on/off (zablokowane jeśli R1 off)

**Mechanizm:**
1. **Auto-rejestracja postów:** każdy post który R1 zakwalifikował jako relewantny (`is_relevant=true && intent_strength>=4`) → automatycznie dodawany do `post_watches` z `watch_until = R1.detected_at + window` (jeśli R2 aktywny)
2. Cron tick R2 → pobierz aktywne post-watches (`watch_until > now()`)
3. Per post URL → Apify `parseforge/reddit-posts-comments-scraper` lub `fatihtahta` z `scrapeComments: true`, depth 2, `since_last_run` filter
4. Dedup komentarzy po `comment_id`
5. M1 modifier (author quality)
6. AI scoring każdego komentarza z kontekstem parent posta + product context
7. `is_relevant=true` → `intent_signals` (autor komentarza = prospect)
8. Po `watch_until` post wypada z aktywnych watchów

**DB:** nowa tabela `post_watches` (post_url, intent_signal_id_origin, watch_started_at, watch_until, last_seen_comment_id) — `intent_signal_id_origin` linkuje wstecz do posta z R1.

**Storage:** `intent_signals` z `mechanism_id='reddit_post_watch'`, `engagement_type='comment'`, `parent_post_url`, `parent_post_content`.

**Niezależność implementacyjna:** mimo że R2 jest **funkcjonalnie zależny** od R1 (czerpie z jego outputu), jego **runtime jest osobny** — własny cron, własny adapter (do scrapowania komentarzy), własny classifier, własny log. R1 i R2 nie współdzielą kodu, tylko dane (R1 wpisuje do `post_watches`, R2 czyta).

---

## R3 · Competitor mention scan

**Co robi:** Reddit search po nazwach konkurentów. Każda wzmianka konkurenta → AI ocena czy to sygnał (frustracja, porównanie, szukanie alternatywy) czy szum (entuzjasta).

**User config:**
- Lista nazw konkurentów (sourced z `product_profiles.competitors`, możliwość per-mechanism override)
- Częstotliwość (default 1h)
- Search scope: all-of-reddit / lista subredditów (default all)
- Toggle on/off

**Mechanizm:**
1. Per nazwa konkurenta → Apify Reddit search actor (`fatihtahta/reddit-scraper-search-fast` z `searchKey={competitor}`, `sort=new`, `timeframe=day`)
2. Time window = freq
3. Dedup
4. M1 modifier
5. AI ocena sentymentu i intent przejścia → `intent_strength`
6. Storage z `competitor_mentioned` field

**Mechanizm wyszukiwania:** Apify scraping (no Reddit API).

**Storage:** `intent_signals` z `mechanism_id='reddit_competitor_mention'`.

---

## R4 · Question pattern scan

**Co robi:** Reddit search po sformułowaniach z wysokim intent ("looking for", "alternative to", "best X for Y", "anyone use", "vs", "migrating from").

**User config:**
- System-defined patterns (lista 10-15 fraz wysoko-konwertujących)
- Custom patterns (user może dodać własne, np. "switched from")
- Częstotliwość (default 1h)
- Search scope (all / lista subredditów)
- Toggle on/off

**Mechanizm:**
1. Per pattern → Apify Reddit search actor z `searchKey={pattern}`
2. Time window
3. Dedup
4. M1 modifier
5. AI weryfikuje czy match dotyczy domeny produktu (filtruje false positives z innych branż)
6. Storage z `match_pattern` field

**Mechanizm wyszukiwania:** Apify scraping (no Reddit API).

**Storage:** `intent_signals` z `mechanism_id='reddit_question_pattern'`.

---

## R5 · Tracked user activity (posty + komentarze BY tracked users)

**Co robi:** User wskazuje listę redditorów do śledzenia (znani prospects, decision-makerzy, influencerzy). Każda nowa aktywność (post lub komentarz) Z ich strony, dotykająca domeny produktu → sygnał.

**User config:**
- Lista usernames (`u/someone`, ...)
- Częstotliwość (default 1h)
- Co śledzić: posts / comments / both (default both)
- Toggle on/off

**Mechanizm:**
1. Per username → Apify user-page scraper (`trudax/reddit-scraper` w trybie user URL: `https://reddit.com/user/{name}/submitted` + `/comments`)
2. Diff vs `last_seen_id` (zapisany w `monitoring_signals.metadata`)
3. AI ocena nowych aktywności vs product context
4. Storage z `tracked_user` field

**Storage:** `intent_signals` z `mechanism_id='reddit_tracked_user_activity'`.

**Koszt:** niski (Apify scraping + AI tylko za nowe).

---

## R6 · Engagement on tracked users' content (NOWY)

**Co robi:** Komplementarny do R5 — śledzi kto komentuje POD postami/komentarzami tracked users. Tracked user może być influencerem branży; ludzie engagujący się z jego treścią to potencjalne leady.

**User config:**
- Lista usernames (może być ta sama lub osobna od R5)
- Częstotliwość (default 2h)
- Window obserwacji per content item (default 7 dni)
- Toggle on/off

**Mechanizm:**
1. Cron tick → pobierz ostatnie posty/komentarze tracked users przez Apify user-page scraper (osobny pipeline, własny storage — nie współdzieli z R5)
2. Każdy nowy content item → dodaje do listy `tracked_engagement_targets` z `watch_until = now + window`
3. Per active target → Apify scrape komentarzy/replies pod nim (`scrapeComments: true`, since_last_run)
4. AI ocena każdego engagującego (czy ICP fit, czy intent)
5. Storage z `tracked_user_origin` + `target_post_url`

**Storage:** `intent_signals` z `mechanism_id='reddit_tracked_user_engagement'`.

**Niezależny:** mimo podobieństwa do R5 — osobny runner, osobny log, osobna konfiguracja UI.

---

## R7 · Engagement on user's own Reddit content (NOWY)

**Co robi:** User ma w gologin zalogowane konto Reddit. Każdy kto komentuje pod jego postami/komentarzami = warm lead. Analog L6 dla LinkedIn.

**User config:**
- Source: gologin profile (auto-detect Reddit username z sesji)
- Częstotliwość (default 1h)
- Window obserwacji per content (default 14 dni)
- Toggle on/off

**Mechanizm:**
1. **Gologin sesja** → pobierz user's posts + comments z `https://reddit.com/user/{me}/submitted` + `/comments` w kontekście zalogowanej sesji (lub Apify user-page scraper jako fallback dla danych publicznych)
2. Każdy aktywny content item → scrape replies/komentarzy przez Apify (since_last_run, publiczne dane)
3. AI ocena każdego engagującego z **wyższym baseline intent_strength** (engagement z własnym contentem = ciepły sygnał)
4. AI prompt podkreśla: "To engagement z postem usera, automatycznie warm lead"

**Storage:** `intent_signals` z `mechanism_id='reddit_own_engagement'`, `is_own_content=true`.

---

## R8 · Reddit mentions/tags (NOWY, gologin only)

**Co robi:** Gdy ktoś tagnie konto usera repco (`u/repco-user`) w komentarzu lub poście — inbound signal, prospect aktywnie szuka kontaktu.

**Wymaga:** zalogowanej sesji Reddit w gologin (notyfikacje widoczne tylko po zalogowaniu).

**User config:**
- Source: gologin profile (auto-detect)
- Częstotliwość (default 30min — szybka reakcja na mentions ma znaczenie)
- Toggle on/off

**Mechanizm:**
1. Gologin sesja → otwórz `https://reddit.com/message/inbox` (lub `/notifications`)
2. Parsuj listę nowych mentions/replies (selektory DOM)
3. Per mention: ekstraktuj autora, kontekst (URL postu/komentarza w którym tagnęli), tekst
4. M1 modifier (czy nie spam-bot)
5. AI ocena czy mention to potencjalny lead vs random ping
6. Storage z `mention_context_url` (gdzie zostali tagnięci)

**Storage:** `intent_signals` z `mechanism_id='reddit_mention'`, wysoki baseline intent_strength (inbound).

---

## R9 · Trending posts modifier (na R1)

**Co robi:** Modifier dla R1 — flaguje posty z wysoką velocity upvote'ów (np. score > 20 w ciągu 30 min od publikacji). Te posty mają wyższy priorytet AI scoring + wyższy baseline intent_strength.

**To NIE jest osobny mechanizm** — to enhancement R1 (jak M1). Implementacja: dodatkowy filtr w R1 ingestion + flag `is_trending` w `intent_signals`.

**User config:**
- Threshold velocity (score / age_minutes) — domyślnie configurable
- Toggle on/off (per R1 source)

**Mechanizm:**
1. R1 pobiera posty (jak zwykle)
2. Dla każdego: oblicz `velocity = score / max(age_minutes, 1)`
3. Jeśli velocity > threshold → flag `is_trending=true`, AI dostaje dodatkowy kontekst "post jest trending w subreddicie"
4. Trending posty automatycznie kwalifikują się do R2 (post-watch) z wyższym priorytetem

**Storage:** `intent_signals` z dodatkowym polem `is_trending`, `velocity_score`.

---

## M1 · Author quality modifier (NIE jest sygnałem — jest filtrem)

**Co robi:** Pre-filter PRZED każdym AI call we wszystkich mechanizmach Reddit (R1-R8). Odsiewa boty, nowe konta, zero-karma accounts. Oszczędza koszt LLM + redukuje noise.

**Mechanizm:**
1. Cache user's about-data na 24h w tabeli `reddit_user_cache` (pobierane przez Apify user profile scraper przy pierwszym napotkaniu)
2. Pobiera: `created_utc`, `comment_karma`, `link_karma`, `total_karma`, `has_verified_email`
3. Threshold (per-user configurable, defaults sensible):
   - account_age >= 7 dni
   - total_karma >= 10
4. Konta poniżej threshold → odrzucone PRZED AI (logged: `dropped_by_modifier='author_quality'`)

**User config:**
- Per mechanizm Reddit (R1-R8) możliwość override progów
- Globalny default w `product_profiles.signal_settings.author_quality_thresholds`
- Toggle on/off (rekomendowane on)

**Implementacja:** osobny moduł `lib/modifiers/author-quality.ts`, importowany przez R1-R8 runners. Nie ma własnego cron'a — uruchamiany inline.

---

## M2 · Cross-subreddit ICP modifier (NIE jest sygnałem — jest enhancerem)

**Co robi:** Pre-AI enhancement we wszystkich Reddit mechanizmach. Sprawdza historię autora (przez Apify user-page scrape, cache 7d) i ocenia ICP fit na podstawie tego w jakich subredditach działa.

**Mechanizm:**
1. Cache w `reddit_user_cache` (rozszerzenie z M1) ostatnie 100 postów/komentarzy autora
2. Oblicz dystrybucję subredditów: ile % w "ICP subreddits" (z `product_profiles.icp_subreddits` listy)
3. ICP score 0-3:
   - 0% — penalty (-2 do intent_strength)
   - 1-10% — neutral
   - 10-30% — boost (+1)
   - >30% — strong boost (+3)
4. Score przekazywany do AI prompta jako kontekst: "Autor jest aktywny w {N}% w subredditach ICP twojego produktu"

**Implementacja:** moduł `lib/modifiers/cross-subreddit-icp.ts`, importowany przez R1-R8.

---

## M3 · Subreddit tier multiplier (NIE jest sygnałem — jest enhancerem)

**Co robi:** Mnożnik intent_strength oparty o "tier" subreddita. Sygnał z r/msp wart inaczej niż z r/learnprogramming.

**User config:**
- Tabela tier'ów subredditów per user (default: 4 tiery, lista subredditów editable)
  - Tier 1 (decision-makers): r/saas, r/msp, r/sales, r/entrepreneur — multiplier 1.5×
  - Tier 2 (practitioners): r/nocode, r/marketing, r/devops — 1.2×
  - Tier 3 (general): r/startups, r/technology — 1.0×
  - Tier 4 (juniors/risky): r/learnprogramming, r/cscareerquestions — 0.7×
  - Tier 0 (exclude): r/memes, r/gaming, r/AskReddit — 0× (drop)

**Mechanizm:** finalny `intent_strength` po AI = `ai_score * subreddit_tier_multiplier`. Tier 0 = sygnał odrzucony.

**Implementacja:** `lib/modifiers/subreddit-tier.ts`, importowany przez R1-R8 (każdy sygnał Reddit ma `subreddit` field z którego można wyznaczyć tier).

---

# LINKEDIN — mechanizmy

## L1 · Keyword post search

**Co robi:** Search LinkedIn po keywordach w treści postów. Najsłabszy intent ale highest volume.

**User config:**
- Lista keywordów
- Częstotliwość (default 2h)
- Toggle on/off

**Mechanizm:**
1. Apify `harvestapi/linkedin-post-search` z `searchQueries=[keywords]`, `maxPosts=25` per query
2. Time window = freq
3. Dedup po normalized URL
4. AI ocena każdego posta vs product context

**Storage:** `intent_signals` z `mechanism_id='linkedin_keyword_search'`.

---

## L2 · Auto-discovered post reactions

**Co robi:** **Platforma sama znajduje relewantne posty LinkedIn** (po topice, konkurentach, influencerach z product contextu) i scrapuje reakcje na nich. User NIE wkleja URL — system odkrywa.

**User config:**
- Topics / keywords do auto-discovery (sourced z product context, możliwość override)
- Częstotliwość discovery (default 6h)
- Min engagement threshold (np. ≥50 reactions na post — bo posty z 5 lajkami to słaby sygnał)
- Max posts to track simultaneously (default 20 — cap kosztu)
- Toggle on/off

**Mechanizm (dwustopniowy):**
1. **Discovery faza** (subset L1 logic, internal — nie współdzieli kodu, ma własną kopię):
   - Search LinkedIn posts po topics/keywords
   - Filtr: minimum engagement (reactions count)
   - Top N postów per topic → dodaj do `linkedin_tracked_posts` z `tracking_until = now + 7d`
2. **Reactions scraping faza** (osobny cron, częstszy — np. 1h):
   - Per active tracked post → Apify `harvestapi/linkedin-post-reactions` ($2/1000)
   - Hard cap: 1218 reactions/post (LinkedIn loader limit)
   - AI ocena każdego reactora vs product context
3. Po `tracking_until` post wypada

**Storage:** `intent_signals` z `mechanism_id='linkedin_auto_post_reactions'`, `engagement_type='reaction'`, `engaged_with_post_url`.

**DB:** nowa tabela `linkedin_tracked_posts` (post_url, discovered_via, tracking_until, last_scraped_at).

**Niezależny:** osobny discovery cron + osobny reactions cron, własne konfiguracje UI.

---

## L3 · Auto-discovered post comments

**Co robi:** Jak L2 ale komentarze. System odkrywa posty, scrapuje komentujących, AI ocenia.

**User config:** te same parametry co L2 (osobne — można L2 włączyć bez L3 lub odwrotnie).

**Mechanizm:**
- Współdzieli `linkedin_tracked_posts` (te same posty z discovery fazy L2 — jeśli oba aktywne, discovery uruchamia się raz)
- ALE comment scraping cron jest osobny, używa `harvestapi/linkedin-post-comments` ($2/1000)
- AI dostaje pełny tekst komentarza + parent post + product context

**Storage:** `intent_signals` z `mechanism_id='linkedin_auto_post_comments'`, `engagement_type='comment'`.

**Uwaga implementacyjna:** "Współdzielenie" `linkedin_tracked_posts` to wspólny KEY-VALUE storage, nie wspólna logika. Każdy mechanizm (L2 i L3) czyta z tej tabeli niezależnie. Discovery faza ma osobnego runnera dla L2 i L3, ale jeśli wybiorą identyczne parametry, deduplikujemy posty na poziomie tabeli (nie runnera).

---

## L4 · Profile reactions monitoring

**Co robi:** User wskazuje LinkedIn profile URL (CEO konkurenta, influencer). System pobiera ostatnie posty profilu i scrapuje reakcje na każdym.

**User config:**
- Lista URL profili
- **Timeframe monitoringu** — ile ostatnich postów obserwować (default 10) i jak długo (default 14 dni od publikacji posta)
- Częstotliwość (default 6h dla discovery nowych postów + 1h dla reactions na aktywnych)
- Toggle on/off

**Mechanizm:**
1. **Profile discovery faza** (cron 6h):
   - Per profile URL → Apify `harvestapi/linkedin-profile-posts` → ostatnie N postów
   - Nowe posty (dedup po URL) → dodaj do `linkedin_tracked_posts` z `tracking_until = post.publishedAt + monitoringWindow`
2. **Reactions faza** (cron 1h):
   - Per active tracked post (z `discovered_via='linkedin_profile_monitoring'`) → reactions scraper
   - AI scoring

**Storage:** `intent_signals` z `mechanism_id='linkedin_profile_reactions'`, `tracked_profile_url`.

---

## L5 · Profile comments monitoring

**Co robi:** Jak L4 ale komentarze.

**User config:** te same parametry co L4 (osobne toggling).

**Mechanizm:** discovery faza wspólna z L4 (czyta `linkedin_tracked_posts` z `discovered_via='linkedin_profile_monitoring'`), ale comments scraper niezależny.

**Storage:** `intent_signals` z `mechanism_id='linkedin_profile_comments'`.

---

## L6 · Engagement on user's own LinkedIn content

**Co robi:** Monitoring reactions + comments pod postami SAMEGO usera repco. Najsilniejszy sygnał (warm lead — engagement z twoim contentem).

**User config:**
- Toggle on/off (jeśli on — używamy konta z gologin, no extra config)
- Częstotliwość (default 1h)
- Window monitoringu (default 14 dni)

**Mechanizm:**
1. **Konto LinkedIn usera już znamy** — jest w gologin (mamy session). NIE robimy dodatkowego OAuth.
2. Pobierz user's profile URL (z `users.linkedin_profile_url` lub gologin metadata)
3. Discovery: ostatnie posty usera (cron 6h)
4. Reactions + comments na każdym aktywnym poście (cron 1h)
5. AI ocena z **wyższym baseline intent_strength** (own content engagement = warm)
6. AI prompt: "To jest engagement z postem usera repco. Automatycznie warm lead."

**Implementacja gologin:**
- **Discovery własnych postów (cron 6h):** gologin sesja → `https://www.linkedin.com/in/{me}/recent-activity/all/` → lista własnych postów. Gologin jest pewniejszy niż Apify dla wykrycia LISTY własnych postów (publiczność postu może być ograniczona do connections).
- **Reactions/comments na każdym poście:** Apify (`harvestapi/linkedin-post-reactions` + `harvestapi/linkedin-post-comments`) — dane reakcji/komentarzy są publiczne pod publicznymi postami.
- Hybrid model: gologin dla discovery + Apify dla scrape. Optymalizuje koszty (Apify tańszy per request) i wiarygodność (gologin = pewność że to wszystkie własne posty).

**Storage:** `intent_signals` z `mechanism_id='linkedin_own_engagement'`, `is_own_content=true`.

---

## L7 · New posts from monitored profile

**Co robi:** Sam fakt że monitorowany profil opublikował coś nowego (na temat domeny) = sygnał. Cel outreachu: "widziałem twój post o X".

**User config:**
- Lista URL profili (te same co L4/L5 lub osobne)
- Częstotliwość (default 6h)
- Toggle on/off

**Mechanizm:**
1. Per profile → `harvestapi/linkedin-profile-posts` → diff vs last seen
2. Nowe posty → AI ocena czy dotyczą domeny produktu
3. `is_relevant=true` → `intent_signals` (autor profilu = prospect, treść posta = kontekst)

**Storage:** `intent_signals` z `mechanism_id='linkedin_profile_new_posts'`, `engagement_type=null`.

---

## L10 · Connection requests received (NOWY, gologin only)

**Co robi:** User repco ma zalogowane konto LinkedIn w gologin. Każda przychodząca prośba o połączenie z ICP-fit profilem = warm inbound lead.

**Wymaga:** zalogowanej sesji LinkedIn w gologin.

**User config:**
- Source: gologin profile (auto-detect)
- Częstotliwość (default 30min)
- Toggle on/off

**Mechanizm:**
1. Gologin sesja → `https://www.linkedin.com/mynetwork/invitation-manager/`
2. Parsuj listę pending invitations (DOM)
3. Per invitation: ekstraktuj profile URL, name, headline, company, mutual connections, optional note (jeśli wysłali)
4. AI ocena vs product context (czy ICP fit, czy treść note sugeruje intent)
5. Storage z `invitation_note` (jeśli był), `mutual_connections_count`

**Storage:** `intent_signals` z `mechanism_id='linkedin_connection_request'`, wysoki baseline (inbound).

---

## L11 · LinkedIn mentions/tags (NOWY, gologin only)

**Co robi:** Gdy ktoś tagnie usera repco w poście LinkedIn lub komentarzu — inbound signal.

**Wymaga:** zalogowanej sesji LinkedIn w gologin.

**User config:**
- Source: gologin profile (auto-detect)
- Częstotliwość (default 30min)
- Toggle on/off

**Mechanizm:**
1. Gologin sesja → `https://www.linkedin.com/notifications/`
2. Parsuj nowe mentions/tags (filtr po typie notyfikacji)
3. Per mention: ekstraktuj autora, kontekst (URL postu w którym tagnęli), tekst
4. AI ocena czy mention to lead vs random
5. Storage z `mention_context_url`

**Storage:** `intent_signals` z `mechanism_id='linkedin_mention'`, wysoki baseline (inbound).

---

## L8 · Job change detection

**Co robi:** Osoby z monitorowanej listy zmieniły pracę. 90-day window = nowi decision-makerzy.

**User config:**
- Lista profili do monitorowania
- Częstotliwość check'u (default 1d — Netrows webhook lub polling)
- Toggle on/off

**Mechanizm:**
- **Default:** polling przez Apify `harvestapi/linkedin-profile-scraper` co tydzień, diff `current_company`/`current_role` w naszej DB. Konsystentne z constraint (Apify-only).
- **Opcjonalnie (decyzja budżetowa):** Netrows Radar webhook (€5/1000 profili, real-time, third-party data provider — NIE LinkedIn API). Lepsze latency (real-time vs tygodniowy polling), ale dodaje trzecie źródło danych poza Apify/gologin.

**Storage:** `intent_signals` z `mechanism_id='linkedin_job_change'`, `previous_role`, `new_role`, `new_company`.

**Status:** start z polling (mieści się w constraint Apify-only). Netrows do rozważenia post-MVP jeśli latency tygodniowy okaże się za duży.

---

## L9 · Hiring signals

**Co robi:** Firmy z watchlisty rekrutują na role które są proxy budżetu/wzrostu (SDR, RevOps, VP Sales, Growth).

**User config:**
- Lista nazw firm
- Lista ról które obchodzą (default: SDR, AE, RevOps, VP Sales, Head of Growth)
- Częstotliwość (default 1d)
- Toggle on/off

**Mechanizm:**
1. Apify `nexgendata/hiring-signal-detector` ($5/1000 firm) lub `curious_coder/linkedin-jobs-scraper` (4.7/5)
2. Greenhouse / Lever / Ashby public APIs (free) jako uzupełnienie
3. AI ocena czy nowa rola = sygnał dla produktu (np. "VP Sales hire" w firmie B2B SaaS = budżet na sales tools)

**Storage:** `intent_signals` z `mechanism_id='linkedin_hiring_signal'`, `company`, `role`, `posted_at`.

---

# TWITTER / X — mechanizmy (osobna platforma)

Goji w transkrypcie pokazał że X przyniósł im 6M views i tysiące customers. Inny ekosystem (intencja inna niż Reddit/LinkedIn — bardziej discovery, mniej buying), ale wart pokrycia.

**Data access:** Apify actors dla X (np. `apidojo/tweet-scraper`, `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest`). Brak Twitter API (płatne, drogo). Gologin opcjonalny dla mechanizmów wymagających zalogowanej sesji (T3 own engagement).

## T1 · Keyword tweet search

**Co robi:** Search po keywordach w treści tweetów. Analog L1.

**User config:** keywordy, częstotliwość (default 1h), toggle.

**Mechanizm:** Apify X scraper z search query → AI ocena każdego tweeta vs product context.

**Storage:** `mechanism_id='twitter_keyword_search'`.

---

## T2 · Competitor mention scan (X)

**Co robi:** Search po nazwach konkurentów na X. Analog R3.

**Mechanizm:** Apify search per competitor, AI sentyment + intent.

**Storage:** `mechanism_id='twitter_competitor_mention'`.

---

## T3 · Engagement on user's own tweets (gologin opcjonalnie)

**Co robi:** Kto retweetuje/lajkuje/komentuje pod tweetami usera repco.

**User config:** auto-detect z gologin (lub user wpisuje swoje X handle), częstotliwość 1h.

**Mechanizm:** Apify scraper na profile usera → ostatnie tweety → engagers per tweet.

**Storage:** `mechanism_id='twitter_own_engagement'`, `is_own_content=true`, wysoki baseline.

---

## T4 · Tracked profile monitoring (X)

**Co robi:** User wskazuje X profile (CEO konkurenta, influencer w niszy). Monitor ich tweetów + engagerów. Analog L4/L5/L7.

**User config:** lista X handles, częstotliwość (default 6h dla discovery + 1h dla engagement scrape).

**Mechanizm:** Apify profile scraper → tweety → engagers.

**Storage:** `mechanism_id='twitter_profile_engagement'`, `tracked_profile_url`.

---

## T5 · Trending topic monitoring

**Co robi:** Monitor X trends w domenie produktu. Tweety z trendujących hashtagów relewantnych dla niszy.

**User config:** lista hashtagów / topics do monitorowania, częstotliwość 2h.

**Mechanizm:** Apify trends scraper + filtr po topic match z product context.

**Storage:** `mechanism_id='twitter_trending_topic'`.

---

# Cross-mechanism enhancements

## E1 · Signal stacking / aggregation

**Co robi:** Per `(user_id, prospect_identifier)` — agreguje wszystkie sygnały z różnych mechanizmów w oknie 7-14 dni i wylicza composite score. "Ten sam Adam Kowalski polajkował post konkurenta (L2) + zostawił komentarz w r/saas o problemie (R1) + wszedł na nasz profil (L10) w 5 dni" = znacznie gorszy lead niż jakikolwiek z tych sygnałów osobno.

**Prospect identifier:** różne formaty per platforma (LinkedIn URL, Reddit username, Twitter handle, email z enrichmentu). Identity resolution może być problemem (ten sam człowiek na 3 platformach z różnymi nazwami) — Phase 2 features.

**Implementacja:**
- Nowa tabela `prospect_aggregations` (user_id, prospect_id, platform_identities {linkedin_url, reddit_username, twitter_handle}, signal_count, composite_score, last_signal_at, signals_jsonb)
- Cron co 30min: per nowy `intent_signal` → znajdź matching prospect_id (po profile URL / username) → update aggregation
- AI re-scoring composite raz dziennie (z pełnym kontekstem wszystkich sygnałów)
- UI dashboard: widok "Top prospects" sortowany po composite score (zamiast feed sygnałów chronologicznych)

**Wartość:** największy single feature dla quality. Bez tego user widzi 100 osobnych sygnałów; z tym widzi top 10 prospectów z czytelnym kontekstem.

---

## E2 · Negative feedback loop

**Co robi:** User w UI klika "not relevant" pod sygnałem. Flag zapisana → AI dostaje przykład jako negative few-shot example w prompcie przy następnych klasyfikacjach (per-user). Po 50 negatywnych przykładach model przestaje generować podobne false positives.

**Implementacja:**
- Nowa tabela `signal_feedback` (user_id, signal_id, feedback_type ENUM not_relevant|relevant|excellent, marked_at)
- Per-user feedback cache: ostatnie 50 negative + 20 positive examples in-memory (Redis lub Supabase RLS)
- AI prompt builder dodaje sekcję "User has marked these similar examples as NOT RELEVANT: ..." + "These as EXCELLENT: ..."
- UI: szybki thumbs-up/thumbs-down per sygnał na dashboardzie

**Wartość:** zamyka pętlę uczenia. Bez tego AI klasyfikuje stałą jakością; z tym — poprawia się per user.

---

# Operations

## O1 · Health monitoring per mechanism

**Co robi:** Alert (Sentry + email) jeśli mechanizm zwraca 0 sygnałów przez >7 dni mimo aktywnej konfiguracji. Może oznaczać: zbroken Apify actor, expired keyword, dead subreddit, gologin session expired.

**Mechanizm:**
- Cron daily: per `(user_id, mechanism_id)` policz `intent_signals` z ostatnich 7d
- Jeśli == 0 i mechanizm aktywny → flag w `mechanism_health_alerts` table
- Sentry event z fingerprintem `{mechanism_id}_{user_id}_silent` (dedup)
- UI banner w `/signals` per mechanizm: "Brak sygnałów od 7 dni — sprawdź konfigurację"

**Wartość:** pre-empt silent failures. Mamy już ten problem z LinkedIn canary — rozszerzyć na wszystkie mechanizmy.

---

## O2 · Onboarding presets

**Co robi:** Nie zmuszać usera do konfiguracji 18 mechanizmów na start. Preset auto-aktywuje sensowny zestaw per persona.

**Presety (initial):**
- **B2B SaaS founder:** R1 (3 subreddits z product context), R3 (konkurenci), L1 (5 keywords), L6 (own LinkedIn z gologin), R7 (own Reddit z gologin)
- **Agency / services:** L1 (keywords w stylu "looking for {service}"), L4 (3 profile potencjalnych klientów), L6, R1
- **Indie hacker:** R1 (r/SaaS, r/indiehackers, r/microsaas), R3, T1 (X keyword search), T3 (own X engagement)

**Mechanizm:**
- Onboarding wizard pyta o personę + product description
- AI generuje rekomendowaną konfigurację per mechanizm (subreddity, keywords)
- One-click "Activate preset" → konfiguracja zapisana, user może edytować

**Wartość:** redukuje time-to-first-signal z "godziny konfiguracji" do "5 minut". Critical dla aktywacji.

---

# Mapping do schematu DB

## `monitoring_signals` (sources, per-user config)

Płaska tabela; **nowe `signal_type` wartości = `mechanism_id`** (jeden enum, jeden source-of-truth):
- `reddit_subreddit_firehose` (R1)
- `reddit_post_watch` (R2)
- `reddit_competitor_mention` (R3)
- `reddit_question_pattern` (R4)
- `reddit_tracked_user_activity` (R5)
- `reddit_tracked_user_engagement` (R6)
- `reddit_own_engagement` (R7)
- `reddit_mention` (R8)
- `linkedin_keyword_search` (L1)
- `linkedin_auto_post_reactions` (L2)
- `linkedin_auto_post_comments` (L3)
- `linkedin_profile_reactions` (L4)
- `linkedin_profile_comments` (L5)
- `linkedin_own_engagement` (L6)
- `linkedin_profile_new_posts` (L7)
- `linkedin_job_change` (L8)
- `linkedin_hiring_signal` (L9)
- `linkedin_connection_request` (L10)
- `linkedin_mention` (L11)
- `twitter_keyword_search` (T1)
- `twitter_competitor_mention` (T2)
- `twitter_own_engagement` (T3)
- `twitter_profile_engagement` (T4)
- `twitter_trending_topic` (T5)

**Nowa kolumna `frequency`** (interval) — user-configurable częstotliwość crona.
**Nowa kolumna `config`** (jsonb) — parametry per-mechanism (np. `{ window_days: 7, soft_cap: 200, depth_limit: 2 }`).

## Nowe tabele

- `post_watches` — dla R2 (post_url, intent_signal_id_origin, watch_until, last_seen_comment_id)
- `linkedin_tracked_posts` — dla L2/L3/L4/L5 (post_url, discovered_via, tracking_until, last_scraped_at)
- `tracked_engagement_targets` — dla R6 (target_post_url, tracked_user, watch_until)
- `reddit_user_cache` — dla M1 + M2 (username, about_data, recent_subreddits jsonb, fetched_at)
- `prospect_aggregations` — dla E1 signal stacking (prospect_id, platform_identities, composite_score, signals jsonb, last_signal_at)
- `signal_feedback` — dla E2 negative feedback loop (user_id, signal_id, feedback_type, marked_at)
- `mechanism_health_alerts` — dla O1 (user_id, mechanism_id, last_signal_at, alert_status, fingerprint)
- `subreddit_tiers` — dla M3 (user_id, subreddit, tier 0-4)

## `intent_signals` (rozszerzone pola)

- `mechanism_id` (text) — który mechanizm znalazł sygnał
- `engagement_type` (enum: reaction | comment | post | null)
- `engaged_with_post_url` (URL źródłowego posta)
- `parent_post_url` + `parent_post_content` (dla R2 / L3 / L5 — komentarz pod cudzym postem)
- `competitor_mentioned` (R3)
- `match_pattern` (R4)
- `tracked_user` / `tracked_profile_url` (R5/R6/L4-L7)
- `reaction_type` (LIKE/PRAISE/INTEREST/EMPATHY/APPRECIATION/CURIOSITY)
- `is_own_content` (R7/L6)
- `previous_role` / `new_role` / `new_company` (L8)
- `dropped_by_modifier` (audit modifierów które odrzuciły element przed AI)

---

# Per-mechanism cost matrix (estimation)

| ID | Default freq | External cost | LLM cost | Total per execution |
|---|---|---|---|---|
| R1 | 1h | ~$0.001 (Apify) | ~$0.005 | **~$0.006/h/subreddit** |
| R2 | 1h | ~$0.002 (Apify) | ~$0.02 | **~$0.022/h/active post** |
| R3 | 1h | ~$0.001 (Apify) | ~$0.005 | **~$0.006/h/competitor** |
| R4 | 1h | ~$0.001 (Apify) | ~$0.002 | **~$0.003/h/pattern** |
| R5 | 1h | ~$0.001 (Apify user-page) | ~$0.001 | **~$0.002/h/user** |
| R6 | 2h | ~$0.002 (Apify) | ~$0.01 | **~$0.012/2h/active target** |
| R7 | 1h | gologin time + ~$0.001 (Apify replies) | ~$0.005 | **~$0.006/h** |
| R8 | 30min | gologin time | ~$0.002 | **~$0.002/30min** (pre-filter ogranicza LLM) |
| R9 | inline (z R1) | $0 | $0 | **$0** (modifier) |
| L1 | 2h | ~$0.005 (Apify) | ~$0.0025 | **~$0.0075/2h/keyword** |
| L2 | 1h scrape + 6h disco | ~$0.21 (Apify reactions) | ~$0.01 | **~$0.22/h/active post** |
| L3 | 1h scrape + 6h disco | ~$0.045 (Apify comments) | ~$0.005 | **~$0.05/h/active post** |
| L4 | 6h disco + 1h scrape | ~$2.10 (Apify) | ~$0.10 | **~$2.20/h/profile (peak)** |
| L5 | jw | ~$0.45 (Apify) | ~$0.05 | **~$0.50/h/profile** |
| L6 | 1h | gologin time + ~$0.50 (Apify) | ~$0.05 | **~$0.55/h** |
| L7 | 6h | ~$0.02 (Apify) | ~$0.005 | **~$0.025/6h/profile** |
| L8 | 1d | ~$0.005 (Netrows lub Apify polling) | ~$0.001 | **~$0.006/d/profile** |
| L9 | 1d | ~$0.005 (Apify) | ~$0.002 | **~$0.007/d/firma** |
| L10 | 30min | gologin time | ~$0.001 | **~$0.001/30min** |
| L11 | 30min | gologin time | ~$0.002 | **~$0.002/30min** |
| T1 | 1h | ~$0.005 (Apify X) | ~$0.005 | **~$0.01/h/keyword** |
| T2 | 1h | ~$0.005 | ~$0.005 | **~$0.01/h/competitor** |
| T3 | 1h | gologin (opt) + ~$0.10 (Apify) | ~$0.01 | **~$0.11/h** |
| T4 | 6h disco + 1h scrape | ~$0.30 (Apify) | ~$0.02 | **~$0.32/h/profile** |
| T5 | 2h | ~$0.05 (Apify trends) | ~$0.005 | **~$0.055/2h** |
| M1 | inline | $0 | $0 | **$0** (filtr przed AI) |
| M2 | inline | reuse R5 cache | $0 | **$0** (enhancer) |
| M3 | inline | $0 | $0 | **$0** (multiplier) |
| E1 | 30min | $0 | ~$0.05/dzień (re-scoring AI) | **~$0.05/dzień/user** |
| E2 | inline | $0 | $0 | **$0** (cache w prompcie) |
| O1 | 1d | $0 | $0 | **$0** (DB query) |
| O2 | once-per-onboarding | $0 | ~$0.05 (AI gen presetu) | **~$0.05/onboarding** |

**Uwagi:**
- "gologin time" = compute time per uruchomienie profilu gologin (~5-20s). Subscription gologin oddzielnie ($24-99/mc per ~10 profili w zależności od planu).
- Apify CU pricing approximate, weryfikować przed P3+ przy realnym volume.
- T1-T5 koszty są szacunkowe — wybór actora dopiero w P9.
- L4 jest najdroższy ($2.20/h/profil) — UI MUSI ostrzegać przy aktywacji.

UI per mechanizm pokazuje preview kosztu na podstawie liczby źródeł × częstotliwości.

---

# Fazy wdrożenia

Każda faza = osobny PR na `development` → review → merge → deploy. Sekwencyjne, bo single dev.

Cel: po każdej fazie produkt działa, user widzi nową wartość, można pauzować wdrożenie po każdej fazie bez połowicznego stanu.

---

## P1 · Fundament + Reddit baseline (~2-2.5 tygodnia)

**Co user dostaje:** Nowy Reddit pipeline który działa lepiej niż obecny. Pierwsze działające mechanizmy (R1 + R9 modifier + M1 + M2 + M3).

**Zakres:**
- DB schema rewrite: `monitoring_signals` (+ `frequency`, `config`), `intent_signals` (+ `mechanism_id`, `engagement_type`, `engaged_with_post_url`, `parent_post_url`, `dropped_by_modifier`, `is_trending`, `velocity_score`, ...)
- Nowy ENUM `mechanism_id` (płaska lista, jeden source-of-truth)
- Tabela `reddit_user_cache` (dla M1 + M2)
- Tabela `subreddit_tiers` (dla M3)
- Webhook handler: branching per `metadata.mechanism_id`
- Per-mechanism prompt registry (`prompts/{mechanism-id}.ts`)
- Backfill istniejących wierszy (legacy → `mechanism_id='legacy_keyword_search'`)
- **R1 (Subreddit firehose)** — runner, adapter, ingestion, classifier, cron, UI
- **R9 (Trending posts modifier on R1)** — flag + AI context boost
- **M1 (Author quality modifier)** — moduł reużywany inline
- **M2 (Cross-subreddit ICP modifier)** — moduł reużywany inline
- **M3 (Subreddit tier multiplier)** — z default tier table + UI do edycji
- Reddit-specific Sonnet prompt (ironia, subreddit context, memes blocklist)
- Refactor `/signals` UI: per-mechanism card pattern (toggle + frequency selector + config + cost preview + last run)
- Per-user credit middleware (sprawdza saldo przed runem)

**Verification:**
- Nowy R1 cron znajduje >0 sygnałów w r/saas (test subreddit) z product contextem dev usera
- Sygnały odrzucone przez M1 widoczne w job_logs ale nie w `intent_signals`
- UI pokazuje toggle R1 + frequency 15min/1h/6h
- Stare sygnały (legacy) wciąż widoczne na dashboardzie z `mechanism_id='legacy_*'`

---

## P2 · R2 post-watch + LinkedIn cleanup (~1 tydzień)

**Co user dostaje:** Komentarze pod postami które R1 zakwalifikował (warm leads w komentarzach). Czyste LinkedIn UI bez martwych typów sygnałów.

**Zakres:**
- Tabela `post_watches` z FK do `intent_signals` (R1 origin)
- **R2 (Post-watch)** — runner, adapter (Apify with `scrapeComments: true`), classifier (z parent post context), cron
- Auto-rejestracja postów z R1 do `post_watches` (gdy R2 aktywny)
- UI: R2 toggle z dependency check (blokowany jeśli R1 off)
- LinkedIn cleanup:
  - Backfill `linkedin_company`/`linkedin_author` → `linkedin_keyword_search` (jako mechanism_id)
  - UI: scalenie 3 sekcji LinkedIn w jedną "L1 Keywords"
  - Refactor `monitor-linkedin/route.ts` na nowy mechanism pattern (osobny runner)

**Verification:**
- Aktywacja R2 niemożliwa gdy R1 off (tooltip)
- Post znaleziony przez R1 → automatycznie ląduje w `post_watches` → R2 cron zwraca komentarze pod nim w ciągu 1h
- Po `watch_until` post znika z aktywnych watchów
- Stare LinkedIn sources wciąż działają (no regression)

---

## P3 · LinkedIn auto-discovery (L2 + L3) (~1.5 tygodnia)

**Co user dostaje:** Pierwsze prawdziwe engagement signals na LinkedIn — system sam znajduje istotne posty i ekstraktuje ludzi reagujących/komentujących.

**Zakres:**
- Tabela `linkedin_tracked_posts`
- **Discovery faza** (cron 6h) — search LinkedIn po topics/keywords/competitors z product contextu, filtr min engagement, top-N do `linkedin_tracked_posts`
- **L2 (Auto post reactions)** — adapter `harvestapi/linkedin-post-reactions`, ingestion, classifier, cron 1h
- **L3 (Auto post comments)** — adapter `harvestapi/linkedin-post-comments`, classifier z tekstem komentarza, cron 1h
- UI: L2/L3 togglowanie + parametry (min engagement threshold, max tracked posts)
- Cost preview w UI (per-mechanism z liczbą tracked postów)

**Verification:**
- Po 6h discovery cyklu `linkedin_tracked_posts` ma >0 wpisów dla testowego product context
- L2 zwraca reactors w ciągu 1h od dodania posta do trackera
- L3 zwraca komentujących z ich treścią komentarzy
- AI klasyfikuje engagement z dedykowanym promptem (różny od post-search)

---

## P4 · LinkedIn profile monitoring (L4 + L5 + L7) (~1 tydzień)

**Co user dostaje:** Monitoring konkretnych profili LinkedIn (CEO konkurenta, influencer) — kto ich engaguje + ich nowe posty.

**Zakres:**
- Adapter `harvestapi/linkedin-profile-posts` (profile discovery)
- **L4 (Profile reactions)** — discovery cron 6h + reactions cron 1h, własny runner
- **L5 (Profile comments)** — collaborative discovery z L4, własny comments runner
- **L7 (New posts from monitored profile)** — własny runner; wykrywa publikacje, AI ocenia czy dotyczy domeny
- UI: lista profili do monitorowania, monitoringWindow per profile (default 14d), ostrzeżenie kosztu (L4 najdroższy)

**Verification:**
- Dodanie profilu CEO konkurenta → po 6h system odkrywa jego ostatnie 10 postów
- L4 zwraca reactors na każdym z tych postów w ciągu 1h
- L7 wykrywa nowy post tego profilu w ciągu 6h
- Każdy mechanizm ma osobny `mechanism_id` w sygnałach

---

## P5 · Own content + inbound (R7 + R8 + L6 + L10 + L11) (~1.5 tygodnia)

**Co user dostaje:** Wszystkie sygnały wymagające zalogowanej sesji gologin (warm leads + inbound).

**Zakres:**
- **R7 (Reddit own engagement)** — gologin sesja Reddit + Apify dla scrapingu replies, AI z `is_own_content=true` flag
- **R8 (Reddit mentions/tags)** — gologin parsing `/message/inbox` notyfikacji, DOM selektory, dedup, AI ocena
- **L6 (LinkedIn own engagement)** — gologin session (auto-detect z gologin metadata), reuse fragmentów L4/L5 z `is_own_content=true`
- **L10 (LinkedIn connection requests)** — gologin parsing `/mynetwork/invitation-manager/`, ekstrakcja invitation note + mutual connections
- **L11 (LinkedIn mentions/tags)** — gologin parsing `/notifications/`, filtr po mention type
- AI prompt podkreśla: "engagement/mention/invitation z user'em = automatycznie warm lead"
- UI: sekcja "Your accounts (auto-detected from gologin)" — read-only display Reddit + LinkedIn handles
- Wspólny moduł `lib/gologin/dom-parsers/` z parserami DOM per platforma (mocked w testach)

**Verification:**
- Test mention na Reddit → R8 wykrywa w ciągu 30min
- Test connection request na LinkedIn → L10 wykrywa w ciągu 30min
- Test komentarz pod własnym postem → R7/L6 wykrywa
- Każdy gologin-based mechanizm loguje sukces parsingu (DOM może się zmienić — alerty O1)

---

## P6 · Reddit search-based (R3 + R4) (~3-5 dni)

**Co user dostaje:** Aktywne wyszukiwanie wzmianek konkurentów i question patterns na całym Reddit (poza watchowanymi subreddits).

**Zakres:**
- **R3 (Competitor mention)** — runner używa Apify Reddit search actor (`fatihtahta/reddit-scraper-search-fast` z `searchKey={competitor}`), AI ocena sentymentu
- **R4 (Question pattern)** — system-defined patterns + user-extensible, Apify Reddit search per pattern
- UI: konfiguracja list konkurentów (sourced z `product_profiles.competitors`), custom patterns input

**Verification:**
- Test wzmianki konkurenta na test subreddit → R3 wykrywa w ciągu 1h, AI rozróżnia sentyment
- Pattern "looking for {domena_produktu}" → R4 zwraca relewantne posty

---

## P7 · Reddit tracked users (R5 + R6) (~1 tydzień)

**Co user dostaje:** Monitoring aktywności konkretnych redditorów + engagement na ich contencie.

**Zakres:**
- Tabela `tracked_engagement_targets` (dla R6)
- **R5 (Tracked user activity)** — własny runner, Apify user-page scraper (`trudax/reddit-scraper` w trybie user URL), diff vs last_seen_id
- **R6 (Tracked users' content engagement)** — własny runner, używa outputu R5 jako źródła (analogicznie do R1→R2 dependency, ale dla tracked users)
- UI: lista tracked users, R6 dependency tooltip (wymaga R5 dla tych samych userów)

**Verification:**
- Dodanie `u/test-influencer` jako tracked → R5 zwraca jego ostatnie posty w ciągu 1h, R6 zwraca komentujących pod jego contentem w ciągu 2h

---

## P8 · LinkedIn deferred (L8 + L9) (~1 tydzień, decyzja budżetowa)

**Co user dostaje:** Job change detection + hiring signals.

**Zakres:**
- **Decyzja przed startem fazy:** Netrows Radar (€5/1000 profili, real-time webhook) vs polling (`harvestapi/linkedin-profile-scraper` co tydzień, $3-5/1000)
- **L8 (Job change)** — wybrany mechanizm + ingestion + AI ocena nowej roli
- **L9 (Hiring signals)** — `nexgendata/hiring-signal-detector` lub `curious_coder/linkedin-jobs-scraper` + Greenhouse/Lever public APIs (Apify scraping, NIE LinkedIn API)
- UI: konfiguracja list profili (L8) i firm (L9)

**Verification:**
- Test profile job change → L8 detekcja w ciągu 1d (polling) lub natychmiast (Netrows webhook)
- Nowy job posting w monitorowanej firmie → L9 wykrywa w ciągu 1d

---

## P9 · Twitter / X (T1-T5) (~2 tygodnie)

**Co user dostaje:** Pełne pokrycie X jako trzecia platforma — keyword search, competitor mentions, own engagement, profile monitoring, trending topics.

**Zakres:**
- Apify X actor adapter (`apidojo/tweet-scraper` lub równoważny — research wyboru przed startem)
- **T1 (Keyword tweet search)** — runner + classifier
- **T2 (Competitor mention)** — analog R3 dla X
- **T3 (Own engagement)** — auto-detect X handle z gologin (lub user input), Apify profile scraper + engagers per tweet
- **T4 (Tracked profile monitoring)** — analog L4/L5 dla X
- **T5 (Trending topic monitoring)** — Apify trends scraper + topic match
- X-specific Sonnet prompt (inny ekosystem, krótsze treści, mniej formalny)
- UI: nowa zakładka "Twitter/X" w `/signals` z 5 mechanizmami

**Verification:** każdy z T1-T5 zwraca >0 sygnałów na test product context w ciągu 24h.

---

## P10 · Cross-mechanism enhancements (E1 + E2) (~1.5 tygodnia)

**Co user dostaje:** Quality lift na wszystkich istniejących mechanizmach — composite scoring + per-user uczenie.

**Zakres:**
- Tabela `prospect_aggregations` + tabela `signal_feedback`
- **E1 (Signal stacking / aggregation)** — runner agregujący sygnały per prospect, identity resolution (LinkedIn URL / Reddit username / X handle), composite score, daily AI re-scoring z full kontekstem
- **E2 (Negative feedback loop)** — UI thumbs-up/down na dashboardzie, prompt builder dodaje few-shot examples per user, feedback cache (Redis lub Supabase materialized view)
- UI: nowy widok "Top prospects" sortowany po composite score (osobno od chronologicznego feed sygnałów)

**Verification:**
- Person z 3 sygnałami w 5 dniach pojawia się w "Top prospects" z composite > suma indywidualnych intent_strength
- Po 50 negative feedbacks user widzi spadek false positives (mierzymy: % sygnałów oznaczonych "not relevant" przed/po)

---

## P11 · Operations (O1 + O2) (~1 tydzień)

**Co user dostaje:** Production-grade observability + frictionless onboarding.

**Zakres:**
- Tabela `mechanism_health_alerts`
- **O1 (Health monitoring per mechanism)** — daily cron sprawdzający per `(user_id, mechanism_id)`, Sentry alerts, UI banner per mechanizm
- **O2 (Onboarding presets)** — wizard w `/onboarding`, persona selection (B2B SaaS founder / Agency / Indie hacker), AI generuje rekomendowaną konfigurację per mechanizm, one-click activate
- UI cleanup `/signals` po dodaniu wszystkich mechanizmów (~25 mechanism cards) — grouping, search, filtering

**Verification:**
- Disabled gologin session → O1 alert w ciągu 24h
- Nowy user przechodzi onboarding → po 5 min ma aktywne 5+ mechanizmów z sensowną konfiguracją

---

## Zależności między fazami

```
P1 (fundament + R1 + R9 + M1 + M2 + M3)
   └── P2 (R2 post-watch [zależy od R1] + LinkedIn cleanup)
          └── P3 (L2 + L3 auto-discovery)
                 └── P4 (L4 + L5 + L7 profile monitoring)
                        └── P5 (R7 + R8 + L6 + L10 + L11 — gologin tier)
                               ├── P6 (R3 + R4 search-based)
                               ├── P7 (R5 + R6 tracked users)
                               ├── P8 (L8 + L9 deferred)
                               └── P9 (T1-T5 Twitter/X)
                                      └── P10 (E1 + E2 cross-mechanism)
                                             └── P11 (O1 + O2 operations)
```

**Kolejność uzasadnienie:**
- P1 → P2 — twardy: P2 wymaga R1
- P2-P5 sekwencyjne — narastanie pokrycia
- P5 jest punktem zbiorczym dla wszystkich gologin-based mechanizmów (jeden moduł `lib/gologin/dom-parsers/`)
- P6/P7/P8/P9 — paralelizowalne (różne mechanizmy, brak deps)
- P10 wymaga większości mechanizmów już działających (signal stacking nie ma sensu z 2 mechanizmami)
- P11 zamyka projekt — observability + onboarding po pełnym pokryciu

**Podsumowanie czasowe:**
- P1-P5 = MVP "signal detection 2.0" (~7-8 tygodni)
- P6-P9 = pełne pokrycie platform (~5 tygodni)
- P10-P11 = quality + ops (~2.5 tygodnia)
- **Total ~15 tygodni do pełnej wizji**

**Możliwe pauzy w dostawie:** po P1 (lepszy Reddit), po P3 (LinkedIn engagement działa), po P5 (gologin warm leads), po P9 (trzy platformy pokryte), po P10 (composite scoring działa). Każdy z tych punktów oddaje produktowi sensowną wartość bez połowicznego stanu.

---

# Hard exclude

- **LinkedIn Sales Navigator** — nie integrujemy. SNAP zamknięte; decyzja produktowa.
- **Oficjalne Reddit/LinkedIn/Twitter API** — nie używamy. Wszystko przez Apify lub gologin.

---

# Known limitations / risks

## Techniczne ryzyka do zaadresowania w trakcie implementacji

### DOM-parsing fragility (R8, L10, L11)
Reddit i LinkedIn często zmieniają DOM bez ostrzeżenia. Mechanizmy gologin-based parsujące UI (R8 inbox, L10 invitations, L11 notifications) mogą wybuchnąć w każdej chwili.
- **Mitygacja:** każdy parser ma osobny test e2e wykrywający breakage; O1 health monitoring alertuje natychmiast (nie czeka 7d) jeśli parser zwraca strukturalnie nieprawidłowe dane.
- **Fallback:** wersjonowanie parserów (`v1`, `v2`...) i feature flag żeby przełączyć w razie awarii.

### Identity resolution dla E1 (signal stacking)
"Ten sam człowiek na 3 platformach" jest hard problem. LinkedIn URL ≠ Reddit username ≠ X handle.
- **MVP scope (P10):** TYLKO per-platform aggregation. "Ten sam Reddit user wygenerował 3 sygnały w 5 dni" — działa. "Ten sam człowiek na Reddit + LinkedIn + X" — NIE działa w MVP.
- **Phase 2 (poza P10):** enrichment przez Apollo/Clearbit (email → wszystkie profile). Wymaga osobnej fazy + budżetu na enrichment API.

### R2 backfill po aktywacji
Jeśli user aktywuje R2 PO tym jak R1 znalazł posty, te posty NIE zostaną dodane wstecz.
- **Decyzja:** forward-looking only (proste). Posty znalezione przed aktywacją R2 nie są watchowane. UI komunikuje to przy aktywacji ("R2 zacznie monitorować nowe posty znalezione przez R1 od teraz").

### Multiple accounts per platform per user
Goji w transkrypcie używa 8 LinkedIn kont. repco user może chcieć podobnie (R7/R8/L6/L10/L11/T3 dla wielu kont).
- **MVP scope:** 1 konto per platforma per user (Reddit + LinkedIn + X). Schema `monitoring_signals.config.gologin_profile_id` pozwala na pojedynczy wybór.
- **Phase 2:** multi-account support — zmiana semantyki gologin-based mechanizmów (toggle per account zamiast global toggle).

### R1 soft cap (200 postów/tick) → utrata sygnałów
Subreddit z 1000+ postów/15min może zgubić sygnały. Pierwszych 200 obrobione, reszta zignorowana.
- **Mitygacja MVP:** UI ostrzeżenie przy aktywacji subreddita z high-volume; rekomendacja: skróć cron interval (15min zamiast 1h) zamiast zwiększać cap.
- **Phase 2:** auto-skalowanie częstotliwości na podstawie historical volume.

### Twitter/X actor wybór
`apidojo/tweet-scraper` i alternatywy mają różne pricing/reliability. Brak finalnej decyzji w planie — research wymagany przed startem P9.

### Gologin koszt + ryzyko detekcji
- Subscription gologin oddzielnie ($24-99/mc per ~10 profili).
- Każde uruchomienie profilu = compute time (~5-20s) + ryzyko CAPTCHA / detection.
- Mitygacja: rate-limiting per profil (max N runs/godz), random jitter na timing, monitoring success rate per profil.

### Apify CU costs przy skalowaniu
Cost matrix są szacunkowe. Przy realnym ruchu (np. 100 userów × 10 mechanizmów × różne częstotliwości) może okazać się że niektóre mechanizmy są nieopłacalne dla cheaper plans.
- **Mitygacja:** O1 + per-user credit middleware z hard caps; mechanizmy drogie (L4) wymagają przed-aktywacją cost preview + confirm.

---

# Rozstrzygnięte decyzje (poprzednio open questions)

1. **Soft cap dla R1:** 200 postów/cron tick. UI ostrzega przy subredditach z >1000 postów/h przy aktywacji.
2. **L2/L3 min engagement threshold:** ≥50 reactions na post (default), konfigurowalne per user w `monitoring_signals.config.min_engagement`.
3. **L4 monitoringWindow:** 14 dni od publikacji posta. Po tym posty mają znikomy nowy engagement → tracking_until upływa.
4. **L6 source profilu LinkedIn:** **gologin metadata ma priorytet** nad `users.linkedin_profile_url`. Powód: gologin = konto które user FAKTYCZNIE używa do outreachu; users.linkedin_profile_url może być stary/inny. Fallback na `users.linkedin_profile_url` tylko jeśli gologin metadata pusty.
5. **UI granularity:** **grupowanie po platformie** (Reddit / LinkedIn / Twitter / Modyfikatory) z listą mechanizmów wewnątrz każdej grupy. Każdy mechanizm jako rozwijany card. Filter "active only" + search by name. Onboarding presets (O2) ukrywają złożoność dla nowych userów.
