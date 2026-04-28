Push `main` to Vercel production: sync Supabase migrations from DEV branch to PROD, then push `main` to trigger a production deployment.

**Prerequisites:** Run `/project:deploy-to-test` first (which merges `development` into `main` locally) and verify everything works on the preview deploy.

## Steps

### 1. Pre-flight checks

a) **Check current branch** — must be on `development`. If not, abort.

b) **Check `main` is ahead of remote:**
   - Run: `git log origin/main..main --oneline`
   - If there are no local commits on `main` that haven't been pushed, abort with:
     "Branch `main` has no unpushed commits. Run `/project:deploy-to-test` first to merge development into main."

c) **Show what will be deployed:**
   - Run: `git log origin/main..main --oneline` to show all commits that will be pushed
   - **Ask user to confirm** they want to deploy these changes to production

### 2. Supabase sync DEV → PROD

This project uses the Supabase Management API via `curl` (no Supabase MCP installed). Required env: `SUPABASE_ACCESS_TOKEN`. On Windows always pass `--ssl-no-revoke` to curl.

Project IDs:
- DEV branch:  `effppfiphrykllkpkdbv` (persistent — NEVER delete/recreate)
- PROD:        `cmkifdwjunojgigrqwnr` (West US Oregon)

**a) List local migration filenames:**
- Read all files in `supabase/migrations/*.sql` and extract their numeric prefix (e.g. `00019`, `00020`).
- The local `supabase/migrations/` directory is the source of truth.

**b) Compare against PROD:**
- Query PROD: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`
  ```bash
  curl -sS --ssl-no-revoke -X POST \
    "https://api.supabase.com/v1/projects/cmkifdwjunojgigrqwnr/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"}'
  ```
- If PROD doesn't have a `supabase_migrations.schema_migrations` table (project predates CLI tracking), fall back to inspecting `pg_type` / `information_schema.tables` for known recent objects (e.g. confirm `apify_runs` exists, confirm `signal_source_type` includes `linkedin_company`).
- Identify any migrations present locally but missing on PROD.
- If none: report "Database already in sync" and skip to step 2e.

**c) Show migration plan:**
- List all migrations that will be applied to PROD with filenames + 1-line summary from the file header.
- **Ask user to confirm** before applying any migrations.
- If user declines, abort the entire deployment.

**d) Apply missing migrations:**
For each missing migration in chronological order:
- Read SQL from `supabase/migrations/<filename>`
- POST it to the PROD `/database/query` endpoint above
- If the migration has multiple statements separated by `;`, split and apply each individually (the management API rejects some multi-statement payloads)
- **CRITICAL:** Apply only DDL (`CREATE TABLE/INDEX/POLICY`, `ALTER TYPE … ADD VALUE`, etc.). NEVER apply DML (`INSERT/UPDATE/DELETE` on existing user data) without explicit user approval per statement.
- If any statement fails, stop and report the error — do not continue with deployment.

**e) Verify schema parity:**
- Compare table count: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'` on both DEV and PROD.
- Confirm RLS: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
- Confirm enum drift: `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('signal_source_type','platform_type','intent_type') GROUP BY t.typname`
- If any mismatch detected, warn the user and ask whether to proceed.

**f) Report sync result:**
- Show number of migrations applied (or "already in sync")
- Show summary: tables, enums, RLS policies — DEV vs PROD with counts.

### 3. Push main to production

```bash
git checkout main
git push origin main
git checkout development
```

- Poll Vercel deployment status every 15s for up to 5 min:
  - Project ID: `prj_dia7ObtJASNbGNae23lstUuxagHQ`
  - Team ID:    `team_Fet1G9S6sYJTj2F3sSPArUso`
  - `vercel ls 2>&1 | grep "main\|Production" | head -3` shows recent prod deploys with status.
- Wait for `state: READY`.
- If deployment enters `ERROR`, report build logs (`vercel logs <deployment-url>`).

### 4. Sync Vercel env vars (if any new ones added)

If the deploy adds any new env vars (e.g. `APIFY_WEBHOOK_SECRET`, `APIFY_REDDIT_ACTOR_ID`), confirm they are present in Vercel **production** scope:
```bash
vercel env ls 2>&1 | grep -E "<NEW_VAR_NAMES>"
```
If missing, add via:
```bash
printf '<value>' | vercel env add <NAME> production
```
Per CLAUDE.md: also add to `preview development` scope when relevant.

### 5. Report results

```
=== Production Deployment Complete ===

Version:      vX.Y.Z
Prod URL:     https://repco.ai
Deploy ID:    <production-deployment-id>

Database:
  Migrations applied: N (or "already in sync")
  Tables (PROD):      N
  Enums:              <list with drift status>

Environment:
  Supabase:   PROD (cmkifdwjunojgigrqwnr)
  Stripe:     Live mode
```

- Remind: "Verify https://repco.ai loads, /signals shows existing data, and the next monitor cron tick (within 15 min for Reddit, 4h for LinkedIn) writes a job_logs row."

## Important

- Never run this without first running `/deploy-to-test` to merge development into main.
- Migrations are applied to PROD **before** the code deployment, so the new schema is ready when the production build goes live.
- If migrations fail, the deployment is aborted — PROD code stays on the previous version.
- Never force-push to `main`.
- Per CLAUDE.md: NEVER destroy / recreate dev branch `effppfiphrykllkpkdbv` — only use it as the source for diffing migrations.
- Per CLAUDE.md: NEVER create `.env.production.local` on disk. If you need to inspect prod env, use `vercel env pull .env.prod.tmp --environment=production` and delete the file when done.
- This command requires user confirmation at two checkpoints: (1) what will be deployed, (2) migration plan (if any).

## Branch flow

```
development → main (local merge via deploy-to-test)
main → push to origin (production deploy via this command)
```
