export type ActionCreditType =
  | "like"
  | "follow"
  | "public_reply"
  | "dm"
  | "followup_dm"

export type CreditCostMap = Record<ActionCreditType, number>

export const CREDIT_COSTS: CreditCostMap = {
  like: 0,
  follow: 0,
  public_reply: 15,
  dm: 30,
  followup_dm: 20,
} as const

export type MonitoringSignalType =
  | "reddit_keyword"
  | "linkedin_keyword"
  | "subreddit"
  | "competitor"
  | "profile_visitor"

export const MONITORING_COSTS: Record<MonitoringSignalType, number> = {
  reddit_keyword: 3,
  linkedin_keyword: 6,
  subreddit: 3,
  competitor: 3,
  profile_visitor: 3,
} as const

export type AccountPlatform = "reddit" | "linkedin"

export const ACCOUNT_COSTS: Record<AccountPlatform, number> = {
  reddit: 3,
  linkedin: 5,
} as const

export const INCLUDED_ACCOUNTS = 2

export interface PricingPlan {
  name: string
  period: "monthly" | "quarterly" | "annual"
  pricePerMonth: number
  totalPrice: number
  stripePriceId: string
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "repco",
    period: "monthly",
    pricePerMonth: 49,
    totalPrice: 49,
    stripePriceId: process.env.STRIPE_PRICE_MONTHLY ?? "",
  },
  {
    name: "repco",
    period: "quarterly",
    pricePerMonth: 35,
    totalPrice: 105,
    stripePriceId: process.env.STRIPE_PRICE_QUARTERLY ?? "",
  },
  {
    name: "repco",
    period: "annual",
    pricePerMonth: 25,
    totalPrice: 300,
    stripePriceId: process.env.STRIPE_PRICE_ANNUAL ?? "",
  },
]

export interface CreditPack {
  name: string
  credits: number
  price: number
  stripePriceId: string
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    name: "Starter",
    credits: 500,
    price: 29,
    stripePriceId: process.env.STRIPE_PRICE_PACK_STARTER ?? "",
  },
  {
    name: "Growth",
    credits: 1500,
    price: 59,
    stripePriceId: process.env.STRIPE_PRICE_PACK_GROWTH ?? "",
  },
  {
    name: "Scale",
    credits: 5000,
    price: 149,
    stripePriceId: process.env.STRIPE_PRICE_PACK_SCALE ?? "",
  },
  {
    name: "Agency",
    credits: 15000,
    price: 399,
    stripePriceId: process.env.STRIPE_PRICE_PACK_AGENCY ?? "",
  },
]
