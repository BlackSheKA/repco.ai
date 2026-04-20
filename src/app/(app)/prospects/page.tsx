import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

import { KanbanBoard } from "@/features/prospects/components/kanban-board"
import type {
  PipelineStage,
  ProspectWithSignal,
} from "@/features/prospects/lib/types"

import { ExportCsvButton } from "./export-csv-button"

export const metadata: Metadata = {
  title: "Prospects",
}

interface ProspectRow {
  id: string
  user_id: string
  platform: "reddit" | "linkedin"
  handle: string | null
  profile_url: string | null
  display_name: string | null
  bio: string | null
  pipeline_status: PipelineStage
  notes: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  intent_signals?: {
    post_url: string
    post_content: string | null
    intent_strength: number | null
    intent_type: string | null
    suggested_angle: string | null
    detected_at: string
  } | null
}

export default async function ProspectsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data } = await supabase
    .from("prospects")
    .select(
      "id, user_id, platform, handle, profile_url, display_name, bio, pipeline_status, notes, tags, created_at, updated_at, intent_signals(post_url, post_content, intent_strength, intent_type, suggested_angle, detected_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  const rows = (data ?? []) as unknown as ProspectRow[]

  const prospects: ProspectWithSignal[] = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    platform: r.platform,
    handle: r.handle,
    profile_url: r.profile_url,
    display_name: r.display_name,
    bio: r.bio,
    pipeline_status: r.pipeline_status,
    notes: r.notes,
    tags: r.tags,
    created_at: r.created_at,
    updated_at: r.updated_at,
    intent_signal: r.intent_signals ?? null,
  }))

  const hasProspects = prospects.length > 0

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-[28px] font-semibold">Prospects</h1>
        <ExportCsvButton />
      </div>

      {hasProspects ? (
        <KanbanBoard initialProspects={prospects} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border bg-muted/30 px-6 py-16 text-center">
          <h2 className="font-sans text-xl font-semibold">
            No prospects yet
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Prospects appear here when repco detects and engages with people
            looking for your product. Start by connecting your Reddit account.
          </p>
          <Button asChild>
            <Link href="/accounts">Connect account</Link>
          </Button>
        </div>
      )}
    </div>
  )
}
