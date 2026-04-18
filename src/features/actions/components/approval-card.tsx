"use client"

import { useState, useTransition } from "react"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FlameIndicator } from "@/features/dashboard/components/flame-indicator"
import type { ApprovalCardData } from "@/features/actions/lib/types"

interface ApprovalCardProps {
  data: ApprovalCardData
  onApprove: (id: string, editedContent?: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  onRegenerate: (id: string) => Promise<void>
}

export function ApprovalCard({
  data,
  onApprove,
  onReject,
  onRegenerate,
}: ApprovalCardProps) {
  const { action, signal } = data
  const author = signal.author_handle ?? "unknown"

  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] = useState(
    action.drafted_content ?? "",
  )
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      const content = isEditing ? editedContent : undefined
      await onApprove(action.id, content)
    })
  }

  function handleReject() {
    startTransition(async () => {
      await onReject(action.id)
    })
  }

  function handleRegenerate() {
    startTransition(async () => {
      await onRegenerate(action.id)
      setIsEditing(false)
    })
  }

  function handleEditToggle() {
    if (isEditing) {
      // Discard edits — revert to original
      setEditedContent(action.drafted_content ?? "")
      setIsEditing(false)
    } else {
      setIsEditing(true)
    }
  }

  return (
    <div
      role="article"
      aria-label={`DM draft for ${author}`}
      className="rounded-lg border bg-card p-4"
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="h-6 rounded-full bg-[#FF4500] text-sm font-medium text-white hover:bg-[#FF4500]/90">
            Reddit
          </Badge>
          {signal.subreddit && (
            <span className="text-sm font-medium text-muted-foreground">
              r/{signal.subreddit}
            </span>
          )}
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-sm text-muted-foreground">u/{author}</span>
        </div>
        <span className="text-sm text-muted-foreground">
          {action.created_at
            ? formatDistanceToNow(new Date(action.created_at), {
                addSuffix: true,
              })
            : ""}
        </span>
      </div>

      {/* Context row */}
      <div className="mt-2 flex items-start gap-2">
        <p className="line-clamp-2 flex-1 text-base">
          {signal.post_content}
        </p>
        <FlameIndicator strength={signal.intent_strength} />
      </div>

      {/* Angle row */}
      {signal.suggested_angle && (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium">Suggested angle:</span>{" "}
          {signal.suggested_angle}
        </p>
      )}

      {/* DM Draft row */}
      <div className="mt-4 rounded-md border bg-background p-4">
        {isEditing ? (
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[80px] resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
            aria-label={`Edit DM to ${author}`}
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap text-base leading-relaxed">
            {action.drafted_content}
          </p>
        )}
      </div>

      {/* Action row */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="default"
          size="sm"
          disabled={isPending}
          aria-label={`Approve message to ${author}`}
          onClick={handleApprove}
        >
          {isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-label={
            isEditing
              ? "Discard edits"
              : `Edit message to ${author}`
          }
          onClick={handleEditToggle}
        >
          {isEditing ? "Discard edits" : "Edit"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-label={`Generate new draft for ${author}`}
          onClick={handleRegenerate}
        >
          {isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          Regenerate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={isPending}
          aria-label={`Reject message to ${author}`}
          onClick={handleReject}
        >
          Reject
        </Button>
      </div>
    </div>
  )
}
