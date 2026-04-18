import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { AccountList } from "@/features/accounts/components/account-list"
import type { AccountDailyUsage } from "@/features/accounts/lib/types"

export default async function AccountsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Fetch accounts
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  // Fetch today's usage for each account
  const today = new Date().toISOString().split("T")[0]
  const { data: usageRows } = await supabase
    .from("action_counts")
    .select("account_id, dm_count, engage_count, reply_count")
    .eq("date", today)

  // Build usage map with limits from accounts
  const usages: Record<string, AccountDailyUsage> = {}
  for (const account of accounts ?? []) {
    const usage = usageRows?.find(
      (r: { account_id: string }) => r.account_id === account.id,
    )
    usages[account.id] = {
      dm_count: usage?.dm_count ?? 0,
      engage_count: usage?.engage_count ?? 0,
      reply_count: usage?.reply_count ?? 0,
      dm_limit: account.daily_dm_limit,
      engage_limit: account.daily_engage_limit,
      reply_limit: account.daily_reply_limit,
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-semibold">Accounts</h1>
      <AccountList
        initialAccounts={accounts ?? []}
        initialUsages={usages}
        userId={user.id}
      />
    </div>
  )
}
