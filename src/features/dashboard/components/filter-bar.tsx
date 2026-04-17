"use client"

import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export interface Filters {
  platform: "all" | "reddit" | "linkedin"
  minIntent: number
  showDismissed: boolean
}

interface FilterBarProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

export function getFiltersFromParams(
  searchParams: URLSearchParams,
): Filters {
  const platform =
    (searchParams.get("platform") as Filters["platform"]) ?? "all"
  const minIntent = Number(searchParams.get("min_intent") ?? "0")
  const showDismissed = searchParams.get("show_dismissed") === "true"
  return { platform, minIntent, showDismissed }
}

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilters = useCallback(
    (updates: Partial<Filters>) => {
      const next = { ...filters, ...updates }
      onFiltersChange(next)

      const params = new URLSearchParams(searchParams.toString())
      if (next.platform !== "all") {
        params.set("platform", next.platform)
      } else {
        params.delete("platform")
      }
      if (next.minIntent > 0) {
        params.set("min_intent", String(next.minIntent))
      } else {
        params.delete("min_intent")
      }
      if (next.showDismissed) {
        params.set("show_dismissed", "true")
      } else {
        params.delete("show_dismissed")
      }

      const qs = params.toString()
      router.replace(qs ? `?${qs}` : "?", { scroll: false })
    },
    [filters, onFiltersChange, router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TooltipProvider>
        <Select
          value={filters.platform}
          onValueChange={(value) =>
            updateFilters({
              platform: value as Filters["platform"],
            })
          }
        >
          <SelectTrigger
            className="w-[160px]"
            aria-label="Filter by platform"
          >
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <SelectItem value="linkedin" disabled>
                    LinkedIn
                  </SelectItem>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming in a future update</p>
              </TooltipContent>
            </Tooltip>
          </SelectContent>
        </Select>

        <Select
          value={String(filters.minIntent)}
          onValueChange={(value) =>
            updateFilters({ minIntent: Number(value) })
          }
        >
          <SelectTrigger
            className="w-[150px]"
            aria-label="Filter by minimum intent strength"
          >
            <SelectValue placeholder="All strengths" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">All strengths</SelectItem>
            <SelectItem value="4">4+ Warm</SelectItem>
            <SelectItem value="7">7+ Hot</SelectItem>
          </SelectContent>
        </Select>
      </TooltipProvider>

      <div className="flex items-center gap-2">
        <Switch
          id="show-dismissed"
          checked={filters.showDismissed}
          onCheckedChange={(checked) =>
            updateFilters({ showDismissed: checked })
          }
          aria-label="Show dismissed signals"
        />
        <Label htmlFor="show-dismissed" className="text-sm">
          Show dismissed
        </Label>
      </div>
    </div>
  )
}
