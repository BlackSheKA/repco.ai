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

  return (
    <AppShell
      user={{ email: user.email ?? "" }}
      terminalHeader={<TerminalHeader userId={user.id} />}
    >
      {children}
    </AppShell>
  )
}
