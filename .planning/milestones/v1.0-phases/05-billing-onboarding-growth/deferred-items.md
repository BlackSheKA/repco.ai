# Deferred Items — Phase 05

Items discovered during execution but outside the executing plan's scope.

## From 05-05 (prospect pipeline)

### TS error in `src/app/(app)/page.tsx`

- **File:** `src/app/(app)/page.tsx:282`
- **Error:** `Property 'creditBalance' does not exist on type 'IntrinsicAttributes & ApprovalQueueProps'`
- **Cause:** Sibling plan 05-04 committed `ec7a716` that added `creditBalance={creditBalance}` to `<ApprovalQueue>` but `ApprovalQueueProps` was not updated to accept the prop.
- **Why deferred:** Parallel execution boundary restricts 05-05 to `src/features/prospects/**` and `src/app/(app)/prospects/**`. The `ApprovalQueue` component and `(app)/page.tsx` belong to other plans' scope. Fix belongs to 05-04 follow-up or the orchestrator.
- **Verification that our scope is clean:** `pnpm typecheck` returns zero errors in `src/features/prospects/**` or `src/app/(app)/prospects/**`.

### Sidebar nav "Prospects" link

- **File:** `src/components/shell/app-sidebar.tsx:34`
- **Issue:** `{ label: "Prospects", icon: Users, href: "#" }` points to `#`. Now that `/prospects` exists, this should become `href: "/prospects"`.
- **Why deferred:** Parallel execution boundary restricts 05-05 to prospects files. The shell/sidebar belongs to a separate scope.

### Plan task 2 steps 9 and 10 (dashboard stats + settings avg_deal_value)

- **Plan:** 05-05 task 2 steps 9 (`src/app/(app)/page.tsx`) and 10 (`src/app/(app)/settings/page.tsx`)
- **Why deferred:** Orchestrator parallel-execution boundary narrowed 05-05 scope to `src/features/prospects/**` and `src/app/(app)/prospects/**`. The dashboard prospect-stats card and settings avg_deal_value input were not executed.
- **Handoff:** These can be completed as a follow-up plan or quick task once sibling plans 05-03/05-04/05-06 land. The required server actions (`updateProspectStage`, `updateProspectNotes`, `updateProspectTags`, `exportProspectsCSV`) and types are already in place.
- **Requirements deferred:** `DASH-04` (dashboard prospect stats + revenue counter) not satisfied by this plan. `PRSP-01..06` are fully satisfied.
