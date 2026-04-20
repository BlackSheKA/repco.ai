import { describe, it, expect } from "vitest"

import { getActionCreditCost } from "./credit-costs"

describe("getActionCreditCost", () => {
  it("returns 0 for like", () => {
    expect(getActionCreditCost("like")).toBe(0)
  })

  it("returns 0 for follow", () => {
    expect(getActionCreditCost("follow")).toBe(0)
  })

  it("returns 15 for public_reply", () => {
    expect(getActionCreditCost("public_reply")).toBe(15)
  })

  it("returns 30 for dm", () => {
    expect(getActionCreditCost("dm")).toBe(30)
  })

  it("returns 20 for followup_dm", () => {
    expect(getActionCreditCost("followup_dm")).toBe(20)
  })
})
