---
phase: quick
plan: 260418-fcb
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/config.toml
  - .env.example
autonomous: true
must_haves:
  truths:
    - "Google OAuth provider is enabled in local Supabase config"
    - "Environment variables for Google OAuth are documented"
  artifacts:
    - path: "supabase/config.toml"
      provides: "Google OAuth provider enabled"
      contains: "enabled = true"
    - path: ".env.example"
      provides: "Google OAuth env var documentation"
      contains: "GOOGLE_CLIENT_ID"
  key_links:
    - from: "supabase/config.toml"
      to: "env(GOOGLE_CLIENT_ID)"
      via: "Supabase config env() references"
      pattern: "env\\(GOOGLE_CLIENT"
---

<objective>
Enable Google OAuth provider in the local Supabase configuration and document the required environment variables.

Purpose: The `signInWithGoogle` server action already calls `supabase.auth.signInWithOAuth({ provider: "google" })`, but the local Supabase config has `[auth.external.google] enabled = false`. This blocks Google login in local dev. The env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are also missing from `.env.example`.

Output: Updated `supabase/config.toml` with Google OAuth enabled, updated `.env.example` with Google OAuth env vars.
</objective>

<execution_context>
@C:/Users/kamil/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/kamil/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@supabase/config.toml
@.env.example
@src/features/auth/actions/auth-actions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enable Google OAuth provider and document env vars</name>
  <files>supabase/config.toml, .env.example</files>
  <action>
1. In `supabase/config.toml`, change `[auth.external.google]` section:
   - Set `enabled = true` (line 93, currently `false`)
   - Keep `client_id = "env(GOOGLE_CLIENT_ID)"` as-is (already correct)
   - Keep `secret = "env(GOOGLE_CLIENT_SECRET)"` as-is (already correct)
   - Leave `redirect_uri` and `url` empty (defaults are correct for standard Google OAuth)

2. In `.env.example`, add two new lines after `CRON_SECRET=`:
   ```
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ```

No other files need changes. The server action `signInWithGoogle` in `src/features/auth/actions/auth-actions.ts` already correctly uses `provider: "google"` with the Supabase OAuth flow.
  </action>
  <verify>
    <automated>grep -q "enabled = true" supabase/config.toml && grep -A1 "\[auth.external.google\]" supabase/config.toml | grep -q "enabled = true" && grep -q "GOOGLE_CLIENT_ID" .env.example && grep -q "GOOGLE_CLIENT_SECRET" .env.example && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>Google OAuth provider enabled in supabase/config.toml. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET documented in .env.example.</done>
</task>

</tasks>

<verification>
- `supabase/config.toml` has `[auth.external.google]` with `enabled = true`
- `.env.example` includes `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`
- `pnpm typecheck` still passes (no code changes)
</verification>

<success_criteria>
Google OAuth provider configuration is enabled for local development and the required environment variables are documented for developer setup.
</success_criteria>

<output>
After completion, create `.planning/quick/260418-fcb-add-google-oauth-provider-configuration/260418-fcb-SUMMARY.md`
</output>
