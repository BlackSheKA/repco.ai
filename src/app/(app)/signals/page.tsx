import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Signals",
}

export default async function SignalsPage() {
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
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Live intent signals from Reddit and LinkedIn. Filter, contact, or
          dismiss.
        </p>
      </div>
      <SignalFeed initialSignals={initialSignals ?? []} userId={user.id} />
    </div>
  )
}
