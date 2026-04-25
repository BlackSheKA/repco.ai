import { redirect } from "next/navigation"

import { AgentCard } from "@/features/dashboard/components/agent-card"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { ApprovalQueue } from "@/features/actions/components/approval-queue"
import type { ApprovalCardData } from "@/features/actions/lib/types"
import { InboxWarningBanner } from "@/features/sequences/components/inbox-warning-banner"
import { RepliesSection } from "@/features/sequences/components/replies-section"
import type { ReplyData } from "@/features/sequences/lib/use-realtime-replies"
import { CreditCard } from "@/features/billing/components/credit-card"
import { UpgradeBanner } from "@/features/billing/components/upgrade-banner"
import { ProspectStatsCard } from "@/features/prospects/components/prospect-stats-card"
import { ResultsCard } from "@/features/growth/components/results-card"
import { createClient } from "@/lib/supabase/server"
import { fetchPendingActions } from "@/features/actions/actions/approval-actions"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const sevenDaysAgoIso = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [
    { data: initialSignals },
    { count: signalsFound },
    { count: actionsPending },
    { data: pendingActions },
    { data: repliedProspects },
    { data: failedAccounts },
    { data: userRow },
    { count: weeklySignalsCount },
    { count: weeklyDmsCount },
    { count: weeklyRepliesCount },
    { count: weeklyConversionsCount },
    { count: prospectsTotal },
    { count: prospectsReplied },
    { count: prospectsConverted },
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
    // LNKD-06: excludes prospects with pipeline_status='unreachable'
    fetchPendingActions(user.id),
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
      .from("users")
      .select("credits_balance, avg_deal_value")
      .eq("id", user.id)
      .maybeSingle(),
    // Weekly signals detected
    supabase
      .from("intent_signals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("detected_at", sevenDaysAgoIso),
    // Weekly DMs sent
    supabase
      .from("actions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", "dm")
      .eq("status", "completed")
      .gte("executed_at", sevenDaysAgoIso),
    // Weekly replies detected
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("replied_detected_at", sevenDaysAgoIso),
    // Weekly conversions
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("pipeline_status", "converted")
      .gte("updated_at", sevenDaysAgoIso),
    // Total prospects (all-time)
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    // Prospects replied (all-time)
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("pipeline_status", "replied"),
    // Prospects converted (all-time)
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("pipeline_status", "converted"),
  ])

  const creditBalance = (userRow?.credits_balance as number | null) ?? 0
  const avgDealValue = (userRow?.avg_deal_value as number | null) ?? null

  // Weekly results card stats (7-day rolling window)
  const weeklyStats = {
    scanned: weeklySignalsCount ?? 0,
    signals: weeklySignalsCount ?? 0,
    dms: weeklyDmsCount ?? 0,
    replies: weeklyRepliesCount ?? 0,
    replyRate:
      (weeklyDmsCount ?? 0) > 0
        ? Math.round(
            ((weeklyRepliesCount ?? 0) / (weeklyDmsCount ?? 1)) * 100,
          )
        : 0,
    conversions: weeklyConversionsCount ?? 0,
  }
  const resultsCardImageUrl =
    `/api/og/results-card?scanned=${weeklyStats.scanned}` +
    `&signals=${weeklyStats.signals}` +
    `&dms=${weeklyStats.dms}` +
    `&replies=${weeklyStats.replies}` +
    `&replyRate=${weeklyStats.replyRate}` +
    `&conversions=${weeklyStats.conversions}`

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
      <UpgradeBanner balance={creditBalance} />
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
      <CreditCard balance={creditBalance} />
      <ProspectStatsCard
        total={prospectsTotal ?? 0}
        replied={prospectsReplied ?? 0}
        converted={prospectsConverted ?? 0}
        avgDealValue={avgDealValue}
      />
      <ResultsCard stats={weeklyStats} imageUrl={resultsCardImageUrl} />
      <SignalFeed initialSignals={initialSignals ?? []} userId={user.id} />
      <RepliesSection initialReplies={replyRows} userId={user.id} />
      <div className="mt-2">
        <ApprovalQueue
          initialApprovals={approvalCards}
          userId={user.id}
          creditBalance={creditBalance}
        />
      </div>
    </div>
  )
}
