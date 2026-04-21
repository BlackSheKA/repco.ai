import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { matchReplyToProspect } from "../reply-matching"

/**
 * Build a mock Supabase client that returns a programmable prospect list
 * from the prospects query chain: from().select().eq(user_id).eq(platform).neq(pipeline_status).
 */
function buildSupabase(
  prospects: Array<Record<string, unknown>>,
): SupabaseClient {
  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() =>
              Promise.resolve({ data: prospects, error: null }),
            ),
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient

  return client
}

describe("matchReplyToProspect", () => {
  it("matches Reddit reply when stored handle has u/ prefix (RPLY-02 regression)", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "u/testuser123",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "testuser123",
      "reddit",
      "user-1",
    )

    expect(result).not.toBeNull()
    expect(result?.prospectId).toBe("prospect-1")
    expect(result?.prospectHandle).toBe("u/testuser123")
    expect(result?.userId).toBe("user-1")
  })

  it("matches when both sender and stored handle have u/ prefix (case-insensitive)", async () => {
    const supabase = buildSupabase([
      {
        id: "p1",
        handle: "u/Alice",
        user_id: "u1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(supabase, "u/alice", "reddit", "u1")

    expect(result?.prospectId).toBe("p1")
    expect(result?.prospectHandle).toBe("u/Alice")
  })

  it("matches U/Mixed sender against u/lowercase stored handle", async () => {
    const supabase = buildSupabase([
      {
        id: "p1",
        handle: "u/mixedcaseuser",
        user_id: "u1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "U/MixedCaseUser",
      "reddit",
      "u1",
    )

    expect(result?.prospectId).toBe("p1")
  })

  it("returns the correct prospect when multiple share user_id + platform", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-a",
        handle: "u/alice",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
      {
        id: "prospect-b",
        handle: "u/bob",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "bob",
      "reddit",
      "user-1",
    )

    expect(result?.prospectId).toBe("prospect-b")
    expect(result?.prospectHandle).toBe("u/bob")
  })

  it("returns null when sender does not match any prospect", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "u/someone-else",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "nobody",
      "reddit",
      "user-1",
    )

    expect(result).toBeNull()
  })

  it("returns null when DB filter yields no candidates", async () => {
    const supabase = buildSupabase([])

    const result = await matchReplyToProspect(
      supabase,
      "alreadyreplied",
      "reddit",
      "user-1",
    )

    expect(result).toBeNull()
  })

  it("returns null without throwing when a prospect row has null handle", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: null,
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "alice",
      "reddit",
      "user-1",
    )

    expect(result).toBeNull()
  })

  it("returns null for empty sender handle", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "u/alice",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(supabase, "", "reddit", "user-1")

    expect(result).toBeNull()
  })
})
