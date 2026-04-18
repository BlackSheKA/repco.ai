import { describe, it, expect } from "vitest"
import { isStuck } from "../screenshot"

describe("isStuck", () => {
  it("returns false when fewer than 3 screenshots", () => {
    expect(isStuck([])).toBe(false)
    expect(isStuck(["aaa"])).toBe(false)
    expect(isStuck(["aaa", "bbb"])).toBe(false)
  })

  it("returns true when last 3 screenshots are identical", () => {
    expect(isStuck(["same", "same", "same"])).toBe(true)
  })

  it("returns false when last 3 screenshots are all different", () => {
    expect(isStuck(["aaa", "bbb", "ccc"])).toBe(false)
  })

  it("returns true when last 3 identical but earlier ones differ", () => {
    expect(isStuck(["xxx", "yyy", "same", "same", "same"])).toBe(true)
  })

  it("returns false when only 2 of last 3 are identical", () => {
    expect(isStuck(["same", "different", "same"])).toBe(false)
    expect(isStuck(["different", "same", "same"])).toBe(false)
    expect(isStuck(["same", "same", "different"])).toBe(false)
  })
})
