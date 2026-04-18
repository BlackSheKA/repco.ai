import { describe, it, expect, vi } from "vitest"
import { checkAndAssignTarget } from "../target-isolation"

function createMockSupabase(prospect: { assigned_account_id: string | null } | null, updateError: Error | null = null) {
  const updateFn = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockReturnValue({
        error: updateError,
      }),
    }),
  })

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: prospect,
            error: null,
          }),
        }),
      }),
      update: updateFn,
    }),
    _updateFn: updateFn,
  }
}

describe("checkAndAssignTarget", () => {
  it("returns allowed: true when prospect has no assigned account", async () => {
    const supabase = createMockSupabase({ assigned_account_id: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndAssignTarget(supabase as any, "prospect-1", "account-1")
    expect(result.allowed).toBe(true)
  })

  it("returns allowed: true when prospect is assigned to same account", async () => {
    const supabase = createMockSupabase({ assigned_account_id: "account-1" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndAssignTarget(supabase as any, "prospect-1", "account-1")
    expect(result.allowed).toBe(true)
  })

  it("returns allowed: false when prospect is assigned to different account", async () => {
    const supabase = createMockSupabase({ assigned_account_id: "account-2" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndAssignTarget(supabase as any, "prospect-1", "account-1")
    expect(result.allowed).toBe(false)
    expect(result.error).toContain("already assigned")
  })

  it("returns allowed: false when prospect not found", async () => {
    const supabase = createMockSupabase(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkAndAssignTarget(supabase as any, "prospect-1", "account-1")
    expect(result.allowed).toBe(false)
    expect(result.error).toContain("not found")
  })
})
