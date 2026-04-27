---
sketch: 001
name: pricing-page
question: "Jak slider + comparison table 4-kolumnowa razem komunikują 'wybierz plan na podstawie skali outreachu'?"
winner: null
tags: [pricing, landing, slider, table]
---

# Sketch 001: Pricing Page

## Design Question

Layout publicznej `/pricing` strony repco.ai — comparison table 4-kolumnowa (Free/Monthly/Quarterly/Annual) z interaktywnym sliderem nad tabelą, który pyta "ile DMs/m chcesz wysyłać" i podświetla rekomendowaną kolumnę. Pytanie: które wykonanie tej koncepcji daje najlepszy balans między czytelnością tabeli a "feel" interakcji ze sliderem.

Wszystkie 3 variants mają **identyczne dane** (te same plany, te same wiersze, ten sam slider math) — różnią się **wyłącznie wizualnym treatmentem highlight'u kolumny + sticky behavior**.

## How to View

```
open .planning/sketches/001-pricing-page/index.html
```

Slider math:
- ≤5 DMs/m → **Free** (monitoring only banner)
- 6-50 → **Monthly** ($49)
- 51-100 → **Quarterly** ($35/mo)
- 101+ → **Annual** ($25/mo)

## Variants

- **A: Quiet** — minimalistyczna tabela, slider above, highlight rekomendowanej kolumny przez subtle `--color-primary-soft` background fill + 1px border ring na headerze. Konserwatywne, professional, niski wizualny "noise". Best for: audiences that scan tables (power users comparison shopping).

- **B: Bold** — slider above + agresywniejszy highlight: gradient fill na całą kolumnę, glow shadow na headerze, **scale translate-y -4px** na rekomendowanej kolumnie (wyskakuje do przodu), kolor ceny zmienia się na primary/accent. Annual ma stronger "Best value · save 49%" badge. Best for: PLG-friendly, "fun", retencja uwagi.

- **C: Sticky interactive** — slider w **sticky strip** pod variant nav (zostaje na ekranie przy scrollowaniu w dół), kolumny tabeli mają **kolorowe top stripes** per plan (zinc / indigo light / indigo / cyan accent), highlight via `scale(1.03)` + glow. Plus FAQ section pod spodem żeby było co scrollować i poczuć sticky behavior. Best for: long landing page with multiple sections, slider zostaje "dotykalny".

## What to Look For

1. **Slider feel** — drag slider, sprawdź czy highlight przechodzi płynnie między kolumnami. Czy delay/animation czuje się natural?
2. **Recommendation copy** — czy "$49/mo · enough credits for ~60 DMs after monitoring" tłumaczy "value per dollar" wystarczająco jasno bez wpadania w burn-rate territory?
3. **Free tier framing** — przesuń slider na 0-5. Banner "Free is monitoring only — upgrade to send messages" — czy to motywuje do upgrade czy frustruje?
4. **Best value** — Annual ma 2 badge'y w wariancie B ("Best value · save 49%") vs jeden w A i C. Który czyta się lepiej?
5. **Density** — czy tabela ma za dużo wierszy? (7 obecnie). Czy któreś można połączyć?
6. **Mobile** — zwęź window do <900px — table degraduje do single column. Czy to wciąż czyta się sensownie?
7. **Bez burn math** — verify: nigdzie nie ma "X cr/day", "wystarczy na N dni", "burn rate". Tylko monthly credits totals + "enough for ~Y DMs" hint przy sliderze.

## Open Questions for Decision

- Czy slider zostawiamy w MVP (pre-launch) czy odpalamy bez niego (faster ship)?
- Czy "Best value" Annual potrzebuje hard discount badge ("save 49%") czy subtelne "Best value" wystarczy?
- Czy potrzeba osobny CTA dla annual (np. "Start annual — save $288") czy ten sam wzór "Start [plan]" co reszta?
- FAQ pod tabelą (jak w wariancie C) — w jakim wariancie ostatecznie? Wszystkich? Tylko C?
