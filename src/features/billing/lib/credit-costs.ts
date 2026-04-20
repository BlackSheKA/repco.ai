import { CREDIT_COSTS, type ActionCreditType } from "./types"

/**
 * Look up the credit cost for a given action type.
 * Returns 0 for free actions (like, follow) and positive values for
 * billable actions (public_reply, dm, followup_dm).
 */
export function getActionCreditCost(actionType: ActionCreditType): number {
  return CREDIT_COSTS[actionType]
}
