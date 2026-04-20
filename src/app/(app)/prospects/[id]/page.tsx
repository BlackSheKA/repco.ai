import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

import {
  ProspectDetail,
  type ProspectAction,
} from "@/features/prospects/components/prospect-detail"
import type {
  PipelineStage,
  ProspectWithSignal,
} from "@/features/prospects/lib/types"

interface ProspectDetailPageProps {
  params: Promise<{ id: string }>
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

export default async function ProspectDetailPage({
  params,
}: ProspectDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: prospectData } = await supabase
    .from("prospects")
    .select(
      "id, user_id, platform, handle, profile_url, display_name, bio, pipeline_status, notes, tags, created_at, updated_at, intent_signals(post_url, post_content, intent_strength, intent_type, suggested_angle, detected_at)",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!prospectData) {
    notFound()
  }

  const row = prospectData as unknown as ProspectRow

  const prospect: ProspectWithSignal = {
    id: row.id,
    user_id: row.user_id,
    platform: row.platform,
    handle: row.handle,
    profile_url: row.profile_url,
    display_name: row.display_name,
    bio: row.bio,
    pipeline_status: row.pipeline_status,
    notes: row.notes,
    tags: row.tags,
    created_at: row.created_at,
    updated_at: row.updated_at,
    intent_signal: row.intent_signals ?? null,
  }

  const { data: actionsData } = await supabase
    .from("actions")
    .select(
      "id, action_type, status, drafted_content, final_content, executed_at, created_at, sequence_step",
    )
    .eq("prospect_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })

  const actions = (actionsData ?? []) as ProspectAction[]

  return <ProspectDetail prospect={prospect} actions={actions} />
}
