/**
 * allocateBrowserProfile — single chokepoint for browser_profile + social_account creation.
 *
 * Decision traceability:
 *   D-02: Reuse rule — pick first profile matching (user_id + country_code) that has no
 *         account on the requested platform. Two-step query required because PostgREST
 *         does not support subqueries in .not.in.
 *   D-09: No race lock. Two concurrent calls may create two profiles. The submit button
 *         disabled-on-click is the only guard. Duplicate profiles are a billable but
 *         accepted edge case.
 *   D-10: Best-effort rollback — if any step after createProfileV2 fails and the profile
 *         was newly created in this invocation, we attempt deleteProfile before re-throwing.
 *         On reuse-path failures the existing GoLogin profile survives (still in use by
 *         other accounts).
 *
 * DEVIATION (17-API-PROBE.md OQ#1): patchProfileFingerprints has no REST endpoint.
 * The GoLogin REST API v1 returns 404 for both POST /fingerprints and PATCH /browser/{id}.
 * The fingerprint patch step is SKIPPED in server runtime. A console.warn is emitted so
 * the skip is visible in Vercel/dev logs. A future phase that wires the MCP tool will
 * restore BPRX-04 compliance.
 *
 * UPDATE (post-UAT 2026-04-27): The original probe was wrong about geolocation proxies.
 * `POST /browser` with `proxy: { mode: "geolocation", autoProxyRegion }` is silently
 * ignored — the profile lands with `proxyEnabled: false` and runs on the host's IP
 * (instant ban). The fix: create+link the residential proxy in a separate call via
 * `assignResidentialProxy`. After that call, `proxy.id` is a real id we store as
 * `gologin_proxy_id` (UNIQUE NOT NULL satisfied with a real value, not the profile-id fallback).
 */

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  assignResidentialProxy,
  createProfileV2,
  deleteProfile,
  patchProfileFingerprints,
} from "@/lib/gologin/client"
import { mapForCountry, type SupportedCountry } from "./country-map"

export interface AllocateBrowserProfileArgs {
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  /** Per D-01: callers in this phase always pass "US" literally. */
  country: SupportedCountry
  supabase: SupabaseClient
}

/**
 * Login URLs the cloud browser opens on first session start. Set as the profile's
 * `startUrl` field at creation time. Cannot be overridden later for reused profiles —
 * GoLogin's PUT /browser/{id}/custom does not accept startUrl (verified via swagger).
 */
const PLATFORM_LOGIN_URLS: Record<"reddit" | "linkedin", string> = {
  reddit: "https://www.reddit.com/login/",
  linkedin: "https://www.linkedin.com/login/",
}

export interface AllocateBrowserProfileResult {
  browserProfileId: string
  gologinProfileId: string
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
    .select("id, gologin_profile_id")
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
    | { id: string; gologin_profile_id: string }
    | undefined

  // ── Step 2: Reuse path ────────────────────────────────────────────────────
  if (existingProfile) {
    // Skip to social_account INSERT — profile is already in DB.
    return insertSocialAccountAndFinish({
      supabase,
      userId,
      platform,
      handle,
      browserProfileId: existingProfile.id,
      gologinProfileId: existingProfile.gologin_profile_id,
      newlyCreated: false, // D-10: don't touch the GoLogin profile on reuse-path failure
    })
  }

  // ── Step 3: Allocate new GoLogin profile (D-09 — no lock) ────────────────
  const { timezone, locale, userAgent, language } = mapForCountry(country)

  // Land the cloud browser directly on the platform's login page (POST /browser
  // accepts startUrl on profile create). Reuse path can't override this — see
  // 17-API-PROBE.md OQ#3 (PUT /browser/{id}/custom has no startUrl field).
  const startUrl = PLATFORM_LOGIN_URLS[platform]

  const created = await createProfileV2({
    accountHandle: handle,
    countryCode: country,
    navigator: {
      userAgent,
      resolution: "1920x1080",
      language,
      platform: "Win32",
    },
    timezone,
    startUrl,
  })

  const gologinProfileId = created.id

  // ── Step 3b: Attach residential proxy (BPRX-03) ─────────────────────────
  // CRITICAL: GoLogin silently drops `proxy.mode:"geolocation"` from POST /browser body.
  // Without this explicit attach call the profile runs on the host IP — instant Reddit/LinkedIn
  // ban. See 17-API-PROBE.md UPDATE.
  // D-10: rollback newly-created profile if proxy creation fails.
  let gologinProxyId: string
  try {
    const proxy = await assignResidentialProxy({
      profileId: gologinProfileId,
      countryCode: country,
      customName: `repco-${handle}`,
    })
    gologinProxyId = proxy.id
  } catch (err) {
    try {
      await deleteProfile(gologinProfileId)
    } catch (delErr) {
      console.error(
        "[allocator] Failed to delete orphan GoLogin profile after proxy assign failure",
        { gologinProfileId, delErr },
      )
    }
    throw err
  }

  // ── Step 4: Patch fingerprint (BPRX-04, D-07) ────────────────────────────
  // Refresh canvas/webGL/audio/fonts via PATCH /browser/fingerprints. Best-effort —
  // failure is non-fatal because the profile + proxy are already wired and a
  // session-default fingerprint is still better than no profile at all.
  try {
    await patchProfileFingerprints(gologinProfileId)
  } catch (err) {
    console.warn("[allocator] patchProfileFingerprints failed (non-fatal)", {
      gologinProfileId,
      err,
    })
  }

  // ── Step 5: INSERT browser_profiles row ───────────────────────────────────
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
      gologin_profile_id: gologinProfileId,
      gologin_proxy_id: gologinProxyId, // real proxy id from assignResidentialProxy
      country_code: country,
      timezone,
      locale,
      display_name: `${country}-${seq}`,
    })
    .select("id")
    .single()

  if (bpErr || !bpRow) {
    // D-10: rollback the newly-created GoLogin profile
    try {
      await deleteProfile(gologinProfileId)
    } catch (delErr) {
      console.error("[allocator] Failed to delete orphan GoLogin profile", {
        gologinProfileId,
        delErr,
      })
    }
    throw new Error(`Failed to insert browser_profile: ${bpErr?.message}`)
  }

  const browserProfileId = (bpRow as { id: string }).id

  return insertSocialAccountAndFinish({
    supabase,
    userId,
    platform,
    handle,
    browserProfileId,
    gologinProfileId,
    newlyCreated: true, // D-10: delete the GoLogin profile if social_account insert fails
    gologinProxyId,
  })
}

// ── Internal helper ──────────────────────────────────────────────────────────

interface InsertArgs {
  supabase: SupabaseClient
  userId: string
  platform: "reddit" | "linkedin"
  handle: string
  browserProfileId: string
  gologinProfileId: string
  /** Whether the GoLogin profile was created in this invocation (affects D-10 rollback). */
  newlyCreated: boolean
  gologinProxyId?: string
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
    gologinProfileId,
    newlyCreated,
  } = args

  // ── Step 7: INSERT social_accounts row ────────────────────────────────────
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
      // D-10: delete the browser_profiles row we just inserted (GoLogin profile also goes)
      try {
        await supabase
          .from("browser_profiles")
          .delete()
          .eq("id", browserProfileId)
      } catch {
        // swallow — best-effort
      }
      try {
        await deleteProfile(gologinProfileId)
      } catch (delErr) {
        console.error("[allocator] Failed to delete orphan GoLogin profile", {
          gologinProfileId,
          delErr,
        })
      }
    }
    throw new Error(`Failed to insert social_account: ${saErr?.message}`)
  }

  const socialAccountId = (saRow as { id: string }).id

  // ── Step 8: revalidatePath only ───────────────────────────────────────────
  // Cloud browser is started lazily via `startAccountBrowser` when the user clicks
  // "Log in" in /accounts — NOT here. This avoids GoLogin's parallel-session quota
  // (HTTP 403 "max parallel cloud launches limit") blocking account creation, and
  // matches the existing UI flow which only consumes accountId + profileId.
  revalidatePath("/accounts")

  return {
    browserProfileId,
    gologinProfileId,
    socialAccountId,
    reused: !newlyCreated,
  }
}
