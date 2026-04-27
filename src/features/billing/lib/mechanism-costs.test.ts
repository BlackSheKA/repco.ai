import { beforeEach, describe, expect, it, vi } from "vitest"

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
    mechanism_id: "OL2",
    unit_cost: 30,
    mechanism_kind: "outbound",
    premium: false,
    requires_gologin: true,
    free_tier_allowed: false,
    description: "LinkedIn DM 1° connection (DOM)",
    created_at: "2026-04-27T00:00:00Z",
  },
  {
    mechanism_id: "E1",
    unit_cost: 5,
    mechanism_kind: "signal",
    premium: false,
    requires_gologin: false,
    free_tier_allowed: true,
    description: "Signal stacking composite",
    created_at: "2026-04-27T00:00:00Z",
  },
]

describe("mechanism-costs", () => {
  beforeEach(async () => {
    fromMock.mockReset()
    selectMock.mockReset()
    selectMock.mockResolvedValue({ data: SEED, error: null })
    fromMock.mockReturnValue({ select: selectMock })
    const { invalidateMechanismCostCache } = await import("./mechanism-costs")
    invalidateMechanismCostCache()
  })

  it("caches result across calls (only 1 DB hit for N calls)", async () => {
    const { getAllMechanismCosts } = await import("./mechanism-costs")
    await getAllMechanismCosts()
    await getAllMechanismCosts()
    await getAllMechanismCosts()
    expect(fromMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith("mechanism_costs")
  })

  it("getMechanismCost returns full row by id", async () => {
    const { getMechanismCost } = await import("./mechanism-costs")
    const r1 = await getMechanismCost("R1")
    expect(r1?.unit_cost).toBe(1)
    expect(r1?.mechanism_kind).toBe("signal")
  })

  it("getMechanismCost returns null for unknown id", async () => {
    const { getMechanismCost } = await import("./mechanism-costs")
    const unknown = await getMechanismCost("DOES_NOT_EXIST")
    expect(unknown).toBeNull()
  })

  it("invalidateMechanismCostCache forces re-fetch", async () => {
    const { getAllMechanismCosts, invalidateMechanismCostCache } = await import(
      "./mechanism-costs"
    )
    await getAllMechanismCosts()
    expect(fromMock).toHaveBeenCalledTimes(1)
    invalidateMechanismCostCache()
    await getAllMechanismCosts()
    expect(fromMock).toHaveBeenCalledTimes(2)
  })

  it("throws on supabase error and leaves cache empty", async () => {
    selectMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } })
    const { getAllMechanismCosts } = await import("./mechanism-costs")
    await expect(getAllMechanismCosts()).rejects.toThrow(
      "mechanism_costs lookup failed: boom",
    )
    // Next call should retry (cache not poisoned)
    selectMock.mockResolvedValue({ data: SEED, error: null })
    const map = await getAllMechanismCosts()
    expect(map.get("R1")?.unit_cost).toBe(1)
  })
})
