import { describe, it, expect } from "vitest"

import { normalizeEmail } from "./normalize-email"

describe("normalizeEmail (PRIC-14)", () => {
  it("preserves plain non-gmail addresses", () => {
    expect(normalizeEmail("plain@example.com")).toBe("plain@example.com")
  })

  it("lowercases mixed-case input", () => {
    expect(normalizeEmail("UPPER@EXAMPLE.COM")).toBe("upper@example.com")
  })

  it("strips dots from gmail local part", () => {
    expect(normalizeEmail("kamil.wandtke@gmail.com")).toBe(
      "kamilwandtke@gmail.com",
    )
  })

  it("strips +alias from gmail local part", () => {
    expect(normalizeEmail("kamil+x@gmail.com")).toBe("kamil@gmail.com")
  })

  it("rewrites googlemail.com to gmail.com and applies dot+plus rules", () => {
    expect(normalizeEmail("Kamil.Wandtke+x@Googlemail.com")).toBe(
      "kamilwandtke@gmail.com",
    )
  })

  it("preserves +alias for non-gmail domains", () => {
    expect(normalizeEmail("with+alias@yahoo.com")).toBe("with+alias@yahoo.com")
  })
})
