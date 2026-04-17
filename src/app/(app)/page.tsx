import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: initialSignals } = await supabase
    .from("intent_signals")
    .select("*")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("detected_at", { ascending: false })
    .limit(20)

  return (
    <div className="flex-1 p-6">
      <SignalFeed
        initialSignals={initialSignals ?? []}
        userId={user.id}
      />
    </div>
  )
}
