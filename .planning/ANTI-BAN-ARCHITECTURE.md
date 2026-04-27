# Anti-Ban Architecture: GoLogin Browser Profiles + Residential Proxy

> **Status:** Plan zatwierdzony 2026-04-27. Nie zaimplementowany — patrz "Kolejność wykonania" niżej.
> **Trigger:** Konto Reddit zbanowane natychmiast po samym ręcznym zalogowaniu przez profil GoLogin (bez akcji bota).

## Context

Konto Reddit zostało zbanowane natychmiast po samym ręcznym zalogowaniu przez profil GoLogin — bez żadnej akcji bota. To dowód, że domyślny stack profilu (`proxy: { mode: "gologin" }`) jest spalony przez Reddita. Zanim w ogóle odpalimy DM-y, musimy doprowadzić infrastrukturę profilu do stanu, w którym świeże konto przeżywa pierwsze logowanie.

Audyt kodu wykazał, że **architektura izolacji per-account jest na papierze, nieużywana w praktyce**:
- kolumna `social_accounts.proxy_id` istnieje w schemacie, **nigdy nie jest populowana** ([account-actions.ts:44-62](../src/features/accounts/actions/account-actions.ts#L44-L62))
- profile tworzone z `proxy: { mode: "gologin" }` (free shared) ([client.ts:60](../src/lib/gologin/client.ts#L60))
- jeden zahardkodowany UA dla wszystkich profili (Chrome 130, Win64, en-US)
- brak persystencji cookies — nowa sesja przy każdej akcji ([adapter.ts:125-146](../src/lib/gologin/adapter.ts#L125-L146))
- warmup tylko czasowy (`warmup_day`), zero realnej aktywności w subach ([warmup/route.ts:45](../src/app/api/cron/warmup/route.ts#L45))
- zero detekcji shadowbana / captcha / "you broke a rule" — Computer Use Haiku tego nie czyta

**Cel zmiany:** sprawić, żeby świeże konto Reddit założone przez profil GoLogin przeżyło ≥7 dni bez bana, bez akcji bota — czyli żeby IP + fingerprint + zachowanie sesji były nie do odróżnienia od zwykłego użytkownika.

---

## Kluczowe wnioski z audytu

**Czy każde konto loguje się z innego IP?** **W KODZIE — NIE.** Wszystkie profile tworzone przez `createProfile()` w `src/lib/gologin/client.ts` dzielą domyślny shared proxy GoLogin. **W GoLogin desktop UI — TAK**, jeśli ręcznie podpinasz proxy z poola.

**Czy GoLogin to wspiera?** **TAK** — endpointy `add_proxies`, `patch_profile_proxy_many_v2`, `users_proxies/mobile_proxy` pozwalają na 1:1 proxy per profil. Po prostu w naszym kodzie z tego nie korzystamy.

**Diagnoza bana (2026-04-27):** Proxy "Germany - 1" (residential, IPv6 floppydata pool) ma notatkę "mój priv dla ri…" i jest Connected do profilu. Najprawdopodobniej **zbanowane konto Reddit logowało się przez residential niemieckie IP, NIE przez shared gologin proxy**. To zmienia obraz:
- Sam zakup residential nie jest gwarancją — pool floppydata.com używany przez wszystkich userów GoLogin może być częściowo flaggowany przez Reddit
- Bardziej ważne stają się: spójność signal stack (geo proxy ↔ timezone ↔ locale ↔ UA), świeżość fingerprintu, zachowanie przy signupie, czas między rejestracją a akcjami
- Mobile (4G LTE) wraca do scope jako realny fallback dla rynków gdzie residential GoLogin jest spalony

---

## Decyzja narzędziowa: zostajemy na GoLogin

GoLogin pokrywa 100% naszych potrzeb (per-profile residential IP, geo-match, persystencja cookies, antydetekcyjny fingerprint Orbita, REST API, Cloud Browser). Problem był tylko taki, że używaliśmy ich darmowego shared proxy — domyślnej, ale nie jedynej opcji. Wszystkie potrzebne endpointy są już dostępne w naszym MCP serwerze.

**Decyzja proxy:** **Opcja B — kupujemy proxy bezpośrednio od GoLogin** (GeoProxy traffic dla residential, mobile pool dla high-value kont). Single billing, brak lock-inu na zewnętrznych dostawców, prostsza implementacja (GoLogin sam zarządza poolem i sticky session — nie trzeba własnej tabeli proxies z credentials).

### Realne ceny GoLogin

Z API `users-proxies/geolocation/traffic` (2026-04-27, USD):

| Bundle | Residential | Mobile (4G) | Datacenter |
|---|---|---|---|
| 2 GB | $3.98 ($1.99/GB) | $3.98 ($1.99/GB) | $3.98 ($1.99/GB) |
| 5 GB | $7.95 ($1.59/GB) | $9.25 ($1.85/GB) | $9.95 ($1.99/GB) |
| 10 GB | $15.90 ($1.59/GB) | $18.50 ($1.85/GB) | $19.90 ($1.99/GB) |
| 20 GB | $29.20 ($1.46/GB) | $34.60 ($1.73/GB) | $39.80 ($1.99/GB) |
| **50 GB** | **$66.50 ($1.33/GB) ← sweet spot** | $79.50 ($1.59/GB) | $99.50 ($1.99/GB) |
| 100 GB | $119 ($1.19/GB) | $146 ($1.46/GB) | $199 ($1.99/GB) |

Plus stały koszt planu Professional: **$9/mc** (10 profili). Datacenter ignorujemy — to ten sam typ co spalony shared proxy.

### Realne zużycie traffic per konto Reddit

Pierwszy test wykazał ~300 MB/mc/profil. Skalując dla aktywnych kont:
- Warmup (browse + upvote): ~500 MB - 1 GB / mc / konto
- Aktywne (DM + monitoring): ~1-3 GB / mc / konto
- **Per 10 kont (max na Pro plan): ~10-30 GB/mc** → bundle 50 GB ($66.50) starcza na 1.5-5 miesiąca

**Total miesięczny koszt operacyjny dla 10 kont Reddit/LinkedIn:**
- Plan: $9
- Traffic (50 GB amortyzowany na ~3 mc): ~$22/mc
- **Razem: ~$31/mc dla 10 kont = ~$3/konto/mc** (albo ~$0.10/konto/dzień)

Mobile (4G LTE) wracamy tylko jeśli residential nie wystarczy — wtedy +$0.30-1/konto/mc dorzucone.

### Już dostępny proxy pool

Z `mcp__gologin-mcp__get_proxy_v2`:
- **8 residential proxy już zaprovisowanych** (provider: `geo.floppydata.com`):
  - US x2 (Oak Lawn IL, Santa Clara CA)
  - GB x2
  - DE (Lichtenfels)
  - FR, CA, AU
- Wszystkie `connectionType: "resident"`, status `true`
- **2 GB residential traffic** już opłacone, użyte 0.09 GB → starcza na pełen test fazy 1 bez kupowania niczego

**Konsekwencja:** Faza 1 nie wymaga "pre-work zakupu paczki traffic". Proxy są, traffic jest. Wystarczy w kodzie powiedzieć GoLoginowi żeby z nich korzystał.

---

## Plan naprawczy (w kolejności priorytetu)

### Faza 0 — Model browser_profiles: 1 proxy = 1 profil GoLogin = N kont (różne platformy)

**Twarda reguła architektoniczna:**
```
1 residential proxy ≡ 1 GoLogin profile ≡ N social_accounts
                                          (max 1 per platforma)
```

- ✅ 1 profil GoLogin może mieć: 1× Reddit + 1× LinkedIn + 1× X + 1× Gmail (różne platformy → wygląda jak normalny człowiek z jednego komputera)
- ❌ 1 profil GoLogin NIE może mieć: 2× Reddit (alt account = ban evasion → instant ban)
- ❌ 2 profile GoLogin NIE mogą dzielić 1 proxy

**Math dla 5R+3L+2X (typowy power user):**
- 5 profili GoLogin (Reddit = wąskie gardło: 5 kont = 5 osobnych profili)
- 5 residential proxy
- Upakowanie: 3 profile mają (Reddit+LinkedIn+X), 2 profile mają tylko Reddit
- Mieści się w Pro plan ($9/mc, 10 slotów). 11+ kont → Business plan.

**Schema (nowa migracja `00027_browser_profiles.sql`):**

```sql
CREATE TABLE browser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gologin_profile_id text UNIQUE NOT NULL,
  gologin_proxy_id text UNIQUE NOT NULL,
  country_code text NOT NULL,
  timezone text NOT NULL,
  locale text NOT NULL,
  display_name text,                -- np. "US-1" albo auto-generated
  created_at timestamptz DEFAULT now()
);

ALTER TABLE social_accounts
  ADD COLUMN browser_profile_id uuid REFERENCES browser_profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT one_account_per_platform UNIQUE (browser_profile_id, platform);

-- Po backfillu zdropować duplikaty:
ALTER TABLE social_accounts
  DROP COLUMN gologin_profile_id,
  DROP COLUMN proxy_id;

-- RLS: browser_profiles widzi tylko owner; cross-tenant blocked
```

**UX — user widzi tylko "Dodaj konto":**

UI flow jest taki sam jak dotychczas: user klika "Dodaj konto Reddit" → przeskakuje do GoLogin Cloud Browser z ekranem logowania Reddita. **Zero dodatkowych pytań, zero ekranów, zero słów typu "setup/bundle/profil/persona".** Cała mechanika alokacji dzieje się serwerowo i niewidocznie.

**Algorytm serwerowy (transparentny dla usera):**

```ts
// src/features/accounts/actions/account-actions.ts
async function connectAccount(userId, platform) {
  const country = await deriveCountryFromCampaign(userId)  // domyślnie 'US'

  // 1. Auto-reuse: znajdź istniejący profil tego usera w tym kraju,
  //    który nie ma jeszcze konta na tej platformie
  let bp = await db.browser_profiles.findFirst({
    where: {
      user_id: userId,
      country_code: country,
      id: { notIn: db.social_accounts.platforms(platform).profileIds() }
    }
  })

  // 2. Jeśli brak — stwórz nowy (alokuj proxy z GoLogin pool, twórz GoLogin profile)
  if (!bp) {
    const proxy = await allocateGoLoginResidentialProxy(country)
    const gologinProfileId = await createGoLoginProfile({
      countryCode: country,
      proxyId: proxy.id,
      timezone: timezoneFor(country),
      locale: localeFor(country)
    })
    bp = await db.browser_profiles.insert({
      user_id: userId, gologin_profile_id: gologinProfileId,
      gologin_proxy_id: proxy.id, country_code: country, ...
    })
  }

  // 3. Linkuj nowe konto i zwróć Cloud Browser URL do logowania
  await db.social_accounts.insert({ ..., browser_profile_id: bp.id })
  return await startCloudBrowser(bp.gologin_profile_id)
}
```

Skutki uboczne tej logiki — user ich nie widzi, ale system je egzekwuje:
- Pierwsze 3 konta różnych platform (Reddit, LinkedIn, X) → wszystkie trafiają do tego samego browser_profile (oszczędność slotów)
- 4. konto Reddit → automatycznie nowy browser_profile + nowy proxy (bo poprzedni już ma Reddit)
- Dla power usera 5R+3L+2X system silently tworzy dokładnie 5 browser_profiles

**Edge case "country mismatch":** Jeśli istniejące profile usera są US ale nowa kampania targetuje DE — algorytm tworzy nowy profil DE (nie reuse US). Country derivowane z kampanii/produktu, nie z dotychczasowych profili.

**Migracja danych:** Wszystkie obecne konta to test data → usunąć w pre-launch i zacząć ze świeżym schematem. Nie traci się produkcyjnych danych.

**Krytyczne pliki:**
- `supabase/migrations/00027_browser_profiles.sql` (NEW)
- `src/features/browser-profiles/` (NEW directory — actions, components, types)
- [src/features/accounts/actions/account-actions.ts:44-62](../src/features/accounts/actions/account-actions.ts#L44-L62) — refactor: connect TO existing browser_profile lub create new
- [src/lib/action-worker/worker.ts](../src/lib/action-worker/worker.ts) — odczytywać `gologin_profile_id` z `browser_profiles` przez JOIN, nie z `social_accounts` bezpośrednio
- [src/features/accounts/lib/types.ts](../src/features/accounts/lib/types.ts) — `SocialAccount` traci `gologin_profile_id`/`proxy_id`, dostaje `browser_profile_id`

### Faza 1 — Stop the bleeding: GoLogin GeoProxy per profil (CRITICAL)

**Cel:** Każdy nowy `browser_profile` tworzony przez kod **musi** używać GoLogin residential GeoProxy z geo dopasowanym do `country_code` — nigdy więcej `mode: "gologin"`. Wszystkie social_accounts dołączone do tego profilu (max 1 per platforma) korzystają z tego samego proxy + fingerprint.

**Pre-work:** Pominięte — proxy pool i traffic balance już są (patrz sekcja wyżej). Jedyna rzecz: jeśli targetujemy rynek poza obecnym pool (PL, JP, BR), dokupić proxy w panelu albo poprzez `mcp__gologin-mcp__post_proxy_add_proxies`. Na start wystarczą obecne 8.

**Zmiany w kodzie:**

1. **`src/lib/gologin/client.ts:41-73`** — `createProfile` przyjmuje `countryCode: string`. Dwa warianty implementacji:

   **Wariant A (rekomendowany):** Listujemy obecne proxy via `GET /proxy/v2`, znajdujemy wolny (`profilesCount: 0`) z matching country, przypisujemy via `proxyId`:
   ```ts
   const proxies = await fetch(`${GOLOGIN_API}/proxy/v2`, ...)
   const proxy = proxies.find(p => p.country === countryCode && p.profilesCount === 0)
   body: { ..., proxy: { id: proxy.id, mode: "geolocation" } }
   ```

   **Wariant B (prostszy, mniej kontroli):** GoLogin sam wybiera z geolocation pool:
   ```ts
   proxy: {
     mode: "geolocation",
     autoProxyRegion: countryCode,
     autoProxyCity: ""
   }
   ```

   W obu wariantach dopasować timezone/locale do country (mapowanie: US→`America/New_York`+`en-US`, GB→`Europe/London`+`en-GB`, DE→`Europe/Berlin`+`de-DE`). Po stworzeniu profilu **zawsze** wywołać `patch_profile_fingerprints` żeby wymusić unikalny fingerprint.

2. **`src/features/accounts/actions/account-actions.ts:44-62`** — derive country z user input (kampanii/produktu). Zapisać `country_code` w `browser_profiles` (nie `social_accounts`).

3. **Backfill istniejących kont:** wszystkie obecne to test data → wymieść i zacząć od świeżego schematu z proper proxy od day 1.

**Krytyczne pliki:**
- [src/lib/gologin/client.ts:41-73](../src/lib/gologin/client.ts#L41-L73)
- [src/features/accounts/actions/account-actions.ts:44-62](../src/features/accounts/actions/account-actions.ts#L44-L62)
- `supabase/migrations/00027_browser_profiles.sql`

### Faza 2 — Persystencja cookies & sesji

Obecnie [adapter.ts:125-146](../src/lib/gologin/adapter.ts#L125-L146) zamyka browser i `stopCloudBrowser` po każdej akcji → cookies tracone, każda akcja = świeże logowanie = czerwona flaga dla Reddita.

**Fix:** Po każdej sesji wywołać `GET /browser/{id}/cookies`, zapisać do `browser_profiles.cookies_jar JSONB`, a przed kolejną sesją wywołać `POST /browser/{id}/cookies` żeby przywrócić. Dodatkowo nie zamykaj browsera natychmiast — zostaw idle 30-60s żeby Reddit nie widział "fast in/out" wzorca.

**Pliki:**
- `src/lib/gologin/adapter.ts` — dodać `saveCookies()` / `restoreCookies()`
- `supabase/migrations/00028_cookie_jar.sql` — kolumna `cookies_jar JSONB` w `browser_profiles`
- `src/lib/action-worker/worker.ts:705-711` — saveCookies przed `releaseProfile`

### Faza 3 — Realny warmup (nie tylko time-based)

Obecny warmup ([warmup/route.ts:45](../src/app/api/cron/warmup/route.ts#L45)) tylko inkrementuje `warmup_day`. **Konto na day 8 wciąż ma 0 karmy i 0 postów.** Reddit wykrywa to natychmiast.

**Fix:** Cron `warmup-reddit-activity` (1x dziennie per konto):
- Day 1-3: tylko browse, scroll, ~5-10 min sesji w randomowych safe subreddits
- Day 4-7: 1-3 upvote'y dziennie w popularnych subach (r/AskReddit, r/todayilearned, etc.)
- Day 8-14: 1 komentarz dziennie w niskim-stake subreddicie (np. r/CasualConversation)
- Day 15+: dopiero teraz dopuszczamy DM (≤2/dzień przez kolejne 2 tygodnie)

**Pliki:**
- `src/app/api/cron/warmup-reddit-activity/route.ts` (NEW)
- `vercel.json` — dodać schedule
- `src/lib/computer-use/actions/reddit-warmup.ts` (NEW) — prompty CU dla browse/upvote/comment

### Faza 4 — Detekcja banów / captcha / shadowbanów (pre + post action)

**Pre-action preflight:** Przed każdą akcją wywołaj `GET https://www.reddit.com/user/{username}/about.json` (przez sam proxy konta, bez auth):
- `data.is_suspended` → ban
- `data.total_karma` < 5 → wciąż za świeży na DM
- HTTP 404 → konto skasowane
- Jeśli content nie zawiera username przy logowanym whoami — shadowban

**Post-action detection w CU:** Dodać do `executeCUAction` ([executor.ts](../src/lib/computer-use/executor.ts)) custom tool `detect_ban_state` z promptem dla Haiku: "Czy widzisz na ekranie modal 'You broke a rule', 'account suspended', captcha, lub komunikat o rate limit? Zwróć JSON `{banned, captcha, suspended, rate_limited}`". Jeśli dowolny `true` → `health_status = "banned"`, halt action, alert user.

**Pliki:**
- `src/features/accounts/lib/reddit-preflight.ts` (NEW)
- `src/lib/computer-use/executor.ts` — nowy tool
- `src/lib/action-worker/worker.ts:78-125` — preflight gate przed execution

### Faza 5 — Account creation hygiene + kosmetyka anty-detekcyjna

**Account creation hygiene (KRYTYCZNE po nowej diagnozie):**
- Brand new Reddit konto **MUSI** być założone z poziomu profilu GoLogin z **już-podpiętym proxy + spójnym timezone + spójnym locale**. Nigdy na własnym IP, nigdy z mismatch geo↔language.
- Mapping country → timezone → locale (jednolity stack):
  - US → `America/New_York` + `en-US`
  - GB → `Europe/London` + `en-GB`
  - DE → `Europe/Berlin` + `de-DE`
  - PL → `Europe/Warsaw` + `pl-PL`
- **Slow signup:** między utworzeniem GoLogin profilu a Reddit signupem odczekać 24h (browse innych stron przez profil — Google, news sites, YouTube). Reddit łączy "newly active fingerprint" + "instant signup" jako bot signal.
- **Po signupie odczekać 48-72h zanim cokolwiek zrobimy** — żadnych follow/upvote w pierwszej dobie.
- **Email verification:** użyć email z aged domeny (Gmail/Outlook konta starszego niż 6 mc), NIE temp-mail/SimpleLogin/aliasów.

**Mobile fallback (gdy residential nie wystarcza):**
- Endpoint `mcp__gologin-mcp__post_users_proxies_mobile_proxy` daje dostęp do mobilnych 4G LTE
- Cennik: 5 GB → $9.25 ($1.85/GB), 10 GB → $18.50, 50 GB → $79.50
- Per konto Reddit ~1-3 GB/mc → mobile = +$2-5/konto/mc na top of residential
- Strategia: **residential domyślnie**, mobile dla VIP kont (najwyższy DM volume) i dla rynków gdzie residential GoLogin łapie bany

**Standardowa kosmetyka:**
- **Rotacja UA:** raz na 7-14 dni per profil wywołać `patch_profile_update_ua_to_new_browser_v` (GoLogin auto-pick aktualnej Chrome)
- **Concurrency cap:** max 1 profil GoLogin uruchomiony per Vercel function execution. Dodać semafor w Postgres advisory lock.
- **Limit dziennego DM** zejść z 8 → **2-3** dla pierwszych 30 dni życia konta.
- **WebRTC mode** ustawić na "alerted" (proxy IP) we wszystkich profilach — domyślnie GoLogin to robi, ale weryfikujmy.

---

## Verification (jak zweryfikować end-to-end)

1. **Smoke test świeżego konta:**
   - Stwórz nowe konto Reddit (manualnie, **z proxy GoLogin już podpiętym** — nie na lokalnym IP)
   - Odczekaj 7 dni z włączonym warmup-reddit-activity (browse + upvote)
   - Po 7 dniach zaloguj się do GoLogin profile, sprawdź `/r/popular` — czy konto żyje
   - Cel: 0 banów na 5 świeżych kontach po 7 dniach

2. **Test integracyjny proxy:**
   - W GoLogin desktop otwórz profil, wejdź na `whatismyipaddress.com` — IP musi być residential (NIE datacenter), ASN zgodny z prawdziwym ISP, country zgodny z `country_code` profilu
   - Wejdź na `browserleaks.com/ip` — sprawdź WebRTC leak (musi pokazywać proxy IP, nie real), DNS (powinien być proxy-side), timezone
   - W DevTools `console.log(navigator.userAgent)` — UA powinien się różnić między profilami
   - Sprawdź w MCP `mcp__gologin-mcp__get_users_proxies_geolocation_traffic` czy traffic się konsumuje proporcjonalnie (kontrola kosztu)

3. **Test detekcji banów:**
   - Manualnie zbanuj testowe konto (post w sub gdzie cię zbanują)
   - Odpal akcję na tym koncie
   - Cel: preflight wykrywa ban, akcja nie startuje, `health_status` → `banned`

4. **Sprawdź żywotność profili w MCP:**
   ```
   mcp__gologin-mcp__get_workspaces__wid__profiles_count
   mcp__gologin-mcp__get_profile__id__cookies (po sesji — powinny być cookies)
   ```

---

## Co zostawiamy poza scope

- **Mobile proxy GoLogin ($30+/seat/mc) przez `post_users_proxies_mobile_proxy`** — nie potrzebujemy na obecnym volume. Wracamy gdy zaczniemy łapać bany na GeoProxy residential albo gdy podniesiemy DM/dzień powyżej 10.
- **Bring-your-own proxy (IPRoyal/Soax) przez `add_proxies`** — odpada przy decyzji Opcja B. Wracamy tylko jeśli GoLogin GeoProxy okaże się problematyczne (np. ich pool też dostanie burn).
- **Zakup postarzonych kont** — szara strefa prawnie + ryzyko Reddit-side. Najpierw sprawdźmy czy świeże konta z dobrym warmupem + proper proxy przeżywają.
- **Reddit OAuth API jako fallback** — to zupełnie inna ścieżka, byłaby rewriteem warstwy akcji. Osobny epic.
- **Stealth-plugin do Playwright** — GoLogin Orbita robi większość fingerprintu; jeśli po fazach 1-5 nadal lecą bany, wtedy się tym zajmiemy.

---

## Kolejność wykonania

1. **Faza 0 (browser_profiles + UX flow)** — fundament. Bez tabeli `browser_profiles` Faza 1 nie ma gdzie zapisać proxy/fingerprint mappingu, a UI nie wie jak grupować konta. ~3 dni.
2. **Faza 1 (residential GeoProxy)** — proxy isolation per browser_profile. Bez tego cała reszta jest bez sensu, bo IP jest spalone. ~2 dni.
3. **Faza 4 (preflight detekcja)** — żeby bot nie wystrzeliwał DMów na konta zbanowane. ~2 dni.
4. **Faza 2 (cookies)** — szybkie zwycięstwo, ~1 dzień.
5. **Faza 3 (realny warmup)** — większa robota, wymaga nowego cron + CU promptów. ~3-4 dni.
6. **Faza 5 (account creation hygiene + kosmetyka)** — defense-in-depth na końcu. ~2-3 dni.

Razem ~13-15 dni roboczych pełnego scope. **Fazy 0 + 1 razem** rozwiązują ~80% problemu w ~5 dni.
