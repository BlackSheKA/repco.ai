import { describe, it, expect, vi, beforeEach } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { handleReplyDetected } from "../stop-on-reply"

/**
 * Build a mock SupabaseClient that records update() calls per table.
 *
 * - prospects: select().eq().single() returns opts.prospectStatus
 * - actions: update().eq().eq().in() records the update payload
 * - prospects: update().eq() records the update payload
 */
function buildSupabase(opts: {
  prospectStatus: string | null
}): {
  client: SupabaseClient
  calls: {
    actionsUpdate: Array<Record<string, unknown>>
    prospectUpdate: Array<Record<string, unknown>>
    prospectUpdateFilters: Array<[string, string]>
    actionsUpdateFilters: Array<Array<[string, unknown]>>
  }
} {
  const actionsUpdate: Array<Record<string, unknown>> = []
  const prospectUpdate: Array<Record<string, unknown>> = []
  const prospectUpdateFilters: Array<[string, string]> = []
  const actionsUpdateFilters: Array<Array<[string, unknown]>> = []

  const client = {
    from: vi.fn((table: string) => {
      if (table === "prospects") {
        return {
          // select() chain for the initial status check
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data:
                    opts.prospectStatus === null
                      ? null
                      : { pipeline_status: opts.prospectStatus },
                  error: null,
                }),
              ),
            })),
          })),
          // update() chain for the prospect update
          update: vi.fn((payload: Record<string, unknown>) => {
            prospectUpdate.push(payload)
            return {
              eq: vi.fn((col: string, value: string) => {
                prospectUpdateFilters.push([col, value])
                return Promise.resolve({ data: null, error: null })
              }),
            }
          }),
        }
      }
      if (table === "actions") {
        // update().eq().eq().in()
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            actionsUpdate.push(payload)
            const filters: Array<[string, unknown]> = []
            const builder: any = {
              eq: vi.fn((col: string, value: unknown) => {
                filters.push([col, value])
                return builder
              }),
              in: vi.fn((col: string, values: unknown) => {
                filters.push([col, values])
                actionsUpdateFilters.push(filters)
                return Promise.resolve({ data: null, error: null })
              }),
            }
            return builder
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return {
    client: client as unknown as SupabaseClient,
    calls: {
      actionsUpdate,
      prospectUpdate,
      prospectUpdateFilters,
      actionsUpdateFilters,
    },
  }
}

describe("handleReplyDetected", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-20T12:00:00Z"))
  })

  it("cancels all pending follow-ups for prospect", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: "contacted" })

    const ok = await handleReplyDetected(client, "p1", "Thanks, interested!")

    expect(ok).toBe(true)
    expect(calls.actionsUpdate).toHaveLength(1)
    expect(calls.actionsUpdate[0]).toMatchObject({ status: "cancelled" })
    // Verify filters include prospect_id and action_type
    const filters = calls.actionsUpdateFilters[0]
    const filterCols = filters.map((f) => f[0])
    expect(filterCols).toContain("prospect_id")
    expect(filterCols).toContain("action_type")
    expect(filters.find((f) => f[0] === "prospect_id")?.[1]).toBe("p1")
    expect(filters.find((f) => f[0] === "action_type")?.[1]).toBe("followup_dm")
  })

  it("updates prospect pipeline_status to replied", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: "contacted" })

    await handleReplyDetected(client, "p1", "Sounds good")

    expect(calls.prospectUpdate).toHaveLength(1)
    expect(calls.prospectUpdate[0]).toMatchObject({
      pipeline_status: "replied",
    })
  })

  it("sets sequence_stopped to true", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: "contacted" })

    await handleReplyDetected(client, "p1", "Reply text")

    expect(calls.prospectUpdate[0]).toMatchObject({ sequence_stopped: true })
  })

  it("stores reply snippet and timestamp", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: "contacted" })

    await handleReplyDetected(client, "p1", "Let's talk more")

    expect(calls.prospectUpdate[0]).toMatchObject({
      last_reply_snippet: "Let's talk more",
      replied_detected_at: "2026-04-20T12:00:00.000Z",
    })
  })

  it("does nothing if prospect already replied", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: "replied" })

    const ok = await handleReplyDetected(client, "p1", "duplicate")

    expect(ok).toBe(false)
    expect(calls.actionsUpdate).toHaveLength(0)
    expect(calls.prospectUpdate).toHaveLength(0)
  })

  it("returns false if prospect not found", async () => {
    const { client, calls } = buildSupabase({ prospectStatus: null })

    const ok = await handleReplyDetected(client, "p-missing", "text")

    expect(ok).toBe(false)
    expect(calls.actionsUpdate).toHaveLength(0)
    expect(calls.prospectUpdate).toHaveLength(0)
  })
})
