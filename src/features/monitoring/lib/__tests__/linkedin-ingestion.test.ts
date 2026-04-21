import { describe, it, expect, beforeEach, vi } from "vitest"
import successFixture from "../../__fixtures__/apify-linkedin/success.json"
import schemaDriftFixture from "../../__fixtures__/apify-linkedin/schema-drift.json"
import type { MonitoringConfig, LinkedInPost } from "../types"

const searchLinkedInPostsMock = vi.fn()

vi.mock("../linkedin-adapter", () => ({
  searchLinkedInPosts: (...args: unknown[]) =>
    searchLinkedInPostsMock(...args),
}))

interface UpsertCall {
  rows: unknown[]
  options: unknown
}

function makeSupabaseStub() {
  const upsertCalls: UpsertCall[] = []
  let nextReturn: { data: { id: string }[] | null; error: null | { message: string } } = {
    data: [],
    error: null,
  }

  const client = {
    from(_table: string) {
      return {
        upsert(rows: unknown[], options: unknown) {
          upsertCalls.push({ rows, options })
          return {
            select(_cols: string) {
              return Promise.resolve(nextReturn)
            },
          }
        },
      }
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient

  return {
    client,
    upsertCalls,
    setNextReturn(value: typeof nextReturn) {
      nextReturn = value
    },
  }
}

const baseConfig: MonitoringConfig = {
  userId: "user-1",
  keywords: ["hiring", "ai"],
  subreddits: [],
  competitors: [],
  productName: "Repco",
  productDescription: "",
}

describe("linkedin-ingestion-pipeline", () => {
  beforeEach(() => {
    searchLinkedInPostsMock.mockReset()
    vi.useRealTimers()
  })

  it("upserts fresh linkedin signals with apify_run_id on happy path", async () => {
    // Freeze time relative to fixture postedAt values (2026-04-20T16:20:00Z latest, within 48h)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-21T00:00:00.000Z"))

    searchLinkedInPostsMock.mockResolvedValue({
      posts: successFixture as LinkedInPost[],
      apifyRunId: "run-happy",
    })

    const stub = makeSupabaseStub()
    stub.setNextReturn({
      data: (successFixture as unknown[]).map((_, i) => ({ id: `sig-${i}` })),
      error: null,
    })

    const { runLinkedInIngestionForUser } = await import(
      "../linkedin-ingestion-pipeline"
    )

    const result = await runLinkedInIngestionForUser(baseConfig, stub.client)

    expect(result.apifyRunId).toBe("run-happy")
    expect(result.signalCount).toBe(5)
    expect(stub.upsertCalls).toHaveLength(1)
    const { rows, options } = stub.upsertCalls[0]
    expect((options as { onConflict: string }).onConflict).toBe("post_url")
    expect(
      (options as { ignoreDuplicates: boolean }).ignoreDuplicates,
    ).toBe(true)

    const typed = rows as Array<{
      platform: string
      apify_run_id: string | null
      post_url: string
    }>
    expect(typed.every((s) => s.platform === "linkedin")).toBe(true)
    expect(typed.every((s) => s.apify_run_id === "run-happy")).toBe(true)
  })

  it("dedup utm: collapses posts differing only by utm_* query params", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-21T00:00:00.000Z"))

    const base = (successFixture as LinkedInPost[])[0]
    const utmVariant: LinkedInPost = {
      ...base,
      url: `${base.url}?utm_source=newsletter&utm_campaign=x`,
    }
    const nonUtmVariant: LinkedInPost = {
      ...base,
      url: `${base.url}?ref=internal`,
    }

    searchLinkedInPostsMock.mockResolvedValue({
      posts: [base, utmVariant, nonUtmVariant],
      apifyRunId: "run-dedup",
    })

    const stub = makeSupabaseStub()
    stub.setNextReturn({ data: [{ id: "sig-1" }, { id: "sig-2" }], error: null })

    const { runLinkedInIngestionForUser } = await import(
      "../linkedin-ingestion-pipeline"
    )

    const result = await runLinkedInIngestionForUser(baseConfig, stub.client)

    // base + utmVariant should collapse to 1; nonUtmVariant has different query so stays as 2nd
    const rows = stub.upsertCalls[0].rows as Array<{ post_url: string }>
    expect(rows).toHaveLength(2)
    // Ensure no row still contains utm_
    expect(rows.every((r) => !r.post_url.includes("utm_"))).toBe(true)
    expect(result.signalCount).toBe(2)
  })

  it("48h freshness: filters posts older than 48h", async () => {
    // Freeze time so that success fixture's postedAt (2026-04-20) is > 72h in past
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-25T00:00:00.000Z"))

    searchLinkedInPostsMock.mockResolvedValue({
      posts: successFixture as LinkedInPost[],
      apifyRunId: "run-stale",
    })

    const stub = makeSupabaseStub()

    const { runLinkedInIngestionForUser } = await import(
      "../linkedin-ingestion-pipeline"
    )

    const result = await runLinkedInIngestionForUser(baseConfig, stub.client)

    expect(result.signalCount).toBe(0)
    expect(result.skippedCount).toBe(5)
    // No upsert should happen when every post is stale
    expect(stub.upsertCalls).toHaveLength(0)
  })

  it("schema drift: tolerates missing headline and postType (nulls persist)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-21T00:00:00.000Z"))

    searchLinkedInPostsMock.mockResolvedValue({
      posts: schemaDriftFixture as unknown as LinkedInPost[],
      apifyRunId: "run-drift",
    })

    const stub = makeSupabaseStub()
    stub.setNextReturn({
      data: [{ id: "sig-a" }, { id: "sig-b" }],
      error: null,
    })

    const { runLinkedInIngestionForUser } = await import(
      "../linkedin-ingestion-pipeline"
    )

    const result = await runLinkedInIngestionForUser(baseConfig, stub.client)

    const rows = stub.upsertCalls[0].rows as Array<{
      author_headline: string | null
      post_type: string | null
    }>
    expect(result.signalCount).toBe(2)
    expect(rows[0].author_headline).toBeNull()
    expect(rows[0].post_type).toBeNull()
  })

  it("empty keywords: returns zero counts and does not call the adapter", async () => {
    const stub = makeSupabaseStub()

    const { runLinkedInIngestionForUser } = await import(
      "../linkedin-ingestion-pipeline"
    )

    const result = await runLinkedInIngestionForUser(
      { ...baseConfig, keywords: [] },
      stub.client,
    )

    expect(result).toEqual({
      signalCount: 0,
      skippedCount: 0,
      apifyRunId: null,
    })
    expect(searchLinkedInPostsMock).not.toHaveBeenCalled()
    expect(stub.upsertCalls).toHaveLength(0)
  })
})
