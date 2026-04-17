# CLAUDE.md — repco.ai

This file provides guidance for Claude Code when working with this project.

## Overview

repco.ai is an AI-powered sales representative that monitors Reddit and LinkedIn 24/7, detects people actively looking for products like yours, and sends personalized DMs from your accounts with your voice. Built for indie hackers and small SaaS teams as a no-code alternative to hiring an SDR.

**Core value:** People actively looking for your product get a personalized, relevant DM within hours — not days, not never.

**Project status:** Phase 1 (Foundation) complete. Current focus: Phase 2 (Reddit Monitoring + Intent Feed). See `.planning/ROADMAP.md` for full 6-phase plan.

## Project Structure

```
src/
├── app/
│   ├── (app)/                # Authenticated app routes (auth guard via middleware)
│   ├── (auth)/login/         # Public auth routes
│   ├── auth/callback/        # OAuth callback handler
│   ├── api/
│   │   └── cron/             # Vercel cron endpoints (zombie-recovery)
│   ├── layout.tsx            # Root layout (fonts, theme, toaster)
│   ├── global-error.tsx      # Global error boundary + Sentry
│   ├── instrumentation.ts    # Sentry initialization
│   └── globals.css           # Tailwind config + brand design tokens
├── components/
│   ├── ui/                   # shadcn/ui primitives (radix-nova preset)
│   ├── shell/                # AppShell, Header, Sidebar, ThemeToggle
│   └── providers/            # ThemeProvider wrapper
├── features/
│   └── auth/                 # Auth feature module
│       ├── actions/          # Server actions (sign in, sign out)
│       └── components/       # LoginForm, SignOutButton
├── lib/
│   ├── supabase/             # Client factories (server, client, middleware)
│   ├── logger.ts             # Structured logger (Axiom + Sentry correlation)
│   ├── alerts.ts             # Threshold alerting (OBSV-04)
│   ├── axiom.ts              # Axiom client setup
│   └── utils.ts              # cn() utility (clsx + tailwind-merge)
├── hooks/                    # Custom React hooks
└── middleware.ts             # Auth redirect middleware
supabase/
├── config.toml               # Local Supabase dev config
└── migrations/               # PostgreSQL migrations (00001–00004)
.planning/                    # GSD planning artifacts
├── PROJECT.md                # Vision, constraints, key decisions
├── REQUIREMENTS.md           # Feature requirements (OBSV-*, MNTR-*, etc.)
├── ROADMAP.md                # 6-phase roadmap
├── STATE.md                  # Current milestone state
└── config.json               # GSD workflow config
PRD/                          # Product requirements docs
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5.9 (strict mode), path alias `@/*` → `./src/*`
- **React**: 19 with Server Components
- **Styling**: Tailwind CSS v4 (PostCSS plugin), dark/light mode via next-themes
- **UI**: shadcn/ui (radix-nova preset), Lucide + Phosphor icons
- **Database**: Supabase (PostgreSQL + RLS + Auth + Storage)
- **Auth**: Supabase Auth (Google OAuth + magic links)
- **Observability**: Sentry (error tracking) + Axiom (structured logging) + correlation IDs
- **Hosting**: Vercel Pro (production + cron)
- **State**: Server components by default, useState for client interactions
- **Package manager**: pnpm
- **Fonts**: Inter (body/headings), Geist (UI sans), Geist Mono (monospace/terminal)
- **Colors**: CSS variables (OkLch), indigo primary `#4338CA`, warm stone palette

## Key Commands

```bash
pnpm dev              # Dev server (Turbopack)
pnpm build            # Production build
pnpm start            # Start production server
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm typecheck        # TypeScript type check (tsc --noEmit)
```

## Architecture Patterns

### Auth Flow
- Google OAuth + magic links via Supabase Auth → `/auth/callback` → `/` (dashboard)
- Middleware intercepts all requests: unauthenticated → `/login`, authenticated off `/login` → `/`
- Route groups: `(auth)` for public routes, `(app)` for protected routes
- Server actions (`"use server"`) for sign in/out mutations

### Supabase Integration
- **Server components/API routes**: `createClient()` from `lib/supabase/server.ts` (cookie-based SSR)
- **Client components**: `createClient()` from `lib/supabase/client.ts` (browser client)
- **Middleware**: `updateSession()` from `lib/supabase/middleware.ts` (token refresh)
- **Admin/cron operations**: service role client created inline with `SUPABASE_SERVICE_ROLE_KEY`
- All data access enforced by RLS policies — users can only access their own data

### Observability
- **Sentry**: client/server/edge configs, initialized via `instrumentation.ts`
- **Axiom**: structured logging with optional conditional client (only if token configured)
- **Correlation IDs**: UUID-based, tracked across console + Axiom + Sentry for request tracing
- **Threshold alerts (OBSV-04)**: success rate < 80% or timeout rate > 5% → Sentry alert with fingerprint dedup

### Cron Route Pattern
```
1. Auth: Bearer token check against CRON_SECRET
2. Setup: correlation ID + start timestamp
3. Operations: service role Supabase client for admin queries
4. Logging: structured logs throughout with correlationId
5. Cleanup: await logger.flush() before returning response
```

### Component Architecture
- **Server-first**: Server Components by default, `"use client"` only when needed
- **Shell pattern**: AppShell wraps Sidebar + Header + main content area
- **Provider pattern**: ThemeProvider wraps app with next-themes
- **Feature modules**: `src/features/<name>/` with `actions/` and `components/` subdirectories

## Conventions

### Naming
- **Files/folders**: `kebab-case` (e.g., `login-form.tsx`, `auth-actions.ts`)
- **Components**: PascalCase exports (e.g., `LoginForm`, `AppShell`)
- **Functions/variables**: camelCase (e.g., `signInWithEmail`, `correlationId`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `NAV_ITEMS`, `AXIOM_DATASET`)
- **Types/interfaces**: PascalCase with `Props` suffix for component props (e.g., `AppShellProps`)
- **DB tables**: `snake_case` (e.g., `intent_signals`, `job_logs`)
- **UUIDs** for all primary keys

### Imports
```typescript
// 1. React/Next.js
import type { Metadata } from "next"
// 2. Third-party
import * as Sentry from "@sentry/nextjs"
// 3. Internal (using @/* alias)
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
```

### Code Style
- **Prettier**: 80 char width, 2 spaces, no semicolons, double quotes, trailing commas (es5)
- **Tailwind**: classes sorted via `prettier-plugin-tailwindcss`, `cn()` for conditionals
- **TypeScript**: strict mode, no `any`, explicit types at boundaries
- Server-first: prefer Server Components, `"use client"` only for interactivity
- Validate with Zod at API boundaries
- Toast notifications via Sonner
- No inline styles — Tailwind utilities only

### Database
- Migrations numbered sequentially: `00001_`, `00002_`, etc.
- Always add RLS policies for new tables
- Use `TIMESTAMPTZ` with `DEFAULT now()` for timestamps
- 12 ENUM types defined in `00001_enums.sql`
- Auth trigger syncs `auth.users` → `public.users`

### Commit Messages
```
<type>(<scope>): <subject>

Types: feat, fix, docs, refactor, test, chore
Scope: phase-based (e.g., 01-03, phase-01)
Examples:
  feat(01-03): login page with split layout and auth form
  docs(phase-01): complete phase execution
```

## Database Schema

**11 tables** with row-level security:

| Table | Purpose |
|-------|---------|
| `users` | Base user record (synced from auth.users via trigger) |
| `credit_transactions` | Credit log (type, amount, payment reference) |
| `monitoring_signals` | Monitoring setup (keywords, subreddits, LinkedIn searches) |
| `product_profiles` | Product info (description, competitors, keywords) |
| `social_accounts` | Connected platforms (handles, profile IDs, warmup status) |
| `intent_signals` | Detected posts (platform, URL, author, intent strength, status) |
| `prospects` | Pipeline contacts (handle, stage, tags, notes) |
| `actions` | DMs & engagements (status, content, approval state) |
| `action_counts` | Daily action counters per account |
| `live_stats` | Public dashboard stats |
| `job_logs` | Job execution log (duration, status, errors, correlation ID) |

**12 ENUM types**: `platform_type`, `action_type`, `action_status_type`, etc.

## Environment

- `NEXT_PUBLIC_*` variables: exposed to browser (Supabase URL, anon key, site URL)
- Server-only variables: Supabase service role key, Sentry config, Axiom token, cron secret
- Reference `.env.example` for the full list of required variables
- Never commit `.env.local` or any file containing secrets

## Testing

**Current state**: No test framework configured yet.

**Planned**:
- Unit tests for server actions and utility functions
- Integration tests for Supabase RLS policies
- E2E tests for critical flows (login, dashboard, action approval)

## Planning

GSD workflow artifacts live in `.planning/`. Current milestone: v1.0.

**6-phase roadmap:**
1. **Foundation** (DONE) — Schema, auth, observability, zombie recovery
2. **Reddit Monitoring + Intent Feed** — snoowrap, signal classification, real-time dashboard
3. **Action Engine** — GoLogin + Playwright + Computer Use, approval queue, anti-ban
4. **Sequences + Reply Detection** — Follow-up sequences, inbox monitoring
5. **Billing + Onboarding + Growth** — Stripe, onboarding wizard, /live page, prospect pipeline
6. **LinkedIn** — Second platform integration

## Critical Rules

- **NEVER kill all Chrome/browser processes** (taskkill chrome.exe etc.) — user has important sessions open. If Playwright can't launch, ask the user to close Chrome manually.
- **NEVER run destructive SQL on production** without explicit confirmation.
- **NEVER commit files containing secrets** (.env.local, credentials, tokens).
- Always test database migrations on dev environment first.
- Use service role client only in server-side code (API routes, cron jobs) — never expose in client components.
- Validate all user input at API boundaries with Zod.
- Flush logger (`await logger.flush()`) before returning from API routes.
