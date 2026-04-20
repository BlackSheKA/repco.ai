import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Public routes that do not require authentication. These bypass the
// auth redirect entirely.
const PUBLIC_ROUTES = [
  "/live",
  "/api/live",
  "/api/scan",
  "/api/stripe/webhook",
  "/api/og",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { response, supabase } = await updateSession(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes (/live, /api/scan, /api/stripe/webhook, /api/og) bypass auth.
  if (isPublicRoute(pathname)) {
    return response;
  }

  // Skip auth gate for remaining API routes — they use their own authorization
  // (Bearer secrets for webhooks + cron, service-role client for workers).
  // Without this, Supabase Database Webhooks and Vercel cron invocations
  // get 307-redirected to /login.
  if (pathname.startsWith("/api/")) {
    return response;
  }

  // Unauthenticated users: redirect to /login (except auth routes)
  if (!user && pathname !== "/login" && !pathname.startsWith("/auth/")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated users visiting /login: redirect to /
  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  // Onboarding gate: if authenticated user has not completed onboarding,
  // force them to /onboarding (except when they are already there). Once
  // completed, /onboarding redirects back to /.
  if (user) {
    const { data: userRow } = await supabase
      .from("users")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();

    const onboardingCompleted = Boolean(userRow?.onboarding_completed_at);

    if (!onboardingCompleted && pathname !== "/onboarding") {
      const onboardingUrl = request.nextUrl.clone();
      onboardingUrl.pathname = "/onboarding";
      return NextResponse.redirect(onboardingUrl);
    }

    if (onboardingCompleted && pathname === "/onboarding") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      return NextResponse.redirect(homeUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
