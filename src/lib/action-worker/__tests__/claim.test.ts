import { describe, it, expect, vi } from "vitest"
import { claimAction } from "../claim"

function createMockSupabase(rpcResult: {
  data: unknown
  error: { message: string } | null
}) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as ReturnType<typeof vi.fn> & { rpc: ReturnType<typeof vi.fn> }
}

describe("claimAction", () => {
  it("returns claimed: true with action when RPC returns a row", async () => {
    const mockAction = { id: "action-1", status: "executing" }
    const supabase = createMockSupabase({
      data: [mockAction],
      error: null,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await claimAction(supabase as any, "action-1")

    expect(result.claimed).toBe(true)
    expect(result.action).toEqual(mockAction)
    expect(result.error).toBeNull()
    expect(supabase.rpc).toHaveBeenCalledWith("claim_action", {
      p_action_id: "action-1",
    })
  })

  it("returns claimed: false when RPC returns empty array", async () => {
    const supabase = createMockSupabase({ data: [], error: null })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await claimAction(supabase as any, "action-2")

    expect(result.claimed).toBe(false)
    expect(result.action).toBeNull()
    expect(result.error).toBe("Already claimed or not approved")
  })

  it("returns claimed: false with error when RPC fails", async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: "RPC error" },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await claimAction(supabase as any, "action-3")

    expect(result.claimed).toBe(false)
    expect(result.action).toBeNull()
    expect(result.error).toBe("RPC error")
  })
})
