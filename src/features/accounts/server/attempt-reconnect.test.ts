import { describe, it, expect, vi, beforeEach } from "vitest"

const supabaseDouble: {
  auth: { getUser: ReturnType<typeof vi.fn> }
  from: ReturnType<typeof vi.fn>
} = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}
const updates: Array<Record<string, unknown>> = []

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseDouble,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/features/accounts/lib/reddit-preflight", () => ({
  runRedditPreflight: vi.fn(),
}))

import { attemptReconnect } from "./attempt-reconnect"
import { runRedditPreflight } from "@/features/accounts/lib/reddit-preflight"

function setupAccountFetch(account: Record<string, unknown> | null) {
  supabaseDouble.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({
            data: account,
            error: account ? null : { message: "not found" },
          }),
        }),
      }),
    }),
    update: (vals: Record<string, unknown>) => {
      updates.push(vals)
      return { eq: () => ({ eq: async () => ({ error: null }) }) }
    },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
})

describe("attemptReconnect", () => {
  it("returns Not authenticated when no user", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({ data: { user: null } })
    const r = await attemptReconnect("abc")
    expect(r).toEqual({ success: false, error: "Not authenticated" })
  })

  it("returns Account not found when row missing", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch(null)
    const r = await attemptReconnect("missing")
    expect(r).toEqual({ success: false, error: "Account not found" })
  })

  it("V-24: ok preflight clears status to 'healthy' when warmup completed", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch({
      id: "a1",
      handle: "alice",
      platform: "reddit",
      health_status: "needs_reconnect",
      warmup_completed_at: new Date().toISOString(),
    })
    ;(runRedditPreflight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "ok",
    })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: true })
    expect(updates.at(-1)).toEqual({ health_status: "healthy" })
  })

  it("ok preflight returns to 'warmup' when warmup_completed_at is null", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch({
      id: "a1",
      handle: "x",
      platform: "reddit",
      health_status: "needs_reconnect",
      warmup_completed_at: null,
    })
    ;(runRedditPreflight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "ok",
    })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: true })
    expect(updates.at(-1)).toEqual({ health_status: "warmup" })
  })

  it("V-25: banned preflight leaves row, returns still_banned", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch({
      id: "a1",
      handle: "x",
      platform: "reddit",
      health_status: "needs_reconnect",
      warmup_completed_at: null,
    })
    ;(runRedditPreflight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "banned",
      reason: "suspended",
    })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "still_banned" })
    expect(updates.length).toBe(0)
  })

  it("transient preflight returns try_again", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch({
      id: "a1",
      handle: "x",
      platform: "reddit",
      health_status: "needs_reconnect",
      warmup_completed_at: null,
    })
    ;(runRedditPreflight as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      kind: "transient",
      error: "rate_limited",
    })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "try_again" })
    expect(updates.length).toBe(0)
  })

  it("LinkedIn account returns platform_unsupported", async () => {
    supabaseDouble.auth.getUser.mockResolvedValue({
      data: { user: { id: "u1" } },
    })
    setupAccountFetch({
      id: "a1",
      handle: "x",
      platform: "linkedin",
      health_status: "needs_reconnect",
      warmup_completed_at: null,
    })
    const r = await attemptReconnect("a1")
    expect(r).toEqual({ success: false, error: "platform_unsupported" })
  })
})
