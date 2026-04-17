"use client"

import { cn } from "@/lib/utils"
import {
  useRealtimeTerminal,
  type TerminalEntry,
} from "@/features/dashboard/lib/use-realtime-terminal"

interface TerminalHeaderProps {
  userId: string
}

/**
 * Highlight key nouns in terminal text:
 * - subreddit names (r/Name)
 * - usernames (u/name)
 * - intent scores (N/10)
 */
function highlightText(text: string): React.ReactNode[] {
  const pattern = /(r\/\w+|u\/\w+|\d+\/10)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} className="text-[#4338CA]">
        {match[0]}
      </span>,
    )
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function getLinePrefix(entry: TerminalEntry): {
  symbol: string
  className: string
} {
  switch (entry.type) {
    case "complete":
      return { symbol: "", className: "text-[#22C55E]" }
    case "found":
      return { symbol: "", className: "text-[#4338CA]" }
    case "scanning":
    case "classifying":
    case "quiet":
    default:
      return { symbol: "", className: "text-zinc-500" }
  }
}

export function TerminalHeader({ userId }: TerminalHeaderProps) {
  const { entries } = useRealtimeTerminal(userId)

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Agent activity log"
      className={cn(
        "h-[60px] overflow-hidden border-b border-border bg-stone-800 px-4 py-2 font-mono text-sm leading-relaxed text-stone-400 dark:bg-stone-900 md:h-[120px]",
      )}
    >
      <div className="flex h-full flex-col justify-end">
        {entries.map((entry) => {
          const { symbol, className } = getLinePrefix(entry)
          return (
            <div
              key={entry.id}
              className="animate-in fade-in duration-300 ease-out"
            >
              {symbol && <span className={className}>{symbol} </span>}
              <span>{highlightText(entry.text)}</span>
            </div>
          )
        })}
        {/* Fill remaining space if fewer than 5 entries */}
        {Array.from({ length: Math.max(0, 5 - entries.length) }).map(
          (_, i) => (
            <div key={`empty-${i}`} className="invisible">
              &nbsp;
            </div>
          ),
        )}
      </div>
    </div>
  )
}
