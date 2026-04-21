# Phase 1: Foundation - Research

**Researched:** 2026-04-17
**Domain:** Next.js 15 + Supabase + Observability (Sentry/Axiom) project scaffold
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield scaffold: Next.js 15 App Router with Supabase Auth (magic link + Google OAuth), full database schema with RLS, Sentry error tracking, Axiom structured logging, a zombie recovery cron, and a branded app shell. No features beyond the shell -- this phase establishes all infrastructure patterns that later phases consume.

The stack is well-documented and mature. Supabase has first-class Next.js SSR support via `@supabase/ssr`. Sentry has a wizard that auto-configures Next.js 15 App Router (client, server, edge). shadcn/ui supports preset-based init with the exact command the user specified. The only complexity is getting Supabase Auth middleware, RLS policies, and the cron security pattern right on the first pass.

**Primary recommendation:** Use the Supabase + Next.js SSR guide as the canonical reference for auth middleware. Deploy all 11 PRD tables via Supabase CLI migrations with RLS from day one. Initialize shadcn/ui with the locked preset command.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Magic link + Google OAuth via Supabase Auth (both methods from day 1)
- Split layout login page: left panel with brand messaging, right panel with auth form (Linear/Vercel style)
- After login, land on a blank app shell with sidebar/header chrome + placeholder content
- The app shell is branded from day 1 -- not unstyled scaffolding
- Deploy all 11 PRD tables in Phase 1 (users, credit_transactions, monitoring_signals, product_profiles, social_accounts, intent_signals, prospects, actions, action_counts, live_stats, job_logs)
- PRD 8.3 SQL is the base -- Claude refines with proper indexes, constraints, ENUMs, and missing pieces
- All tables get RLS policies upfront
- Supabase CLI migrations (supabase migration new / supabase db push) -- version-controlled SQL files in supabase/migrations/
- No seed data -- empty database, each phase adds test data as needed
- Next.js 15 App Router with feature-grouped folders: src/features/auth/, src/features/monitoring/, etc.
- pnpm as package manager
- shadcn/ui initialized via: `pnpm dlx shadcn@latest init --preset b3QwALGmg --template next`
- Modern SaaS aesthetic -- NOT Polsia-inspired
- Brand identity from day 1: indigo primary (#4338CA), warm stone palette, Inter (body/headings), Geist (UI sans), Geist Mono (monospace)
- Tailwind theme configured with brand colors via shadcn CSS variables
- Sentry for error tracking with built-in alert rules
- Axiom for structured logging -- request-level + errors with correlation IDs (stay within 500MB free tier)
- Zombie recovery cron every 5 min: resets actions stuck in "executing" > 10 min, logs to job_logs + Axiom only (no email alerts in Phase 1)
- OBSV-04 email alerts deferred to Phase 4 when Resend is set up -- Sentry alert rules cover Phase 1 needs

### Claude's Discretion
- Exact RLS policy design per table
- Index selection and constraint refinements beyond PRD schema
- Correlation ID generation strategy
- Sentry alert rule thresholds and grouping
- App shell layout details (sidebar width, header height, navigation items)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OBSV-01 | System logs all action executions to job_logs with duration_ms, status, and error details | job_logs table in schema migration; Axiom logging patterns with correlation IDs |
| OBSV-02 | System runs zombie recovery cron every 5 minutes: actions stuck in "executing" > 10 min are reset | Vercel Cron configuration in vercel.json; CRON_SECRET security pattern |
| OBSV-03 | System tracks error rates via Sentry with structured logging via Axiom | @sentry/nextjs wizard setup; @axiomhq/nextjs integration; correlation ID strategy |
| OBSV-04 | System alerts (email) when action success rate < 80% or timeout rate > 5% | Deferred to Phase 4 per CONTEXT.md; Sentry alert rules cover Phase 1 needs |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.5.15 | App Router framework | Latest stable 15.x; user locked to Next.js 15 |
| @supabase/supabase-js | 2.103.3 | Supabase client (DB, Auth, Realtime) | Official JS client |
| @supabase/ssr | 0.10.2 | Server-side auth with cookies (PKCE flow) | Official SSR package replacing deprecated auth-helpers |
| @sentry/nextjs | 10.49.0 | Error tracking + source maps + performance | Official Next.js SDK with wizard setup |
| @axiomhq/nextjs | 0.2.0 | Structured logging for Next.js | Official Axiom integration for Next.js (replaces legacy next-axiom) |
| @axiomhq/js | 1.6.0 | Core Axiom client | Required peer dependency for @axiomhq/nextjs |
| @axiomhq/logging | 0.2.0 | Logging primitives | Required peer dependency for @axiomhq/nextjs |
| @axiomhq/react | 0.2.0 | React client-side logging | Required peer dependency for @axiomhq/nextjs |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-themes | 0.4.6 | Theme toggle (system/light/dark) | App shell theme cycling |
| lucide-react | 1.8.0 | Icon library | shadcn/ui default icon set |
| sonner | 2.0.7 | Toast notifications | Auth error/success feedback |

### CLI Tools

| Tool | Version | Purpose |
|------|---------|---------|
| supabase (CLI) | 2.92.0 | Local dev, migrations, db push |
| pnpm | latest | Package manager (user locked) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @supabase/ssr | @supabase/auth-helpers-nextjs | Deprecated; ssr is the current official approach |
| @axiomhq/nextjs | next-axiom (legacy) | Legacy package; @axiomhq/nextjs is the current recommended package |
| crypto.randomUUID() | nanoid / uuid | No extra dependency; built-in Node.js API sufficient for correlation IDs |

**Installation:**
```bash
pnpm add @supabase/supabase-js @supabase/ssr @sentry/nextjs @axiomhq/js @axiomhq/logging @axiomhq/nextjs @axiomhq/react next-themes lucide-react sonner
```

**Dev tools:**
```bash
pnpm add -D supabase
```

**shadcn/ui init (must run BEFORE adding components):**
```bash
pnpm dlx shadcn@latest init --preset b3QwALGmg --template next
```

**shadcn/ui components needed for Phase 1:**
```bash
pnpm dlx shadcn@latest add button input separator avatar sonner dropdown-menu alert-dialog
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx           # Split-layout login page
│   ├── (app)/
│   │   ├── layout.tsx             # Authenticated shell (sidebar + header)
│   │   └── page.tsx               # Dashboard placeholder
│   ├── api/
│   │   └── cron/
│   │       └── zombie-recovery/
│   │           └── route.ts       # Vercel Cron endpoint
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts           # Supabase auth callback (magic link + OAuth)
│   ├── global-error.tsx           # Sentry error boundary (created by wizard)
│   ├── layout.tsx                 # Root layout (fonts, theme provider, Sonner)
│   └── instrumentation.ts        # Sentry instrumentation hook
├── lib/
│   └── supabase/
│       ├── client.ts              # Browser client (createBrowserClient)
│       ├── server.ts              # Server client (createServerClient + cookies)
│       └── middleware.ts          # Auth middleware helper
├── features/
│   └── auth/
│       ├── components/
│       │   ├── login-form.tsx     # Email + Google OAuth form
│       │   └── sign-out-button.tsx
│       └── actions/
│           └── auth-actions.ts    # Server actions for sign-in/sign-out
├── components/
│   ├── ui/                        # shadcn/ui components (auto-generated)
│   ├── shell/
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   └── theme-toggle.tsx
│   └── providers/
│       └── theme-provider.tsx     # next-themes provider
├── middleware.ts                   # Root middleware (Supabase auth refresh)
supabase/
├── config.toml                    # Supabase local config
└── migrations/
    ├── 00001_initial_schema.sql   # All 11 tables + ENUMs + indexes
    └── 00002_rls_policies.sql     # All RLS policies
sentry.client.config.ts
sentry.server.config.ts
sentry.edge.config.ts
vercel.json                        # Cron job definitions
```

### Pattern 1: Supabase SSR Auth with Middleware

**What:** Use `@supabase/ssr` to create server/browser clients that handle cookies automatically via PKCE flow. Middleware refreshes expired tokens on every request.

**When to use:** Every authenticated page and API route.

**Example:**
```typescript
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

```typescript
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  // Refresh session -- MUST be called
  await supabase.auth.getUser();

  // Redirect unauthenticated users to /login
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !request.nextUrl.pathname.startsWith("/login") && !request.nextUrl.pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

### Pattern 2: Supabase Auth Callback Route

**What:** Handle the auth callback for both magic link and OAuth flows via a single route.

**Example:**
```typescript
// src/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
```

### Pattern 3: Vercel Cron with CRON_SECRET

**What:** Secure cron endpoints using Vercel's built-in CRON_SECRET authorization header.

**Example:**
```typescript
// src/app/api/cron/zombie-recovery/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reset stuck actions
  // Log to job_logs + Axiom
  // ...

  return NextResponse.json({ ok: true });
}
```

```json
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/zombie-recovery",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Pattern 4: Correlation ID Strategy

**What:** Generate a correlation ID per request/operation and thread it through Sentry + Axiom for cross-referencing errors with structured logs.

**Recommendation:** Use `crypto.randomUUID()` (built-in Node.js). Generate in middleware or at the start of each cron invocation. Pass via headers or function arguments -- do NOT use AsyncLocalStorage (overkill for Phase 1).

**Example:**
```typescript
// In middleware or API route
const correlationId = crypto.randomUUID();

// Sentry scope
Sentry.setTag("correlation_id", correlationId);

// Axiom log
logger.info("Action executed", { correlationId, actionId, duration_ms });
```

### Anti-Patterns to Avoid
- **Using `@supabase/auth-helpers-nextjs`:** Deprecated. Use `@supabase/ssr` instead.
- **Calling `getSession()` in Server Components:** Use `getUser()` -- it validates the JWT against the Supabase Auth server rather than trusting the local cookie blindly.
- **Putting auth logic in layout.tsx instead of middleware:** Auth checks must happen in middleware to protect all routes uniformly. Layouts can read the user for display but should not redirect.
- **Creating Supabase admin client in client-side code:** The `service_role` key must never reach the browser. Use it only in server-side API routes/crons.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie-based SSR auth | Custom JWT + cookie management | @supabase/ssr (PKCE flow, automatic token refresh) | Token refresh, PKCE code exchange, cookie chunking for large JWTs |
| Theme switching | Custom localStorage + CSS class toggle | next-themes | SSR flash prevention, system preference detection, hydration mismatch handling |
| Toast notifications | Custom portal + animation | sonner (via shadcn Sonner component) | Accessible, stacked, keyboard dismissable, SSR-safe |
| Source map uploads | Manual upload script | @sentry/nextjs withSentryConfig | Automatic during build, version tagging, artifact management |
| Error boundaries | Custom error boundary + reporting | Sentry's global-error.tsx + captureException | Automatic breadcrumbs, session replay, release correlation |
| Database migrations | Raw SQL files run manually | Supabase CLI migrations | Versioned, reversible, local dev + remote push, team-safe |

## Common Pitfalls

### Pitfall 1: Supabase Auth Cookie Not Refreshing
**What goes wrong:** User sessions expire silently; users get logged out unexpectedly.
**Why it happens:** Middleware doesn't call `supabase.auth.getUser()`, so expired tokens are never refreshed.
**How to avoid:** Always call `await supabase.auth.getUser()` in middleware on every request. This is what triggers the token refresh.
**Warning signs:** Users reporting being logged out after ~1 hour of inactivity.

### Pitfall 2: RLS Policies Block All Access
**What goes wrong:** Authenticated users get empty query results despite data existing.
**Why it happens:** RLS is enabled but policies don't properly reference `auth.uid()` or the JWT claims.
**How to avoid:** Test every policy with both `anon` and `authenticated` roles. Ensure `auth.uid()` matches the `user_id` column pattern used across all tables.
**Warning signs:** `SELECT * FROM table` returns empty from the app but returns data from the Supabase dashboard (which uses service_role).

### Pitfall 3: Next.js 15 Async cookies()
**What goes wrong:** Build errors or runtime crashes when creating Supabase server client.
**Why it happens:** In Next.js 15, `cookies()` from `next/headers` is async (returns a Promise). Code from Next.js 14 tutorials that calls `cookies()` synchronously will break.
**How to avoid:** Always `await cookies()` -- e.g. `const cookieStore = await cookies()`.
**Warning signs:** Type error on `cookieStore.getAll()` or "cookies was called without await".

### Pitfall 4: Vercel Cron Not Secured
**What goes wrong:** Anyone can trigger the zombie recovery endpoint by visiting the URL.
**Why it happens:** Missing CRON_SECRET check in the route handler.
**How to avoid:** Always verify `Authorization: Bearer ${CRON_SECRET}` header. Vercel injects this automatically when invoking crons.
**Warning signs:** Unexpected cron invocations in logs.

### Pitfall 5: Sentry withSentryConfig Breaking Turbopack
**What goes wrong:** Dev server fails to start or throws errors about unsupported webpack plugins.
**Why it happens:** Sentry's webpack plugin is not compatible with Turbopack in dev mode.
**How to avoid:** Use `--turbopack` only if Sentry supports it in the installed version. The Sentry wizard typically handles this, but verify the generated next.config.ts disables Sentry webpack in Turbopack mode.
**Warning signs:** Dev server crashes with webpack plugin errors.

### Pitfall 6: Google OAuth Redirect URI Mismatch
**What goes wrong:** Google OAuth fails with redirect_uri_mismatch error.
**Why it happens:** The redirect URI in Google Cloud Console doesn't match the Supabase callback URL format.
**How to avoid:** Set the redirect URI in Google Console to `https://<project-ref>.supabase.co/auth/v1/callback`. Also configure the site URL in Supabase Auth settings to match the Vercel production domain.
**Warning signs:** OAuth works locally but fails in production (or vice versa).

## Code Examples

### Supabase Magic Link Sign-In (Server Action)
```typescript
// src/features/auth/actions/auth-actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signInWithGoogle() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

### Zombie Recovery Cron SQL
```sql
-- Reset stuck actions and log to job_logs
WITH stuck AS (
  UPDATE actions
  SET status = 'failed',
      error = 'Zombie recovery: execution exceeded 10 minutes'
  WHERE status = 'executing'
    AND executed_at < NOW() - INTERVAL '10 minutes'
  RETURNING id, user_id
)
INSERT INTO job_logs (id, job_type, status, user_id, action_id, started_at, finished_at, duration_ms, metadata)
SELECT
  gen_random_uuid(),
  'action',
  'timeout',
  s.user_id,
  s.id,
  NOW(),
  NOW(),
  0,
  jsonb_build_object('recovery', 'zombie', 'original_action_id', s.id)
FROM stuck s;
```

### RLS Policy Pattern (users table example)
```sql
-- Users can only read/update their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- No INSERT policy needed -- Supabase Auth trigger handles user creation
-- No DELETE policy -- users cannot delete themselves
```

### Environment Variables Required
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# App
NEXT_PUBLIC_SITE_URL=https://repco.ai

# Sentry
SENTRY_DSN=<dsn>
SENTRY_AUTH_TOKEN=<auth-token>
SENTRY_ORG=<org>
SENTRY_PROJECT=<project>

# Axiom
AXIOM_TOKEN=<token>
AXIOM_DATASET=<dataset>

# Vercel Cron
CRON_SECRET=<auto-generated-by-vercel>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @supabase/auth-helpers-nextjs | @supabase/ssr | Mid-2024 | New cookie-based approach; old package deprecated |
| next-axiom | @axiomhq/nextjs + @axiomhq/js + @axiomhq/logging + @axiomhq/react | Late 2025 | Modular packages, framework-agnostic core |
| Synchronous cookies() in Next.js | Async cookies() (await required) | Next.js 15.0 | Breaking change from 14.x; all server utility calls are now async |
| Sentry sentry.server.config.ts import | instrumentation.ts hook | Next.js 15+ / Sentry 8+ | Uses Next.js instrumentation hook instead of custom import |
| PRD says Next.js 14 | User decision says Next.js 15 | CONTEXT.md | Next.js 15 is the locked decision; PRD reference is outdated |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`. Do not use.
- `next-axiom`: Legacy. Use `@axiomhq/nextjs` instead.
- Synchronous `cookies()` / `headers()`: Must be awaited in Next.js 15.

## Open Questions

1. **shadcn/ui Preset Behavior**
   - What we know: The preset code `b3QwALGmg` is provided by the user and the init command is locked.
   - What's unclear: Exactly what the preset configures (color scheme, default components, Tailwind config). Presets are opaque URL-encoded configs.
   - Recommendation: Run the init command first, then inspect and override the generated Tailwind config with the brand colors/fonts from the UI spec. The preset provides a starting point, not the final config.

2. **Axiom @axiomhq/nextjs Maturity**
   - What we know: Version 0.2.0, relatively new package replacing legacy next-axiom.
   - What's unclear: Exact API surface and configuration patterns (v0.2.0 is early).
   - Recommendation: If the API is too unstable or undocumented, fall back to `@axiomhq/js` directly with manual Next.js integration. The core client is at v1.6.0 and is stable.

3. **Supabase Auth Trigger for users Table**
   - What we know: Supabase Auth creates entries in `auth.users`. The PRD schema has a separate `public.users` table.
   - What's unclear: Whether to use a database trigger or application-level sync to populate `public.users` from `auth.users`.
   - Recommendation: Use a Postgres trigger (`on auth.users INSERT`) to auto-create the `public.users` row. This is the standard Supabase pattern and avoids race conditions.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (standard for Next.js 15 projects) |
| Config file | None -- Wave 0 will create vitest.config.ts |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBSV-01 | Job logs record action executions with duration, status, error | unit | `pnpm vitest run src/features/observability/__tests__/job-logs.test.ts -t "job logs"` | No -- Wave 0 |
| OBSV-02 | Zombie recovery resets stuck actions > 10 min | integration | `pnpm vitest run src/app/api/cron/zombie-recovery/__tests__/route.test.ts` | No -- Wave 0 |
| OBSV-03 | Sentry captures errors; Axiom receives structured logs | smoke / manual | Manual: trigger error in dev, verify in Sentry dashboard + Axiom dataset | N/A -- manual |
| OBSV-04 | Email alerts on low success rate (deferred to Phase 4) | N/A | Deferred | N/A |

**Additional tests (non-requirement, infrastructure validation):**

| Area | Test Type | Command |
|------|-----------|---------|
| Supabase client creation (browser + server) | unit | `pnpm vitest run src/lib/supabase/__tests__/` |
| Auth callback route | integration | `pnpm vitest run src/app/auth/callback/__tests__/` |
| Middleware auth redirect logic | unit | `pnpm vitest run src/__tests__/middleware.test.ts` |
| RLS policies | manual | Supabase dashboard SQL editor or `supabase test db` |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --reporter=verbose`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- test framework configuration
- [ ] `src/features/observability/__tests__/job-logs.test.ts` -- covers OBSV-01
- [ ] `src/app/api/cron/zombie-recovery/__tests__/route.test.ts` -- covers OBSV-02
- [ ] `src/lib/supabase/__tests__/client.test.ts` -- infrastructure validation
- [ ] Framework install: `pnpm add -D vitest @vitejs/plugin-react @testing-library/react` -- if none detected

## Sources

### Primary (HIGH confidence)
- [Supabase SSR Auth with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) -- middleware pattern, createServerClient, PKCE flow
- [Supabase Creating a Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client) -- browser + server client utilities
- [Sentry Next.js Manual Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/) -- config files, instrumentation hook, global-error
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) -- vercel.json config, CRON_SECRET pattern
- [shadcn/ui CLI init](https://ui.shadcn.com/docs/cli) -- preset flag, template options

### Secondary (MEDIUM confidence)
- [Axiom Next.js Integration](https://axiom.co/docs/send-data/nextjs) -- @axiomhq/nextjs setup (v0.2.0 is early; may need fallback)
- [next-axiom GitHub](https://github.com/axiomhq/next-axiom) -- legacy reference for patterns

### Tertiary (LOW confidence)
- Axiom @axiomhq/nextjs exact API surface -- v0.2.0 documentation is sparse; flagged for validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via npm registry; versions confirmed
- Architecture: HIGH -- follows official Supabase + Next.js SSR guide patterns exactly
- Pitfalls: HIGH -- well-documented migration gotchas (Next.js 14->15 async cookies, deprecated auth-helpers)
- Axiom integration: MEDIUM -- new package at v0.2.0; may need fallback to core @axiomhq/js

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable stack, 30-day validity)
