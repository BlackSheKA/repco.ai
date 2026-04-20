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
import { ContextualCreditPrompt } from "@/features/billing/components/contextual-credit-prompt"
import { getActionCreditCost } from "@/features/billing/lib/credit-costs"
import type { ActionCreditType } from "@/features/billing/lib/types"

import { ApprovalCard } from "./approval-card"

interface ApprovalQueueProps {
  initialApprovals: ApprovalCardData[]
  userId: string
  creditBalance?: number
}

export function ApprovalQueue({
  initialApprovals,
  userId,
  creditBalance,
}: ApprovalQueueProps) {
  const approvals = useRealtimeApprovals(userId, initialApprovals)

  async function handleApprove(
    actionId: string,
    editedContent?: string,
  ) {
    // NOTE: Credits are deducted on action completion in the worker
    // (src/lib/action-worker/worker.ts), not at approval time. This keeps
    // approval instant and avoids double-charging on re-queued actions.
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
          {approvals.map((approval) => {
            const actionCost = getActionCreditCost(
              approval.action.action_type as ActionCreditType,
            )
            return (
              <div key={approval.action.id}>
                <ApprovalCard
                  data={approval}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onRegenerate={handleRegenerate}
                  onSave={handleSave}
                />
                {typeof creditBalance === "number" && actionCost > 0 && (
                  <ContextualCreditPrompt
                    actionCost={actionCost}
                    remainingCredits={creditBalance}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
