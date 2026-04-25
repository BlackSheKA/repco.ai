"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, Circle, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const DISMISSED_KEY = "repco_checklist_dismissed"

interface OnboardingChecklistProps {
  productDescribed: boolean
  keywordsGenerated: boolean
  redditConnected: boolean
  firstDmApproved: boolean
}

interface ChecklistItem {
  label: string
  done: boolean
  href?: string
}

export function OnboardingChecklist({
  productDescribed,
  keywordsGenerated,
  redditConnected,
  firstDmApproved,
}: OnboardingChecklistProps) {
  const [hydrated, setHydrated] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let nextDismissed = false
    try {
      nextDismissed = window.localStorage.getItem(DISMISSED_KEY) === "true"
    } catch {
      // ignore storage access errors (private mode, etc.)
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(nextDismissed)
    setHydrated(true)
  }, [])

  const items: ChecklistItem[] = [
    { label: "Describe your product", done: productDescribed },
    { label: "Keywords generated", done: keywordsGenerated },
    {
      label: "Connect Reddit account",
      done: redditConnected,
      href: "/accounts",
    },
    {
      label: "Approve your first DM",
      done: firstDmApproved,
      href: "/#approvals",
    },
  ]

  const completedCount = items.filter((i) => i.done).length
  const progressValue = (completedCount / items.length) * 100
  const allComplete = completedCount === items.length

  function handleDismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true")
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  if (!hydrated || dismissed || allComplete) {
    return null
  }

  return (
    <SidebarMenuItem>
      <Popover>
        <PopoverTrigger asChild>
          <SidebarMenuButton>
            <Sparkles />
            <span>Get started</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {completedCount}/{items.length}
            </span>
          </SidebarMenuButton>
        </PopoverTrigger>

        <PopoverContent align="start" side="right" className="w-72">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Get started</h3>
              <span className="font-mono text-xs text-muted-foreground">
                {completedCount}/{items.length}
              </span>
            </div>

            <Progress value={progressValue} className="h-1" />

            <ul className="flex flex-col gap-2">
              {items.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      item.done
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-muted-foreground/40 text-transparent",
                    )}
                    aria-hidden
                  >
                    {item.done ? (
                      <Check className="size-2.5" strokeWidth={3} />
                    ) : (
                      <Circle className="size-2.5" />
                    )}
                  </span>

                  {item.href && !item.done ? (
                    <Link
                      href={item.href}
                      className="text-sm font-medium hover:underline"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        "text-sm",
                        item.done
                          ? "text-muted-foreground line-through"
                          : "font-medium",
                      )}
                    >
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Hide
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}
