"use client"

import { Badge } from "@/components/ui/badge"

import { useRealtimeReplies, type ReplyData } from "../lib/use-realtime-replies"
import { ReplyCard } from "./reply-card"

interface RepliesSectionProps {
  initialReplies: ReplyData[]
  userId: string
}

export function RepliesSection({
  initialReplies,
  userId,
}: RepliesSectionProps) {
  const replies = useRealtimeReplies(initialReplies, userId)

  const sorted = [...replies].sort((a, b) => {
    const at = a.replied_detected_at
      ? new Date(a.replied_detected_at).getTime()
      : 0
    const bt = b.replied_detected_at
      ? new Date(b.replied_detected_at).getTime()
      : 0
    return bt - at
  })

  return (
    <section role="region" aria-label="Replies" className="mt-2">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-[28px] font-semibold leading-tight">Replies</h2>
        <Badge variant="secondary">{sorted.length}</Badge>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 py-12 text-center">
          <h3 className="text-base font-semibold">No replies yet</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            When a prospect replies to your DM, it will appear here. repco
            checks inboxes every 2 hours.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sorted.map((reply) => (
            <ReplyCard key={reply.id} reply={reply} />
          ))}
        </div>
      )}
    </section>
  )
}
