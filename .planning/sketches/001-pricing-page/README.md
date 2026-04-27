---
sketch: 001
name: pricing-page
question: "Two-section design: Free-vs-Paid decision + tier picker — czy to czyściej niż comparison table z 4 kolumnami i 7 wierszami 'unlimited × N'?"
winner: null
tags: [pricing, landing, two-section, tier-picker, billing-toggle]
---

# Sketch 001: Pricing Page (two-section redesign)

## Design Question

Poprzednia iteracja używała comparison table 4-kolumnowej × 7 wierszy. Większość paid tierów ma identyczne features → tabela powtarzała "✓ ✓ ✓ ✓" w 5 wierszach co wyglądało jak fake differentiation.

Reframe: **paid tiery różnią się TYLKO ceną i ilością credits**. Comparison table dla nich nie ma sensu. Więc:

- **Sekcja 1 (Free vs Paid):** dwie duże karty z prawdziwą decyzją — "monitor only" vs "monitor + reach out". Tu są realne differences w features.
- **Sekcja 2 (Tier picker):** 3 paid cards z monthly/annual toggle. Pokazują tylko: cena · credits · "fits ~N DMs". Wszystkie features paid wymienione raz w sekcji "Every paid tier includes".

## How to View

```
open .planning/sketches/001-pricing-page/index.html
```

Slider math (B + C):
- ≤5 DMs/m → no tier highlighted (recommends Free)
- 6-30 → **Starter** ($25/m monthly · $20/m annual)
- 31-100 → **Growth** ⭐ ($59/m monthly · $47/m annual)
- 101+ → **Scale** ($129/m monthly · $103/m annual)

## Variants

- **A: Static** — dwie sekcje, brak slidera, brak sticky. Czysta konstrukcja "decision then volume". Najszybszy do build w real app.

- **B: With slider** — dodaje slider między toggle'em a tier cards. "How many DMs/month?" → highlight rekomendowanej karty (border ring + glow + scale 1.04 dla popular Growth). Slider live-updates.

- **C: Sticky toggle + slider** — toggle + slider sticky pod variant nav. User scrolluje przez tier cards / includes / FAQ a slider zostaje "dotykalny" cały czas. Best for long pages.

## What to Look For

1. **Decision card balance** — Free vs Paid. Czy "from $20/mo" w Paid karcie jest dobrym anchor czy lepiej dać bigger price? Czy `cross` items na Free ("No DMs", "1 account, slower scan") są clear constraint czy negative selling?
2. **Tier picker density** — 3 karty obok siebie (Starter / Growth ⭐ / Scale). Każda: name, price, credits, "fits ~N DMs", CTA. Dużo białej przestrzeni — czy to good breathing room czy puste?
3. **"Most popular" badge na Growth** — w wariancie A/C tylko badge + border. W wariancie B Growth zawsze ma scale 1.04 + glow (więcej attention zawsze). Który feels right?
4. **Slider interplay** (B + C) — drag → highlight tier. Co się dzieje gdy slider trafia w Growth (i tak popular by default)? Double highlight czy override?
5. **"Includes" sekcja** — pod tier cards jedna lista "Every paid tier includes:" z 6 itemami w 2 kolumny. Czy to lepiej niż pokazywanie każdego itema 3× w cards columns?
6. **Annual toggle** — kliknij Monthly ↔ Annual. Cena się zmienia, billing line update'uje na "$240/yr · billed annually". Jasne czy mylące?
7. **Mobile (<800px)** — wszystko w 1 column. Czy decision cards działają stack'owane?

## Open Questions

- Czy cross items na Free karcie (5 features w tym 2 z ✕) to dobry mix czy za dużo "no's"?
- "fits ~25 DMs / month" przy każdym tierze — pre-purchase value calc (dozwolone) czy zaczyna się ślizgać w burn-rate territory?
- Slider w MVP czy odpalamy bez (ship faster)?
- Variants B i C robią dokładnie to samo poza sticky — czy worth utrzymywać oba?
