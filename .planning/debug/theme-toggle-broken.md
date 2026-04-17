---
status: investigating
trigger: "Diagnose why the theme toggle button doesn't work"
created: 2026-04-17T10:00:00Z
updated: 2026-04-17T10:30:00Z
---

## Current Focus

hypothesis: next-themes 0.4.6 has a known React 19 / Next.js 16 incompatibility where setTheme becomes a no-op
test: Verified code structure, bundle output, and RSC payload - all correct. Known GitHub issues confirm the incompatibility.
expecting: Replacing next-themes or implementing a custom ThemeProvider should fix the issue
next_action: Replace next-themes with a custom implementation or upgrade to a React 19 compatible alternative

## Symptoms

expected: Clicking theme toggle cycles through system/light/dark themes
actual: Click does nothing, localStorage.getItem('theme') returns null, HTML class stays "light"
errors: No console errors reported
reproduction: Click the "Toggle color theme" button in the header
started: After migration to React 19 / Next.js 16

## Eliminated

- hypothesis: Duplicate next-themes module instances causing context identity mismatch
  evidence: Only one copy at node_modules/.pnpm/next-themes@0.4.6_.../. Both provider and consumer reference identical Turbopack module path.
  timestamp: 2026-04-17T10:05:00Z

- hypothesis: ThemeToggle rendered outside ThemeProvider tree
  evidence: RSC payload shows $L1c (ThemeProvider) wrapping all children including layout-router that renders AppShell > ThemeToggle
  timestamp: 2026-04-17T10:10:00Z

- hypothesis: Duplicate React instances breaking context
  evidence: Both createContext and useContext in bundled code reference same React import. Only one React version (19.2.5) installed.
  timestamp: 2026-04-17T10:12:00Z

- hypothesis: Content Security Policy blocking inline script
  evidence: No CSP headers in middleware or config
  timestamp: 2026-04-17T10:14:00Z

- hypothesis: forcedTheme accidentally set
  evidence: grep for forcedTheme in src/ returns no matches
  timestamp: 2026-04-17T10:15:00Z

- hypothesis: Button component swallowing onClick
  evidence: Button passes {...props} including onClick to the rendered element
  timestamp: 2026-04-17T10:18:00Z

## Evidence

- timestamp: 2026-04-17T10:05:00Z
  checked: pnpm ls next-themes and find for package.json
  found: Single installation at node_modules/.pnpm/next-themes@0.4.6_react-dom@19.2.5_react@19.2.5__react@19.2.5/
  implication: No module identity issues

- timestamp: 2026-04-17T10:08:00Z
  checked: Production bundle chunk a93971d58f5dc53f.js
  found: Both createContext(void 0) for next-themes context and useContext/useTheme reference same React module
  implication: Context should propagate correctly within same bundle

- timestamp: 2026-04-17T10:10:00Z
  checked: RSC flight data from curl http://localhost:3333/login
  found: ThemeProvider ($L1c) wraps body children including layout-router
  implication: Component tree structure is correct

- timestamp: 2026-04-17T10:12:00Z
  checked: next-themes source code (minified in dist/index.mjs)
  found: useState initializer H() returns undefined on server, causing theme state to be undefined after hydration
  implication: Initial theme state is undefined; setTheme should still work when called

- timestamp: 2026-04-17T10:15:00Z
  checked: GitHub issues for next-themes + React 19 compatibility
  found: facebook/react#31576, pacocoursey/next-themes#296, #367, #387 all document React 19 incompatibility
  implication: Known issue with next-themes 0.4.6 and React 19

- timestamp: 2026-04-17T10:20:00Z
  checked: next-themes inline script behavior in React 19
  found: React 19 warns "Scripts inside React components are never executed when rendering on the client" - the dangerouslySetInnerHTML script may not execute during client-side navigation
  implication: Theme initialization script may fail on client-side navigation in React 19

## Resolution

root_cause: next-themes 0.4.6 is incompatible with React 19.2.5 / Next.js 16.1.7. Multiple known issues: (1) useState initializer returns undefined during SSR and React 19 hydration preserves this undefined state, (2) inline script rendered via dangerouslySetInnerHTML inside a React component is never executed on client-side renders in React 19, (3) the library has been effectively abandoned since March 2025 with no React 19 fixes merged.
fix: 
verification: 
files_changed: []
