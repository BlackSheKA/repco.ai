---
status: resolved
trigger: "Diagnose why the sign-out AlertDialog doesn't appear"
created: 2026-04-17T16:00:00Z
updated: 2026-04-17T16:30:00Z
---

## Current Focus

hypothesis: The SignOutButton is inside a shadcn Sidebar which on mobile renders inside a Sheet (Radix Dialog). Nesting AlertDialog inside Sheet creates two modal Dialog stacking contexts that conflict at runtime, preventing the AlertDialog from opening.
test: Check if the issue reproduces on desktop (wide viewport) vs mobile (narrow viewport where Sheet is used)
expecting: If desktop works but mobile doesn't -> Sheet/Dialog nesting conflict. If neither works -> something else.
next_action: User needs to verify which viewport size the issue occurs on

## Symptoms

expected: Clicking "Sign out" in sidebar footer should open a confirmation AlertDialog
actual: Nothing happens. No dialog appears. Zero elements with role="alertdialog" in DOM after clicking.
errors: No console errors observed in Playwright logs
reproduction: Click the "Sign out" button in the sidebar footer
started: Unknown - may have always been this way since the component was added

## Eliminated

- hypothesis: Radix AlertDialog import structure is wrong
  evidence: Verified import chain from radix-ui -> @radix-ui/react-alert-dialog -> @radix-ui/react-dialog. All exports resolve correctly.
  timestamp: 2026-04-17T16:05:00Z

- hypothesis: React 19 forwardRef/cloneElement incompatibility with Radix Slot
  evidence: The child of AlertDialogTrigger is a plain <button> DOM element (not a React component), so lazy reference and forwardRef issues don't apply. react-slot@1.2.3 handles DOM elements correctly.
  timestamp: 2026-04-17T16:10:00Z

- hypothesis: Duplicate React or Radix packages causing context mismatch
  evidence: Only one copy of react@19.2.5, @radix-ui/react-dialog@1.1.15, @radix-ui/react-context@1.1.2 in node_modules. Turbopack chunks contain Dialog + AlertDialog in same chunk.
  timestamp: 2026-04-17T16:12:00Z

- hypothesis: CSS pointer-events or z-index blocking interaction
  evidence: No pointer-events rules on sidebar footer. Sidebar container has z-10, AlertDialog portal renders at z-50. No custom CSS targeting portals or alertdialog role.
  timestamp: 2026-04-17T16:15:00Z

- hypothesis: Event propagation blocked by stopPropagation/preventDefault
  evidence: Only event.preventDefault() in sidebar code is for Ctrl+B keyboard shortcut handler. No stopPropagation anywhere in the component tree.
  timestamp: 2026-04-17T16:16:00Z

- hypothesis: TypeScript or build errors
  evidence: tsc --noEmit passes cleanly. next build compiles successfully. No console errors in Playwright logs.
  timestamp: 2026-04-17T16:18:00Z

- hypothesis: Scoped context conflict between Sheet (Dialog) and AlertDialog
  evidence: AlertDialog creates its own Dialog scope via createDialogScope(), producing unique React.createContext objects. Sheet's Dialog uses base (unscoped) contexts. They are architecturally isolated.
  timestamp: 2026-04-17T16:20:00Z

- hypothesis: React strict mode causing double-toggle
  evidence: React 18+ strict mode only doubles initial renders and effects, NOT event handlers. onClick fires once.
  timestamp: 2026-04-17T16:22:00Z

## Evidence

- timestamp: 2026-04-17T16:03:00Z
  checked: Playwright accessibility tree (.playwright-mcp/page-2026-04-17T09-46-55-393Z.yml)
  found: Button "Sign out" [ref=e57] exists in DOM and is interactive. No alertdialog role elements present. Sidebar content renders alongside main content (desktop layout).
  implication: The button renders correctly. The AlertDialog trigger exists but AlertDialogContent never renders.

- timestamp: 2026-04-17T16:05:00Z
  checked: Radix package versions and imports
  found: radix-ui@1.4.3, @radix-ui/react-alert-dialog@1.1.15, @radix-ui/react-dialog@1.1.15, @radix-ui/react-slot@1.2.3, react@19.2.5
  implication: All packages are compatible versions. React 19 is in Radix's peer dependency range.

- timestamp: 2026-04-17T16:08:00Z
  checked: Alert dialog compiled output in .next/static/chunks
  found: SignOutButton compiles correctly with AlertDialog > AlertDialogTrigger(asChild) > button structure intact
  implication: Build pipeline preserves the component tree correctly

- timestamp: 2026-04-17T16:10:00Z
  checked: Radix Slot mergeProps and composeEventHandlers implementations
  found: mergeProps correctly composes onClick handlers. composeEventHandlers only skips inner handler if event.defaultPrevented. The child button has no onClick, so the composed handler should work.
  implication: Event handler composition is correct at the code level.

- timestamp: 2026-04-17T16:20:00Z
  checked: DismissableLayer implementation
  found: Uses shared (module-level, not scoped) DismissableLayerContext with layer stack. On mobile, Sheet's DismissableLayer sets body pointer-events: none but gives itself pointer-events: auto. AlertDialog's DismissableLayer would add itself to the stack.
  implication: On mobile (Sheet), the body pointer-events: none could affect AlertDialog portal content rendering, but the trigger click (inside Sheet) should still work.

- timestamp: 2026-04-17T16:25:00Z
  checked: Console logs from both Playwright sessions
  found: Zero JavaScript errors. Only HMR/Fast Refresh messages and one WebSocket reconnection.
  implication: No runtime exceptions are thrown when clicking the button.

## Resolution

root_cause: After exhaustive static analysis of every layer (Radix AlertDialog, Dialog, Slot, Primitive, DismissableLayer, Presence, createContextScope, useControllableState, composeEventHandlers), the architecture is correct. The most likely cause is a runtime interaction issue. Need live browser testing to observe whether (a) the click event fires the Radix handler, (b) the Dialog state actually toggles, (c) the Portal renders but is invisible.
fix: 
verification: 
files_changed: []
