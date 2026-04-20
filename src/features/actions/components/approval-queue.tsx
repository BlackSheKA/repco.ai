"use client"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import {
  approveAction,
  rejectAction,
  regenerateAction,
  saveEdits,
} from "@/features/actions/actions/approval-actions"
import { useRealtimeApprovals } from "@/features/actions/lib/use-realtime-approvals"
import type { ApprovalCardData } from "@/features/actions/lib/types"

import { ApprovalCard } from "./approval-card"

interface ApprovalQueueProps {
  initialApprovals: ApprovalCardData[]
  userId: string
}

export function ApprovalQueue({
  initialApprovals,
  userId,
}: ApprovalQueueProps) {
  const approvals = useRealtimeApprovals(userId, initialApprovals)

  async function handleApprove(
    actionId: string,
    editedContent?: string,
  ) {
    const result = await approveAction(actionId, editedContent)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Message approved -- sending shortly")
    }
  }

  async function handleReject(actionId: string) {
    const result = await rejectAction(actionId)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast("Message rejected")
    }
  }

  async function handleRegenerate(actionId: string) {
    toast("Generating a new draft...")
    const result = await regenerateAction(actionId)
    if (result.error) {
      toast.error(result.error)
    }
  }

  async function handleSave(actionId: string, editedContent: string) {
    const result = await saveEdits(actionId, editedContent)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Edits saved")
    }
  }

  return (
    <div role="region" aria-label="Approval queue">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-2xl font-semibold">Approval Queue</h2>
        <Badge variant="secondary">{approvals.length}</Badge>
      </div>

      {approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-base font-semibold">
            No messages pending
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            When you click Contact on a signal, repco will draft a DM
            for your review.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.action.id}
              data={approval}
              onApprove={handleApprove}
              onReject={handleReject}
              onRegenerate={handleRegenerate}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}
