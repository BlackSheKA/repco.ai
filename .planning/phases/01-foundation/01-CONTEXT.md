# Phase 1: Foundation - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

The project skeleton exists and is deployable — auth works, schema is live with RLS, errors are tracked, and nothing can be built wrong due to missing infrastructure. No UI features beyond a branded app shell. No monitoring, no actions, no dashboard content.

</domain>

<decisions>
## Implementation Decisions

### Auth method
- Magic link + Google OAuth via Supabase Auth (both methods from day 1)
- Split layout login page: left panel with brand messaging, right panel with auth form (Linear/Vercel style)
- After login, land on a blank app shell with sidebar/header chrome + placeholder content
- The app shell is branded from day 1 — not unstyled scaffolding

### Schema deployment
- Deploy all 11 PRD tables in Phase 1 (users, credit_transactions, monitoring_signals, product_profiles, social_accounts, intent_signals, prospects, actions, action_counts, live_stats, job_logs)
- PRD §8.3 SQL is the base — Claude refines with proper indexes, constraints, ENUMs, and missing pieces
- All tables get RLS policies upfront
- Supabase CLI migrations (`supabase migration new` / `supabase db push`) — version-controlled SQL files in supabase/migrations/
- No seed data — empty database, each phase adds test data as needed

### Project structure
- Next.js 15 App Router with feature-grouped folders: src/features/auth/, src/features/monitoring/, etc.
- pnpm as package manager
- shadcn/ui initialized via specific preset: `pnpm dlx shadcn@latest init --preset b3QwALGmg --template next`
- Modern SaaS aesthetic — NOT Polsia-inspired
- Brand identity from day 1: black/white/orange (#E8500A), Instrument Serif (headlines), Inter (body), JetBrains Mono (terminal/code)
- Tailwind theme configured with brand colors via shadcn CSS variables

### Observability
- Sentry for error tracking — use Sentry's built-in alert rules for error rate thresholds
- Axiom for structured logging — request-level + errors with correlation IDs (stay within 500MB free tier)
- Zombie recovery cron every 5 min: resets actions stuck in "executing" > 10 min, logs to job_logs + Axiom only (no email alerts in Phase 1)
- OBSV-04 email alerts deferred to Phase 4 when Resend is set up — Sentry alert rules cover Phase 1 needs

### Claude's Discretion
- Exact RLS policy design per table
- Index selection and constraint refinements beyond PRD schema
- Correlation ID generation strategy
- Sentry alert rule thresholds and grouping
- App shell layout details (sidebar width, header height, navigation items)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema & architecture
- `PRD/repco-prd-final.md` §8.3 — Full SQL schema definition (11 tables, all column types and relationships)
- `PRD/repco-prd-final.md` §8 — Tech stack decisions (Supabase, Next.js 15, Vercel Pro, Sentry, Axiom)

### PLG & growth
- `PRD/repco-plg-design.md` — PLG strategy and growth hooks (context for /live page and landing decisions in later phases)

### Project-level
- `.planning/PROJECT.md` — Constraints, key decisions, design language, typography
- `.planning/REQUIREMENTS.md` — OBSV-01 through OBSV-04 are Phase 1 requirements
- `.planning/ROADMAP.md` — Phase 1 success criteria (5 criteria that must be TRUE)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes all patterns

### Integration Points
- Supabase project (to be created)
- Vercel Pro deployment (to be configured)
- Sentry project (to be created)
- Axiom dataset (to be created)

</code_context>

<specifics>
## Specific Ideas

- shadcn/ui must be initialized with exact command: `pnpm dlx shadcn@latest init --preset b3QwALGmg --template next`
- Login page should feel like Linear/Vercel — split layout, clean, modern SaaS
- The shell should have enough chrome that Phase 2 can drop dashboard content into it without restructuring

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-16*
