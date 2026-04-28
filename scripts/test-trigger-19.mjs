#!/usr/bin/env node
// scripts/test-trigger-19.mjs
// Phase 19 — trigger integration + migration smoke harness for the dev branch.
// Subcommands:
//   --enums --columns --plan-config --audit-table
//   --signup --normalize --duplicate --quick
//
// Pre-migration: read-only commands report SKIP; trigger commands skip too.
// Post-migration: every command must report OK.

import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const DEV_REF = "effppfiphrykllkpkdbv"
const PROD_REF = "cmkifdwjunojgigrqwnr"

// ---------- env ----------

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local")
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch (err) {
    throw new Error(`Cannot read .env.local at ${path}: ${err.message}`)
  }
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[m[1]] = value
  }
  return env
}

const fileEnv = loadEnvLocal()
const SUPABASE_URL =
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY =
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const ACCESS_TOKEN =
  fileEnv.SUPABASE_ACCESS_TOKEN ?? process.env.SUPABASE_ACCESS_TOKEN

for (const [k, v] of [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY],
  ["SUPABASE_ACCESS_TOKEN", ACCESS_TOKEN],
]) {
  if (!v) {
    console.error(`Missing env var ${k} (.env.local or process env).`)
    process.exit(2)
  }
}

if (!SUPABASE_URL.includes(DEV_REF)) {
  console.error(
    `Refusing to run: not pointing at dev branch ${DEV_REF} (got ${SUPABASE_URL})`,
  )
  process.exit(2)
}
if (SUPABASE_URL.includes(PROD_REF)) {
  console.error(`Refusing to run: prod ref ${PROD_REF} detected.`)
  process.exit(2)
}

let _supabase = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 0 } },
    })
  }
  return _supabase
}

// ---------- Management API ----------

const MGMT_BASE = `https://api.supabase.com/v1/projects/${DEV_REF}`

async function runSql(sql) {
  const res = await fetch(`${MGMT_BASE}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      Connection: "close",
    },
    body: JSON.stringify({ query: sql }),
    keepalive: false,
  })
  const text = await res.text()
  if (!res.ok) {
    // Strip Authorization echoes (defensive — never leak the bearer)
    const safe = text.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>")
    const err = new Error(`runSql failed (${res.status}): ${safe}`)
    err.status = res.status
    err.body = safe
    throw err
  }
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}

function isMissing(err) {
  const m = String(err?.body ?? err?.message ?? "")
  return (
    m.includes("does not exist") ||
    m.includes("undefined_table") ||
    m.includes("undefined_column") ||
    m.includes("undefined_object")
  )
}

function sqlLit(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

// ---------- TS mirror of public.normalize_email (for cmdSignup) ----------

function normalizeEmail(email) {
  const lower = email.toLowerCase()
  const [local, domain] = lower.split("@")
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`
  }
  return lower
}

// ---------- cleanup helpers ----------

async function cleanupTestUser(userId) {
  if (!userId) return
  try {
    await getSupabase().auth.admin.deleteUser(userId)
  } catch (err) {
    const msg = String(err?.message ?? "")
    if (!msg.includes("not found") && !msg.includes("User not found")) {
      // best-effort; do not throw from cleanup
      console.warn(`cleanupTestUser warning: ${msg}`)
    }
  }
  // public.users (and signup_audit via FK CASCADE) is NOT cleaned up by
  // auth.admin.deleteUser — there is no FK CASCADE from auth.users → public.users.
  // Delete explicitly so duplicate detection across test runs stays clean.
  try {
    await runSql(`DELETE FROM public.users WHERE id=${sqlLit(userId)}`)
  } catch {
    // ignore
  }
}

async function cleanupAllTestUsersWithPrefix(prefix) {
  // Fallback sweep — uses Management API to delete by email prefix.
  try {
    const rows = await runSql(
      `SELECT id::text FROM auth.users WHERE email LIKE ${sqlLit(prefix + "%")}`,
    )
    for (const row of rows ?? []) {
      await cleanupTestUser(row.id)
    }
  } catch {
    // ignore
  }
}

// ---------- subcommand outcomes ----------

function ok(name, extra = "") {
  console.log(`OK ${name}${extra ? " — " + extra : ""}`)
  return true
}
function skip(name, reason) {
  console.log(`SKIP ${name}: ${reason}`)
  return true
}
function fail(name, reason) {
  console.log(`FAIL ${name}: ${reason}`)
  return false
}

// ---------- subcommand: --enums ----------

async function cmdEnums() {
  const name = "enums"
  try {
    const subRows = await runSql(
      `SELECT array_agg(enumlabel ORDER BY enumsortorder) AS labels FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='subscription_plan'`,
    )
    const sub = subRows?.[0]?.labels
    if (!sub) return skip(name, "subscription_plan ENUM not present")
    const subArr = Array.isArray(sub)
      ? sub
      : String(sub).replace(/[{}]/g, "").split(",")
    if (subArr.join(",") !== "free,pro")
      return fail(name, `subscription_plan = ${subArr.join(",")}`)

    const cycRows = await runSql(
      `SELECT array_agg(enumlabel ORDER BY enumsortorder) AS labels FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='billing_cycle'`,
    )
    const cyc = cycRows?.[0]?.labels
    if (!cyc) return skip(name, "billing_cycle ENUM not present")
    const cycArr = Array.isArray(cyc)
      ? cyc
      : String(cyc).replace(/[{}]/g, "").split(",")
    if (cycArr.join(",") !== "monthly,annual")
      return fail(name, `billing_cycle = ${cycArr.join(",")}`)

    return ok(name)
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }
}

// ---------- subcommand: --columns ----------

async function cmdColumns() {
  const name = "columns"
  try {
    const rows = await runSql(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users'
        AND column_name IN ('subscription_plan','billing_cycle','credits_balance_cap','credits_included_monthly')
      ORDER BY column_name
    `)
    if (!rows || rows.length < 4)
      return skip(name, `only ${rows?.length ?? 0}/4 expected columns present`)

    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]))

    if (byName.subscription_plan?.is_nullable !== "NO")
      return fail(name, "subscription_plan must be NOT NULL")
    if (
      !String(byName.subscription_plan?.column_default ?? "").includes("'free'")
    )
      return fail(
        name,
        `subscription_plan default = ${byName.subscription_plan?.column_default}`,
      )

    if (byName.billing_cycle?.is_nullable !== "YES")
      return fail(name, "billing_cycle must be nullable")
    if (byName.billing_cycle?.column_default !== null)
      return fail(
        name,
        `billing_cycle default = ${byName.billing_cycle?.column_default}`,
      )

    if (byName.credits_balance_cap?.is_nullable !== "NO")
      return fail(name, "credits_balance_cap must be NOT NULL")
    if (
      !String(byName.credits_balance_cap?.column_default ?? "").includes("500")
    )
      return fail(
        name,
        `credits_balance_cap default = ${byName.credits_balance_cap?.column_default}`,
      )

    if (
      !String(byName.credits_included_monthly?.column_default ?? "").includes(
        "250",
      )
    )
      return fail(
        name,
        `credits_included_monthly default = ${byName.credits_included_monthly?.column_default}`,
      )

    const conRows = await runSql(
      `SELECT conname FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='c' AND conname='users_billing_cycle_required_for_pro'`,
    )
    if (!conRows || conRows.length === 0)
      return fail(name, "missing CHECK users_billing_cycle_required_for_pro")

    // CHECK enforcement
    let violated = false
    try {
      await runSql(
        `BEGIN; INSERT INTO public.users (id,email,subscription_plan,billing_cycle) VALUES (gen_random_uuid(), 'pro-no-cycle@test.invalid', 'pro', NULL); ROLLBACK;`,
      )
    } catch (err) {
      const m = String(err.body ?? err.message ?? "")
      if (m.includes("23514") || m.includes("users_billing_cycle_required_for_pro"))
        violated = true
    }
    if (!violated)
      return fail(name, "CHECK did not reject pro+NULL billing_cycle")

    return ok(name)
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }
}

// ---------- subcommand: --audit-table ----------

async function cmdAuditTable() {
  const name = "audit-table"
  try {
    const tbl = await runSql(
      `SELECT relname, relrowsecurity FROM pg_class WHERE relname='signup_audit' AND relkind='r'`,
    )
    if (!tbl || tbl.length === 0)
      return skip(name, "signup_audit table not present")
    if (tbl[0].relrowsecurity !== true)
      return fail(name, "RLS must be enabled on signup_audit")

    const pol = await runSql(
      `SELECT count(*)::int AS n FROM pg_policy WHERE polrelid='public.signup_audit'::regclass`,
    )
    if ((pol?.[0]?.n ?? -1) !== 0)
      return fail(name, `signup_audit has ${pol?.[0]?.n} policies (expected 0)`)

    const cols = await runSql(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='signup_audit'
      ORDER BY ordinal_position
    `)
    const required = {
      id: { type: "uuid", nullable: "NO" },
      user_id: { type: "uuid", nullable: "NO" },
      email_normalized: { type: "text", nullable: "NO" },
      ip: { type: "inet", nullable: "YES" },
      duplicate_flag: { type: "boolean", nullable: "NO" },
      created_at: { type: "timestamp with time zone", nullable: "NO" },
    }
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]))
    for (const [col, spec] of Object.entries(required)) {
      const got = byName[col]
      if (!got) return fail(name, `signup_audit missing column ${col}`)
      if (got.data_type !== spec.type)
        return fail(
          name,
          `signup_audit.${col} type=${got.data_type} (expected ${spec.type})`,
        )
      if (got.is_nullable !== spec.nullable)
        return fail(
          name,
          `signup_audit.${col} nullable=${got.is_nullable} (expected ${spec.nullable})`,
        )
    }

    return ok(name)
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }
}

// ---------- subcommand: --normalize ----------

async function cmdNormalize() {
  const name = "normalize"
  const cases = [
    ["plain@example.com", "plain@example.com"],
    ["UPPER@EXAMPLE.COM", "upper@example.com"],
    ["kamil.wandtke@gmail.com", "kamilwandtke@gmail.com"],
    ["kamil+x@gmail.com", "kamil@gmail.com"],
    ["Kamil.Wandtke+x@Googlemail.com", "kamilwandtke@gmail.com"],
    ["with+alias@yahoo.com", "with+alias@yahoo.com"],
  ]
  try {
    for (const [input, expected] of cases) {
      const rows = await runSql(
        `SELECT public.normalize_email(${sqlLit(input)}) AS r`,
      )
      const got = rows?.[0]?.r
      if (got !== expected)
        return fail(name, `normalize_email(${input}) = ${got} (expected ${expected})`)
    }
    return ok(name)
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }
}

// ---------- subcommand: --signup ----------

async function cmdSignup() {
  const name = "signup"
  // Pre-flight: skip if migration not applied
  try {
    const probe = await runSql(
      `SELECT 1 FROM pg_type WHERE typname='subscription_plan'`,
    )
    if (!probe || probe.length === 0) return skip(name, "migration not applied")
    await runSql(
      `SELECT 1 FROM pg_class WHERE relname='signup_audit' AND relkind='r'`,
    )
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, `pre-flight failed: ${err.message}`)
  }

  const email = `phase19-signup-${randomUUID().slice(0, 8)}@example.com`
  const ip = "203.0.113.10"
  let userId
  try {
    const { data, error } = await getSupabase().auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { ip },
    })
    if (error) return fail(name, `createUser: ${error.message}`)
    userId = data.user.id

    await new Promise((r) => setTimeout(r, 200))

    const u = await runSql(
      `SELECT subscription_plan::text AS subscription_plan, billing_cycle::text AS billing_cycle, credits_balance, credits_balance_cap, credits_included_monthly, trial_ends_at, subscription_active, billing_period::text AS billing_period FROM public.users WHERE id=${sqlLit(userId)}`,
    )
    const row = u?.[0]
    if (!row) return fail(name, "no public.users row written")
    if (row.subscription_plan !== "free")
      return fail(name, `subscription_plan = ${row.subscription_plan}`)
    if (row.billing_cycle !== null)
      return fail(name, `billing_cycle = ${row.billing_cycle}`)
    if (Number(row.credits_balance) !== 250)
      return fail(name, `credits_balance = ${row.credits_balance}`)
    if (Number(row.credits_balance_cap) !== 500)
      return fail(name, `credits_balance_cap = ${row.credits_balance_cap}`)
    if (Number(row.credits_included_monthly) !== 250)
      return fail(
        name,
        `credits_included_monthly = ${row.credits_included_monthly}`,
      )
    if (row.trial_ends_at !== null)
      return fail(name, `trial_ends_at = ${row.trial_ends_at}`)
    if (row.subscription_active !== false)
      return fail(name, `subscription_active = ${row.subscription_active}`)
    if (row.billing_period !== null)
      return fail(name, `billing_period = ${row.billing_period}`)

    const tx = await runSql(
      `SELECT type::text AS type, amount, description FROM public.credit_transactions WHERE user_id=${sqlLit(userId)}`,
    )
    if (!tx || tx.length !== 1)
      return fail(name, `credit_transactions rows = ${tx?.length}`)
    if (tx[0].type !== "monthly_grant")
      return fail(name, `tx type = ${tx[0].type}`)
    if (Number(tx[0].amount) !== 250)
      return fail(name, `tx amount = ${tx[0].amount}`)
    if (tx[0].description !== "Free tier signup grant")
      return fail(name, `tx description = ${tx[0].description}`)

    const a = await runSql(
      `SELECT email_normalized, host(ip) AS ip, duplicate_flag FROM public.signup_audit WHERE user_id=${sqlLit(userId)}`,
    )
    if (!a || a.length !== 1)
      return fail(name, `signup_audit rows = ${a?.length}`)
    const expectedNorm = normalizeEmail(email)
    if (a[0].email_normalized !== expectedNorm)
      return fail(
        name,
        `email_normalized = ${a[0].email_normalized} (expected ${expectedNorm})`,
      )
    if (a[0].ip !== ip) return fail(name, `audit ip = ${a[0].ip}`)
    if (a[0].duplicate_flag !== false)
      return fail(name, `duplicate_flag = ${a[0].duplicate_flag}`)

    return ok(name)
  } catch (err) {
    return fail(name, err.message)
  } finally {
    await cleanupTestUser(userId)
  }
}

// ---------- subcommand: --duplicate ----------

async function cmdDuplicate() {
  const name = "duplicate"
  try {
    const probe = await runSql(
      `SELECT 1 FROM pg_class WHERE relname='signup_audit' AND relkind='r'`,
    )
    if (!probe || probe.length === 0) return skip(name, "migration not applied")
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }

  const suffix = randomUUID().slice(0, 8)
  // Both emails normalize to 'phase19dup{suffix}atest@gmail.com':
  //   A: dots stripped (gmail rule)
  //   B: +alias stripped (gmail rule)
  const emailA = `phase19dup${suffix}.atest@gmail.com`
  const emailB = `phase19dup${suffix}atest+x@gmail.com`
  const ip = "198.51.100.50"
  let idA, idB
  try {
    {
      const { data, error } = await getSupabase().auth.admin.createUser({
        email: emailA,
        email_confirm: true,
        user_metadata: { ip },
      })
      if (error) return fail(name, `createUser A: ${error.message}`)
      idA = data.user.id
    }
    await new Promise((r) => setTimeout(r, 150))
    {
      const { data, error } = await getSupabase().auth.admin.createUser({
        email: emailB,
        email_confirm: true,
        user_metadata: { ip },
      })
      if (error) return fail(name, `createUser B: ${error.message}`)
      idB = data.user.id
    }
    await new Promise((r) => setTimeout(r, 200))

    const a = await runSql(
      `SELECT duplicate_flag FROM public.signup_audit WHERE user_id=${sqlLit(idB)}`,
    )
    if (!a || a.length !== 1)
      return fail(name, `signup_audit rows for B = ${a?.length}`)
    if (a[0].duplicate_flag !== true)
      return fail(name, `B duplicate_flag = ${a[0].duplicate_flag}`)

    const u = await runSql(
      `SELECT credits_balance FROM public.users WHERE id=${sqlLit(idB)}`,
    )
    if (Number(u?.[0]?.credits_balance) !== 250)
      return fail(name, `B credits_balance = ${u?.[0]?.credits_balance}`)

    return ok(name)
  } catch (err) {
    return fail(name, err.message)
  } finally {
    await cleanupTestUser(idA)
    await cleanupTestUser(idB)
  }
}

// ---------- subcommand: --plan-config ----------

async function cmdPlanConfig() {
  const name = "plan-config"
  try {
    const probe = await runSql(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='credits_balance_cap'`,
    )
    if (!probe || probe.length === 0) return skip(name, "migration not applied")
  } catch (err) {
    if (isMissing(err)) return skip(name, "migration not applied")
    return fail(name, err.message)
  }

  const email = `phase19-plan-${randomUUID().slice(0, 8)}@example.com`
  let userId
  try {
    const { data, error } = await getSupabase().auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { ip: "203.0.113.99" },
    })
    if (error) return fail(name, `createUser: ${error.message}`)
    userId = data.user.id
    await new Promise((r) => setTimeout(r, 150))

    const rows = await runSql(
      `SELECT credits_balance_cap, credits_included_monthly FROM public.users WHERE id=${sqlLit(userId)}`,
    )
    const r = rows?.[0]
    if (!r) return fail(name, "no users row written")
    if (Number(r.credits_balance_cap) !== 500)
      return fail(name, `credits_balance_cap = ${r.credits_balance_cap}`)
    if (Number(r.credits_included_monthly) !== 250)
      return fail(name, `credits_included_monthly = ${r.credits_included_monthly}`)
    return ok(name)
  } catch (err) {
    return fail(name, err.message)
  } finally {
    await cleanupTestUser(userId)
  }
}

// ---------- subcommand: --quick ----------

async function cmdQuick() {
  const order = [
    ["enums", cmdEnums],
    ["columns", cmdColumns],
    ["audit-table", cmdAuditTable],
    ["normalize", cmdNormalize],
    ["signup", cmdSignup],
    ["duplicate", cmdDuplicate],
    ["plan-config", cmdPlanConfig],
  ]
  for (const [, fn] of order) {
    const ok = await fn()
    if (!ok) return false
  }
  // Cleanup invariant: no phase19- users left
  try {
    const rows = await runSql(
      `SELECT count(*)::int AS n FROM auth.users WHERE email LIKE 'phase19-%@example.com' OR email LIKE 'phase19-%@gmail.com' OR email LIKE 'phase19dup%'`,
    )
    if ((rows?.[0]?.n ?? 0) !== 0) {
      console.log(
        `WARN cleanup: ${rows[0].n} phase19- test users remain — sweeping`,
      )
      await cleanupAllTestUsersWithPrefix("phase19-")
      await cleanupAllTestUsersWithPrefix("phase19dup")
    }
  } catch {
    // ignore — cleanup verification is best-effort
  }
  return true
}

// ---------- dispatcher ----------

const HANDLERS = {
  "--enums": cmdEnums,
  "--columns": cmdColumns,
  "--plan-config": cmdPlanConfig,
  "--audit-table": cmdAuditTable,
  "--signup": cmdSignup,
  "--normalize": cmdNormalize,
  "--duplicate": cmdDuplicate,
  "--quick": cmdQuick,
}

function usage() {
  console.error(
    "Usage: node scripts/test-trigger-19.mjs " +
      Object.keys(HANDLERS).join(" | "),
  )
}

async function main() {
  const flag = process.argv[2]
  if (!flag || !HANDLERS[flag]) {
    usage()
    process.exit(1)
  }
  let code = 0
  try {
    const ok = await HANDLERS[flag]()
    code = ok ? 0 : 1
  } catch (err) {
    console.error(`Unhandled: ${err.message}`)
    code = 1
  }
  // Wait for undici sockets to settle on Windows / Node 24 (libuv assertion
  // crash on premature handle teardown). 50ms empirically clears keepalive.
  await new Promise((r) => setTimeout(r, 50))
  process.exit(code)
}

main()
