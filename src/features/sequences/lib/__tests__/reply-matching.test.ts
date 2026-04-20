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
  it("matches reply sender to prospect by lowercase handle", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "testuser123",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "TestUser123",
      "reddit",
      "user-1",
    )

    expect(result).not.toBeNull()
    expect(result?.prospectId).toBe("prospect-1")
    expect(result?.prospectHandle).toBe("testuser123")
    expect(result?.userId).toBe("user-1")
  })

  it("matches on handle + platform + user_id tuple", async () => {
    // Only one prospect returned because DB filter is user_id + platform
    // This test verifies the correct tuple-match prospect is returned
    const supabase = buildSupabase([
      {
        id: "prospect-a",
        handle: "alice",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
      {
        id: "prospect-b",
        handle: "bob",
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
    expect(result?.prospectHandle).toBe("bob")
  })

  it("returns null for unmatched sender", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "someone-else",
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

  it("skips prospects already in replied status", async () => {
    // DB filter neq('replied') excludes them; mock honors that by returning []
    const supabase = buildSupabase([])

    const result = await matchReplyToProspect(
      supabase,
      "alreadyreplied",
      "reddit",
      "user-1",
    )

    expect(result).toBeNull()
  })

  it("handles case-insensitive Reddit handles with u/ prefix", async () => {
    const supabase = buildSupabase([
      {
        id: "prospect-1",
        handle: "myuser",
        user_id: "user-1",
        pipeline_status: "contacted",
      },
    ])

    const result = await matchReplyToProspect(
      supabase,
      "U/MyUser",
      "reddit",
      "user-1",
    )

    expect(result).not.toBeNull()
    expect(result?.prospectId).toBe("prospect-1")
  })
})
