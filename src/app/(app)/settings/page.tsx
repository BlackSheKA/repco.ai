import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SettingsForm } from "@/features/monitoring/components/settings-form"

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

  return (
    <div className="p-6">
      <h1 className="font-sans text-[28px] font-semibold">Settings</h1>
      <div className="mt-8">
        <SettingsForm keywords={keywords} subreddits={subreddits} />
      </div>
    </div>
  )
}
