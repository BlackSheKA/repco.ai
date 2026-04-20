"use client"

import { useState, useTransition } from "react"
import { DragDropProvider } from "@dnd-kit/react"
import type { DragEndEvent } from "@dnd-kit/react"
import { toast } from "sonner"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

import { updateProspectStage } from "../actions/update-prospect"
import { isValidStageTransition } from "../lib/pipeline"
import { PIPELINE_STAGES, type PipelineStage } from "../lib/types"
import type { ProspectWithSignal } from "../lib/types"
import { KanbanColumn } from "./kanban-column"

interface KanbanBoardProps {
  initialProspects: ProspectWithSignal[]
}

export function KanbanBoard({ initialProspects }: KanbanBoardProps) {
  const [prospects, setProspects] = useState(initialProspects)
  const [, startTransition] = useTransition()

  const grouped = PIPELINE_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = prospects.filter((p) => p.pipeline_status === stage)
      return acc
    },
    {} as Record<PipelineStage, ProspectWithSignal[]>,
  )

  const moveProspect = (prospectId: string, newStage: PipelineStage) => {
    const prospect = prospects.find((p) => p.id === prospectId)
    if (!prospect) return
    const oldStage = prospect.pipeline_status
    if (oldStage === newStage) return

    if (!isValidStageTransition(oldStage, newStage)) {
      toast.error("Invalid stage transition")
      return
    }

    // Optimistic update
    setProspects((prev) =>
      prev.map((p) =>
        p.id === prospectId ? { ...p, pipeline_status: newStage } : p,
      ),
    )

    startTransition(async () => {
      const result = await updateProspectStage(prospectId, newStage)
      if ("error" in result) {
        // Revert
        setProspects((prev) =>
          prev.map((p) =>
            p.id === prospectId ? { ...p, pipeline_status: oldStage } : p,
          ),
        )
        toast.error(result.error)
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { operation, canceled } = event
    if (canceled) return
    const source = operation.source
    const target = operation.target
    if (!source || !target) return

    const prospectId = String(source.id)
    const targetId = String(target.id)
    if (!targetId.startsWith("column-")) return
    const newStage = targetId.replace("column-", "") as PipelineStage
    moveProspect(prospectId, newStage)
  }

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-4 pb-4">
          {PIPELINE_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              prospects={grouped[stage] ?? []}
              onMove={moveProspect}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </DragDropProvider>
  )
}
