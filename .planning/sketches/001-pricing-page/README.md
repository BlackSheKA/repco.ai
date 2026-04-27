---
sketch: 001
name: pricing-page
question: "Free + Pro + credit packs: czy 1 plan paid + scale-by-packs jest czytelniejszy niż 3 volume tiers?"
winner: null
tags: [pricing, landing, free-pro, packs, billing-toggle]
---

# Sketch 001: Pricing Page (Free + Pro + Packs)

## Design Question

Iteracje:
1. v1: Comparison table 4 cols (Free/Monthly/Quarterly/Annual) — broken (annual = 0% margin)
2. v2: Volume tiers (Free/Starter/Growth/Scale) — paid tiery różniły się **tylko credits**, fake differentiation w wierszach
3. **v3 (current): Free + Pro + Packs** — jedna decyzja "płacić czy nie", scale przez credit packs

Filozofia: **plan = unlock**, **packs = volume**. Nie zmuszamy usera do wyboru "który tier" gdy jedyna różnica to liczba kredytów.

## How to View

```
open .planning/sketches/001-pricing-page/index.html
```

**Plan struktura:**

| | Free | Pro |
|---|---|---|
| Monthly | $0 | $49/m |
| Annual | — | $39/m ($468/yr, save 20%) |
| Credits | 250/m | 2 000/m |

**Packs** (one-time top-up, never expire):
- Starter 500 cr / $29
- Growth 1 500 cr / $59
- Scale 5 000 cr / $149 ⭐
- Agency 15 000 cr / $399

Slider math (B + C):
- ≤5 DMs/m → "Free is enough"
- 6-50 → "Pro alone covers it"
- 51-80 → Pro + Starter pack
- 81-130 → Pro + Growth pack
- 131-200 → Pro + Scale pack
- 200+ → Pro + Agency pack

## Variants

- **A: Static** — billing toggle, 2 plan cards (Free / Pro), 4 pack cards static, includes section, FAQ. Najczystszy, najszybszy do build.

- **B: With slider** — dodaje slider między packs head a packs grid. Slider pyta "ile DMs/m" → text recommendation + highlight rekomendowanego packa (border ring + glow).

- **C: Sticky toggle** — billing toggle sticky pod variant nav. Slider w packs section. Najwięcej "always-tactile" feel.

## What to Look For

1. **Plans card balance** — Free vs Pro side-by-side. Pro ma `.pro` border + glow primary. Czy odróżnia się wystarczająco bez przesady?
2. **Annual toggle effect** — kliknij Monthly ↔ Annual. Pro price: $49 → $39, billing line: "billed monthly · cancel anytime" → "$468/yr · billed annually". Free się nie zmienia.
3. **Packs grid** — 4 karty w rzędzie. Scale (Most popular) ma badge + border. Czy grid wygląda balanced czy jedna karta dominuje?
4. **Slider recommendation copy** (B + C) — drag slider, recommendation text update'uje się ("Pro alone covers it" → "Pro + 1× Starter pack" → ...). Highlight przeskakuje przez packs. Płynne czy juj?
5. **"Includes" sekcja** — "Pro includes" jako reminder co user dostaje za $49/m. 6 itemów w 2 kolumny. Lepiej zostawić czy wywalić (info już w Pro karcie)?
6. **Mobile (<800px)** — plans stack 1 col, packs 2×2 grid. Working?
7. **Bez burn math** — verify: pre-purchase value calc OK ("fits ~50 DMs"), ale brak "wystarczy na N dni", "burn rate", countdown.

## Open Questions

- Free karta ma 2 cross items + 2 check items. Czy to clear constraint czy negative selling?
- Pro card price font (3.25rem) vs Free price font (3.25rem) — równa wielkość, ale Pro ma glow + border. Czy Pro czyta się jako "primary CTA" czy jako "alternative"?
- Slider w packs section sugeruje że user **musi kupić pack** żeby wysłać >50 DMs. Czy to dobrze (clear scaling path) czy mylące (Pro user nie zawsze chce add packs)?
- Czy "Most popular" badge na Scale pack jest pomocne (większość power user'ów to wybierze) czy zwadliwe (może ludzie kupią Scale gdy wystarczyłby Growth)?
- Cena $49/m vs anchor "$39 annual" — który eksponować na hero?
