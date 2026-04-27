import { describe, it, expect } from "vitest"

import { PLAN_CONFIG, type SubscriptionPlan } from "./plan-config"

describe("PLAN_CONFIG (PRIC-04, PRIC-14)", () => {
  it("free plan grants 250 credits with cap 500", () => {
    expect(PLAN_CONFIG.free).toEqual({ grant: 250, cap: 500 })
  })

  it("pro plan grants 2000 credits with cap 4000", () => {
    expect(PLAN_CONFIG.pro).toEqual({ grant: 2000, cap: 4000 })
  })

  it("contains exactly 2 plans", () => {
    expect(Object.keys(PLAN_CONFIG).sort()).toEqual(["free", "pro"])
  })

  it("SubscriptionPlan type allows 'free' and 'pro'", () => {
    const free: SubscriptionPlan = "free"
    const pro: SubscriptionPlan = "pro"
    expect(free).toBe("free")
    expect(pro).toBe("pro")
  })
})
