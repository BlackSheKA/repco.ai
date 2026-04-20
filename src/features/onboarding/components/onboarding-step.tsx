"use client"

import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import type { OnboardingStep as OnboardingStepConfig } from "../lib/types"

interface OnboardingStepProps {
  step: OnboardingStepConfig
  value: string
  onChange: (next: string) => void
  onNext: () => void
  onSkip?: () => void
  isLoading?: boolean
  totalSteps?: number
}

export function OnboardingStep({
  step,
  value,
  onChange,
  onNext,
  onSkip,
  isLoading = false,
  totalSteps = 3,
}: OnboardingStepProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Autofocus input when the step mounts (each step remounts via key prop)
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 220)
    return () => window.clearTimeout(id)
  }, [])

  const isCompetitorStep = step.step === 3
  const trimmed = value.trim()
  const meetsMinLength = trimmed.length >= 5
  const canSubmit = isCompetitorStep ? true : meetsMinLength

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSubmit && !isLoading) {
        onNext()
      }
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-6 animate-in fade-in duration-200">
      <div className="flex w-full max-w-[480px] flex-col gap-8">
        <StepIndicator current={step.step} total={totalSteps} />

        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
          {step.heading}
        </h1>

        {isCompetitorStep ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={step.placeholder}
            className="min-h-20 text-base"
            disabled={isLoading}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={step.placeholder}
            className="h-11 text-base"
            disabled={isLoading}
          />
        )}

        {!isCompetitorStep && !meetsMinLength && trimmed.length > 0 && (
          <p className="-mt-4 text-sm text-muted-foreground">
            A few more words help repco find better signals.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          {isCompetitorStep && onSkip ? (
            <Button
              type="button"
              variant="link"
              className="px-0 text-muted-foreground"
              onClick={onSkip}
              disabled={isLoading}
            >
              {step.skipLabel ?? "Skip for now"}
            </Button>
          ) : (
            <span />
          )}

          <Button
            type="button"
            size="lg"
            onClick={onNext}
            disabled={!canSubmit || isLoading}
            className={cn("min-w-24", isLoading && "opacity-80")}
          >
            {isLoading ? "Working..." : "Next"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StepIndicator({
  current,
  total,
}: {
  current: number
  total: number
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const stepNumber = i + 1
        const isComplete = stepNumber < current
        const isCurrent = stepNumber === current
        return (
          <span
            key={stepNumber}
            aria-label={`Step ${stepNumber} of ${total}`}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              isComplete && "bg-primary",
              isCurrent && "bg-primary",
              !isComplete && !isCurrent && "border border-muted-foreground/40"
            )}
          />
        )
      })}
    </div>
  )
}
