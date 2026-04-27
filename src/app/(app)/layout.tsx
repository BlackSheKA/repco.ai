import { redirect } from "next/navigation"

import {
  AccountDegradedBanner,
  type DegradedAccount,
} from "@/components/account-degraded-banner"
import { AppShell } from "@/components/shell/app-shell"
import { TerminalHeader } from "@/features/dashboard/components/terminal-header"
import { createClient } from "@/lib/supabase/server"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [
    { data: degradedRows },
    { data: userRow },
    { count: productProfileCount },
    { count: redditAccountCount },
    { count: completedActionCount },
  ] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id, handle, platform, health_status")
      .eq("user_id", user.id)
      .in("health_status", [
        "warning",
        "cooldown",
        "banned",
        "needs_reconnect",
        "captcha_required",
      ]),
    supabase
      .from("users")
      .select("credits_balance")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("product_profiles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("platform", "reddit"),
    supabase
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed"),
  ])

  const degradedAccounts: DegradedAccount[] = (degradedRows ?? [])
    .filter(
      (r): r is { id: string; handle: string; platform: "reddit" | "linkedin"; health_status: DegradedAccount["health_status"] } =>
        typeof r.handle === "string" && r.handle.length > 0,
    )
    .map((r) => ({
      id: r.id,
      handle: r.handle,
      platform: r.platform,
      health_status: r.health_status,
    }))
  const hasAccountAlerts = degradedAccounts.length > 0
  const creditBalance = (userRow?.credits_balance as number | null) ?? 0

  const productDescribed = (productProfileCount ?? 0) > 0
  const onboarding = {
    productDescribed,
    keywordsGenerated: productDescribed,
    redditConnected: (redditAccountCount ?? 0) > 0,
    firstDmApproved: (completedActionCount ?? 0) > 0,
  }

  return (
    <AppShell
      user={{ email: user.email ?? "" }}
      terminalHeader={<TerminalHeader userId={user.id} />}
      hasAccountAlerts={hasAccountAlerts}
      creditBalance={creditBalance}
      onboarding={onboarding}
    >
      <AccountDegradedBanner accounts={degradedAccounts} />
      {children}
    </AppShell>
  )
}
