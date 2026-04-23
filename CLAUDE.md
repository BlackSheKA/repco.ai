# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# CLAUDE.md — repco.ai

## Overview

repco.ai — AI sales rep that monitors Reddit and LinkedIn 24/7, detects buying intent, and sends personalized DMs from your accounts. No-code SDR alternative for indie hackers and small SaaS.

**Status:** Phase 1 (Foundation) done. Active: Phase 2 (Reddit Monitoring + Intent Feed). Full plan in `.planning/ROADMAP.md`.

## Tech Stack

- Next.js 16 (App Router, Turbopack), React 19 RSC, TypeScript 5.9 strict, `@/*` → `./src/*`
- Tailwind CSS v4, shadcn/ui (radix-nova preset, Lucide + Phosphor). **Always prefer native shadcn components before building custom.**
- Supabase (Postgres + RLS + Auth), Supabase Auth (Google OAuth + magic links)
- Sentry + Axiom + correlation IDs
- Vercel Pro (hosting + cron), pnpm

## Key Commands

```bash
pnpm dev --port 3001  # ALWAYS port 3001 — Supabase redirect URLs configured for it
pnpm build | start | lint | format | typecheck
```

## Architecture

### Auth
Google OAuth + magic links → `/auth/callback` → `/`. Middleware redirects: unauthenticated → `/login`, authenticated off `/login` → `/`. Route groups: `(auth)` public, `(app)` protected. Server actions for sign in/out.

### Supabase
- Prod: `cmkifdwjunojgigrqwnr` (West US Oregon) · Dev branch: `dvmfeswlhlbgzqhtoytl`
- Management API: `SUPABASE_ACCESS_TOKEN` env; use `--ssl-no-revoke` with curl on Windows
- Clients: `lib/supabase/server.ts` (SSR), `lib/supabase/client.ts` (browser), `lib/supabase/middleware.ts` (token refresh). Service role client inline for admin/cron only — never in client code.
- All data access enforced by RLS.

### Observability
Sentry initialized via `instrumentation.ts`. Axiom structured logging (conditional on token). UUID correlation IDs across console + Axiom + Sentry. Threshold alerts (OBSV-04): success <80% or timeout >5% → Sentry with fingerprint dedup.

### Cron route pattern
1. Bearer auth vs `CRON_SECRET`
2. Correlation ID + start timestamp
3. Service role Supabase client
4. Structured logs with correlationId
5. `await logger.flush()` before response

### Component architecture
Server-first (`"use client"` only when needed). AppShell = Sidebar + Header + main. ThemeProvider wraps app. Features live in `src/features/<name>/{actions,components}/`.

## Conventions

- **Naming**: files/folders `kebab-case`; components `PascalCase` (Props suffix); functions/vars `camelCase`; constants `UPPER_SNAKE_CASE`; DB tables `snake_case`; UUID PKs.
- **Imports**: React/Next → third-party → `@/*` alias.
- **Style**: Prettier (80 cols, 2 spaces, no semis, double quotes, trailing commas es5). Tailwind sorted via plugin, `cn()` for conditionals. No `any`, no inline styles. Validate with Zod at API boundaries. Toasts via Sonner.
- **DB**: sequential migrations `00001_`, `00002_`…; RLS on every new table; `TIMESTAMPTZ DEFAULT now()`; 12 ENUMs in `00001_enums.sql`; `auth.users` → `public.users` trigger.
- **Commits**: `<type>(<scope>): <subject>` — types: feat/fix/docs/refactor/test/chore; scope phase-based (e.g. `01-03`).

## Database

Schema in `supabase/migrations/` — 11 tables with RLS, 12 ENUMs in `00001_enums.sql`. Core tables: `users`, `monitoring_signals`, `product_profiles`, `social_accounts`, `intent_signals`, `prospects`, `actions`, `action_counts`, `credit_transactions`, `live_stats`, `job_logs`.

## Environments

Strict separation across Git, Vercel, Supabase and local disk. **Never mix them.**

| Layer | Production | Preview / Dev |
|---|---|---|
| Git branch | `main` | `development` (+ PR branches) |
| Vercel deployment | Production (auto on push to `main`) | Preview (auto on push to `development`) |
| Supabase | prod `cmkifdwjunojgigrqwnr` | dev branch `dvmfeswlhlbgzqhtoytl` |
| Stripe | LIVE keys (`sk_live_…`) | TEST keys (`sk_test_…`) |
| Site URL | `https://repco.ai` | Vercel preview URL / `http://localhost:3001` |
| Local file | _none — do NOT keep prod env on disk_ | `.env.local` (dev Supabase + Stripe test) |

### Rules
- **Default working branch is `development`.** `main` only receives merges via PR after verification on preview.
- **Local `.env.local` must point at dev Supabase**, never prod. If it drifts, fix it immediately.
- **Never create `.env.production.local`** on disk. Prod secrets live only in Vercel. If you need to inspect them, use `vercel env pull .env.prod.tmp --environment=production` and delete the file when done.
- **Preview env vars in Vercel are scoped to the `development` branch** — when adding new vars to Vercel use `vercel env add NAME preview development --value '…'` (the `development` git-branch arg is required).
- **Stripe CLI / webhooks** locally forward to test mode only; live webhooks are Stripe-hosted and point at `repco.ai`.
- Use `pnpm dev --port 3001` locally → hits dev Supabase via `.env.local`.
- Cron jobs in Vercel run with the env matching the deployment (prod cron hits prod DB, preview cron hits dev DB).

See `.env.example` for the shape. `NEXT_PUBLIC_*` = browser-exposed; others server-only. Never commit `.env.local` or any `.env.*.local`.

## Testing

No test framework configured yet.

## Critical Rules

- **Screenshots ALWAYS go in `screenshots/`** — never save PNG/JPG/WebP to project root or arbitrary locations. Applies to UAT captures, Playwright output saved outside `.playwright-mcp/`, debug screenshots, design references. Use descriptive filenames (e.g. `screenshots/uat-<phase>-<feature>.png`).
- **NEVER kill all Chrome/browser processes** — user has important sessions open. If Playwright can't launch, ask the user to close Chrome manually.
- **NEVER run destructive SQL on production** without explicit confirmation.
- **NEVER commit secrets** (.env.local, credentials, tokens).
- Test migrations on dev branch first.
- Service role client server-side only.
- Validate user input at API boundaries with Zod.
- `await logger.flush()` before returning from API routes.
