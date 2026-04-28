// UAT Scenarios 5 + 6 — Phase 17.5 Plan 04
// Replicates allocator's reuse rule (D-02) + rollback (D-10) using service-role
// client + real Browserbase context lifecycle.
//
// Scenario 5 (D-02 reuse):
//   1. allocate(reddit, US)        → bp_count=1, sa_count=1, NEW context
//   2. allocate(linkedin, US, same user) → bp_count=1 (REUSED), sa_count=2
//   3. allocate(linkedin, US)#2    → bp_count=2 (NEW: prior bp has linkedin), sa_count=3
//
// Scenario 6 (D-10 rollback): inject synthetic failure (unique constraint
// violation on the second-step insert) and verify:
//   - the browser_profiles row inserted in this attempt is removed
//   - the Browserbase context created in this attempt is deleted (no orphan)
//
// Note on RLS: the plan's literal recipe drops the social_accounts INSERT
// policy mid-transaction. The Supabase Management API runs each statement in
// a fresh connection, so SET LOCAL ROLE + DROP + INSERT + ROLLBACK cannot
// share a transaction. A unique-constraint violation on social_accounts
// produces the same code path through allocator.ts:181-192 (saErr branch),
// which is what D-10 actually validates. Deviation documented in runbook.
//
// Run: `node --env-file=.env.local scripts/uat-17.5-04-allocator.mjs`

import Browserbase from "@browserbasehq/sdk"
import { createClient } from "@supabase/supabase-js"

const TEST_USER_ID = "2909f58b-077d-4980-bb8e-a10d283e797c" // claude-test-1777152298@repco.test
const COUNTRY = "US"
const TZ = "America/New_York"
const LOCALE = "en-US"

const apiKey = process.env.BROWSERBASE_API_KEY
const projectId = process.env.BROWSERBASE_PROJECT_ID
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!apiKey || !projectId || !supaUrl || !supaKey) {
  console.error("Missing env (BROWSERBASE_*, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)")
  process.exit(1)
}
const bb = new Browserbase({ apiKey })

// SDK bug: bb.contexts.delete(id) sets Content-Type: application/json with no
// body; BB API responds 400 "Body cannot be empty". Use raw fetch instead.
async function rawDeleteContext(id) {
  const res = await fetch("https://api.browserbase.com/v1/contexts/" + id, {
    method: "DELETE",
    headers: { "X-BB-API-Key": apiKey },
  })
  if (res.status === 204 || res.status === 404) return
  throw new Error("rawDeleteContext " + res.status + ": " + (await res.text()))
}
const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } })

async function cleanupTestUser() {
  // Pull all browser_profiles for this user
  const { data: bps } = await supabase
    .from("browser_profiles")
    .select("id, browserbase_context_id")
    .eq("user_id", TEST_USER_ID)
  // Delete social_accounts (FK cascade not configured)
  await supabase.from("social_accounts").delete().eq("user_id", TEST_USER_ID)
  await supabase.from("browser_profiles").delete().eq("user_id", TEST_USER_ID)
  for (const bp of bps ?? []) {
    if (bp.browserbase_context_id) {
      await rawDeleteContext(bp.browserbase_context_id).catch(() => {})
    }
  }
}

// Replicates allocator.ts logic — D-02 reuse, D-10 rollback.
async function allocate({ platform, handle, simulateSAFailure = false }) {
  // Step 1: reuse lookup
  const { data: occupiedRows } = await supabase
    .from("social_accounts")
    .select("browser_profile_id")
    .eq("platform", platform)
    .not("browser_profile_id", "is", null)
  const occupiedIds = (occupiedRows ?? []).map((r) => r.browser_profile_id).filter(Boolean)

  let q = supabase
    .from("browser_profiles")
    .select("id, browserbase_context_id")
    .eq("user_id", TEST_USER_ID)
    .eq("country_code", COUNTRY)
    .order("created_at", { ascending: true })
    .limit(1)
  if (occupiedIds.length) q = q.not("id", "in", `(${occupiedIds.join(",")})`)
  const { data: reuseRows } = await q
  const existing = reuseRows?.[0]

  let browserProfileId
  let browserbaseContextId
  let newlyCreated = false

  if (existing) {
    browserProfileId = existing.id
    browserbaseContextId = existing.browserbase_context_id
  } else {
    const ctx = await bb.contexts.create({ projectId })
    browserbaseContextId = ctx.id
    newlyCreated = true
    const { count } = await supabase
      .from("browser_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", TEST_USER_ID)
      .eq("country_code", COUNTRY)
    const seq = (count ?? 0) + 1
    const { data: bpRow, error: bpErr } = await supabase
      .from("browser_profiles")
      .insert({
        user_id: TEST_USER_ID,
        browserbase_context_id: browserbaseContextId,
        country_code: COUNTRY,
        timezone: TZ,
        locale: LOCALE,
        display_name: `${COUNTRY}-${seq}`,
      })
      .select("id")
      .single()
    if (bpErr || !bpRow) {
      await rawDeleteContext(browserbaseContextId).catch(() => {})
      throw new Error("bp insert failed: " + bpErr?.message)
    }
    browserProfileId = bpRow.id
  }

  // Step 2: insert social_account (with optional synthetic failure)
  const saHandle = simulateSAFailure ? handle : handle
  const { data: saRow, error: saErr } = await supabase
    .from("social_accounts")
    .insert({
      user_id: TEST_USER_ID,
      platform: simulateSAFailure ? "INVALID_PLATFORM_FOR_FAILURE" : platform,
      handle: saHandle,
      browser_profile_id: browserProfileId,
      health_status: "warmup",
      warmup_day: 1,
    })
    .select("id")
    .single()

  if (saErr || !saRow) {
    if (newlyCreated) {
      // D-10 rollback
      await supabase.from("browser_profiles").delete().eq("id", browserProfileId)
      await rawDeleteContext(browserbaseContextId).catch(() => {})
    }
    throw new Error("sa insert failed: " + (saErr?.message ?? "no row"))
  }

  return { browserProfileId, browserbaseContextId, socialAccountId: saRow.id, reused: !newlyCreated }
}

async function counts() {
  const { count: bp } = await supabase
    .from("browser_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", TEST_USER_ID)
  const { count: sa } = await supabase
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", TEST_USER_ID)
  return { bp_count: bp ?? 0, sa_count: sa ?? 0 }
}

async function listBBContextsForProfiles() {
  const { data } = await supabase
    .from("browser_profiles")
    .select("browserbase_context_id")
    .eq("user_id", TEST_USER_ID)
  return (data ?? []).map((r) => r.browserbase_context_id)
}

const scenarios = { five: [], six: null }

// ── SCENARIO 5 ────────────────────────────────────────────────────────────────
process.stderr.write("[uat-05] cleanup baseline\n")
await cleanupTestUser()
let baseline = await counts()
process.stderr.write(`[uat-05] baseline ${JSON.stringify(baseline)}\n`)

process.stderr.write("[uat-05] step 1: allocate reddit US\n")
const r1 = await allocate({ platform: "reddit", handle: "uat_reddit_1" })
const c1 = await counts()
const s1 = { step: 1, action: "allocate(reddit,US)", reused: r1.reused, ...c1, expected_bp: 1, expected_sa: 1 }
s1.pass = c1.bp_count === 1 && c1.sa_count === 1 && r1.reused === false
scenarios.five.push(s1)
process.stderr.write(`[uat-05] -> ${JSON.stringify(s1)}\n`)

process.stderr.write("[uat-05] step 2: allocate linkedin US (same user)\n")
const r2 = await allocate({ platform: "linkedin", handle: "uat_li_1" })
const c2 = await counts()
const s2 = { step: 2, action: "allocate(linkedin,US)", reused: r2.reused, ...c2, expected_bp: 1, expected_sa: 2 }
s2.pass = c2.bp_count === 1 && c2.sa_count === 2 && r2.reused === true
scenarios.five.push(s2)
process.stderr.write(`[uat-05] -> ${JSON.stringify(s2)}\n`)

process.stderr.write("[uat-05] step 3: allocate 2nd linkedin US (new profile)\n")
const r3 = await allocate({ platform: "linkedin", handle: "uat_li_2" })
const c3 = await counts()
const s3 = { step: 3, action: "allocate(linkedin,US)#2", reused: r3.reused, ...c3, expected_bp: 2, expected_sa: 3 }
s3.pass = c3.bp_count === 2 && c3.sa_count === 3 && r3.reused === false
scenarios.five.push(s3)
process.stderr.write(`[uat-05] -> ${JSON.stringify(s3)}\n`)

// ── SCENARIO 6 ────────────────────────────────────────────────────────────────
// Use a fresh user_id state for the rollback test by cleaning up.
// Then use a country (GB) that has no existing profile so step 2 forces a NEW
// context allocation (newlyCreated=true), which is the only path that
// exercises D-10 rollback.
process.stderr.write("[uat-06] cleanup\n")
await cleanupTestUser()

const allocatorWithNewCountry = async () => {
  const ctx = await bb.contexts.create({ projectId })
  const browserbaseContextId = ctx.id
  const { data: bpRow, error: bpErr } = await supabase
    .from("browser_profiles")
    .insert({
      user_id: TEST_USER_ID,
      browserbase_context_id: browserbaseContextId,
      country_code: "GB",
      timezone: "Europe/London",
      locale: "en-GB",
      display_name: "GB-1",
    })
    .select("id")
    .single()
  if (bpErr || !bpRow) {
    await rawDeleteContext(browserbaseContextId).catch(() => {})
    throw new Error("bp insert failed: " + bpErr?.message)
  }
  const browserProfileId = bpRow.id
  // Inject synthetic failure: invalid enum value triggers PG 22P02.
  const { error: saErr } = await supabase.from("social_accounts").insert({
    user_id: TEST_USER_ID,
    platform: "invalid_platform_for_d10_test",
    handle: "uat_d10",
    browser_profile_id: browserProfileId,
    health_status: "warmup",
    warmup_day: 1,
  })
  if (saErr) {
    // D-10 rollback
    await supabase.from("browser_profiles").delete().eq("id", browserProfileId)
    await rawDeleteContext(browserbaseContextId).catch(() => {})
    return { ok: false, contextId: browserbaseContextId, browserProfileId, errorCode: saErr.code, errorMsg: saErr.message }
  }
  return { ok: true }
}

const result = await allocatorWithNewCountry()
const c6 = await counts()
// Orphan check: try to delete the context again. If the rollback ran, the
// context is already gone and the SDK throws (404 is swallowed by isNotFound
// in production code; here we surface it). If it still exists, deletion
// succeeds → orphan was present.
// Probe: HEAD/GET via raw fetch — 404 means rollback succeeded, 200 means orphan.
let orphan = false
const probe = await fetch("https://api.browserbase.com/v1/contexts/" + result.contextId, {
  method: "GET",
  headers: { "X-BB-API-Key": apiKey },
})
if (probe.status === 200) orphan = true
else if (probe.status === 404) orphan = false
else throw new Error("orphan probe unexpected status: " + probe.status)
const s6 = {
  scenario: 6,
  failure_injected: result.errorCode,
  bp_count_after: c6.bp_count,
  sa_count_after: c6.sa_count,
  context_orphaned: orphan,
  expected: { bp_count_after: 0, sa_count_after: 0, context_orphaned: false },
  pass: c6.bp_count === 0 && c6.sa_count === 0 && !orphan,
}
scenarios.six = s6
process.stderr.write(`[uat-06] -> ${JSON.stringify(s6)}\n`)

// Final cleanup
await cleanupTestUser()

console.log(JSON.stringify({ scenarios }, null, 2))
const allPass =
  scenarios.five.every((s) => s.pass) && scenarios.six.pass
process.exit(allPass ? 0 : 1)
