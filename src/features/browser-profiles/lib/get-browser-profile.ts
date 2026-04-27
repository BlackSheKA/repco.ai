import type { SupabaseClient } from "@supabase/supabase-js"
import type { BrowserProfile } from "@/features/accounts/lib/types"

/**
 * Resolve the browser_profiles row for a given social_accounts.id via FK embed.
 * Returns null when:
 *   - the social_accounts row does not exist
 *   - the social_accounts row has browser_profile_id IS NULL
 *   - the FK target row was deleted (defensive)
 *
 * Caller passes its own supabase client (SSR / service-role); never imports a singleton.
 */
export async function getBrowserProfileForAccount(
  accountId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null> {
  const { data } = await supabase
    .from("social_accounts")
    .select("browser_profile_id, browser_profiles(*)")
    .eq("id", accountId)
    .single()

  if (!data) return null
  // Supabase-js embeds the FK target under the table name. When browser_profile_id IS NULL,
  // browser_profiles is null. When non-null, it is the row object.
  const profile = (data as { browser_profiles: BrowserProfile | null }).browser_profiles
  return profile ?? null
}

/**
 * Resolve a browser_profiles row by its primary key. Returns null when not found.
 */
export async function getBrowserProfileById(
  browserProfileId: string,
  supabase: SupabaseClient,
): Promise<BrowserProfile | null> {
  const { data } = await supabase
    .from("browser_profiles")
    .select("id, gologin_profile_id, gologin_proxy_id, country_code, timezone, locale, display_name")
    .eq("id", browserProfileId)
    .single()

  return (data as BrowserProfile | null) ?? null
}
