"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { FlameIndicator } from "@/features/dashboard/components/flame-indicator"
import {
  updateProspectNotes,
  updateProspectStage,
  updateProspectTags,
} from "../actions/update-prospect"
import { isValidStageTransition } from "../lib/pipeline"
import { PIPELINE_STAGES, type PipelineStage } from "../lib/types"
import type { ProspectWithSignal } from "../lib/types"

const STAGE_LABELS: Record<PipelineStage, string> = {
  detected: "Detected",
  engaged: "Engaged",
  contacted: "Contacted",
  replied: "Replied",
  converted: "Converted",
  rejected: "Rejected",
}

export interface ProspectAction {
  id: string
  action_type: string
  status: string
  drafted_content: string | null
  final_content: string | null
  executed_at: string | null
  created_at: string
  sequence_step: number | null
}

interface ProspectDetailProps {
  prospect: ProspectWithSignal
  actions: ProspectAction[]
}

export function ProspectDetail({
  prospect,
  actions,
}: ProspectDetailProps) {
  const [stage, setStage] = useState<PipelineStage>(prospect.pipeline_status)
  const [notes, setNotes] = useState(prospect.notes ?? "")
  const [tagsInput, setTagsInput] = useState(
    (prospect.tags ?? []).join(", "),
  )
  const [, startTransition] = useTransition()

  const validTargets = PIPELINE_STAGES.filter((s) =>
    isValidStageTransition(stage, s),
  )

  const handleStageChange = (newStage: PipelineStage) => {
    const prev = stage
    setStage(newStage)
    startTransition(async () => {
      const res = await updateProspectStage(prospect.id, newStage)
      if ("error" in res) {
        setStage(prev)
        toast.error(res.error)
      } else {
        toast.success(`Moved to ${STAGE_LABELS[newStage]}`)
      }
    })
  }

  const saveNotes = () => {
    if (notes === (prospect.notes ?? "")) return
    startTransition(async () => {
      const res = await updateProspectNotes(prospect.id, notes)
      if ("error" in res) toast.error(res.error)
    })
  }

  const saveTags = () => {
    const tagsArray = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    const current = prospect.tags ?? []
    if (
      tagsArray.length === current.length &&
      tagsArray.every((t, i) => t === current[i])
    ) {
      return
    }
    startTransition(async () => {
      const res = await updateProspectTags(prospect.id, tagsArray)
      if ("error" in res) toast.error(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <Link
        href="/prospects"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to prospects
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: conversation history */}
        <div className="lg:col-span-2">
          <h2 className="mb-4 font-sans text-lg font-semibold">
            Conversation history
          </h2>
          {actions.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No messages yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {actions.map((action) => (
                <li
                  key={action.id}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {action.action_type}
                      </Badge>
                      {action.sequence_step != null && (
                        <Badge variant="secondary" className="text-xs">
                          Step {action.sequence_step}
                        </Badge>
                      )}
                      <Badge
                        className={cn(
                          "text-xs",
                          action.status === "completed" && "bg-emerald-500",
                          action.status === "failed" && "bg-destructive",
                        )}
                      >
                        {action.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(
                        new Date(action.executed_at ?? action.created_at),
                        { addSuffix: true },
                      )}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {action.final_content ?? action.drafted_content ?? ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: info */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "h-6 rounded-full px-2",
                  prospect.platform === "reddit" &&
                    "border-[#FF4500]/40 text-[#FF4500]",
                )}
              >
                {prospect.platform}
              </Badge>
              <span className="text-sm font-medium">
                {prospect.handle ?? prospect.display_name ?? "unknown"}
              </span>
            </div>
            {prospect.bio && (
              <p className="mt-2 text-sm text-muted-foreground">
                {prospect.bio}
              </p>
            )}
            {prospect.profile_url && (
              <a
                href={prospect.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                View profile
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {prospect.intent_signal && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Intent signal</h3>
              {prospect.intent_signal.post_content && (
                <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                  {prospect.intent_signal.post_content}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between">
                <FlameIndicator
                  strength={prospect.intent_signal.intent_strength}
                />
                <a
                  href={prospect.intent_signal.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                >
                  View post
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {prospect.intent_signal.suggested_angle && (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  <span className="font-medium">Suggested angle:</span>{" "}
                  {prospect.intent_signal.suggested_angle}
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Pipeline status</h3>
            <div className="flex items-center gap-2">
              <Badge>{STAGE_LABELS[stage]}</Badge>
              <Select
                value=""
                onValueChange={(v) => handleStageChange(v as PipelineStage)}
              >
                <SelectTrigger size="sm" className="h-8 flex-1 text-xs">
                  <SelectValue placeholder="Move to..." />
                </SelectTrigger>
                <SelectContent>
                  {validTargets.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Notes</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Add notes about this prospect..."
              className="min-h-[120px] resize-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-saves on blur
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">Tags</h3>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onBlur={saveTags}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveTags()
                }
              }}
              placeholder="comma, separated, tags"
            />
            {(prospect.tags ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(prospect.tags ?? []).map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={saveTags}
            >
              Save tags
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
