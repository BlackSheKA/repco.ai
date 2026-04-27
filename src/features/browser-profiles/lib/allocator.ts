/**
 * allocateBrowserProfile — single chokepoint for browser_profile + social_account creation.
 *
 * Decision traceability (Phase 17.5 — Browserbase):
 *   D-02: Reuse rule — pick first profile matching (user_id + country_code) that has no
 *         account on the requested platform. Two-step query required because PostgREST
 *         does not support subqueries in .not.in.
 *   D-09: No race lock. Two concurrent calls may create two contexts. The submit button
 *         disabled-on-click is the only guard. Cheap on Browserbase (no slot quota).
 *   D-10: Best-effort rollback — if any step after createContext fails and the context
 *         was newly created in this invocation, we attempt deleteContext before re-throwing.
 *         On reuse-path failures the existing Browserbase context survives (still in use
 *         by other accounts).
 *   D17.5-04: Returns { browserProfileId, browserbaseContextId, socialAccountId, reused }.
 *             No cloudBrowserUrl — session start is owned by startAccountBrowser.
 */

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { createContext, deleteContext } from "@/lib/browserbase/client"
import { mapForCountry, type SupportedCountry } from "./country-map"

export interface AllocateBrowserProfileArgs {
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  /** Per D-01: callers in this phase always pass "US" literally. */
  country: SupportedCountry
  supabase: SupabaseClient
}

export interface AllocateBrowserProfileResult {
  browserProfileId: string
  browserbaseContextId: string
  /** socialAccountId — surfaced so connectAccount can return accountId to the UI. */
  socialAccountId: string
  /** true when an existing browser_profile was reused (D-02). */
  reused: boolean
}

export async function allocateBrowserProfile(
  args: AllocateBrowserProfileArgs,
): Promise<AllocateBrowserProfileResult> {
  const { userId, platform, handle, country, supabase } = args

  // ── Step 1: Reuse lookup (D-02) ──────────────────────────────────────────
  // Two-step query because PostgREST does not support subqueries in .not.in.
  // (a) Collect profile ids that already have an account on this platform.
  const { data: occupiedRows } = await supabase
    .from("social_accounts")
    .select("browser_profile_id")
    .eq("platform", platform)
    .not("browser_profile_id", "is", null)

  const occupiedIds: string[] = (occupiedRows ?? [])
    .map((r: { browser_profile_id: string | null }) => r.browser_profile_id)
    .filter((id): id is string => id !== null)

  // (b) Find first eligible profile for this user + country, excluding occupied ones.
  let query = supabase
    .from("browser_profiles")
    .select("id, browserbase_context_id")
    .eq("user_id", userId)
    .eq("country_code", country)
    .order("created_at", { ascending: true })
    .limit(1)

  if (occupiedIds.length > 0) {
    // D-02: exclude profiles already consumed by an account on this platform
    query = query.not("id", "in", `(${occupiedIds.join(",")})`)
  }

  const { data: reuseRows } = await query
  const existingProfile = reuseRows?.[0] as
    | { id: string; browserbase_context_id: string }
    | undefined

  // ── Step 2: Reuse path ────────────────────────────────────────────────────
  if (existingProfile) {
    return insertSocialAccountAndFinish({
      supabase,
      userId,
      platform,
      handle,
      browserProfileId: existingProfile.id,
      browserbaseContextId: existingProfile.browserbase_context_id,
      newlyCreated: false, // D-10: don't touch the context on reuse-path failure
    })
  }

  // ── Step 3: Allocate new Browserbase context (D-09 — no lock) ────────────
  const { timezone, locale } = mapForCountry(country)
  const ctx = await createContext()
  const browserbaseContextId = ctx.id

  // ── Step 4: INSERT browser_profiles row ───────────────────────────────────
  // Compute display_name: {country}-{seq} where seq = existing profiles for this
  // user+country + 1.
  let seq = 1
  const { count: existingCount } = await supabase
    .from("browser_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("country_code", country)
  if (typeof existingCount === "number") {
    seq = existingCount + 1
  }

  const { data: bpRow, error: bpErr } = await supabase
    .from("browser_profiles")
    .insert({
      user_id: userId,
      browserbase_context_id: browserbaseContextId,
      country_code: country,
      timezone,
      locale,
      display_name: `${country}-${seq}`,
    })
    .select("id")
    .single()

  if (bpErr || !bpRow) {
    // D-10: rollback the newly-created Browserbase context
    await deleteContext(browserbaseContextId).catch(() => {})
    throw new Error(`Failed to insert browser_profile: ${bpErr?.message}`)
  }

  const browserProfileId = (bpRow as { id: string }).id

  return insertSocialAccountAndFinish({
    supabase,
    userId,
    platform,
    handle,
    browserProfileId,
    browserbaseContextId,
    newlyCreated: true, // D-10: delete the context if social_account insert fails
  })
}

// ── Internal helper ──────────────────────────────────────────────────────────

interface InsertArgs {
  supabase: SupabaseClient
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  browserProfileId: string
  browserbaseContextId: string
  /** Whether the context was created in this invocation (affects D-10 rollback). */
  newlyCreated: boolean
}

async function insertSocialAccountAndFinish(
  args: InsertArgs,
): Promise<AllocateBrowserProfileResult> {
  const {
    supabase,
    userId,
    platform,
    handle,
    browserProfileId,
    browserbaseContextId,
    newlyCreated,
  } = args

  const { data: saRow, error: saErr } = await supabase
    .from("social_accounts")
    .insert({
      user_id: userId,
      platform,
      handle,
      browser_profile_id: browserProfileId,
      health_status: "warmup",
      warmup_day: 1,
    })
    .select("id")
    .single()

  if (saErr || !saRow) {
    if (newlyCreated) {
      // D-10: delete the browser_profiles row we just inserted, then the context
      await supabase
        .from("browser_profiles")
        .delete()
        .eq("id", browserProfileId)
        .then(() => undefined, () => undefined)
      await deleteContext(browserbaseContextId).catch(() => {})
    }
    throw new Error(`Failed to insert social_account: ${saErr?.message}`)
  }

  const socialAccountId = (saRow as { id: string }).id

  // D17.5-04: session start is decoupled — owned by startAccountBrowser.
  revalidatePath("/accounts")

  return {
    browserProfileId,
    browserbaseContextId,
    socialAccountId,
    reused: !newlyCreated,
  }
}
