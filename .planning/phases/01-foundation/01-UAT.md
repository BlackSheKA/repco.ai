---
status: diagnosed
phase: 01-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md]
started: 2026-04-17T09:50:00Z
updated: 2026-04-17T14:57:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `pnpm dev` from scratch. Server boots without errors. Opening http://localhost:3000 loads the app (redirects to /login if not authenticated).
result: pass

### 2. Login Page Layout
expected: Navigating to /login shows a split-layout page: left side has a dark brand panel with repco branding, right side has an auth form with email input, "Send magic link" button, and a Google OAuth button. Responsive on mobile (brand panel hidden or stacked).
result: skipped
reason: User already authenticated, cannot view login page without signing out

### 3. Magic Link Auth Flow
expected: Enter a valid email address and click "Send magic link". A success message or toast appears confirming the link was sent. No console errors.
result: skipped
reason: Requires real email roundtrip, cannot test with Playwright alone

### 4. Auth Redirect
expected: When not logged in, navigating to http://localhost:3000/ redirects to /login. When logged in, navigating to /login redirects to /.
result: pass

### 5. App Shell (Sidebar + Header)
expected: After logging in, the dashboard page shows: a 240px sidebar on the left with 6 nav items (Dashboard, Signals, Approvals, Prospects, Accounts, Settings), user email at the bottom, and a sign-out button. A header bar at the top with a theme toggle and user avatar.
result: pass

### 6. Theme Toggle
expected: Clicking the theme toggle in the header cycles through modes: system -> light -> dark -> system. The page colors change accordingly (dark background in dark mode, light in light mode).
result: issue
reported: "Theme toggle button clicks don't change the theme. localStorage.getItem('theme') returns null after multiple clicks. HTML class stays 'light'. CSS dark mode works when forced manually via JS. setTheme() from next-themes has no effect."
severity: major

### 7. Mobile Sidebar
expected: Resize the browser to mobile width (< 768px). The sidebar is hidden. A hamburger icon appears in the header. Tapping it opens the sidebar as an overlay. Tapping outside or pressing the hamburger again closes it.
result: issue
reported: "Hamburger click doesn't open sidebar as overlay on mobile. Sidebar element disappears entirely from DOM at mobile width. Toggle Sidebar button click has no visible effect."
severity: major

### 8. Sign Out
expected: Click the sign-out button in the sidebar. A confirmation dialog appears asking to confirm. Confirming signs you out and redirects to /login.
result: issue
reported: "AlertDialog confirmation doesn't appear when clicking Sign out. Zero elements with role='alertdialog' found in DOM after clicking. SignOutButton component uses AlertDialog with AlertDialogTrigger but dialog content never renders."
severity: major

## Summary

total: 8
passed: 3
issues: 3
pending: 0
skipped: 2

## Gaps

- truth: "Theme toggle cycles system -> light -> dark and page colors change"
  status: failed
  reason: "User reported: Theme toggle button clicks don't change the theme. localStorage.getItem('theme') returns null after multiple clicks. HTML class stays 'light'. CSS dark mode works when forced manually via JS. setTheme() from next-themes has no effect."
  severity: major
  test: 6
  root_cause: "next-themes 0.4.6 incompatible with React 19.2.5 / Next.js 16.1.7. setTheme() returned by useTheme() is the no-op default. React 19 changed behavior for inline script tags rendered via dangerouslySetInnerHTML inside React components — they never execute on client-side renders, breaking next-themes' flash prevention script and state initialization."
  artifacts:
    - path: "src/components/providers/theme-provider.tsx"
      issue: "Wraps broken next-themes ThemeProvider"
    - path: "src/components/shell/theme-toggle.tsx"
      issue: "Consumes broken useTheme() hook"
    - path: "node_modules/next-themes/dist/index.mjs"
      issue: "Library incompatible with React 19"
  missing:
    - "Replace next-themes with custom ThemeProvider (~50 lines) or @wrksz/themes drop-in replacement"
  debug_session: ".planning/debug/theme-toggle-broken.md"

- truth: "Mobile sidebar opens as overlay when hamburger is tapped"
  status: failed
  reason: "User reported: Hamburger click doesn't open sidebar as overlay on mobile. Sidebar element disappears entirely from DOM at mobile width. Toggle Sidebar button click has no visible effect."
  severity: major
  test: 7
  root_cause: "useIsMobile hook returns false when toggleSidebar is called, causing it to call setOpen (desktop) instead of setOpenMobile (mobile). The hook initializes isMobile as undefined (!!undefined = false) and relies on useEffect + matchMedia, which may not fire correctly when viewport is resized after page load. toggleSidebar branches on stale isMobile value."
  artifacts:
    - path: "src/hooks/use-mobile.ts"
      issue: "useIsMobile initial value is false (!!undefined), timing issue with matchMedia"
    - path: "src/components/ui/sidebar.tsx"
      issue: "toggleSidebar branches on isMobile — calls wrong setter when isMobile is stale"
  missing:
    - "Add console.log to toggleSidebar to verify isMobile at click time"
    - "Ensure useIsMobile correctly handles viewport changes and initial state"
  debug_session: ".planning/debug/mobile-sidebar-not-opening.md"

- truth: "Sign out button shows confirmation dialog before signing out"
  status: failed
  reason: "User reported: AlertDialog confirmation doesn't appear when clicking Sign out. Zero elements with role='alertdialog' found in DOM after clicking. SignOutButton component uses AlertDialog with AlertDialogTrigger but dialog content never renders."
  severity: major
  test: 8
  root_cause: "Radix AlertDialog asChild Slot event handler composition fails with React 19. Known issues with Radix primitives and React 19's ref handling (radix-ui/primitives#3293, #3776). The Slot mergeProps onClick composition doesn't fire the internal onOpenToggle handler. May also be exacerbated by nesting AlertDialog inside Sidebar's Sheet (nested Dialog contexts)."
  artifacts:
    - path: "src/features/auth/components/sign-out-button.tsx"
      issue: "AlertDialog trigger click doesn't open dialog due to Radix/React 19 asChild issue"
    - path: "src/components/ui/sidebar.tsx"
      issue: "On mobile, wraps children in Sheet (Radix Dialog), creating nested Dialog contexts"
  missing:
    - "Convert AlertDialog to controlled mode with explicit open/onOpenChange state"
    - "Add direct onClick handler on trigger button to bypass Radix Slot composition"
  debug_session: ".planning/debug/signout-alertdialog-not-opening.md"
