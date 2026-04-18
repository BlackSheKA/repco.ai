---
phase: quick
plan: 260418-gom
subsystem: ui/branding
tags: [logo, sidebar, login, theme-aware, svg]
dependency_graph:
  requires: []
  provides: [svg-logo-integration]
  affects: [app-sidebar, login-page]
tech_stack:
  added: []
  patterns: [next/image-svg-import, useTheme-logo-switch, css-dark-variant]
key_files:
  created:
    - src/app/images/repco-light-mode.svg
    - src/app/images/repco-dark-mode.svg
    - src/app/images/repco-bw-mode.svg
    - src/app/images/znak-light-tr.png
    - src/app/images/znak-dark-tr.png
    - src/app/images/znak-3-bg.png
  modified:
    - src/components/shell/app-sidebar.tsx
    - src/app/(auth)/login/page.tsx
decisions:
  - "useTheme for sidebar (client component), CSS dark: variant for login (server component)"
metrics:
  duration: 1min
  completed: 2026-04-18
---

# Quick Task 260418-gom: Replace Text Logos with SVG Images Summary

SVG brand logos replace all text "repco" spans in sidebar and login page with theme-aware image switching.

## What Was Done

### Task 1: Rename Logo Files to Kebab-Case (898e82f)

Renamed all 6 image files in `src/app/images/` from space-separated names to kebab-case:
- `repco light mode.svg` -> `repco-light-mode.svg`
- `repco derk mode.svg` -> `repco-dark-mode.svg` (fixed "derk" typo to "dark")
- `repco bw mode.svg` -> `repco-bw-mode.svg`
- `znak light tr.png` -> `znak-light-tr.png`
- `znak dark tr.png` -> `znak-dark-tr.png`
- `znak 3 bg.png` -> `znak-3-bg.png`

### Task 2: Replace Text Logos with SVG Images (614fc4f)

**app-sidebar.tsx** (client component):
- Added `useTheme` from next-themes and `Image` from next/image
- Imported both light and dark SVG logos as static imports
- `resolvedTheme` switches logo source between light/dark
- Replaced `<span>repco</span>` with `<Image src={logo} alt="repco" height={28} />`

**login/page.tsx** (server component):
- Left panel (always dark bg): Uses `logoDark` at height={48}
- Mobile header: Two `<Image>` elements with `dark:hidden` / `hidden dark:block` CSS classes
- Server Component preserved -- no "use client" needed

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `pnpm typecheck` passes with no errors
- All SVG files correctly renamed and committed
- No text "repco" logos remain in UI components (only metadata title string)
