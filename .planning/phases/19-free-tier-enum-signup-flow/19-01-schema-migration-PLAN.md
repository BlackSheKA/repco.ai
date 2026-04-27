---
phase: 19
plan: 19-01-schema-migration
type: execute
wave: 1
depends_on: [19-00-wave-0-test-harness]
files_modified:
  - supabase/migrations/00025_free_tier_signup.sql
autonomous: false
requirements: [PRIC-04, PRIC-05, PRIC-14]
must_haves:
  truths:
    - "ENUM `subscription_plan` exists in dev DB with exactly values {free, pro}"
    - "ENUM `billing_cycle` exists in dev DB with exactly values {monthly, annual}"
    - "users.subscription_plan defaults to 'free'; users.billing_cycle is nullable; CHECK constraint blocks pro+NULL cycle"
    - "users.credits_balance_cap is NEW NOT NULL DEFAULT 500; users.credits_included_monthly default switched from 500 → 250 (column already existed per 00002:18)"
    - "Backfill UPDATE sets all existing test users to subscription_plan='free', billing_cycle=NULL, credits_balance_cap=500, credits_included_monthly=250"
    - "public.normalize_email(text) function exists, LANGUAGE sql IMMUTABLE, handling Gmail/Googlemail dot+plus normalization"
    - "public.signup_audit table exists with RLS enabled and zero policies (deny-all to client roles, service_role bypass)"
    - "handle_new_user trigger body replaced atomically inserts user + 250cr ledger + signup_audit row"
    - "Legacy columns trial_ends_at, subscription_active, billing_period are explicitly written to NULL/false/NULL by trigger (NOT dropped — Phase 21 owns drops per D-12/D-13)"
    - "Migration applied to dev branch effppfiphrykllkpkdbv via Supabase Management API (NEVER prod cmkifdwjunojgigrqwnr)"
  artifacts:
    - path: "supabase/migrations/00025_free_tier_signup.sql"
      provides: "Phase 19 schema migration — ENUMs, columns, normalize_email, signup_audit, handle_new_user replacement"
      contains: "CREATE TYPE subscription_plan|CREATE TYPE billing_cycle|CREATE OR REPLACE FUNCTION public.handle_new_user|CREATE TABLE public.signup_audit|CREATE OR REPLACE FUNCTION public.normalize_email"
  key_links:
    - from: "supabase/migrations/00025_free_tier_signup.sql"
      to: "Supabase dev branch effppfiphrykllkpkdbv"
      via: "Management API curl with --ssl-no-revoke (Windows) per CLAUDE.md"
      pattern: "api.supabase.com/v1/projects/effppfiphrykllkpkdbv"
    - from: "public.handle_new_user trigger function"
      to: "public.users + public.credit_transactions + public.signup_audit"
      via: "atomic 3-step INSERT inside SECURITY DEFINER trigger function"
      pattern: "INSERT INTO public.users|INSERT INTO public.credit_transactions|INSERT INTO public.signup_audit"
---

<objective>
Author and apply migration `supabase/migrations/00025_free_tier_signup.sql` introducing the free-tier schema model and rewritten signup trigger.

Purpose: Closes PRIC-04 (ENUMs + columns), PRIC-05 (trigger rewrite — 250cr free signup, no trial), and the database half of PRIC-14 (signup_audit table + normalize_email function). Strictly additive — keeps legacy `trial_ends_at`, `subscription_active`, `billing_period` columns in place per D-12 (Phase 21 owns drops).

Output: One migration file applied to dev branch only.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/19-free-tier-enum-signup-flow/19-CONTEXT.md
@.planning/phases/19-free-tier-enum-signup-flow/19-RESEARCH.md
@.planning/phases/19-free-tier-enum-signup-flow/19-PATTERNS.md
@.planning/phases/19-free-tier-enum-signup-flow/19-VALIDATION.md
@CLAUDE.md
@supabase/migrations/00002_initial_schema.sql
@supabase/migrations/00004_auth_trigger.sql
@supabase/migrations/00010_phase5_billing_onboarding.sql
@supabase/migrations/00015_auto_trial.sql
@supabase/migrations/00024_mechanism_costs.sql

<interfaces>
Existing schema constraints (from RESEARCH.md, VERIFIED):
- `public.users.credits_included_monthly` ALREADY EXISTS (00002_initial_schema.sql:18, default 500). MUST use ALTER COLUMN SET DEFAULT, NOT ADD COLUMN. ADD COLUMN will fail with 42701 duplicate_column.
- `public.users.credits_balance` exists (00002:17, default 500) — defensive ALTER to 250 default.
- `public.users.trial_ends_at`, `subscription_active`, `billing_period` columns must remain in place (NULL-able) — Phase 19 keeps, Phase 21 drops.
- `on_auth_user_created` trigger DDL is in 00004 — DO NOT touch, only CREATE OR REPLACE the function body.
- `subscription_tier` ENUM does NOT exist in DB — do NOT add a `DROP TYPE IF EXISTS subscription_tier` (footgun per RESEARCH.md anti-patterns).
- `billing_period_type` ENUM still exists and feeds `billing_period` column — leave it alone (Phase 21 owns drop).
- `credit_transactions` schema (00010): columns `(id, user_id, type credit_type, amount, description, created_at, ...)`; type ENUM includes `monthly_grant`.

Trigger body shape from 00015 (analog):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (...) VALUES (...);
  INSERT INTO public.credit_transactions (...) VALUES (...);
  RETURN NEW;
END;
$$;
```

Management API recipe (per memory `reference_supabase_management_api`):
```
curl --ssl-no-revoke -X POST \
  https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d @<(jq -Rs '{query: .}' < supabase/migrations/00025_free_tier_signup.sql)
```
On Windows, escape via PowerShell or paste payload through `--data-binary @file` after pre-jq. The script can also use `node scripts/test-trigger-19.mjs` runSql helper for application — fine either way.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author 00025_free_tier_signup.sql migration</name>
  <files>supabase/migrations/00025_free_tier_signup.sql</files>
  <action>
Create the migration with header banner and 6 numbered sections in this exact order (matches RESEARCH.md "Recommended ordering"):

```sql
-- Migration: 00025_free_tier_signup
-- Purpose: Phase 19 — free-tier ENUMs, per-plan credit columns, signup_audit table,
--          rewritten handle_new_user trigger granting 250 cr with no trial.
-- Depends on: 00002 (users), 00004 (auth trigger DDL), 00010 (credit_transactions),
--             00015 (previous handle_new_user body — replaced here).
-- Closes: PRIC-04, PRIC-05, PRIC-14
-- Phase 19 is ADDITIVE ONLY. Phase 21 owns dropping legacy columns
-- (trial_ends_at, subscription_active, billing_period).
```

**Section 1 — New ENUMs** (per D-01, D-02; pattern from 00024):
```sql
CREATE TYPE public.subscription_plan AS ENUM ('free', 'pro');
CREATE TYPE public.billing_cycle    AS ENUM ('monthly', 'annual');
```

**Section 2 — Add new columns + change existing default** (per D-04, RESEARCH Pitfall 1+2):
```sql
ALTER TABLE public.users
  ADD COLUMN subscription_plan public.subscription_plan NOT NULL DEFAULT 'free',
  ADD COLUMN billing_cycle     public.billing_cycle,                              -- nullable for free
  ADD COLUMN credits_balance_cap integer NOT NULL DEFAULT 500;

-- credits_included_monthly already exists from 00002 with DEFAULT 500 —
-- only change the default; backfill happens in Section 3.
ALTER TABLE public.users ALTER COLUMN credits_included_monthly SET DEFAULT 250;

-- Defensive: also retarget credits_balance default for any future direct INSERT
-- (current code only inserts via trigger, but matches the new free-tier baseline).
ALTER TABLE public.users ALTER COLUMN credits_balance SET DEFAULT 250;

-- Conditional NOT NULL via CHECK (cannot use NOT NULL directly per D-02 + Pitfall 2)
ALTER TABLE public.users
  ADD CONSTRAINT users_billing_cycle_required_for_pro
    CHECK (subscription_plan = 'free' OR billing_cycle IS NOT NULL);
```

**Section 3 — Backfill existing rows** (per D-06):
```sql
UPDATE public.users
SET
  subscription_plan = 'free',
  billing_cycle = NULL,
  credits_balance_cap = 500,
  credits_included_monthly = 250,
  updated_at = NOW()
WHERE TRUE;
-- Test data only; Phase 20 wipes auth.users anyway. Per CLAUDE.md memory
-- `project_users_are_test_data`: pre-launch, all users are test data.
```

**Section 4 — `public.normalize_email` SQL function** (per D-10, RESEARCH Pattern 5; LANGUAGE sql IMMUTABLE):
```sql
CREATE OR REPLACE FUNCTION public.normalize_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN split_part(lower(p_email), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '')
           || '@gmail.com'
    ELSE lower(p_email)
  END;
$$;
```

**Section 5 — `public.signup_audit` table + RLS** (per D-10, D-11, RESEARCH Pattern 4):
```sql
CREATE TABLE public.signup_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  ip               inet,
  duplicate_flag   boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_audit_email_ip
  ON public.signup_audit (email_normalized, ip);

ALTER TABLE public.signup_audit ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies → all client roles denied.
-- service_role bypasses RLS; trigger uses SECURITY DEFINER so writes succeed.
```

**Section 6 — Replace `handle_new_user` body** (per D-07, D-09, D-12; pattern from 00015 + RESEARCH Code Examples):
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ip inet := NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet;
  v_normalized text := public.normalize_email(NEW.email);
BEGIN
  -- 1. user row (free plan, 250 cr, NO trial; legacy fields explicitly NULL/false per D-12)
  INSERT INTO public.users (
    id, email,
    subscription_plan, billing_cycle,
    credits_balance, credits_balance_cap, credits_included_monthly,
    trial_ends_at, subscription_active, billing_period,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    'free', NULL,
    250, 500, 250,
    NULL, false, NULL,
    NOW(), NOW()
  );

  -- 2. atomic ledger row (double-entry invariant from 00010 / 00015)
  INSERT INTO public.credit_transactions (user_id, type, amount, description, created_at)
  VALUES (NEW.id, 'monthly_grant', 250, 'Free tier signup grant', NOW());

  -- 3. audit row (PRIC-14). duplicate_flag set if same (email_normalized, ip) seen before.
  INSERT INTO public.signup_audit (user_id, email_normalized, ip, duplicate_flag, created_at)
  VALUES (
    NEW.id,
    v_normalized,
    v_ip,
    EXISTS (
      SELECT 1 FROM public.signup_audit prev
      WHERE prev.email_normalized = v_normalized
        AND prev.ip = v_ip
        AND v_ip IS NOT NULL
        AND prev.user_id <> NEW.id
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;
```

Notes baked in:
- All references fully qualified (`public.users`, `public.credit_transactions`, `public.signup_audit`, `public.normalize_email`) — Pitfall 7 (search_path injection on SECURITY DEFINER).
- Empty-string IP coerced to NULL via NULLIF — Pitfall 5.
- Duplicate detection skipped when ip IS NULL (avoids false-positive collisions on all-NULL OAuth signups before callback fills IP).
- `on_auth_user_created` trigger DDL is NOT touched (already in 00004) — function body replacement only.

Do NOT add any DROP statements. Do NOT touch `subscription_tier` (does not exist). Do NOT touch `billing_period_type` (Phase 21).
  </action>
  <verify>
    <automated>test -f supabase/migrations/00025_free_tier_signup.sql && grep -q "CREATE TYPE public.subscription_plan AS ENUM" supabase/migrations/00025_free_tier_signup.sql && grep -q "users_billing_cycle_required_for_pro" supabase/migrations/00025_free_tier_signup.sql && grep -q "Free tier signup grant" supabase/migrations/00025_free_tier_signup.sql && ! grep -q "DROP TYPE" supabase/migrations/00025_free_tier_signup.sql</automated>
  </verify>
  <done>
- Migration file exists at `supabase/migrations/00025_free_tier_signup.sql`
- Contains all 6 numbered sections (header search: `-- Section 1` through `-- Section 6` or equivalent comments)
- No DROP statements anywhere
- No reference to `subscription_tier` or `billing_period_type`
- All `public.` schema qualifiers present in trigger body (grep `public.users`, `public.credit_transactions`, `public.signup_audit`, `public.normalize_email`)
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2 [BLOCKING]: Apply migration to dev branch effppfiphrykllkpkdbv via Supabase Management API</name>
  <what-built>
Migration file `supabase/migrations/00025_free_tier_signup.sql` from Task 1.

This task does NOT use `supabase db push` (CLAUDE.md says use Management API directly). It uses the curl recipe from memory `reference_supabase_management_api`, with the `--ssl-no-revoke` flag for Windows.
  </what-built>
  <how-to-verify>
**SAFETY GATE — read first:** Target project ref MUST be `effppfiphrykllkpkdbv` (dev branch). NEVER target `cmkifdwjunojgigrqwnr` (prod) in this phase. Per CLAUDE.md Critical Rules + memory `feedback_dev_branch_no_touch`: never destroy or rotate dev branch — but applying additive migrations is fine.

Step 1 — Apply migration via Management API:

```bash
# From repco.ai project root, with .env.local loaded.
# SUPABASE_ACCESS_TOKEN comes from User-scope env per CLAUDE.md.

# Read the SQL into a JSON-escaped payload:
node -e "const fs=require('fs');const sql=fs.readFileSync('supabase/migrations/00025_free_tier_signup.sql','utf8');fs.writeFileSync('/tmp/00025-payload.json',JSON.stringify({query:sql}));"

curl --ssl-no-revoke -X POST \
  "https://api.supabase.com/v1/projects/effppfiphrykllkpkdbv/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/00025-payload.json
```

Expected: HTTP 200/201 with empty result array `[]` (DDL statements return no rows).

Step 2 — Run the Wave 0 harness (post-migration mode now):

```bash
node scripts/test-trigger-19.mjs --quick
```

Expected output: every subcommand prints `OK <name>` and the script exits 0:
```
OK enums
OK columns
OK audit-table
OK normalize
OK signup
OK duplicate
OK plan-config
```

Step 3 — Manual sanity SELECTs via Management API:

```sql
-- Confirm ENUMs
SELECT enum_range(NULL::public.subscription_plan);
SELECT enum_range(NULL::public.billing_cycle);

-- Confirm function exists
SELECT public.normalize_email('Kamil.Wandtke+x@Googlemail.com');
-- Expected: kamilwandtke@gmail.com

-- Confirm signup_audit RLS
SELECT relname, relrowsecurity FROM pg_class WHERE relname='signup_audit';
-- Expected: relrowsecurity = true
```

If any step fails: do NOT mark this task complete. Investigate the SQL error, fix the migration in Task 1, and re-apply.

If applied successfully but the trigger is broken, you can re-run the migration — `CREATE OR REPLACE FUNCTION` is idempotent, but `CREATE TYPE` and `CREATE TABLE` and `ADD COLUMN` are NOT. To recover from a partial apply: write a one-off rollback SQL that DROPs the new ENUMs/columns/table/constraint, then re-apply 00025. (Acceptable on dev branch only.)
  </how-to-verify>
  <resume-signal>Type "approved" after `node scripts/test-trigger-19.mjs --quick` exits 0 with all OK lines, or describe what failed.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md with migration applied + commit</name>
  <files>.planning/STATE.md</files>
  <action>
Append a single dated line to `.planning/STATE.md` Recent Decisions / Status section noting:
- Phase 19 migration `00025_free_tier_signup.sql` applied to dev branch effppfiphrykllkpkdbv on {today's date}.
- Wave 0 harness `--quick` passes all 7 subcommands.
- Plan 02 (application integration) is unblocked.

Do NOT modify any other section of STATE.md. This is a surgical append.

Commit:
```
git add supabase/migrations/00025_free_tier_signup.sql .planning/STATE.md
git commit -m "feat(19-01): free-tier ENUMs, signup_audit table, handle_new_user rewrite (PRIC-04, PRIC-05, PRIC-14)"
```

Do NOT push. Do NOT merge to main. Default branch is `development` per CLAUDE.md.
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -q "19-01"</automated>
  </verify>
  <done>
- STATE.md has one new line documenting Phase 19 migration applied to dev
- One commit on `development` branch with the migration + STATE.md change
- No push to remote unless user explicitly asks
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Local dev → Supabase Management API | DDL applied via PAT-authenticated curl on dev branch |
| auth.users INSERT → public.handle_new_user trigger | Untrusted user-controlled `raw_user_meta_data.ip` crosses into trigger |
| public.handle_new_user trigger → public.users / credit_transactions / signup_audit | SECURITY DEFINER privilege escalation context |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-01-01 | Elevation of Privilege | `handle_new_user` SECURITY DEFINER function | mitigate | `SET search_path = ''` (preserved verbatim from 00015) + every reference fully qualified `public.users`, `public.credit_transactions`, `public.signup_audit`, `public.normalize_email`. Prevents an attacker who can create a `public.users` shim from hijacking inserts. [CITED: supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions] |
| T-19-01-02 | Tampering | Migration applied to wrong project (prod ref) | mitigate | Manual checkpoint requires explicit URL `effppfiphrykllkpkdbv` in curl. Wave 0 harness already enforces same gate. CLAUDE.md prohibits prod destructive SQL without confirmation. |
| T-19-01-03 | Information Disclosure | signup_audit row leak via authenticated user reads | mitigate | RLS enabled with ZERO policies → authenticated/anon roles cannot SELECT. Only service_role (bypass) and SECURITY DEFINER trigger can write/read. [VERIFIED: pattern matches 00024 inverse — D-10 explicit] |
| T-19-01-04 | Spoofing | User crafts `raw_user_meta_data.ip` to evade duplicate detection | accept | Per D-11, duplicate is audit-only (no hard reject). Even if attacker rotates IP, audit still captures email_normalized; manual SQL review sees collision via Gmail-aware normalize. Hard-reject deferred to post-launch. |
| T-19-01-05 | Tampering | `''::inet` cast error breaks signup flow entirely | mitigate | `NULLIF(NEW.raw_user_meta_data->>'ip', '')::inet` coerces empty string to NULL before cast (Pitfall 5). Trigger gracefully accepts missing IP — audit row inserts with `ip=NULL`. |
| T-19-01-06 | Denial of Service | Backfill UPDATE locks users table on prod | accept | Migration runs on dev only this phase; user count is small (test data). Phase 21 will run a similar UPDATE on prod with appropriate timing — out of scope here. |
| T-19-01-07 | Repudiation | credit_transactions row not written if trigger crashes mid-flight | mitigate | All 3 INSERTs are inside the implicit auth.users transaction; any failure rolls back the entire signup. Atomic invariant preserved (no orphaned user without ledger row). |
| T-19-01-08 | Information Disclosure | Duplicate detection EXISTS subquery timing leak | accept | Audit row is inserted unconditionally regardless of duplicate; signup latency does not vary with duplicate state in a way exploitable for enumeration. Index on (email_normalized, ip) ensures O(log n). |
</threat_model>

<verification>
After Task 3 commit:

```bash
# Migration file present
test -f supabase/migrations/00025_free_tier_signup.sql

# Wave 0 harness all green post-application
node scripts/test-trigger-19.mjs --quick

# Spot checks via runSql or curl Management API
# (these are also covered by --quick subcommands above; documented here for executor sanity)
SELECT enum_range(NULL::public.subscription_plan);  -- {free,pro}
SELECT enum_range(NULL::public.billing_cycle);      -- {monthly,annual}
SELECT public.normalize_email('Kamil.Wandtke+x@Googlemail.com');  -- kamilwandtke@gmail.com
SELECT relrowsecurity FROM pg_class WHERE relname='signup_audit'; -- t

# No accidental prod hit
git log -1 --stat | grep -v "cmkifdwjunojgigrqwnr"
```
</verification>

<success_criteria>
- `supabase/migrations/00025_free_tier_signup.sql` exists and contains all 6 numbered sections
- Migration applied successfully to dev branch effppfiphrykllkpkdbv via Management API
- `node scripts/test-trigger-19.mjs --quick` exits 0 with 7 OK lines
- STATE.md updated with one-line note
- One commit `feat(19-01): ...` on `development` branch
- No reference to `cmkifdwjunojgigrqwnr` in any committed file
- No DROP statements in the migration
- Legacy columns (`trial_ends_at`, `subscription_active`, `billing_period`) still exist on `public.users` (verifiable via `\d users`)
</success_criteria>

<output>
After completion, create `.planning/phases/19-free-tier-enum-signup-flow/19-01-SUMMARY.md` recording:
- Migration file path + 6 sections
- Application timestamp + dev branch ref
- Wave 0 `--quick` post-application result (7 OK lines)
- Confirmation that legacy columns kept (NOT dropped — Phase 21 scope)
- Confirmation that prod branch was never touched
</output>
