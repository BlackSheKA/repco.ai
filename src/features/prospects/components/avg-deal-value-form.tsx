"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateAvgDealValue } from "@/features/prospects/actions/update-avg-deal-value"

interface AvgDealValueFormProps {
  initialValue: number | null
}

export function AvgDealValueForm({ initialValue }: AvgDealValueFormProps) {
  const [value, setValue] = useState<string>(
    initialValue !== null ? String(initialValue) : "",
  )
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = value.trim()
    const parsed = trimmed === "" ? null : Number(trimmed)

    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Please enter a non-negative number")
      return
    }

    startTransition(async () => {
      const { error } = await updateAvgDealValue(parsed)
      if (error) {
        toast.error(error)
      } else {
        toast.success("Average deal value saved")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="avg-deal-value">Average deal value (USD)</Label>
        <p className="text-sm text-muted-foreground">
          Used to estimate revenue on the dashboard from converted prospects.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          id="avg-deal-value"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          placeholder="e.g. 500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-[200px]"
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  )
}
