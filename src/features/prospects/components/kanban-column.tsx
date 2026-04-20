"use client"

import { useDroppable } from "@dnd-kit/react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { ProspectCard } from "./prospect-card"
import type { PipelineStage, ProspectWithSignal } from "../lib/types"

interface KanbanColumnProps {
  stage: PipelineStage
  prospects: ProspectWithSignal[]
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

export function KanbanColumn({
  stage,
  prospects,
  onMove,
}: KanbanColumnProps) {
  const { ref, isDropTarget } = useDroppable({
    id: `column-${stage}`,
    data: { stage },
  })

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-w-[280px] flex-col rounded-lg border bg-muted/30 p-3 transition-colors",
        isDropTarget && "border-primary bg-primary/5",
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-sans text-sm font-semibold">
          {STAGE_LABELS[stage]}
        </h2>
        <Badge variant="secondary" className="h-5 px-2 text-xs">
          {prospects.length}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {prospects.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No prospects
          </p>
        ) : (
          prospects.map((p) => (
            <ProspectCard key={p.id} prospect={p} onMove={onMove} />
          ))
        )}
      </div>
    </div>
  )
}
