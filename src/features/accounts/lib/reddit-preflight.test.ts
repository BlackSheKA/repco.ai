import { describe, it, expect, vi, beforeEach } from "vitest"

import { runRedditPreflight } from "./reddit-preflight"

function makeSupabaseDouble(
  cache: {
    last_preflight_at: string | null
    last_preflight_status: string | null
  } | null,
) {
  const updates: Array<Record<string, unknown>> = []
  return {
    updates,
    client: {
      from: (_t: string) => ({
        select: (_c: string) => ({
          eq: (_k: string, _v: string) => ({
            single: async () => ({ data: cache, error: null }),
          }),
        }),
        update: (vals: Record<string, unknown>) => {
          updates.push(vals)
          return {
            eq: (_k: string, _v: string) =>
              Promise.resolve({ error: null }),
          }
        },
      }),
    } as never,
  }
}

describe("runRedditPreflight", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("V-09: cache hit (status='ok' within 1h) skips fetch", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }))
    const sb = makeSupabaseDouble({
      last_preflight_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      last_preflight_status: "ok",
    })
    const result = await runRedditPreflight({
      handle: "spez",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "ok" })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("expired cache → fetch IS called", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: { is_suspended: false, total_karma: 100 } }),
        { status: 200 },
      ),
    )
    const sb = makeSupabaseDouble({
      last_preflight_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      last_preflight_status: "ok",
    })
    const result = await runRedditPreflight({
      handle: "spez",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "ok" })
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(sb.updates.at(-1)).toMatchObject({ last_preflight_status: "ok" })
  })

  it("200 + is_suspended:true → banned/suspended", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { is_suspended: true } }), {
        status: 200,
      }),
    )
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "banned", reason: "suspended" })
    expect(sb.updates.at(-1)).toMatchObject({
      last_preflight_status: "banned",
    })
  })

  it("200 + total_karma<5 → banned/low_karma", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: { is_suspended: false, total_karma: 2 } }),
        { status: 200 },
      ),
    )
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "banned", reason: "low_karma" })
  })

  it("200 + total_karma>=5 → ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: { is_suspended: false, total_karma: 100 } }),
        { status: 200 },
      ),
    )
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "ok" })
  })

  it("404 → banned/404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 404 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "ghost",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "banned", reason: "404" })
  })

  it("403 → banned/403", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("", { status: 403 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "banned", reason: "403" })
  })

  it("V-08: 503 once retries; second 503 → transient", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result.kind).toBe("transient")
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it("503 once then 200 → ok", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { is_suspended: false, total_karma: 50 },
          }),
          { status: 200 },
        ),
      )
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toEqual({ kind: "ok" })
  })

  it("429 rate-limited (twice) → transient with rate_limited error", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
    const sb = makeSupabaseDouble(null)
    const result = await runRedditPreflight({
      handle: "x",
      supabase: sb.client,
      accountId: "abc",
    })
    expect(result).toMatchObject({ kind: "transient" })
  })
})
