import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  calculateAccountBurn,
  calculateDailyBurn,
  calculateMonitoringBurn,
  intervalToCadenceBucket,
  SCANS_PER_DAY,
} from "./credit-burn"
import { invalidateMechanismCostCache } from "./mechanism-costs"

const fromMock = vi.fn()
const selectMock = vi.fn()

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: fromMock })),
}))

const SEED = [
  {
    mechanism_id: "R1",
    unit_cost: 1,
    mechanism_kind: "signal",
    premium: false,
    requires_gologin: false,
    free_tier_allowed: true,
    description: "Subreddit firehose",
    created_at: "2026-04-27T00:00:00Z",
  },
  {
    mechanism_id: "L6",
    unit_cost: 3,
    mechanism_kind: "signal",
    premium: false,
    requires_gologin: true,
    free_tier_allowed: true,
    description: "Own LinkedIn engagement (gologin)",
    created_at: "2026-04-27T00:00:00Z",
  },
  {
    mechanism_id: "E1",
    unit_cost: 5,
    mechanism_kind: "signal",
    premium: false,
    requires_gologin: false,
    free_tier_allowed: true,
    description: "Signal stacking",
    created_at: "2026-04-27T00:00:00Z",
  },
  {
    mechanism_id: "OL2",
    unit_cost: 30,
    mechanism_kind: "outbound",
    premium: false,
    requires_gologin: true,
    free_tier_allowed: false,
    description: "LinkedIn DM",
    created_at: "2026-04-27T00:00:00Z",
  },
]

describe("intervalToCadenceBucket", () => {
  it.each([
    ["00:15:00", "15min"],
    ["00:30:00", "30min"],
    ["01:00:00", "1h"],
    ["02:00:00", "2h"],
    ["04:00:00", "4h"],
    ["06:00:00", "6h"],
    ["24:00:00", "24h"],
    ["1 day", "24h"],
    ["15 minutes", "15min"],
    ["6 hours", "6h"],
  ])("parses %s → %s", (input, expected) => {
    expect(intervalToCadenceBucket(input)).toBe(expected)
  })

  it("returns null for unknown interval", () => {
    expect(intervalToCadenceBucket("3 hours")).toBeNull()
    expect(intervalToCadenceBucket("garbage")).toBeNull()
  })
})

describe("SCANS_PER_DAY", () => {
  it("matches PRICING.md §1 table", () => {
    expect(SCANS_PER_DAY).toEqual({
      "15min": 96,
      "30min": 48,
      "1h": 24,
      "2h": 12,
      "4h": 6,
      "6h": 4,
      "24h": 1,
    })
  })
})

describe("calculateMonitoringBurn", () => {
  beforeEach(() => {
    fromMock.mockReset()
    selectMock.mockReset()
    selectMock.mockResolvedValue({ data: SEED, error: null })
    fromMock.mockReturnValue({ select: selectMock })
    invalidateMechanismCostCache()
  })

  it("R1 at 6h × 1 source = 4", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "R1", frequency: "6 hours", active: true },
    ])
    expect(burn).toBe(4)
  })

  it("R1 at 1h × 2 sources = 48", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "R1", frequency: "1 hour", active: true },
      { mechanism_id: "R1", frequency: "1 hour", active: true },
    ])
    expect(burn).toBe(48)
  })

  it("E1 alone = 5 (flat)", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "E1", frequency: "6 hours", active: true },
    ])
    expect(burn).toBe(5)
  })

  it("E1 + R1 6h = 9", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "R1", frequency: "6 hours", active: true },
      { mechanism_id: "E1", frequency: "6 hours", active: true },
    ])
    expect(burn).toBe(9)
  })

  it("2 E1 rows still counted once = 5", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "E1", frequency: "6 hours", active: true },
      { mechanism_id: "E1", frequency: "1 hour", active: true },
    ])
    expect(burn).toBe(5)
  })

  it("inactive signals contribute 0", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "R1", frequency: "6 hours", active: false },
    ])
    expect(burn).toBe(0)
  })

  it("unknown mechanism_id contributes 0", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "UNKNOWN", frequency: "6 hours", active: true },
    ])
    expect(burn).toBe(0)
  })

  it("empty input returns 0", async () => {
    expect(await calculateMonitoringBurn([])).toBe(0)
  })

  it("outbound mechanism_id in monitoring input contributes 0", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "OL2", frequency: "6 hours", active: true },
    ])
    expect(burn).toBe(0)
  })

  it("L6 at 24h × 1 source = 3", async () => {
    const burn = await calculateMonitoringBurn([
      { mechanism_id: "L6", frequency: "24 hours", active: true },
    ])
    expect(burn).toBe(3)
  })
})

describe("calculateAccountBurn", () => {
  it("returns 0 for 2 reddit accounts (2 included)", () => {
    expect(
      calculateAccountBurn([
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
      ]),
    ).toBe(0)
  })
  it("returns 5 for 2 reddit + 1 linkedin (1 extra linkedin at 5)", () => {
    expect(
      calculateAccountBurn([
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
        { platform: "linkedin", active: true },
      ]),
    ).toBe(5)
  })
})

describe("calculateDailyBurn", () => {
  beforeEach(() => {
    fromMock.mockReset()
    selectMock.mockReset()
    selectMock.mockResolvedValue({ data: SEED, error: null })
    fromMock.mockReturnValue({ select: selectMock })
    invalidateMechanismCostCache()
  })

  it("combines monitoring + account burn", async () => {
    const total = await calculateDailyBurn(
      [{ mechanism_id: "R1", frequency: "6 hours", active: true }],
      [
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
        { platform: "reddit", active: true },
      ],
    )
    expect(total).toBe(7)
  })
})
