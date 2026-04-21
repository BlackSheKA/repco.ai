#!/usr/bin/env node
// scripts/phase-08-validate.mjs
// Usage: node scripts/phase-08-validate.mjs [--live-stats-seed] [--live-stats-fresh] [--vercel-crons] [--digest-idempotency]
// Runs all checks if no flag provided.

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"

const SEED_ID = "00000000-0000-0000-0000-000000000001"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    )
    process.exit(1)
  }
  return createClient(url, key)
}

/**
 * --live-stats-seed
 * SELECT from live_stats WHERE id=SEED_ID; PASS if 1 row returned.
 */
async function checkLiveStatsSeed() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("live_stats")
    .select("id")
    .eq("id", SEED_ID)
    .maybeSingle()

  if (error) {
    console.log(`[FAIL] live-stats-seed: query error — ${error.message}`)
    return false
  }
  if (data) {
    console.log(`[PASS] live-stats-seed: seed row present (id=${SEED_ID})`)
    return true
  }
  console.log(
    `[FAIL] live-stats-seed: seed row missing — run migration 00012 on this database`
  )
  return false
}

/**
 * --live-stats-fresh
 * SELECT updated_at FROM live_stats WHERE id=SEED_ID;
 * PASS if updated_at > now() - 10 minutes.
 */
async function checkLiveStatsFresh() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("live_stats")
    .select("updated_at")
    .eq("id", SEED_ID)
    .maybeSingle()

  if (error) {
    console.log(`[FAIL] live-stats-fresh: query error — ${error.message}`)
    return false
  }
  if (!data) {
    console.log(
      `[FAIL] live-stats-fresh: seed row missing — run migration 00012 first`
    )
    return false
  }

  const updatedAt = new Date(data.updated_at)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

  if (updatedAt > tenMinutesAgo) {
    console.log(
      `[PASS] live-stats-fresh: updated_at=${data.updated_at} (within last 10 minutes)`
    )
    return true
  }
  console.log(
    `[FAIL] live-stats-fresh: updated_at=${data.updated_at} is older than 10 minutes — cron may not have run yet`
  )
  return false
}

/**
 * --vercel-crons
 * Read vercel.json; PASS if /api/cron/daily-digest is ABSENT AND /api/cron/refresh-live-stats is PRESENT.
 */
function checkVercelCrons() {
  const vercelJsonPath = resolve(process.cwd(), "vercel.json")
  let vercelJson
  try {
    vercelJson = JSON.parse(readFileSync(vercelJsonPath, "utf-8"))
  } catch (err) {
    console.log(`[FAIL] vercel-crons: could not read vercel.json — ${err.message}`)
    return false
  }

  const crons = vercelJson.crons ?? []
  const paths = crons.map((c) => c.path)

  const hasDailyDigest = paths.includes("/api/cron/daily-digest")
  const hasRefreshLiveStats = paths.includes("/api/cron/refresh-live-stats")

  const pass = !hasDailyDigest && hasRefreshLiveStats

  if (pass) {
    console.log(
      "[PASS] vercel-crons: /api/cron/daily-digest absent, /api/cron/refresh-live-stats present"
    )
  } else {
    const reasons = []
    if (hasDailyDigest)
      reasons.push("/api/cron/daily-digest still present (should be removed in Plan 03)")
    if (!hasRefreshLiveStats)
      reasons.push(
        "/api/cron/refresh-live-stats missing (should be added in Plan 03)"
      )
    console.log(`[FAIL] vercel-crons: ${reasons.join("; ")}`)
  }
  return pass
}

/**
 * --digest-idempotency
 * SELECT COUNT(*) FROM job_logs WHERE metadata->>'cron'='digest' AND started_at::date = current_date;
 * PASS if count <= 1.
 * If PHASE08_TEST_USER_ID is set, filter by user_id as well.
 */
async function checkDigestIdempotency() {
  const supabase = getSupabase()
  const testUserId = process.env.PHASE08_TEST_USER_ID

  let query = supabase
    .from("job_logs")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>cron", "digest")
    .gte("started_at", new Date().toISOString().slice(0, 10)) // current_date start
    .lt(
      "started_at",
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    ) // next day

  if (testUserId) {
    query = query.eq("user_id", testUserId)
  }

  const { count, error } = await query

  if (error) {
    console.log(`[FAIL] digest-idempotency: query error — ${error.message}`)
    return false
  }

  const runCount = count ?? 0
  if (runCount <= 1) {
    const scope = testUserId ? `user ${testUserId}` : "global"
    console.log(
      `[PASS] digest-idempotency: digest ran ${runCount} time(s) today (${scope})`
    )
    return true
  }
  console.log(
    `[FAIL] digest-idempotency: digest ran ${runCount} times today — expected <= 1`
  )
  return false
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)

const runSeed = args.includes("--live-stats-seed")
const runFresh = args.includes("--live-stats-fresh")
const runCrons = args.includes("--vercel-crons")
const runDigest = args.includes("--digest-idempotency")
const runAll = args.length === 0 || args.includes("--full")

const results = []

if (runAll || runSeed) results.push(await checkLiveStatsSeed())
if (runAll || runFresh) results.push(await checkLiveStatsFresh())
if (runAll || runCrons) results.push(checkVercelCrons())
if (runAll || runDigest) results.push(await checkDigestIdempotency())

const passed = results.filter(Boolean).length
const failed = results.filter((r) => !r).length

if (results.length > 1) {
  console.log(`\nSummary: ${passed} passed, ${failed} failed`)
}

process.exit(failed > 0 ? 1 : 0)
