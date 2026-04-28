import { NextResponse } from "next/server";

import { createClient as createServiceClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/features/auth/lib/normalize-email";
import { createClient } from "@/lib/supabase/server";

function parseClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  if (!first) return null;
  return /^[\da-fA-F:.]+$/.test(first) ? first : null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Idempotent signup_audit IP follow-up for OAuth users (Pitfall 4).
      // For magic-link users, IP is already in raw_user_meta_data -> trigger
      // captured it -> WHERE ip IS NULL filters them out, this UPDATE is a no-op.
      const ip = parseClientIp(request);
      if (ip && data.user.email) {
        try {
          const service = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
          );
          const emailNormalized = normalizeEmail(data.user.email);
          const { data: prev } = await service
            .from("signup_audit")
            .select("user_id")
            .eq("email_normalized", emailNormalized)
            .eq("ip", ip)
            .neq("user_id", data.user.id)
            .limit(1);
          const duplicate_flag = !!prev && prev.length > 0;
          await service
            .from("signup_audit")
            .update({ ip, duplicate_flag })
            .eq("user_id", data.user.id)
            .is("ip", null);
        } catch {
          // Audit-only path (D-11): never block signin/signup on audit failure.
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
