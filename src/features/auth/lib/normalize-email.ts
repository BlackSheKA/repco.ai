/**
 * TypeScript mirror of public.normalize_email() SQL function.
 *
 * Lowercase the email; for gmail.com / googlemail.com domains, strip dots
 * from the local part and drop everything from `+` onward, then rewrite
 * domain to gmail.com. Used by /auth/callback to recompute duplicate_flag
 * for OAuth signups (the SQL function is the canonical source; this TS
 * impl exists because the callback runs in app code).
 *
 * Parity is enforced by normalize-email.test.ts and the
 * scripts/test-trigger-19.mjs --normalize SQL smoke check.
 */
export function normalizeEmail(email: string): string {
  const lower = email.toLowerCase()
  const [local, domain] = lower.split("@") as [string, string]
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0]!.replace(/\./g, "")}@gmail.com`
  }
  return lower
}
