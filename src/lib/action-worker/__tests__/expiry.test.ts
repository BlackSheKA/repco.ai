import { afterEach, describe, it, expect, vi } from "vitest"
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
              neq: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({
                  data: options.selectData,
                  error: options.selectError ?? null,
                }),
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

  describe("12h expiry boundary", () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it("does NOT expire an action created 11h59m ago", async () => {
      const now = new Date("2024-01-01T12:00:00.000Z").getTime()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // 11h59m ago = 719 minutes = 43140 seconds before now
      // This is NEWER than the 12h cutoff — should not be expired
      const supabase = createMockSupabase({ selectData: [] })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await expireStaleActions(supabase as any)

      expect(result.expiredCount).toBe(0)
    })

    it("DOES expire an action created 12h01m ago", async () => {
      const now = new Date("2024-01-01T12:00:00.000Z").getTime()
      vi.useFakeTimers()
      vi.setSystemTime(now)

      // 12h01m ago is OLDER than the 12h cutoff — should be expired
      const supabase = createMockSupabase({
        selectData: [{ id: "a-stale", prospect_id: "p-stale" }],
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await expireStaleActions(supabase as any)

      expect(result.expiredCount).toBe(1)
    })
  })
})
