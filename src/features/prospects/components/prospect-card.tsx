"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { GripVertical } from "lucide-react"
import { useDraggable } from "@dnd-kit/react"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { FlameIndicator } from "@/features/dashboard/components/flame-indicator"
import { isValidStageTransition } from "../lib/pipeline"
import { PIPELINE_STAGES, type PipelineStage } from "../lib/types"
import type { ProspectWithSignal } from "../lib/types"

interface ProspectCardProps {
  prospect: ProspectWithSignal
  onMove: (prospectId: string, stage: PipelineStage) => void
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  detected: "Detected",
  engaged: "Engaged",
  contacted: "Contacted",
  replied: "Replied",
  converted: "Converted",
  rejected: "Rejected",
}

export function ProspectCard({ prospect, onMove }: ProspectCardProps) {
  const router = useRouter()
  const handleRef = useRef<HTMLButtonElement>(null)

  const { ref, handleRef: dndHandleRef, isDragging } = useDraggable({
    id: prospect.id,
    data: { stage: prospect.pipeline_status },
  })

  const validTargets = PIPELINE_STAGES.filter((s) =>
    isValidStageTransition(prospect.pipeline_status, s),
  )

  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation when interacting with controls
    const target = e.target as HTMLElement
    if (target.closest("[data-no-nav]")) return
    router.push(`/prospects/${prospect.id}`)
  }

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm cursor-pointer",
        isDragging && "opacity-50 shadow-lg",
      )}
      onClick={handleClick}
      role="article"
      aria-label={`Prospect ${prospect.handle ?? "unknown"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            ref={(el) => {
              handleRef.current = el
              dndHandleRef(el)
            }}
            data-no-nav
            className="hidden h-12 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing md:inline-flex"
            aria-label="Drag handle"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {prospect.handle ?? prospect.display_name ?? "unknown"}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "h-5 rounded-full px-2 text-xs font-medium",
                  prospect.platform === "reddit" &&
                    "border-[#FF4500]/40 text-[#FF4500]",
                )}
              >
                {prospect.platform}
              </Badge>
            </div>
            {prospect.intent_signal?.intent_strength != null && (
              <div className="mt-1">
                <FlameIndicator
                  strength={prospect.intent_signal.intent_strength}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2" data-no-nav onClick={(e) => e.stopPropagation()}>
        <Select
          value=""
          onValueChange={(v) => onMove(prospect.id, v as PipelineStage)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 w-full text-xs"
            aria-label="Move to stage"
          >
            <SelectValue placeholder="Move to..." />
          </SelectTrigger>
          <SelectContent>
            {validTargets.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
