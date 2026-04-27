---
sketch: 001
name: pricing-page
question: "Jak slider + comparison table 4-kolumnowa + monthly/annual toggle razem komunikują 'wybierz tier na podstawie objętości outreachu'?"
winner: null
tags: [pricing, landing, slider, table, billing-toggle]
---

# Sketch 001: Pricing Page

## Design Question

Layout publicznej `/pricing` strony repco.ai. Trzy interactive elementy do skoordynowania:

1. **Comparison table 4 kolumny** — Free / Starter / Growth ⭐ / Scale
2. **Monthly/Annual toggle** nad tabelą (orthogonal -20%)
3. **Slider "ile DMs/m"** z highlight rekomendowanej kolumny

Pytanie: które wykonanie tej koncepcji daje najlepszy balans między czytelnością tabeli a "feel" interakcji ze sliderem + toggle. Wszystkie 3 variants mają **identyczne dane** — różnią się **wyłącznie wizualnym treatmentem highlight'u kolumny + sticky behavior**.

## How to View

```
open .planning/sketches/001-pricing-page/index.html
```

Slider math (z [PRICING.md §2](../../PRICING.md)):
- ≤5 DMs/m → **Free** (banner: "monitoring only — upgrade to send messages")
- 6-30 → **Starter** ($25/m monthly · $20/m annual)
- 31-100 → **Growth** ⭐ ($59/m monthly · $47/m annual)
- 101+ → **Scale** ($129/m monthly · $103/m annual)

Annual toggle powoduje:
- Ceny w nagłówkach przełączają się na effective monthly ($25→$20, $59→$47, $129→$103)
- Pojawia się second line: "$240/yr", "$566/yr", "$1 238/yr"
- Slider rekomendacja "$25/mo" → "$20/mo billed annually"

## Variants

- **A: Quiet** — minimalistyczna tabela, slider above, highlight rekomendowanej kolumny przez subtle `--color-primary-soft` background fill + 1px border ring na headerze. Konserwatywne, professional, niski wizualny "noise".

- **B: Bold** — slider above + agresywniejszy highlight: gradient fill na całą kolumnę, glow shadow na headerze, **scale translate-y -4px** na rekomendowanej kolumnie (wyskakuje do przodu), kolor ceny zmienia się na primary. Best for: PLG-friendly, "fun".

- **C: Sticky interactive** — slider w **sticky strip** pod variant nav (zostaje na ekranie przy scrollowaniu), kolumny tabeli mają **kolorowe top stripes** per plan (zinc / indigo light / indigo / cyan), highlight via `scale(1.03)` + glow. Plus FAQ section pod spodem.

## What to Look For

1. **Slider feel** — drag slider, sprawdź czy highlight przechodzi płynnie między 4 kolumnami zgodnie z math powyżej.
2. **Toggle interplay** — przełącz monthly ↔ annual, sprawdź czy:
   - Ceny w nagłówkach update'ują się płynnie
   - Slider recommendation "why" copy też się przełącza ("$25/mo" vs "$20/mo billed annually")
   - "Save 20%" badge na annual button czy się komunikuje wartość
3. **Free framing** — przesuń slider na 0-5. Recommendation: "Free · monitoring only — upgrade to send messages". Czy to motywuje do upgrade?
4. **Most popular** — Growth ma badge "Most popular" zawsze. Czy w wariancie B (gdzie jest scale + glow) wystarczająco wybija się wśród rekomendacji?
5. **Density** — 7 wierszy tabeli. Wszystkie paid mają identyczne ✓✓✓ na większości wierszy — czy to dobrze (clear "you only pay for volume") czy nudno (looks like fake differentiation)?
6. **Annual badge spot** — czy "Save 20%" w toggle pillu jest czytelne, czy potrzeba dodatkowo na całej annual column?
7. **Mobile** — zwęź window do <900px → tabela degraduje do single column.
8. **Bez burn math** — verify: nigdzie nie ma "X cr/day", "wystarczy na N dni", "burn rate". Tylko monthly credits totals + "fits ~Y DMs" hint przy sliderze (pre-purchase value calc).

## Open Questions

- Czy "Most popular" Growth potrzebuje silniejszego visual treatment (np. większa karta zawsze, niezależnie od slidera)?
- Save 20% — communicate jako badge w pillu (current) czy jako floating banner pod tabelą (np. "→ Save $144/yr by paying upfront")?
- Czy slider w MVP czy odpalamy bez (faster ship)?
- FAQ pod tabelą — w jakim wariancie ostatecznie? (Wariant C ma).
