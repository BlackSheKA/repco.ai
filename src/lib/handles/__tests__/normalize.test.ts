import { describe, it, expect } from "vitest"

import { normalizeHandle } from "../normalize"

describe("normalizeHandle", () => {
  it("strips u/ prefix and lowercases Reddit handles", () => {
    expect(normalizeHandle("u/testuser", "reddit")).toBe("testuser")
  })

  it("handles U/ prefix (uppercase) + mixed case result", () => {
    expect(normalizeHandle("U/MixedCase", "reddit")).toBe("mixedcase")
  })

  it("trims whitespace before stripping prefix for Reddit", () => {
    expect(normalizeHandle("  u/alice  ", "reddit")).toBe("alice")
  })

  it("lowercases a bare Reddit handle without prefix", () => {
    expect(normalizeHandle("plainuser", "reddit")).toBe("plainuser")
  })

  it("does not strip prefixes on LinkedIn, just lowercases", () => {
    expect(normalizeHandle("John Doe", "linkedin")).toBe("john doe")
  })

  it("leaves already-lowercase LinkedIn handles untouched", () => {
    expect(normalizeHandle("john_doe", "linkedin")).toBe("john_doe")
  })

  it("returns empty string for null (reddit)", () => {
    expect(normalizeHandle(null, "reddit")).toBe("")
  })

  it("returns empty string for undefined (linkedin)", () => {
    expect(normalizeHandle(undefined, "linkedin")).toBe("")
  })

  it("returns empty string for empty input", () => {
    expect(normalizeHandle("", "reddit")).toBe("")
  })

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeHandle("   ", "reddit")).toBe("")
  })

  it("falls back to trim + lowercase for unknown platforms", () => {
    expect(normalizeHandle("Some.Handle", "x-twitter")).toBe("some.handle")
  })

  it("case-folds the U/ prefix on mixed-case input with trailing spaces", () => {
    expect(normalizeHandle("U/Alice  ", "reddit")).toBe("alice")
  })
})
