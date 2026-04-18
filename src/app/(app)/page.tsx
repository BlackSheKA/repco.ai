import { redirect } from "next/navigation"

import { AgentCard } from "@/features/dashboard/components/agent-card"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { ApprovalQueue } from "@/features/actions/components/approval-queue"
import type { ApprovalCardData } from "@/features/actions/lib/types"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const [
    { data: initialSignals },
    { count: signalsFound },
    { count: actionsPending },
    { data: pendingActions },
  ] = await Promise.all([
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
    supabase
      .from("actions")
      .select(
        "*, prospects!inner(handle, intent_signal_id, platform)",
      )
      .eq("user_id", user.id)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false }),
  ])

  // Build ApprovalCardData[] by fetching signal data for each pending action
  const approvalCards: ApprovalCardData[] = []
  for (const action of pendingActions ?? []) {
    const prospect = action.prospects as unknown as {
      handle: string
      intent_signal_id: string
      platform: string
    }

    const { data: signal } = await supabase
      .from("intent_signals")
      .select(
        "post_url, post_content, subreddit, author_handle, intent_strength, suggested_angle, platform, detected_at",
      )
      .eq("id", prospect.intent_signal_id)
      .single()

    approvalCards.push({
      action,
      signal: signal ?? {
        post_url: "",
        post_content: null,
        subreddit: null,
        author_handle: prospect.handle,
        intent_strength: null,
        suggested_angle: null,
        platform: prospect.platform,
        detected_at: "",
      },
    })
  }

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
      <div className="mt-2">
        <ApprovalQueue
          initialApprovals={approvalCards}
          userId={user.id}
        />
      </div>
    </div>
  )
}
