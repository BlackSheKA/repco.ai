import { describe, it, expect, vi } from "vitest"
import { expireStaleActions } from "../expiry"

function createMockSupabase(options: {
  selectData: Array<{ id: string; prospect_id: string }>
  selectError?: { message: string }
  updateError?: { message: string }
  prospectUpdateError?: { message: string }
}) {
  const updateFn = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: options.updateError ?? null }),
  })

  const prospectUpdateFn = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({
      error: options.prospectUpdateError ?? null,
    }),
  })

  let updateCallCount = 0

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "actions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({
                data: options.selectData,
                error: options.selectError ?? null,
              }),
            }),
          }),
          update: vi.fn().mockImplementation(() => {
            updateCallCount++
            return updateCallCount === 1 ? updateFn() : updateFn()
          }),
        }
      }
      if (table === "prospects") {
        return {
          update: vi.fn().mockImplementation(() => prospectUpdateFn()),
        }
      }
      return {}
    }),
  }
}

describe("expireStaleActions", () => {
  it("marks actions older than 12h as expired", async () => {
    const staleActions = [
      { id: "a1", prospect_id: "p1" },
      { id: "a2", prospect_id: "p2" },
    ]
    const supabase = createMockSupabase({ selectData: staleActions })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await expireStaleActions(supabase as any)

    expect(result.expiredCount).toBe(2)
    expect(supabase.from).toHaveBeenCalledWith("actions")
  })

  it("returns 0 when no stale actions exist", async () => {
    const supabase = createMockSupabase({ selectData: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await expireStaleActions(supabase as any)

    expect(result.expiredCount).toBe(0)
  })

  it("resets associated prospects to detected status", async () => {
    const staleActions = [{ id: "a1", prospect_id: "p1" }]
    const supabase = createMockSupabase({ selectData: staleActions })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await expireStaleActions(supabase as any)

    expect(result.expiredCount).toBe(1)
    expect(supabase.from).toHaveBeenCalledWith("prospects")
  })
})
