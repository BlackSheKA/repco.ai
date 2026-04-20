---
phase: 05-billing-onboarding-growth
plan: 05
subsystem: prospects
tags: [nextjs, shadcn, dnd-kit, server-actions, csv, kanban]

requires:
  - phase: 05-billing-onboarding-growth
    plan: 01
    provides: PIPELINE_STAGES, PipelineStage, ProspectWithSignal, isValidStageTransition
provides:
  - /prospects kanban route with 6-stage drag-and-drop
  - /prospects/[id] detail route with notes, tags, conversation history
  - updateProspectStage / updateProspectNotes / updateProspectTags server actions
  - exportProspectsCSV server action (papaparse)
  - ProspectCard, KanbanColumn, KanbanBoard, ProspectDetail components
affects: [dashboard-prospect-card (deferred), settings-avg-deal-value (deferred)]

tech-stack:
  added: [papaparse, @types/papaparse, @dnd-kit/react, shadcn/scroll-area]
  patterns:
    - "Optimistic UI update with revert-on-error in KanbanBoard; Sonner toast for failures"
    - "Server action validation re-checks transition via isValidStageTransition before UPDATE"
    - "CSV download via client-side Blob + anchor click; server action returns csv string"
    - "Drag-and-drop via @dnd-kit/react (DragDropProvider, useDraggable, useDroppable)"

key-files:
  created:
    - src/features/prospects/actions/update-prospect.ts
    - src/features/prospects/actions/export-csv.ts
    - src/features/prospects/components/prospect-card.tsx
    - src/features/prospects/components/kanban-column.tsx
    - src/features/prospects/components/kanban-board.tsx
    - src/features/prospects/components/prospect-detail.tsx
    - src/app/(app)/prospects/page.tsx
    - src/app/(app)/prospects/export-csv-button.tsx
    - src/app/(app)/prospects/[id]/page.tsx
    - src/components/ui/scroll-area.tsx
  modified: []

key-decisions:
  - "Drag handle hidden below md breakpoint (touch target 48px on desktop only); Move to... Select always available for keyboard/mobile"
  - "rejected stage-specific UI rule honored: Select dropdown only shows targets where isValidStageTransition returns true"
  - "CSV export uses fixed column order matching plan; tags array -> comma-separated string before unparse"
  - "Deferred task 2 steps 9+10 (dashboard stats, settings avg_deal_value) due to parallel-execution scope boundary"

requirements-completed: [PRSP-01, PRSP-02, PRSP-03, PRSP-04, PRSP-05, PRSP-06]
requirements-deferred: [DASH-04]

duration: 6min
completed: 2026-04-20
---

# Phase 05 Plan 05: Prospect Pipeline Summary

**Drag-and-drop kanban board with 6 pipeline columns, per-card Move-to Select dropdown, prospect detail page with inline notes/tags editing and conversation history, CSV export, and full server-action validation of stage transitions.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T11:50:30Z
- **Completed:** 2026-04-20T11:56:28Z
- **Tasks:** 2

## Accomplishments

- **Task 1 (server actions + CSV):** `updateProspectStage` server action fetches current stage, validates via `isValidStageTransition`, updates `prospects.pipeline_status` with `updated_at`. `updateProspectNotes` / `updateProspectTags` mirror the pattern. `exportProspectsCSV` selects 9 columns, joins tags with `", "`, uses `Papa.unparse` with fixed column order.
- **Task 2 (UI):** `@dnd-kit/react` powers `DragDropProvider` + `useDraggable` (cards) + `useDroppable` (columns). `KanbanBoard` groups prospects client-side by `pipeline_status`, performs optimistic update, reverts on error with Sonner toast. Every card exposes a `Move to...` Select dropdown (keyboard/mobile path). Drag handle visible only on `md+` viewport (48px touch target on desktop).
- **Detail page:** `/prospects/[id]` renders two-column layout above `lg` (2/3 conversation history + 1/3 info). Notes auto-save on blur; tags save on Enter or blur with explicit "Save tags" button. Intent-signal card reuses `FlameIndicator` for intent strength + suggested angle display.
- **List page:** `/prospects` page has Export CSV button (client Blob download), header row, empty state ("No prospects yet" + Connect account CTA).
- **Typecheck:** `pnpm typecheck` passes cleanly.

## Task Commits

1. **Task 1: Prospect server actions and CSV export** - `8122e61` (feat)
2. **Task 2: Kanban board UI, prospect detail page** - files committed into sibling `23e3990` (parallel-race; see Deviations)

## Files Created

- `src/features/prospects/actions/update-prospect.ts` - stage / notes / tags server actions
- `src/features/prospects/actions/export-csv.ts` - CSV generation with papaparse
- `src/features/prospects/components/prospect-card.tsx` - Draggable card with Move to... dropdown
- `src/features/prospects/components/kanban-column.tsx` - Droppable column with count badge
- `src/features/prospects/components/kanban-board.tsx` - DragDropProvider wrapper with optimistic update
- `src/features/prospects/components/prospect-detail.tsx` - Full-detail layout with notes/tags/conversation
- `src/app/(app)/prospects/page.tsx` - Prospects list/kanban route
- `src/app/(app)/prospects/export-csv-button.tsx` - Client export button
- `src/app/(app)/prospects/[id]/page.tsx` - Detail route (fetches prospect + actions)
- `src/components/ui/scroll-area.tsx` - shadcn primitive (added for horizontal board scroll)

## Decisions Made

- **Drag handle desktop-only, Move-to dropdown always**: Mobile users get the Select; desktop users get both. 48px touch target on desktop drag handle per plan.
- **Optimistic update + revert on error**: Perceived latency near-zero; if server action rejects (invalid transition or RLS denial), state reverts and Sonner toast surfaces the error.
- **Stage dropdown filters on `isValidStageTransition`**: Users can never select an invalid target from the UI. Server action still re-checks (defense in depth).
- **CSV column order locked in server action**: `handle, platform, pipeline_status, display_name, bio, notes, tags, created_at` (matches plan spec). Tags joined with `", "`.
- **Drop target uses `column-{stage}` ID convention**: Clean namespace separation from `prospectId` (card source ID) inside `DragDropProvider`.
- **Deferred dashboard + settings edits**: Parallel-execution boundary explicitly restricted 05-05 to `src/features/prospects/**` and `src/app/(app)/prospects/**`. Steps 9 (dashboard prospect stats card) and 10 (settings avg_deal_value input) were out of bounds. Logged in `deferred-items.md`.

## Deviations from Plan

### Scope-boundary deviation (documented, not auto-fixed)

**1. Deferred task 2 steps 9+10 to `deferred-items.md`**
- **Found during:** Task 2 pre-execution scope review
- **Issue:** Plan lists `src/app/(app)/page.tsx` and `src/app/(app)/settings/page.tsx` in `files_modified`, but the orchestrator parallel-execution message narrows scope to `src/features/prospects/** and src/app/(app)/prospects/**`.
- **Action:** Honored orchestrator boundary. Skipped steps 9 (dashboard prospect stats card) and 10 (settings avg_deal_value input). Logged in `deferred-items.md` with handoff instructions. All server-action and type contracts needed for a follow-up are in place.
- **Impact:** Requirement `DASH-04` not satisfied by this plan. `PRSP-01..06` fully satisfied.

### Parallel-execution file-race (informational)

**2. Task 2 files also produced by sibling 05-04**
- **What happened:** Sibling plan 05-04 commit `23e3990` bundled `kanban-board.tsx`, `kanban-column.tsx`, `prospect-card.tsx`, `prospect-detail.tsx`, `(app)/prospects/**`, and `src/components/ui/scroll-area.tsx` into its "credit balance widget" commit. Content is byte-identical to our files. Our on-disk files match `HEAD` after 23e3990 landed.
- **Why:** Both agents produced identical output from the same plan spec; sibling 05-04 happened to stage/commit first. Our task 1 commit (`8122e61`) landed before the race.
- **Resolution:** No redundant work; files are correctly tracked under the sibling commit and satisfy all acceptance criteria. `pnpm typecheck` passes with sibling 05-04's `ApprovalQueue` `creditBalance` prop fix applied.
- **Impact:** Clean — all prospect features ship, but attribution for kanban/detail UI lands under commit `23e3990` (05-04) rather than a dedicated 05-05 commit.

### Auto-fixed

None.

## Acceptance Criteria Verification

- `src/features/prospects/components/kanban-board.tsx` contains `"use client"` and `DragDropProvider` from `@dnd-kit/react` — yes
- `src/features/prospects/components/kanban-column.tsx` renders stage name + count badge — yes
- `src/features/prospects/components/prospect-card.tsx` has Move to... Select dropdown — yes
- `src/app/(app)/prospects/page.tsx` has Export CSV button and "No prospects yet" empty state — yes
- `src/app/(app)/prospects/[id]/page.tsx` exists and queries single prospect — yes
- `src/features/prospects/components/prospect-detail.tsx` has notes textarea and tags input — yes
- `src/features/prospects/actions/update-prospect.ts` contains `"use server"` + exports + calls `isValidStageTransition` — yes
- `src/features/prospects/actions/export-csv.ts` contains `"use server"` + imports `Papa` + calls `Papa.unparse` — yes
- `pnpm typecheck` passes — yes

## Issues Encountered

- Parallel agent race condition caused sibling plan 05-04 to bundle our Task 2 files. Resolved organically (identical content); documented in deferred-items.md and in this summary.
- `pnpm typecheck` briefly failed with a TS2322 in `(app)/page.tsx` caused by sibling 05-04's first commit (`ec7a716`) passing a `creditBalance` prop to `ApprovalQueue` before `ApprovalQueueProps` was updated. Sibling's follow-up commit `23e3990` resolved it.

## User Setup Required

None.

## Next Phase Readiness

- Full prospect feature shipped for PRSP-01..06.
- Dashboard prospect stats card + settings avg_deal_value input remain for a follow-up plan (see `deferred-items.md`). Server actions and types are ready for that work.
- Recommend a quick follow-up to satisfy DASH-04 once sibling parallel work settles.

---
*Phase: 05-billing-onboarding-growth*
*Completed: 2026-04-20*

## Self-Check: PASSED

- All 10 listed files exist on disk (verified)
- Task 1 commit `8122e61` present in git log (verified)
- Task 2 files committed via sibling `23e3990` (verified — byte-identical)
- `pnpm typecheck` exits 0 (verified)
- Acceptance criteria all satisfied for in-scope items (verified)
