> **Status: COMPLETE — Phase 10 delivered the connection_request executor arm.**
> See `src/lib/computer-use/actions/linkedin-connect.ts` and the
> `case "connection_request"` arm in `src/lib/action-worker/worker.ts`.
> This file is kept for historical context only.

# Phase 6 -- LinkedIn `connection_request` Executor TODO

**Status:** Stub placeholder. Phase 6 writes `connection_request` rows to the
`actions` table with `status='pending_approval'`, but the actual execution
(Browserbase -> Playwright CDP -> Haiku CU click-through) is deferred to Phase 3.

## What's done (Phase 6)

- `src/features/actions/lib/connection-note-generation.ts` drafts a
  <=300 char LinkedIn connection note via Claude Sonnet 4.6.
- `src/features/actions/actions/create-actions.ts` branches on
  `signal.platform === "linkedin"` and inserts an action row with
  `action_type='connection_request'` + `status='pending_approval'`.
- Migration `00011_phase6_linkedin.sql` extends `action_type` enum with
  `connection_request`.

## What's NOT done (Phase 3 territory)

There is no `execute-action.ts` switch statement yet. When Phase 3 adds one,
it must include a `case "connection_request"` arm that:

1. Loads the prospect's LinkedIn profile URL.
2. Launches Playwright via Browserbase session for the LinkedIn account.
3. Uses Haiku computer-use to:
   - Navigate to the prospect's profile page.
   - Click the "Connect" button.
   - Paste `drafted_content` into the "Add a note" text area.
   - Click "Send invitation".
4. On success: update `actions` row `status='completed'`, set
   `executed_at=now()`. Update prospect `pipeline_status` to `connected_pending`
   (or equivalent).
5. On failure: increment retry counter, set `status='failed'` after N retries,
   capture screenshot, log to `job_logs`.

Until the executor arm exists, connection_request rows sit in
`status='pending_approval'` and never execute -- they are visible in the
approval queue but the Approve button will eventually need to wire through
to the Phase 3 harness.

## Related deferrals

- **Connection acceptance detection cron**: separate cron (polling inbox)
  that transitions prospect `pipeline_status` from `connected_pending` to
  `connected` once the invitation is accepted. Not part of Phase 6 scope.
- **LinkedIn credit enforcement**: Phase 5 owns `get_action_credit_cost`;
  LinkedIn connection requests will cost 20 credits per BILL-06 once wired.
- **LinkedIn account onboarding wizard**: Phase 5 owns onboarding flows.
