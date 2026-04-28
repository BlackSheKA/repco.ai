# PRD — repco.ai (MVP v1.0 + v1.1)

**Cel:** lista wszystkich funkcjonalności MVP w formie checklisty do ręcznej weryfikacji.
**Format:** każdy punkt = jedna obserwowalna funkcja + sposób weryfikacji + ID wymagania.
**Status legenda:** [x] uznane za wykonane w `REQUIREMENTS.md` · [ ] otwarte / luka audytowa · [~] wykonane ale ze znanym problemem (zob. memory / audyt v1.1).

> **Mapowanie tabelek bazy** używane przy weryfikacji: `users`, `monitoring_signals`, `product_profiles`, `social_accounts`, `intent_signals`, `prospects`, `actions`, `action_counts`, `credit_transactions`, `live_stats`, `job_logs`.

---

## 1. Onboarding

- [x] **ONBR-01** — kreator pyta o produkt (1 zdanie) i Claude generuje listę keywordów + subredditów.
  - **Weryfikacja:** `/onboarding` krok 1 → po zatwierdzeniu w `monitoring_signals` pojawiają się rekordy `signal_type='reddit_keyword'` i `signal_type='subreddit'` powiązane z `user_id`.
- [x] **ONBR-02** — pytanie o target customer (1 zdanie), zapisywane do `product_profiles`.
  - **Weryfikacja:** `select description, target_customer from product_profiles where user_id=?`.
- [x] **ONBR-03** — opcjonalne nazwy konkurentów (zapisywane jako `signal_type='competitor'`).
  - **Weryfikacja:** `select * from monitoring_signals where signal_type='competitor' and user_id=?`.
- [x] **ONBR-04** — użytkownik może podłączyć konto Reddit przez GoLogin (`/accounts`).
  - **Weryfikacja:** `/accounts` → "Connect Reddit" → po przejściu OAuth/cookie capture pojawia się rząd w `social_accounts` z `platform='reddit'` i `health_status='warming'`.
- [ ] **ONBR-05** — użytkownik może podłączyć konto LinkedIn przez GoLogin.
  - **Weryfikacja:** `/accounts` → "Connect LinkedIn" → rząd w `social_accounts` z `platform='linkedin'`. **UWAGA: wykonane w Phase 10, ale roadmap dalej pokazuje Pending — potwierdzić ręcznie.**
- [x] **ONBR-06** — animacja "live scanning" pokazuje rzeczywiste sygnały podczas onboardingu.
  - **Weryfikacja:** ostatni krok kreatora → sygnały dosypują się w czasie rzeczywistym (Realtime z `intent_signals`), nie placeholder.
- [x] **ONBR-07** — po onboardingu użytkownik trafia na `/` (dashboard) z pierwszymi sygnałami.
  - **Weryfikacja:** middleware nie odsyła do `/onboarding` po jego ukończeniu.

---

## 2. Monitoring — Reddit (co 15 min)

- [ ] **MNTR-01** — cron `monitor-reddit` co 15 min skanuje Reddit per użytkownik.
  - **Weryfikacja:** `vercel.json` ma wpis `*/15 * * * *` → endpoint `/api/cron/monitor-reddit` (Bearer `CRON_SECRET`) → po wywołaniu rośnie `intent_signals` count i zapisuje się rząd w `job_logs` (`job_type='monitor'`, `metadata.cron='monitor-reddit'`). **Status:** `REQUIREMENTS.md` zaznacza Pending — sprawdzić bieżący kod / prod.
- [x] **MNTR-03** — strukturalny matcher (`structural-matcher.ts`) klasyfikuje ~80–90% sygnałów bez AI.
  - **Reguły:**
    - keyword w tytule + body → score 7
    - keyword tylko w tytule → score 6
    - keyword tylko w body → score 5
    - bonus +2 jeśli tytuł zawiera buying-phrase z listy: `looking for, need, recommend, alternative to, best, help me find, suggestions for, what do you use`
    - mention konkurenta → score 7, intent_type=`competitive`
    - tylko buying-phrase bez keyworda → score 4, ambiguous=true
  - **Weryfikacja:** unit-testy `structural-matcher.test.ts` + ręcznie: post z "looking for CRM" w r/SaaS → score ≥7.
- [x] **MNTR-04** — Sonnet klasyfikuje ambiguous (~10–20%): zwraca `intent_type`, `intent_strength` (1–10), `reasoning`, `suggested_angle`.
  - **Weryfikacja:** w `intent_signals` ambiguous rekordy mają niepuste `suggested_angle` i `reasoning`.
- [ ] **MNTR-05** — dedup po `post_url` (UNIQUE constraint) + odrzucenie postów >48h.
  - **Weryfikacja:** uruchomić cron 2× pod rząd → liczba sygnałów nie podwaja się. Sprawdzić `\d intent_signals` na obecność UNIQUE na `post_url`.
- [x] **MNTR-06** — nowe sygnały lecą Realtime do dashboardu.
  - **Weryfikacja:** otwórz `/`, w drugim oknie INSERT do `intent_signals` → karta pojawia się bez refresh.
- [ ] **MNTR-07** — każdy run cronu loguje się do `job_logs` z duration, status, signal count.
  - **Weryfikacja:** `select * from job_logs where job_type='monitor' order by started_at desc limit 5` — czy ma `duration_ms`, `status`, `metadata.total_signals`.

---

## 3. Monitoring — LinkedIn (co 2–4h)

- [x] **MNTR-02** — cron `monitor-linkedin` skanuje LinkedIn przez Apify actor `apimaestro~linkedin-post-search-scraper`.
  - **Weryfikacja:** `/api/cron/monitor-linkedin` → run → `intent_signals` z `platform='linkedin'` + log w `job_logs` z `metadata.apify_run_id`.
  - **Canary:** smoke-test wykrywa silent failure (zob. `linkedin-canary.ts`).

---

## 4. Intent Feed (dashboard)

- [x] **FEED-01** — feed sygnałów sortowany po `detected_at desc`.
- [x] **FEED-02** — karta sygnału pokazuje: platforma (badge Reddit/LinkedIn), subreddit lub źródło, autor (handle), time-ago, fragment posta, intent strength 1–10 z paskiem.
- [x] **FEED-03** — przycisk "Contact" inicjuje sekwencję outreach (tworzy actions w bazie).
- [x] **FEED-04** — przycisk "Dismiss" usuwa sygnał z feedu.
- [x] **FEED-05** — filtr po platformie (Reddit / LinkedIn) + min. intent strength.
- **Weryfikacja zbiorcza:** `/` lub `/feed` — przejść każdą interakcją po kolei.

---

## 5. Agent Persona ("repco")

- [x] **AGNT-01** — karta agenta na dashboardzie z bieżącym stanem + dziennymi statami.
- [x] **AGNT-02** — stany emocjonalne: `Scanning`, `Found`, `Waiting`, `Sent`, `Reply`, `Cooldown`, `Quiet`.
- [x] **AGNT-03** — terminal header (czarne tło, monospace, pomarańczowe akcenty) z 5 ostatnimi akcjami w czasie rzeczywistym.
- **Weryfikacja:** dashboard `/` — sprawdzić każdy stan przez wywołanie odpowiednich akcji.

---

## 6. Action Engine — typy akcji

| ID | Akcja | Reddit | LinkedIn | Auto/Approval | Limit/dzień/konto | Mechanizm |
|---|---|---|---|---|---|---|
| - | `like` | ✅ upvote | ✅ React | auto | 20 (engage pool) | DOM (LinkedIn) / Haiku CU (Reddit) |
| - | `follow` | ✅ | ✅ | auto | 20 (engage pool) | DOM, detekcja Premium-gate (LinkedIn) |
| - | `public_reply` | ✅ komentarz | ✅ komentarz | **approval** | 5 | Haiku CU |
| - | `dm` | ✅ chat | ✅ message (1° only) | **approval** | 8 | Haiku CU (Reddit) / DOM (LinkedIn, deterministyczny) |
| - | `followup_dm` | ✅ day 3/7/14 | ✅ day 3/7/14 | **approval** | wlicza się w 8 | jak `dm` |
| - | `connection_request` | ❌ | ✅ z notatką | **approval** | osobny `daily_connection_limit` | DOM via `/preload/custom-invite/?vanityName=X` |

### Action Engine — wymagania szczegółowe

- [x] **ACTN-01** — klik "Contact" tworzy `like` + `follow` z `status='approved'` (auto), bez kolejki.
  - **Weryfikacja:** `select action_type, status from actions where prospect_id=? order by created_at`.
- [x] **ACTN-02** — DM generowany przez Claude Sonnet 4.6, max 3 zdania, referuje konkretny post, **bez linku** w pierwszej wiadomości.
  - **Weryfikacja:** wygenerowany DM ≤3 zdania, brak `http://`/`https://`, zawiera nawiązanie do treści posta.
- [x] **ACTN-03** — QC odrzuca DMy spammy / generic / długie / z linkiem.
  - **Weryfikacja:** unit-testy QC + ręcznie: wymusić generic prompt → `actions.error` lub regenerate.
- [x] **ACTN-04** — DM trafia do approval queue ze `status='pending_approval'`.
- [x] **ACTN-05** — egzekucja: Supabase DB Webhook → Vercel Function → GoLogin Cloud → Playwright CDP → Haiku CU (lub DOM dla LinkedIn).
  - **Weryfikacja:** zatwierdzić DM → przejście statusów `approved → executing → completed`, plus `screenshot_url` niepusty.
- [x] **ACTN-06** — `claim_action` RPC z `FOR UPDATE SKIP LOCKED` (brak duplikatów wykonania).
  - **Weryfikacja:** włączyć 2 worki równolegle → ta sama akcja nie wykona się 2×.
- [x] **ACTN-07** — screenshot weryfikacyjny po wykonaniu (Supabase Storage URL w `actions.screenshot_url`).
- [x] **ACTN-08** — Haiku CU max 15 kroków + stuck detection (3× ten sam screenshot = abort).
  - **Weryfikacja:** zalogować `cu_steps` w `job_logs.metadata`; ustawić target nieosiągalny → akcja kończy się `failed` po ≤15 krokach.
- [x] **ACTN-09** — dzienny limit per konto: DM 8 / engage (like+follow) 20 / public reply 5.
  - **Weryfikacja:** `select * from action_counts where account_id=? and date=current_date` — sprawdzić, czy 9. DM blokowany.
- [x] **ACTN-10** — akcja wygasa po **12h** bez akceptacji (`status='expired'`).
  - **Weryfikacja:** stworzyć akcję, ustawić `created_at - 13h` → cron `expire-actions` ustawia `expired`.

---

## 7. Approval Queue

- [x] **APRV-01** — karta z post-context, intent score, suggested_angle.
  - **Weryfikacja:** `/approve` lub komponent na dashboardzie pokazuje wszystko 4.
- [x] **APRV-02** — Approve jednym klikiem.
- [x] **APRV-03** — Edit przed approve (zapisuje do `actions.final_content`).
- [x] **APRV-04** — Reject (`status='rejected'`).
- **Phase 9 fix:** karta poprawnie pokazuje badge LinkedIn vs Reddit (nie `r/null` dla LinkedIn).

---

## 8. Follow-up Sequences

- [x] **FLLW-01** — follow-up #1 day 3 (feature/benefit angle).
- [x] **FLLW-02** — follow-up #2 day 7 (value/insight angle).
- [x] **FLLW-03** — follow-up #3 day 14 (low-pressure check-in).
- [x] **FLLW-04** — reply zatrzymuje **wszystkie** pending follow-upy (`status='cancelled'`).
- [x] **FLLW-05** — każdy follow-up wymaga approval przed wysłaniem.
- **Weryfikacja:** wysłać DM → po 3 dniach pojawia się `followup_dm` w queue; symulować reply → wszystkie pending follow-upy ten samego prospekta = `cancelled`.

---

## 9. Reply Detection

- [x] **RPLY-01** — cron `check-replies` co 2h przez GoLogin + Playwright + Haiku CU otwiera inbox.
  - **Weryfikacja:** `vercel.json` ma `0 */2 * * *` → `/api/cron/check-replies` → log w `job_logs`.
- [x] **RPLY-02** — match sender → `prospects.handle` (znormalizowany; usuwa `u/` prefix po obu stronach).
  - **Weryfikacja:** wysłać DM do `u/test`, odpowiedzieć z konta test → `prospects.pipeline_status='replied'`. Patrz Phase 7 fix.
- [x] **RPLY-03** — email reply alert (Resend) w <10 min od wykrycia.
- [x] **RPLY-04** — Realtime push do `use-realtime-replies` na dashboardzie.

---

## 10. Anti-Ban System

- [x] **ABAN-01** — każde `social_account` ma osobny GoLogin Cloud profile (unikalny fingerprint + proxy).
  - **Weryfikacja:** `select gologin_profile_id from social_accounts` — każdy unikalny.
- [x] **ABAN-02** — 7-dniowy progressive warmup:
  - dni 1–3: tylko browse
  - dni 4–5: likes + follows (max 5/dzień)
  - dni 6–7: pierwszy public reply
  - dzień 8+: DM enabled
  - **Weryfikacja:** sprawdzić `warmup_state` na dziale w `worker.ts` `allowedActions`.
- [x] **ABAN-03** — losowe opóźnienia między akcjami (mean 90s, std 60s, min 15s).
- [x] **ABAN-04** — behavioral noise: 60% akcji to scroll/read/like na nie-targetowej treści.
- [x] **ABAN-05** — timing w godzinach aktywnych usera (default 8:00–22:00 lokalnego TZ).
- [x] **ABAN-06** — target isolation: 1 prospect = 1 konto; żadne inne konto go nie kontaktuje.
  - **Weryfikacja:** UNIQUE(`prospect_id`, `account_id`) + sprawdzić, czy `claim_action` nie pozwala na drugie konto.
- [x] **ABAN-07** — health: `healthy → warning (auto cooldown 48h) → cooldown → banned (alert + email)`.
- [ ] **PHASE-14 GAP** — read-side enforcement: `worker.ts` powinien fail-fast z `failure_mode='account_quarantined'` gdy `health_status in ('warning','banned')` lub `cooldown_until > now()`. **NIE WDROŻONE** (pending Phase 14).
  - **Weryfikacja:** ustawić ręcznie `social_accounts.health_status='warning'` → zatwierdzony DM **nie powinien** się wykonać.

---

## 11. Prospect Pipeline

- [x] **PRSP-01** — kanban z 6 stage'ami: `detected → engaged → contacted → replied → converted → rejected`.
- [x] **PRSP-02** — szczegóły prospekta: platforma, handle, bio, intent signal, conversation history, pipeline status.
- [x] **PRSP-03** — notatki + tagi.
- [x] **PRSP-04** — eksport CSV.
- [x] **PRSP-05** — manualne przesuwanie między stage'ami.
- [x] **PRSP-06** — dashboard widget: total prospects / replied / converted / estimated revenue.
- **Weryfikacja:** `/prospects` — przejść każdą interakcją.

---

## 12. Account Management (`/accounts`)

- [x] **ACCT-01** — health status + warmup progress per konto.
- [x] **ACCT-02** — dzienne limity + remaining capacity per konto.
- [x] **ACCT-03** — assignment kont do platform (które konto odpowiada za który feed).
- [x] **ACCT-04** — automatyczne zarządzanie GoLogin profiles (create/open/close).

---

## 13. Dashboard

- [x] **DASH-01** — terminal header (5 ostatnich akcji, real-time).
- [x] **DASH-02** — multi-column layout: Agent card · Found Today · Approval Queue · Results.
- [x] **DASH-03** — Realtime update (Supabase Realtime).
- [x] **DASH-04** — revenue counter (`avg_deal_value × converted_count`).

---

## 14. Billing (Stripe)

> **Nota:** sekcja v1.2 — pełna spec w [PRICING.md](PRICING.md). Stare BILL-* (3-day trial, 3 cycle plans, 5 monitoring signals) wywalone w hard switch. Nowy model: Free + Pro (monthly/annual) + 4 credit packs + per-scan burn engine z 27 mechanism cost matrix.

- [ ] **BILL-01** — Free tier 250 cr/m + Pro tier 2 000 cr/m (monthly: $49, annual: $39/m = $468/yr) przez Stripe Checkout.
  - **Weryfikacja:** signup → `users.subscription_plan='free'`, +250 cr; subscribe Pro monthly → `subscription_plan='pro'`, `billing_cycle='monthly'`, +2000 cr; annual → `billing_cycle='annual'`.
- [ ] **BILL-02** — Brak 3-day trialu — Free tier całkowicie zastępuje. `handle_new_user` ustawia `subscription_plan='free'` + 250 cr.
  - **Weryfikacja:** nowa rejestracja → BRAK `trial_ends_at` (kolumna usunięta lub ignored), automatycznie free.
- [ ] **BILL-03** — Credit packs (4 SKUs, top-up, never expire): Starter 500/$29, Growth 1500/$59, Scale 5000/$149 ⭐, Agency 15000/$399. Dostępne tylko dla Pro.
  - **Weryfikacja:** free user próbuje pack checkout → 403; Pro user → Stripe checkout → `credit_transactions` rząd `pack_purchase` + balance += pack_size.
- [ ] **BILL-04** — Per-scan monitoring burn z `mechanism_costs` table (27 wierszy, R1-R9 / L1-L11 / T1-T5 / E1):
  - Formuła: `daily_burn = cr_per_scan × scans_per_day(cadence) × num_sources`
  - Cadence configurable per signal (24h / 6h / 4h / 2h / 1h / 30min / 15min)
  - Default cadence: 6h economy
  - **Weryfikacja:** test signal (R1, 1 subreddit, 6h) → burn 4 cr/day; zmiana cadence na 1h → burn 24 cr/day.
- [ ] **BILL-05** — Daily account credit burn (poza pierwszymi 2 darmowymi):
  - reddit: 3/dzień/konto
  - linkedin: 5/dzień/konto
- [ ] **BILL-06** — Action credit cost (on completion): full per-mechanism table z [PRICING.md §6](PRICING.md#6-outreach-mechanisms-outbound-pricing) (26 outbound mechanizmów OR1-9 / OL1-11 / OX1-8). Engage pool 0 cr, soft outbound 5-20 cr, hard outbound 20-30 cr.
- [x] **BILL-07** — atomowe SQL (`deduct_credits` RPC) — brak ujemnych sald w race conditions.
  - **Weryfikacja:** symulować dwa równoczesne deduct → suma transakcji = poprawna.
- [ ] **BILL-08** — dashboard pokazuje **tylko balance** (NIE burn rate / "X dni do wyczerpania" — patrz feedback memory `credit_ui_no_burn_math`). Stosuje się też do `/signals` mechanism configurator (unit cost OK, daily ticker NIE).
  - **Weryfikacja:** sidebar widget pokazuje liczbę kredytów, nie pokazuje "Y/day"; mechanism config pokazuje "1 credit per scan" ale nie "30 cr/day".
- [ ] **BILL-09** — kontekstowe upgrade prompts gdy kredyty kończą się: binarny "Buy credits" + "Upgrade to Pro" (BEZ countdownu).
- [ ] **BILL-10** — Grant rollover ADDITIVE z cap 2× monthly grant (Free cap 500, Pro cap 4 000).
  - **Weryfikacja:** Pro user balance 100 → po grancie 2 100; balance 5 000 → po grancie 4 000 (cap).
- [ ] **BILL-11** — Annual billing toggle = orthogonal -20% on Pro. 2 Stripe price IDs: `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`.

---

## 15. PLG / Growth

- [x] **GROW-01** — `/live`: publiczny anonimowy feed sygnałów, polling 10s, bez auth.
- [x] **GROW-02** — `/live` agregaty: signals last hour, signals 24h, active users, DMs sent, replies, conversion rate (z tabeli `live_stats`, refreshowane cron'em `refresh-live-stats`).
- [x] **GROW-03** — landing "Scan my product": user wpisuje opis, widzi realne wyniki Reddita w <5s bez signupu.
  - **Weryfikacja:** strona główna → form → wyniki w <5s (rate-limited).
- [x] **GROW-04** — weekly results card: 1200×630 PNG (next/og) z statami + share na X/LinkedIn.
- [x] **GROW-05** — daily email digest 8:00 lokalnie: "X people looking for [product] yesterday".
- [x] **GROW-06** — digest zawiera top sygnał + count DMs pending approval.

---

## 16. Notifications (email — Resend)

- [x] **NTFY-01** — daily digest (jeden cron `digest`, idempotency guard `last_digest_sent_at` — Phase 8).
  - **Weryfikacja:** ustawić timezone → o godz. 8:00 lokalnej dostać 1 email; uruchomić cron 2× → drugi nie wysyła.
- [x] **NTFY-02** — reply alert email.
- [x] **NTFY-03** — account warning/banned alert email.

---

## 17. Observability

- [x] **OBSV-01** — `job_logs` zapisuje każdą akcję: `duration_ms`, `status`, `error`, `metadata.correlation_id`.
  - Phase 9 fix: usunięto nieistniejące kolumny `details` / `correlation_id` z INSERTu (były silently dropowane).
- [x] **OBSV-02** — zombie recovery cron co 5 min: akcje `executing > 10 min` → reset.
  - **Weryfikacja:** `vercel.json` `*/5 * * * *` → `/api/cron/zombie-recovery`.
- [x] **OBSV-03** — Sentry + Axiom + correlation IDs.
- [x] **OBSV-04** — alert email gdy success rate < 80% lub timeout rate > 5%.

---

## 18. LinkedIn — pełen zakres (MVP + v1.1)

> v1.1 (Phase 13) dorobiła deterministyczny DOM flow dla **każdego** typu LinkedIn action + pre-screening + authwall detection. Sekcja jest głębsza niż wynika z `LNKD-01..06`, bo część infrastruktury (executor failure modes, prescreen verdykty, authwall guard) nie ma osobnych ID wymagań.

### 18.1 Monitoring LinkedIn

- [x] **MNTR-02** — cron `monitor-linkedin` co 2–4h przez Apify actor `apimaestro~linkedin-post-search-scraper`.
  - **Adapter:** [linkedin-adapter.ts](src/features/monitoring/lib/linkedin-adapter.ts) — `maxItemsPerQuery=25`, timeout 120s, memory 1GB; zwraca `apifyRunId` zapisywany do `intent_signals.apify_run_id` dla audytu.
  - **Queries:** z `monitoring_signals` typu `linkedin_keyword` (osobne od redditowych — różne strategie matchowania).
  - **Weryfikacja:** ręczne wywołanie `/api/cron/monitor-linkedin` → `intent_signals` z `platform='linkedin'` + `metadata.apify_run_id` w `job_logs`.

- [x] **Strukturalny matcher LinkedIn** ([linkedin-matcher.ts](src/features/monitoring/lib/linkedin-matcher.ts)) — różny od Reddita:
  - **Hashtag normalization** — `#AI` matchuje keyword `ai` (regex `/#(\w+)/g`)
  - **@mention parsing** — wyciąga handle'e dla list konkurentów (regex `/@([\w-]+)/g`)
  - **Article boost** — `postType='article'` z mention konkurenta → +1 do intent_strength
  - **Short-post heuristic** — post < 50 znaków → `ambiguous=true` (engagement-farming noise → Sonnet review)
  - **Competitor hit** — score 7, `intent_type='competitive'`
  - **Keyword hit** — score 5 (bez bonusu jaki ma Reddit za "buying-phrase")
  - **Weryfikacja:** unit tests `linkedin-matcher.test.ts`.

- [x] **Ingestion pipeline** ([linkedin-ingestion-pipeline.ts](src/features/monitoring/lib/linkedin-ingestion-pipeline.ts)):
  - **Dedup po URL ze stripowanymi `utm_*`** — LinkedIn dokleja tracking, bez tego mielibyśmy duplikaty
  - **Freshness cutoff 48h** (`FRESHNESS_CUTOFF_SECONDS = 48 * 3600`)
  - **Truncate body do 500 znaków**
  - **Pełny payload do `intent_signals`:** `author_handle`, `author_profile_url`, `author_headline`, `author_company`, `post_type`
  - **Weryfikacja:** odpalić cron 2× → liczba sygnałów nie podwaja się; sygnał z `?utm_source=share` i bez = jeden rząd.

- [x] **Canary / silent failure detection** ([linkedin-canary.ts](src/features/monitoring/lib/linkedin-canary.ts)) — Apify actory bywają zwracają `SUCCEEDED` ze 0 wyników (silent break po stronie scrapera). Smoke test odpala znaną query z gwarantowanym wynikiem; jak wraca 0 → Sentry alert + flag w `job_logs.metadata.canary_failed`.

### 18.2 Akcje LinkedIn — wszystkie executory

> Wszystkie używają **deterministycznego DOM flow** (no Haiku CU = no AI cost per action). Każdy zwraca typed `failureMode` zapisywany do `job_logs.metadata.failure_mode` dla ops slicingu.

#### `connection_request` ([linkedin-connect-executor.ts](src/lib/action-worker/actions/linkedin-connect-executor.ts))
- **URL hack:** `https://www.linkedin.com/in/{slug}/preload/custom-invite/?vanityName={slug}` — otwiera dialog "Add a note + Send" omijając anti-bot (CDP-dispatched click na "Connect" jest ignorowany przez `isTrusted: false` check)
- **Failure modes:** `profile_unreachable`, `security_checkpoint`, `session_expired`, `weekly_limit_reached`, `already_connected`, `connect_button_missing`, `unknown`
- **Credit cost:** 20
- **Weryfikacja:** zatwierdzić `connection_request` → status `completed` + screenshot z otwartym dialogiem "Invitation sent".

#### `dm` ([linkedin-dm-executor.ts](src/lib/action-worker/actions/linkedin-dm-executor.ts))
- Działa **tylko do 1° connections** (po akceptacji invite); brak InMail/Premium support w v1.1
- **Failure modes:** `not_connected`, `message_disabled`, `dialog_never_opened`, `send_button_missing`, `security_checkpoint`, `session_expired`, `weekly_limit_reached`, `unknown`
- **Credit cost:** 30 (taki sam jak Reddit DM)
- **Weryfikacja:** prospekt z `pipeline_status='connected'` → DM → `completed`; prospekt 2°/3° → `failureMode='not_connected'`.

#### `followup_dm` (day 3/7/14) ([linkedin-dm-executor.ts](src/lib/action-worker/actions/linkedin-dm-executor.ts))
- Routing: cron `schedule-followups` rozpoznaje `platform='linkedin'` i kieruje do tego samego DM executora
- **Credit cost:** 20
- **Weryfikacja:** wysłać LinkedIn DM → po 3 dniach `followup_dm` w queue z platformą LinkedIn; reply prospekta → wszystkie pending follow-upy `cancelled`.

#### `follow` ([linkedin-follow-executor.ts](src/lib/action-worker/actions/linkedin-follow-executor.ts))
- Standalone profile follow (creator/influencer engagement; nie wymaga connection)
- **Failure modes:** `profile_unreachable`, `security_checkpoint`, `session_expired`, `already_following`, `follow_premium_gated` (Follow ukryty za Premium dla niektórych targetów), `follow_button_missing`, `unknown`
- **Credit cost:** 0 (engage pool)
- **Weryfikacja:** influencer profile → Follow → `completed` + UI pokazuje "Following".

#### `like` (React) ([linkedin-like-executor.ts](src/lib/action-worker/actions/linkedin-like-executor.ts))
- React 👍 na poście (URL targetowany)
- **Failure modes:** `post_unreachable`, `post_deleted`, `security_checkpoint`, `session_expired`, `already_liked`, `react_button_missing`, `unknown`
- **Credit cost:** 0 (engage pool)

#### `comment` ([linkedin-comment-executor.ts](src/lib/action-worker/actions/linkedin-comment-executor.ts) + [generate-comment.ts](src/lib/action-worker/actions/generate-comment.ts))
- Top-level comment na poście; limit LinkedIn = **1250 znaków**
- Treść generowana przez Sonnet (kontekstowe nawiązanie do tezy posta)
- **Failure modes:** `comment_disabled`, `character_limit_exceeded`, `post_unreachable`, `security_checkpoint`, `session_expired`, `unknown`
- **Credit cost:** 15 (taki sam jak public_reply na Reddicie)

### 18.3 Pre-screening LinkedIn (v1.1)

- [x] **LNKD-06** — cron `linkedin-prescreen` ([route.ts](src/app/api/cron/linkedin-prescreen/route.ts)) co godzinę odwiedza `/in/{slug}` dla prospektów `pipeline_status='detected'` i klasyfikuje DOM, **zanim** akcja trafi do approval queue.
- **Batch cap:** 50 prospektów/run, single healthy LinkedIn account/run.
- **6 verdyktów (priority order):**
  1. `security_checkpoint` (URL zawiera `/checkpoint`) → **abort run** + `social_accounts.health_status='warning'`
  2. `account_logged_out` (auth-wall) → **wstrzymaj wszystko z tego konta** (fix 2026-04-24 po UAT — wcześniej silent absorb zamiast session-expired signal)
  3. `profile_unreachable` (404) → `pipeline_status='unreachable'`, `unreachable_reason='profile_unreachable'`
  4. `already_connected` (jest `messaging` sidebar) → `pipeline_status='connected'` (otwiera ścieżkę do DM)
  5. `creator_mode_no_connect` (jest Follow ale brak Connect) → `unreachable`, reason=`creator_mode_no_connect`
  6. `null` (żaden sygnał) → zostaw `detected`, refresh `last_prescreen_attempt_at` (retry później)
- **Efekt:** approval queue **nie zalewa się** akcjami strukturalnie niewykonalnymi; mierzalny spadek `no_connect_available` failures w `job_logs`.
- **Weryfikacja:** prospekt z private profile → uruchom cron → `pipeline_status='unreachable'`; prospekt connected → `pipeline_status='connected'`.

### 18.4 Authwall preflight guard

- [x] **Authwall detector** ([linkedin-authwall.ts](src/lib/action-worker/actions/linkedin-authwall.ts)) — wpięty w **każdy** LinkedIn executor + prescreen przed wykonaniem akcji.
- **Wykrywa wylogowanie po:**
  - URL zawiera `/authwall` lub `/checkpoint`
  - Brak `nav.global-nav` (zalogowany landmark)
- **Skutek:** zwraca `failureMode='session_expired'` zamiast wykonywać akcję na pustej stronie i raportować `target_failure`.
- **Tło:** patrz feedback memory `linkedin_executor_session_gap` — przed tym fix DM/Follow/prescreen silently misattributed logged-out state jako "target nie istnieje", marnując kolejne próby na tych samych prospektach.

### 18.5 Account quarantine (Phase 14 — gap)

- [ ] **Quarantine read-side gate** — Phase 13 zapisuje `health_status='warning'` / `cooldown_until` poprawnie (worker.ts:614 dla `security_checkpoint`/`session_expired`, worker.ts:629 dla `weekly_limit_reached`, prescreen cron dla checkpointu), ale **żaden execution gate ich nie czyta**.
  - **Skutek:** approved action na koncie z `warning` ciągnie się do GoLogin connect step → palenie sesji ponownie po checkpoint.
  - **Phase 14 (otwarta)** doda fail-fast w `worker.ts` z `failureMode='account_quarantined'` + JOIN w `claim_action` RPC (defense in depth).
  - **Weryfikacja:** ustawić ręcznie `social_accounts.health_status='warning'` → zatwierdzony LinkedIn DM nadal się wykona (BUG do zamknięcia w Phase 14).

### 18.6 Wymagania v1.1 (LNKD-01..06)

- [x] **LNKD-01** — LinkedIn DM do 1° via deterministic DOM flow (zob. 18.2 `dm`).
- [x] **LNKD-02** — LinkedIn Follow standalone (zob. 18.2 `follow`).
- [x] **LNKD-03** — LinkedIn React/Like z post URL (zob. 18.2 `like`).
- [x] **LNKD-04** — LinkedIn Comment z 1250-char limit (zob. 18.2 `comment`).
- [x] **LNKD-05** — `followup_dm` LinkedIn route przez nowy DM executor; Reddit follow-upy zielone (zob. 18.2 `followup_dm`).
- [x] **LNKD-06** — pre-screening cron z 6 verdyktami (zob. 18.3).

### 18.7 Czego LinkedIn świadomie **NIE** obsługujemy

| Feature | Powód |
|---|---|
| Sales Navigator / Recruiter | Osobne URL i layout; wymaga Premium subscription na koncie |
| InMail (płatny DM bez connection) | Wymaga Premium na koncie outreachowym; v2+ |
| Endorsements / skills | Niski signal-to-noise, ban risk podejrzanie wysoki |
| Group posts | Inny layout od głównego feedu, nie skanowane przez Apify actor |
| Article comments (LinkedIn Articles) | Tylko top-level comments na zwykłych postach |
| 2°/3° degree DMs bez connection | Niemożliwe bez InMail; ścieżka to `connection_request` → akcept → DM |
| Event invites / page follows | Nie na roadmapie v1.x |
| Repost / share | Świadomie — nie chcemy wzmacniać cudzych treści głosem agenta |
| LinkedIn Live / Stories | Ephemeral content, nie dopasowane do intent monitoringu |

### 18.8 Podsumowanie — co skanujemy i czym mierzymy sukces

| Element | Wartość |
|---|---|
| Akcje obsługiwane | 5 typów (`connection_request`, `dm`, `follow`, `like`, `comment`) + `followup_dm` w sekwencjach |
| Mechanizm | Deterministic DOM flow (no Haiku CU per action) |
| Typed failure modes | 8+ (`security_checkpoint`, `session_expired`, `weekly_limit_reached`, `not_connected`, `message_disabled`, `follow_premium_gated`, `post_unreachable`, `comment_disabled`, +`unknown`) |
| Pre-screening | 6 verdyktów przed approval queue |
| Authwall guard | Każdy executor + prescreen |
| Monitoring cadence | 2–4h via Apify (LinkedIn nie jest real-time) |
| Dedup | URL z trim `utm_*` + freshness 48h |
| Strukturalny match | Hashtagi + mentions + article boost + short-post → Sonnet |
| Canary | Smoke test → Sentry alert na silent Apify failure |
| Account quarantine | **OTWARTE w Phase 14** — read-side gate brakuje |

---

## 19. Znane luki przed shipowalnym MVP

- [ ] **MNTR-01 / 05 / 07** — Phase 2 zaznaczone Pending w `REQUIREMENTS.md`. Sprawdzić ręcznie kod vs status — może być zwykły dług dokumentacyjny.
- [ ] **ONBR-05** — LinkedIn connect: roadmap Phase 10 oznaczony Complete, ale REQUIREMENTS Pending. Potwierdzić.
- [ ] **Phase 14** — quarantine read-side gate w `worker.ts` + `claim_action` JOIN na `social_accounts`. Bez tego `health_status='warning'` nie blokuje wysyłki.
- [~] **Faza 1 plan 01-06** — UAT fixes (theme toggle, mobile sidebar, sign-out dialog) zaznaczone Pending, ale zgodnie z `.planning/debug/resolved/` — naprawione. Aktualizacja STATE.md potrzebna.

---

## 20. Out of Scope (nie weryfikujemy)

- Chrome extension
- Email sequences (cold email)
- Mobile native app
- Multi-user / team
- Real-time WebSocket na `/live`
- Storing social credentials (tylko cookies w GoLogin)
- Referral program
- A/B testing message variants
- CRM integrations (HubSpot, Pipedrive, Salesforce)
- Autopilot mode (no approval)

---

## Sposób weryfikacji — szybka procedura

1. **Cron jobs:** `vercel.json` + ręczne `curl -H "Authorization: Bearer $CRON_SECRET" https://repco.ai/api/cron/<name>` → sprawdzić `job_logs`.
2. **DB invariants:** `psql` lub Supabase Studio — sprawdzić UNIQUE/NOT NULL/RLS policies dla każdej tabeli.
3. **UI flows:** `pnpm dev --port 3001` → przejść każdy ekran i odznaczyć checkbox tutaj.
4. **Action E2E:** approve DM → obserwuj `actions.status` przejście `approved → executing → completed` + screenshot.
5. **Anti-ban:** ustawić ręcznie `social_accounts.health_status='warning'` → zatwierdzony DM **nie powinien** się wykonać (Phase 14 gap — aktualnie wykona się!).

---

*Wygenerowane: 2026-04-25 z `REQUIREMENTS.md` + ROADMAP + kodu (`monitor-reddit/route.ts`, `structural-matcher.ts`, `worker.ts`, `actions/lib/types.ts`).*
*Memory references: feedback `credit_ui_no_burn_math`, feedback `linkedin_executor_session_gap`, project `linkedin_connect_url_hack`.*
