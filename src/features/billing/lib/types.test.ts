import { describe, it, expect } from "vitest"

import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  PRICING_PLANS,
} from "./types"

// BILL-02: Stripe Checkout subscription — 3 plans at correct prices
describe("PRICING_PLANS (BILL-02)", () => {
  it("contains exactly 3 subscription plans", () => {
    expect(PRICING_PLANS).toHaveLength(3)
  })

  it("monthly plan is priced at $49/month", () => {
    const monthly = PRICING_PLANS.find((p) => p.period === "monthly")
    expect(monthly).toBeDefined()
    expect(monthly!.pricePerMonth).toBe(49)
    expect(monthly!.totalPrice).toBe(49)
  })

  it("quarterly plan is priced at $35/month ($105 total)", () => {
    const quarterly = PRICING_PLANS.find((p) => p.period === "quarterly")
    expect(quarterly).toBeDefined()
    expect(quarterly!.pricePerMonth).toBe(35)
    expect(quarterly!.totalPrice).toBe(105)
  })

  it("annual plan is priced at $25/month ($300 total)", () => {
    const annual = PRICING_PLANS.find((p) => p.period === "annual")
    expect(annual).toBeDefined()
    expect(annual!.pricePerMonth).toBe(25)
    expect(annual!.totalPrice).toBe(300)
  })
})

// BILL-03: Credit packs — 4 tiers at correct credits and prices
describe("CREDIT_PACKS (BILL-03)", () => {
  it("contains exactly 4 credit packs", () => {
    expect(CREDIT_PACKS).toHaveLength(4)
  })

  it("Starter pack: 500 credits at $29", () => {
    const pack = CREDIT_PACKS.find((p) => p.name === "Starter")
    expect(pack).toBeDefined()
    expect(pack!.credits).toBe(500)
    expect(pack!.price).toBe(29)
  })

  it("Growth pack: 1500 credits at $59", () => {
    const pack = CREDIT_PACKS.find((p) => p.name === "Growth")
    expect(pack).toBeDefined()
    expect(pack!.credits).toBe(1500)
    expect(pack!.price).toBe(59)
  })

  it("Scale pack: 5000 credits at $149", () => {
    const pack = CREDIT_PACKS.find((p) => p.name === "Scale")
    expect(pack).toBeDefined()
    expect(pack!.credits).toBe(5000)
    expect(pack!.price).toBe(149)
  })

  it("Agency pack: 15000 credits at $399", () => {
    const pack = CREDIT_PACKS.find((p) => p.name === "Agency")
    expect(pack).toBeDefined()
    expect(pack!.credits).toBe(15000)
    expect(pack!.price).toBe(399)
  })
})

// BILL-06: Action credit deduction — LinkedIn connect = 20 credits
describe("CREDIT_COSTS connection_request (BILL-06)", () => {
  it("returns 20 for connection_request (LinkedIn connect)", () => {
    expect(CREDIT_COSTS["connection_request"]).toBe(20)
  })
})
