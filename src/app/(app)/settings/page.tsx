import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
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

  const { data: userData } = await supabase
    .from("users")
    .select("auto_send_followups, avg_deal_value")
    .eq("id", user.id)
    .single()

  return (
    <div className="p-6">
      <h1 className="font-sans text-[28px] font-semibold">Settings</h1>
      <p className="mt-2 max-w-[640px] text-sm text-muted-foreground">
        Source keywords, subreddits, and LinkedIn targets live on the{" "}
        <Link href="/signals" className="underline underline-offset-4">
          Signals → Sources
        </Link>{" "}
        tab.
      </p>
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
