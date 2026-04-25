import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SignalFeed } from "@/features/dashboard/components/signal-feed"
import { SourcesPanel } from "@/features/monitoring/components/sources-panel"
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

  const [{ data: initialSignals }, { data: sources }] = await Promise.all([
    supabase
      .from("intent_signals")
      .select("*")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("detected_at", { ascending: false })
      .limit(20),
    supabase
      .from("monitoring_signals")
      .select("id, signal_type, value")
      .eq("user_id", user.id)
      .eq("active", true),
  ])

  const bucketed = (sources ?? []).reduce(
    (acc, s) => {
      const item = { id: s.id, value: s.value }
      switch (s.signal_type) {
        case "reddit_keyword":
          acc.redditKeywords.push(item)
          break
        case "subreddit":
          acc.subreddits.push(item)
          break
        case "linkedin_keyword":
          acc.linkedinKeywords.push(item)
          break
        case "linkedin_company":
          acc.linkedinCompanies.push(item)
          break
        case "linkedin_author":
          acc.linkedinAuthors.push(item)
          break
      }
      return acc
    },
    {
      redditKeywords: [] as { id: string; value: string }[],
      subreddits: [] as { id: string; value: string }[],
      linkedinKeywords: [] as { id: string; value: string }[],
      linkedinCompanies: [] as { id: string; value: string }[],
      linkedinAuthors: [] as { id: string; value: string }[],
    },
  )

  return (
    <div className="flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
        <p className="text-sm text-muted-foreground">
          Live intent signals from Reddit and LinkedIn. Filter, contact, or
          dismiss.
        </p>
      </div>
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>
        <TabsContent value="feed" className="mt-4">
          <SignalFeed initialSignals={initialSignals ?? []} userId={user.id} />
        </TabsContent>
        <TabsContent value="sources" className="mt-4">
          <SourcesPanel
            redditKeywords={bucketed.redditKeywords}
            subreddits={bucketed.subreddits}
            linkedinKeywords={bucketed.linkedinKeywords}
            linkedinCompanies={bucketed.linkedinCompanies}
            linkedinAuthors={bucketed.linkedinAuthors}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
