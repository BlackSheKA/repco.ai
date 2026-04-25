import { redirect } from "next/navigation"

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

  const [{ count: alertCount }, { data: userRow }] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("health_status", ["warning", "cooldown", "banned"]),
    supabase
      .from("users")
      .select("credits_balance")
      .eq("id", user.id)
      .maybeSingle(),
  ])

  const hasAccountAlerts = (alertCount ?? 0) > 0
  const creditBalance = (userRow?.credits_balance as number | null) ?? 0

  return (
    <AppShell
      user={{ email: user.email ?? "" }}
      terminalHeader={<TerminalHeader userId={user.id} />}
      hasAccountAlerts={hasAccountAlerts}
      creditBalance={creditBalance}
    >
      {children}
    </AppShell>
  )
}
