import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SettingsForm } from "@/features/monitoring/components/settings-form"
import { AutoSendToggle } from "@/features/sequences/components/auto-send-toggle"
import { AvgDealValueForm } from "@/features/prospects/components/avg-deal-value-form"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Fetch user's monitoring signals
  const { data: signals } = await supabase
    .from("monitoring_signals")
    .select("id, signal_type, value")
    .eq("user_id", user.id)
    .eq("active", true)

  const keywords = (signals ?? [])
    .filter((s) => s.signal_type === "reddit_keyword")
    .map((s) => ({ id: s.id, value: s.value }))

  const subreddits = (signals ?? [])
    .filter((s) => s.signal_type === "subreddit")
    .map((s) => ({ id: s.id, value: s.value }))

  // Fetch user's auto-send preference and avg deal value
  const { data: userData } = await supabase
    .from("users")
    .select("auto_send_followups, avg_deal_value")
    .eq("id", user.id)
    .single()

  return (
    <div className="p-6">
      <h1 className="font-sans text-[28px] font-semibold">Settings</h1>
      <div className="mt-8">
        <SettingsForm keywords={keywords} subreddits={subreddits} />
      </div>
      <div className="mt-8 max-w-[640px]">
        <h2 className="font-sans text-xl font-semibold">Follow-up Sequences</h2>
        <div className="mt-4 rounded-lg bg-muted/50 p-6">
          <AutoSendToggle
            initialEnabled={userData?.auto_send_followups ?? false}
          />
        </div>
      </div>
      <div className="mt-8 max-w-[640px]">
        <h2 className="font-sans text-xl font-semibold">Revenue Tracking</h2>
        <div className="mt-4 rounded-lg bg-muted/50 p-6">
          <AvgDealValueForm
            initialValue={
              (userData?.avg_deal_value as number | null | undefined) ?? null
            }
          />
        </div>
      </div>
    </div>
  )
}
