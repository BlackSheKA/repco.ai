"use client"

import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SequenceStepState =
  | "completed"
  | "pending"
  | "skipped"
  | "cancelled"

export interface SequenceStep {
  step: number
  state: SequenceStepState
}

interface SequenceTimelineProps {
  steps: SequenceStep[]
  prospectHandle: string
  onStopSequence: () => void | Promise<void>
  showStopButton?: boolean
}

const STEP_LABELS = ["DM", "Day 3", "Day 7", "Day 14"]

function stepClasses(state: SequenceStepState): {
  dot: string
  line: string
  label: string
} {
  switch (state) {
    case "completed":
      return {
        dot: "bg-[#22C55E] border-[#22C55E]/30",
        line: "bg-[#22C55E]/40",
        label: "",
      }
    case "pending":
      return {
        dot: "bg-primary/30 border-primary/50",
        line: "bg-muted/40",
        label: "text-muted-foreground",
      }
    case "skipped":
      return {
        dot: "bg-amber-500/30 border-amber-500/50",
        line: "bg-muted/40",
        label: "text-muted-foreground",
      }
    case "cancelled":
      return {
        dot: "bg-muted/20 border-muted/30",
        line: "bg-muted/30",
        label: "text-muted-foreground line-through",
      }
  }
}

export function SequenceTimeline({
  steps,
  prospectHandle,
  onStopSequence,
  showStopButton = true,
}: SequenceTimelineProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  async function handleConfirm() {
    setIsPending(true)
    try {
      await onStopSequence()
      setDialogOpen(false)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <ol role="list" className="flex flex-1 items-center gap-2">
        {steps.map((step, idx) => {
          const classes = stepClasses(step.state)
          const label = STEP_LABELS[idx] ?? `Step ${step.step}`
          return (
            <li
              key={step.step}
              role="listitem"
              aria-label={`Step ${step.step}: ${step.state}`}
              className="flex items-center gap-2"
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "size-3 rounded-full border-2",
                    classes.dot,
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn("text-sm", classes.label)}
                >
                  {label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <span
                  className={cn("h-0.5 w-6", classes.line)}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>

      {showStopButton && (
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive min-h-[44px] md:min-h-0"
              aria-label={`Stop follow-up sequence for u/${prospectHandle}`}
            >
              Stop sequence
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Stop sequence for u/{prospectHandle}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will cancel all remaining follow-ups. You can still send a
                new message manually.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel autoFocus>Keep sending</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isPending}
                onClick={(e) => {
                  e.preventDefault()
                  void handleConfirm()
                }}
              >
                {isPending ? "Stopping..." : "Stop sequence"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
