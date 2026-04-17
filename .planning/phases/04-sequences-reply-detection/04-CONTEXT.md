# Phase 4: Sequences + Reply Detection - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Prospects who don't reply receive structured follow-ups at day 3, 7, and 14; replies are detected automatically via GoLogin + Playwright + Haiku CU inbox checks every 2h and stop all follow-ups; users are notified by email (Resend) for replies, account alerts, and daily digests. No billing/credits (Phase 5), no onboarding (Phase 5), no prospect pipeline UI (Phase 5), no LinkedIn (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Follow-up sequence flow
- Default mode: each follow-up appears in the approval queue for user review before sending
- Auto-send toggle available: global setting (not per-prospect) that switches all follow-ups to auto-send without approval
- Follow-up angles per PRD: day 3 (feature/benefit), day 7 (value/insight), day 14 (low-pressure check-in)
- Follow-up DMs generated just-in-time when each step is due (not pre-generated upfront) — fresher context
- Follow-up cards in approval queue have 24h expiry (longer than initial DM's 12h) — if missed, that follow-up is skipped
- Missed follow-up: skip and continue — remaining follow-ups still fire on original schedule (e.g., miss day 3, day 7 still fires)
- Quality control: same rules as Phase 3 DM generation (max 3 sentences, no links, must reference original post)
- When auto-send is enabled: follow-ups skip the approval queue entirely, log in terminal header as sent action, visible on prospect timeline

### Reply detection UX
- Replies surface via: Sonner toast + terminal header event + dedicated reply card in a new "Replies" section on the dashboard
- Reply card shows full thread: user's original DM (collapsed/truncated) + prospect's reply (expanded) + prospect info + "View on Reddit" link
- When reply detected: all pending follow-ups cancelled immediately, prospect pipeline_status updated to "replied"
- Visual indicator on prospect record: "Sequence stopped — reply received" badge
- Agent card transitions to "Reply" emotional state on new reply detection
- Reply pushed to dashboard via Supabase Realtime

### Reply detection failures
- Dashboard warning banner after any failed inbox check: "Reply check failed for @account — last successful check: Xh ago"
- Email alert sent after 3 consecutive failures
- Each inbox check logged to job_logs with duration, status, error details (consistent with Phase 1 cron pattern)

### Email notification design
- Email provider: Resend
- Three email types: reply alert, daily digest, account warning
- All three use branded HTML templates (Resend React email) with repco branding: indigo accent, Inter font, logo
- Reply alert: minimal — prospect handle, platform, "View in repco" CTA button. No reply text in email. Sent within 10 min of detection
- Daily digest (8:00 user's timezone): yesterday's signal count, top 1-3 signals (highest intent), count of DMs pending approval, replies received. "Open repco" CTA
- Account warning email: account handle, new status (warning/banned), recommended action. Triggered immediately on status change
- All notifications on by default, no in-app settings page, no unsubscribe mechanism in V1

### Sequence control & visibility
- Prospect card shows mini-timeline: sent DM (done) → follow-up 1 (day 3, pending/sent/skipped) → follow-up 2 (day 7) → follow-up 3 (day 14)
- "Stop sequence" button on the prospect timeline — cancels all remaining follow-ups (no pause/resume, no per-step cancel)
- Auto-send toggle lives in a global Settings page (or monitoring config page) — applies to all prospects uniformly

### Claude's Discretion
- Follow-up scheduler cron implementation (timing, batch processing)
- Sequence state machine internals (DB schema for tracking sequence progress)
- Inbox navigation strategy for Haiku CU (how to find and read DM replies on Reddit)
- Reply-to-prospect matching logic
- Resend React email template layout details
- Daily digest timezone handling implementation
- Dashboard "Replies" section layout and positioning relative to intent feed and approval queue

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Follow-up sequences
- `PRD/repco-prd-final.md` §7.4 — Follow-up sequence spec: 3-touch cadence (day 3/7/14), angle progression, stop-on-reply logic
- `.planning/REQUIREMENTS.md` — FLLW-01 through FLLW-05: follow-up scheduling, stop-on-reply, approval queue integration

### Reply detection
- `PRD/repco-prd-final.md` §7.4 — Reply detection: inbox check cadence (2h), prospect matching, pipeline status update
- `.planning/REQUIREMENTS.md` — RPLY-01 through RPLY-04: inbox check, prospect matching, email notification, realtime push

### Email notifications
- `.planning/REQUIREMENTS.md` — NTFY-01 through NTFY-03: daily digest, reply notification, account alert

### Action engine (Phase 3 foundation)
- `.planning/phases/03-action-engine/03-CONTEXT.md` — GoLogin + Playwright + Haiku CU pipeline, approval queue UX (stacked cards, inline editing), DM generation rules, account health states
- `PRD/repco-prd-final.md` §7.4 — Action execution pipeline that reply detection and follow-up sending reuse

### Prior phase context
- `.planning/phases/02-reddit-monitoring-intent-feed/02-CONTEXT.md` — Signal card design, dashboard layout, terminal header, agent emotional states
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema, app shell, observability patterns

### Project-level
- `.planning/PROJECT.md` — Constraints (Anthropic only, Vercel Pro, GoLogin Cloud), key decisions
- `.planning/REQUIREMENTS.md` — Full requirement definitions with acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/dashboard/components/signal-card.tsx` — Card pattern reference for reply cards
- `src/features/dashboard/components/flame-indicator.tsx` — Intent score display (reuse in follow-up approval cards)
- `src/features/dashboard/lib/use-realtime-signals.ts` — Supabase Realtime subscription pattern (adapt for reply events)
- `src/features/dashboard/components/terminal-header.tsx` — Will receive follow-up sent and reply detected events
- `src/features/dashboard/components/agent-card.tsx` + `src/features/dashboard/lib/agent-state.ts` — Agent emotional state machine (add Reply state transitions)
- `src/components/ui/card.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx` — shadcn primitives for all new cards
- `src/app/api/cron/` — Existing cron route pattern (zombie-recovery, monitor-reddit) for follow-up scheduler and reply detection crons
- `src/lib/logger.ts` — Structured logging with correlation IDs for new cron jobs

### Established Patterns
- Feature-grouped folders: new modules at `src/features/sequences/` and `src/features/notifications/`
- Server actions in `actions/` subdirectory for mutations
- Supabase server client for SSR, service role for cron/API routes
- Sonner toast for in-app notifications
- Vercel Cron with CRON_SECRET auth, correlation IDs, logger.flush()

### Integration Points
- Supabase tables: `actions` (follow-up actions), `prospects` (pipeline_status, sequence state), `job_logs` (cron runs)
- Supabase Realtime: subscribe to reply events for dashboard updates
- Phase 3 action execution pipeline: follow-ups reuse the same GoLogin + Playwright + Haiku CU flow
- Phase 3 approval queue: follow-up cards appear alongside initial DM cards
- Phase 3 account health: warning/banned status changes trigger email alerts
- App shell sidebar: Settings page for auto-send toggle
- Anthropic API: Claude Sonnet 4.6 for follow-up DM generation (same as Phase 3)

</code_context>

<specifics>
## Specific Ideas

- Follow-up approval cards should be visually identical to initial DM approval cards — same card layout, just with a "Follow-up 2 of 3" label
- The prospect timeline (sent → FU1 → FU2 → FU3) should feel like a simple progress tracker, not a complex Gantt chart
- Reply alert emails are intentionally minimal — drive users back to the app rather than showing reply content in email
- Auto-send toggle is a power-user feature — default off, clearly labeled with what it does
- The "Replies" dashboard section is a key moment of delight — this is where users see repco working

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-sequences-reply-detection*
*Context gathered: 2026-04-17*
