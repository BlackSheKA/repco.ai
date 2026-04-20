import type { PipelineStage } from "./types"

// Forward progression order (rejected handled separately).
const FORWARD_ORDER: PipelineStage[] = [
  "detected",
  "engaged",
  "contacted",
  "replied",
  "converted",
]

/**
 * Validate a prospect pipeline stage transition.
 *
 * Rules:
 * - Same stage -> same stage is not a transition (false)
 * - Any stage can move to "rejected"
 * - "rejected" can move to any other stage (un-reject)
 * - Forward skips are allowed (detected -> converted OK)
 * - Backward moves are not allowed (once converted, stays converted
 *   unless rejected)
 */
export function isValidStageTransition(
  from: PipelineStage,
  to: PipelineStage,
): boolean {
  if (from === to) return false

  // Any stage -> rejected is allowed.
  if (to === "rejected") return true

  // rejected -> any non-rejected is allowed (un-reject).
  if (from === "rejected") return true

  const fromIdx = FORWARD_ORDER.indexOf(from)
  const toIdx = FORWARD_ORDER.indexOf(to)

  // Both stages must exist in forward order at this point.
  if (fromIdx === -1 || toIdx === -1) return false

  // Must be strictly forward.
  return toIdx > fromIdx
}
