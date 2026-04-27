export const PLAN_CONFIG = {
  free: { grant: 250, cap: 500 },
  pro: { grant: 2000, cap: 4000 },
} as const

export type SubscriptionPlan = keyof typeof PLAN_CONFIG
export type BillingCycle = "monthly" | "annual"
