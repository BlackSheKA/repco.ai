"use client"

import { useState } from "react"
import { CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getWarmupState } from "@/features/accounts/lib/types"

interface WarmupProgressProps {
  warmupDay: number
  completedAt: string | null
  username: string
  onSkipWarmup?: () => void
}

function getProgressColor(day: number): string {
  if (day >= 8) return "#22C55E"
  if (day >= 6) return "#4338CA"
  if (day >= 4) return "#F59E0B"
  return "#78716C"
}

export function WarmupProgress({
  warmupDay,
  completedAt,
  username,
  onSkipWarmup,
}: WarmupProgressProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const state = getWarmupState(warmupDay, completedAt)

  if (state.completed && !state.skipped) {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="text-sm text-green-500">Warmup complete</span>
      </div>
    )
  }

  if (state.skipped) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help text-sm text-amber-500">
              Warmup skipped
            </span>
          </TooltipTrigger>
          <TooltipContent>
            This account skipped warmup. Higher ban risk.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const progressValue = (state.day / 7) * 100

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">
        Warmup: Day {state.day} of 7
      </span>
      <div
        role="progressbar"
        aria-valuenow={state.day}
        aria-valuemin={0}
        aria-valuemax={7}
        aria-label={`Warmup progress for ${username}`}
      >
        <Progress
          value={progressValue}
          className="h-2"
          style={
            {
              "--progress-color": getProgressColor(state.day),
            } as React.CSSProperties
          }
        />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-auto w-fit p-0 text-xs text-muted-foreground"
        onClick={() => setDialogOpen(true)}
      >
        Skip warmup
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Skip warmup for u/{username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Skipping warmup increases the risk of your account being
              flagged or banned by Reddit. Only do this if this account
              already has recent activity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>
              Keep warming up
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onSkipWarmup?.()
                setDialogOpen(false)
              }}
            >
              Skip warmup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
