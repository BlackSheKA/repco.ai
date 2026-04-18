import { redirect } from "next/navigation"

import { AgentCard } from "@/features/dashboard/components/agent-card"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [{ data: initialSignals }, { count: signalsFound }, { count: actionsPending }] =
    await Promise.all([
      supabase
        .from("intent_signals")
        .select("*")
        .eq("user_id", user.id)
        .is("dismissed_at", null)
        .order("detected_at", { ascending: false })
        .limit(20),
      supabase
        .from("intent_signals")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte(
          "detected_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        ),
      supabase
        .from("actions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending_approval"),
    ])

  return (
    <div className="flex flex-col gap-6 p-6">
      <AgentCard
        userId={user.id}
        initialStats={{
          signalsFound: signalsFound ?? 0,
          actionsPending: actionsPending ?? 0,
        }}
      />
      <SignalFeed initialSignals={initialSignals ?? []} userId={user.id} />
    </div>
  )
}
