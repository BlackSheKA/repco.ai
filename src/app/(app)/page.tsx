import { redirect } from "next/navigation"

import { AgentCard } from "@/features/dashboard/components/agent-card"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { ApprovalQueue } from "@/features/actions/components/approval-queue"
import type { ApprovalCardData } from "@/features/actions/lib/types"
import { OnboardingChecklist } from "@/features/onboarding/components/onboarding-checklist"
import { InboxWarningBanner } from "@/features/sequences/components/inbox-warning-banner"
import { RepliesSection } from "@/features/sequences/components/replies-section"
import type { ReplyData } from "@/features/sequences/lib/use-realtime-replies"
import { createClient } from "@/lib/supabase/server"

interface DashboardPageProps {
  searchParams?: Promise<{ onboarded?: string }>
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {}
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
    { data: repliedProspects },
    { data: failedAccounts },
    { count: productProfileCount },
    { count: redditAccountCount },
    { count: completedActionCount },
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
    supabase
      .from("prospects")
      .select(
        "id, handle, platform, last_reply_snippet, replied_detected_at, intent_signal_id",
      )
      .eq("user_id", user.id)
      .eq("pipeline_status", "replied")
      .order("replied_detected_at", { ascending: false })
      .limit(20),
    supabase
      .from("social_accounts")
      .select("handle, last_inbox_check_at, consecutive_inbox_failures")
      .eq("user_id", user.id)
      .gt("consecutive_inbox_failures", 0)
      .limit(1),
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

  const productDescribed = (productProfileCount ?? 0) > 0
  const keywordsGenerated = productDescribed
  const redditConnected = (redditAccountCount ?? 0) > 0
  const firstDmApproved = (completedActionCount ?? 0) > 0
  const checklistCompletedCount = [
    productDescribed,
    keywordsGenerated,
    redditConnected,
    firstDmApproved,
  ].filter(Boolean).length
  const showChecklist =
    resolvedSearchParams.onboarded === "true" ||
    checklistCompletedCount < 4

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

  // Build ReplyData[] by fetching original DM + post URL for each replied prospect
  const replyRows: ReplyData[] = []
  for (const prospect of repliedProspects ?? []) {
    const [dmResult, signalResult] = await Promise.all([
      supabase
        .from("actions")
        .select("final_content, drafted_content, created_at")
        .eq("prospect_id", prospect.id)
        .eq("action_type", "dm")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      prospect.intent_signal_id
        ? supabase
            .from("intent_signals")
            .select("post_url")
            .eq("id", prospect.intent_signal_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const dm = dmResult.data as
      | { final_content: string | null; drafted_content: string | null }
      | null
    const sig = (
      signalResult as { data: { post_url: string | null } | null }
    ).data

    replyRows.push({
      id: prospect.id,
      handle: prospect.handle ?? "unknown",
      platform: prospect.platform ?? "reddit",
      last_reply_snippet: prospect.last_reply_snippet,
      replied_detected_at: prospect.replied_detected_at,
      intent_signal_id: prospect.intent_signal_id,
      original_dm: dm?.final_content ?? dm?.drafted_content ?? null,
      post_url: sig?.post_url ?? null,
    })
  }

  const failedAccount = failedAccounts?.[0]

  return (
    <div className="flex flex-col gap-6 p-6">
      {showChecklist && (
        <OnboardingChecklist
          productDescribed={productDescribed}
          keywordsGenerated={keywordsGenerated}
          redditConnected={redditConnected}
          firstDmApproved={firstDmApproved}
        />
      )}
      {failedAccount && (
        <InboxWarningBanner
          accountHandle={failedAccount.handle ?? "unknown"}
          lastSuccessfulCheck={failedAccount.last_inbox_check_at}
        />
      )}
      <AgentCard
        userId={user.id}
        initialStats={{
          signalsFound: signalsFound ?? 0,
          actionsPending: actionsPending ?? 0,
        }}
      />
      <SignalFeed initialSignals={initialSignals ?? []} userId={user.id} />
      <RepliesSection initialReplies={replyRows} userId={user.id} />
      <div className="mt-2">
        <ApprovalQueue
          initialApprovals={approvalCards}
          userId={user.id}
        />
      </div>
    </div>
  )
}
