import { describe, it, expect } from "vitest"

import { isValidStageTransition } from "./pipeline"

describe("isValidStageTransition", () => {
  it("allows detected -> engaged", () => {
    expect(isValidStageTransition("detected", "engaged")).toBe(true)
  })

  it("allows engaged -> contacted", () => {
    expect(isValidStageTransition("engaged", "contacted")).toBe(true)
  })

  it("allows contacted -> replied", () => {
    expect(isValidStageTransition("contacted", "replied")).toBe(true)
  })

  it("allows replied -> converted", () => {
    expect(isValidStageTransition("replied", "converted")).toBe(true)
  })

  it("disallows converted -> detected (no backward from converted)", () => {
    expect(isValidStageTransition("converted", "detected")).toBe(false)
  })

  it("allows any stage to rejected", () => {
    expect(isValidStageTransition("detected", "rejected")).toBe(true)
    expect(isValidStageTransition("engaged", "rejected")).toBe(true)
    expect(isValidStageTransition("contacted", "rejected")).toBe(true)
    expect(isValidStageTransition("replied", "rejected")).toBe(true)
    expect(isValidStageTransition("converted", "rejected")).toBe(true)
  })

  it("allows rejected -> any non-rejected stage (un-reject)", () => {
    expect(isValidStageTransition("rejected", "detected")).toBe(true)
    expect(isValidStageTransition("rejected", "engaged")).toBe(true)
    expect(isValidStageTransition("rejected", "contacted")).toBe(true)
    expect(isValidStageTransition("rejected", "replied")).toBe(true)
    expect(isValidStageTransition("rejected", "converted")).toBe(true)
  })

  it("disallows same stage to same stage", () => {
    expect(isValidStageTransition("detected", "detected")).toBe(false)
    expect(isValidStageTransition("engaged", "engaged")).toBe(false)
    expect(isValidStageTransition("rejected", "rejected")).toBe(false)
  })

  it("allows skipping forward (manual moves)", () => {
    expect(isValidStageTransition("detected", "contacted")).toBe(true)
    expect(isValidStageTransition("detected", "converted")).toBe(true)
    expect(isValidStageTransition("engaged", "converted")).toBe(true)
  })

  it("disallows backward progression (except via rejected)", () => {
    expect(isValidStageTransition("contacted", "engaged")).toBe(false)
    expect(isValidStageTransition("replied", "contacted")).toBe(false)
    expect(isValidStageTransition("converted", "replied")).toBe(false)
  })
})
