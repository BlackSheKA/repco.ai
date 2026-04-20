"use client"

import { useEffect, useRef, useState } from "react"

interface ScanAnimationProps {
  subreddits: string[]
  signalCount: number
  onComplete: () => void
}

const CHAR_INTERVAL_MS = 60
const LINE_HOLD_MS = 350
const MIN_DURATION_MS = 3000
const MAX_DURATION_MS = 5000

export function ScanAnimation({
  subreddits,
  signalCount,
  onComplete,
}: ScanAnimationProps) {
  const [displayText, setDisplayText] = useState("")
  const [phase, setPhase] = useState<"typing" | "revealed">("typing")
  const completeCalled = useRef(false)

  const targets = subreddits.length > 0 ? subreddits : ["r/SaaS", "r/startups"]

  useEffect(() => {
    let cancelled = false
    const startedAt = Date.now()

    let subredditIndex = 0
    let charIndex = 0
    let intervalId: ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function typeNext() {
      if (cancelled) return
      const current = targets[subredditIndex % targets.length]
      const fullLine = `Scanning ${current}...`

      if (charIndex <= fullLine.length) {
        setDisplayText(fullLine.slice(0, charIndex))
        charIndex += 1
      } else {
        // Pause on completed line, then move to next
        if (intervalId) clearInterval(intervalId)
        intervalId = null
        timeoutId = setTimeout(() => {
          if (cancelled) return
          const elapsed = Date.now() - startedAt
          subredditIndex += 1
          charIndex = 0

          const shouldReveal =
            (elapsed >= MIN_DURATION_MS &&
              subredditIndex >= targets.length) ||
            elapsed >= MAX_DURATION_MS

          if (shouldReveal) {
            setPhase("revealed")
            if (!completeCalled.current) {
              completeCalled.current = true
              // small delay so the reveal copy is visible before navigating
              setTimeout(() => onComplete(), 1200)
            }
            return
          }

          intervalId = setInterval(typeNext, CHAR_INTERVAL_MS)
        }, LINE_HOLD_MS)
      }
    }

    intervalId = setInterval(typeNext, CHAR_INTERVAL_MS)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
    // targets derived from subreddits prop; stable enough — we want to run once
    // per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-6">
      <div className="flex w-full max-w-[480px] flex-col items-start gap-8">
        {phase === "typing" && (
          <p className="font-mono text-[20px] font-medium text-foreground">
            {displayText}
            <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-foreground align-middle" />
          </p>
        )}

        {phase === "revealed" && (
          <div className="flex w-full animate-in fade-in flex-col gap-3 duration-500">
            {signalCount > 0 ? (
              <h2 className="text-[28px] font-semibold leading-tight">
                Found {signalCount}{" "}
                {signalCount === 1 ? "person" : "people"} looking for something
                like yours
              </h2>
            ) : (
              <>
                <h2 className="text-[28px] font-semibold leading-tight">
                  No signals yet
                </h2>
                <p className="text-base text-muted-foreground">
                  repco will start scanning every 15 minutes. Here are broader
                  keywords that might help:
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
