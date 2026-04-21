---
phase: quick
plan: 260418-gom
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/images/repco-light-mode.svg
  - src/app/images/repco-dark-mode.svg
  - src/app/images/repco-bw-mode.svg
  - src/components/shell/app-sidebar.tsx
  - src/app/(auth)/login/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Sidebar shows SVG logo image instead of text 'repco'"
    - "Login left panel shows dark-mode SVG logo (always dark bg)"
    - "Login mobile header shows theme-aware SVG logo"
    - "Logo switches between light/dark variants when theme toggles"
  artifacts:
    - path: "src/app/images/repco-light-mode.svg"
      provides: "Kebab-case renamed light mode logo"
    - path: "src/app/images/repco-dark-mode.svg"
      provides: "Kebab-case renamed dark mode logo"
    - path: "src/components/shell/app-sidebar.tsx"
      provides: "Sidebar with SVG logo image"
    - path: "src/app/(auth)/login/page.tsx"
      provides: "Login page with SVG logo images"
  key_links:
    - from: "src/components/shell/app-sidebar.tsx"
      to: "src/app/images/repco-*.svg"
      via: "next/image with theme-aware source switching"
      pattern: "Image.*repco"
    - from: "src/app/(auth)/login/page.tsx"
      to: "src/app/images/repco-dark-mode.svg"
      via: "next/image for left panel (always dark bg)"
      pattern: "Image.*repco-dark"
---

<objective>
Replace all text "repco" logos with actual SVG logo files from src/app/images/.

Purpose: Use real brand logos instead of plain text throughout the app.
Output: Sidebar and login page display SVG logo images with proper theme awareness.
</objective>

<execution_context>
@C:/Users/kamil/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/kamil/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/shell/app-sidebar.tsx
@src/app/(auth)/login/page.tsx

Logo files in src/app/images/:
- "repco light mode.svg" — for light theme (dark-colored logo on light bg)
- "repco derk mode.svg" — for dark theme (light-colored logo on dark bg)
- "repco bw mode.svg" — black & white variant (not used in this task)

SVG files are 58-85K tokens — too large to inline. MUST use next/image with file imports.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename SVG files to kebab-case</name>
  <files>src/app/images/repco-light-mode.svg, src/app/images/repco-dark-mode.svg, src/app/images/repco-bw-mode.svg</files>
  <action>
Rename the SVG logo files from space-separated names to kebab-case (project convention):
- `repco light mode.svg` -> `repco-light-mode.svg`
- `repco derk mode.svg` -> `repco-dark-mode.svg` (note: original has typo "derk", rename to "dark")
- `repco bw mode.svg` -> `repco-bw-mode.svg`

Use `git mv` for each file to preserve git history.
  </action>
  <verify>
    <automated>ls src/app/images/repco-*.svg | wc -l</automated>
  </verify>
  <done>All three SVG files renamed to kebab-case, no space-separated filenames remain</done>
</task>

<task type="auto">
  <name>Task 2: Replace text logos with SVG images in sidebar and login page</name>
  <files>src/components/shell/app-sidebar.tsx, src/app/(auth)/login/page.tsx</files>
  <action>
**app-sidebar.tsx** (client component — already has "use client"):

1. Import `Image` from "next/image" and the two logo SVGs:
   ```
   import Image from "next/image"
   import logoLight from "@/app/images/repco-light-mode.svg"
   import logoDark from "@/app/images/repco-dark-mode.svg"
   ```
2. Import `useTheme` from "next-themes" to detect current theme.
3. In the component, add `const { resolvedTheme } = useTheme()` and derive `const logo = resolvedTheme === "dark" ? logoDark : logoLight`.
4. Replace line 53 `<span className="text-xl font-semibold">repco</span>` with:
   ```
   <Image src={logo} alt="repco" height={28} priority />
   ```
   Use height={28} to match the text-xl visual size. Let width auto-scale from SVG aspect ratio.

**login/page.tsx** (server component):

This is a Server Component — cannot use useTheme. Handle each logo placement differently:

1. Import `Image` from "next/image" and the logo SVGs:
   ```
   import Image from "next/image"
   import logoDark from "@/app/images/repco-dark-mode.svg"
   import logoLight from "@/app/images/repco-light-mode.svg"
   ```

2. Left panel (line 14, always dark bg #09090B): Replace `<span className="font-sans text-[40px] text-white">repco</span>` with:
   ```
   <Image src={logoDark} alt="repco" height={48} priority />
   ```
   Always use dark-mode logo since the panel is always dark.

3. Mobile header (line 25, theme-aware): Replace `<span className="font-sans text-2xl">repco</span>` with both logo variants using CSS dark: class to toggle visibility:
   ```
   <Image src={logoLight} alt="repco" height={28} className="dark:hidden" priority />
   <Image src={logoDark} alt="repco" height={28} className="hidden dark:block" priority />
   ```
   This avoids needing "use client" — uses Tailwind dark: variant which works with next-themes class strategy.
  </action>
  <verify>
    <automated>cd C:/Users/kamil/Code/repco.ai && pnpm typecheck</automated>
  </verify>
  <done>
- Sidebar shows theme-aware SVG logo (switches on theme toggle)
- Login left panel shows dark-mode SVG logo (always dark bg)
- Login mobile header shows theme-aware SVG logo via CSS dark: variant
- No text "repco" logos remain in the codebase (except metadata title strings)
- TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. `pnpm typecheck` passes — no type errors from Image imports or useTheme usage
2. `pnpm build` succeeds — server/client component boundaries respected
3. Visual check: sidebar logo visible in both light and dark themes
4. Visual check: login page left panel shows logo on dark background
5. Visual check: login mobile header shows theme-appropriate logo
</verification>

<success_criteria>
- All three SVG files renamed to kebab-case
- Zero text "repco" logos remain in UI components (metadata title strings are fine)
- Sidebar logo is theme-aware (light/dark switching)
- Login left panel always shows dark-mode logo
- Login mobile header is theme-aware without requiring "use client"
- TypeScript and build pass cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/260418-gom-ustaw-logo-na-te-z-katalogu-src-app-imag/260418-gom-SUMMARY.md`
</output>
