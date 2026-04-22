import { describe, it, expect } from "vitest"
import { isStuck } from "../screenshot"

describe("isStuck", () => {
  it("returns false when fewer than 5 screenshots", () => {
    expect(isStuck([])).toBe(false)
    expect(isStuck(["a"])).toBe(false)
    expect(isStuck(["a", "a"])).toBe(false)
    expect(isStuck(["a", "a", "a"])).toBe(false)
    expect(isStuck(["a", "a", "a", "a"])).toBe(false)
  })

  it("returns true when last 5 screenshots are identical", () => {
    expect(isStuck(["same", "same", "same", "same", "same"])).toBe(true)
  })

  it("returns false when last 5 screenshots differ", () => {
    expect(isStuck(["a", "b", "c", "d", "e"])).toBe(false)
  })

  it("returns true when last 5 identical but earlier ones differ", () => {
    expect(
      isStuck(["x", "y", "same", "same", "same", "same", "same"]),
    ).toBe(true)
  })

  it("returns false when only some of last 5 are identical", () => {
    expect(isStuck(["same", "same", "same", "same", "different"])).toBe(
      false,
    )
    expect(isStuck(["different", "same", "same", "same", "same"])).toBe(
      false,
    )
    expect(isStuck(["same", "different", "same", "same", "same"])).toBe(
      false,
    )
  })
})
