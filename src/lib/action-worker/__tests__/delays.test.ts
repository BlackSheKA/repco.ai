import { describe, it, expect, vi, afterEach } from "vitest"
import { randomDelay, sleep, isWithinActiveHours } from "../delays"

describe("randomDelay", () => {
  it("returns a number >= 15 (min floor)", () => {
    for (let i = 0; i < 100; i++) {
      expect(randomDelay()).toBeGreaterThanOrEqual(15)
    }
  })

  it("respects custom min parameter", () => {
    for (let i = 0; i < 100; i++) {
      expect(randomDelay(90, 60, 30)).toBeGreaterThanOrEqual(30)
    }
  })

  it("default mean is approximately 90 (statistical check)", () => {
    const samples = Array.from({ length: 1000 }, () => randomDelay())
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    // Mean should be within 70-110 range with high probability
    expect(avg).toBeGreaterThan(70)
    expect(avg).toBeLessThan(110)
  })
})

describe("sleep", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves after specified seconds", async () => {
    vi.useFakeTimers()
    const promise = sleep(2)
    vi.advanceTimersByTime(2000)
    await promise
    // If we get here, sleep resolved correctly
    expect(true).toBe(true)
  })
})

describe("isWithinActiveHours", () => {
  it("returns true when current hour is within range", () => {
    // Mock date to a known hour
    const mockDate = new Date("2026-04-18T14:00:00Z") // 14:00 UTC
    vi.setSystemTime(mockDate)
    expect(isWithinActiveHours("UTC", 8, 22)).toBe(true)
    vi.useRealTimers()
  })

  it("returns false when current hour is outside range", () => {
    const mockDate = new Date("2026-04-18T03:00:00Z") // 03:00 UTC
    vi.setSystemTime(mockDate)
    expect(isWithinActiveHours("UTC", 8, 22)).toBe(false)
    vi.useRealTimers()
  })

  it("handles wrap-around (e.g., start=22, end=6)", () => {
    // 23:00 UTC should be within 22-6
    const lateNight = new Date("2026-04-18T23:00:00Z")
    vi.setSystemTime(lateNight)
    expect(isWithinActiveHours("UTC", 22, 6)).toBe(true)

    // 03:00 UTC should be within 22-6
    const earlyMorning = new Date("2026-04-18T03:00:00Z")
    vi.setSystemTime(earlyMorning)
    expect(isWithinActiveHours("UTC", 22, 6)).toBe(true)

    // 10:00 UTC should NOT be within 22-6
    const midDay = new Date("2026-04-18T10:00:00Z")
    vi.setSystemTime(midDay)
    expect(isWithinActiveHours("UTC", 22, 6)).toBe(false)

    vi.useRealTimers()
  })
})
