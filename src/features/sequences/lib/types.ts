export const FOLLOW_UP_SCHEDULE = [
  { step: 1, dayOffset: 3, angle: "feature/benefit" },
  { step: 2, dayOffset: 7, angle: "value/insight" },
  { step: 3, dayOffset: 14, angle: "low-pressure check-in" },
] as const

export type FollowUpStep = 1 | 2 | 3

export interface DueFollowUp {
  prospectId: string
  userId: string
  step: FollowUpStep
  angle: string
  intentSignalId: string
  accountId: string
  prospectHandle: string
  platform: string
}

export interface SequenceProgress {
  completedSteps: FollowUpStep[]
  nextStep: FollowUpStep | null
  sequenceStopped: boolean
  hasReplied: boolean
}
