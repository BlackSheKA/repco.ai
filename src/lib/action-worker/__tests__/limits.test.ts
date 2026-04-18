import { describe, it, expect, vi } from "vitest"
import { checkAndIncrementLimit, getDailyUsage } from "../limits"

function createMockRpc(result: { data: unknown; error: { message: string } | null }) {
  return {
    rpc: vi.fn().mockResolvedValue(result),
  }
}

describe("checkAndIncrementLimit", () => {
  it("returns true when RPC returns true", async () => {
    const supabase = createMockRpc({ data: true, error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndIncrementLimit(supabase as any, "acc-1", "dm")

    expect(result).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith("check_and_increment_limit", {
      p_account_id: "acc-1",
      p_action_type: "dm",
    })
  })

  it("returns false when RPC returns false (limit reached)", async () => {
    const supabase = createMockRpc({ data: false, error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndIncrementLimit(supabase as any, "acc-1", "dm")

    expect(result).toBe(false)
  })

  it("returns false on RPC error", async () => {
    const supabase = createMockRpc({
      data: null,
      error: { message: "DB error" },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndIncrementLimit(supabase as any, "acc-1", "dm")

    expect(result).toBe(false)
  })
})

describe("getDailyUsage", () => {
  it("returns zeros when no row exists", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await getDailyUsage(supabase as any, "acc-1")

    expect(result).toEqual({ dm_count: 0, engage_count: 0, reply_count: 0 })
  })
})
