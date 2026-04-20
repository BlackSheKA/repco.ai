"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { toggleAutoSend } from "../actions/toggle-auto-send"

interface AutoSendToggleProps {
  initialEnabled: boolean
}

export function AutoSendToggle({ initialEnabled }: AutoSendToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isPending, startTransition] = useTransition()

  function handleToggle(checked: boolean) {
    setEnabled(checked)
    startTransition(async () => {
      try {
        await toggleAutoSend(checked)
        toast(checked ? "Auto-send enabled" : "Auto-send disabled")
      } catch {
        setEnabled(!checked)
        toast.error("Failed to update setting")
      }
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <label htmlFor="auto-send" className="font-sans text-base">
          Auto-send follow-ups
        </label>
        <p id="auto-send-description" className="text-sm text-muted-foreground">
          When enabled, follow-up messages send automatically without your
          approval. Default cadence: day 3, 7, and 14.
        </p>
      </div>
      <Switch
        id="auto-send"
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={isPending}
        aria-label="Auto-send follow-ups"
        aria-describedby="auto-send-description"
      />
    </div>
  )
}
