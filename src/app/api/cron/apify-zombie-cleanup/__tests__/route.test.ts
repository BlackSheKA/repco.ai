/**
 * Zombie cleanup test — pin the filter chains for both pending + processing
 * buckets. The cron runs two parallel-ish queries with distinct cutoffs:
 *   pending    → cutoff -30 min
 *   processing → cutoff -10 min (mid-ingest crashes recover faster)
 * If a future refactor drops either status filter, the cleanup either nukes
 * healthy in-flight runs OR misses the very class of zombie it exists for.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const sentryCaptureMessage = vi.fn()
vi.mock("@sentry/nextjs", () => ({
  captureMessage: sentryCaptureMessage,
}))

const loggerError = vi.fn()
const loggerInfo = vi.fn()
const loggerFlush = vi.fn(async () => undefined)
vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerError,
    info: loggerInfo,
    flush: loggerFlush,
    createCorrelationId: () => "test-corr",
  },
}))

// Capture every chain call across both buckets.
type Call = { method: string; args: unknown[] }
const calls: Call[] = []
// Per-test queue: each invocation of `from("apify_runs").update(...).select(...)`
// pulls one entry. Two are pulled per test (pending then processing).
const updateResults: { data?: unknown[]; error?: unknown }[] = []

function makeBuilder() {
  const b: Record<string, (...args: unknown[]) => unknown> = {
    update: (...args) => {
      calls.push({ method: "update", args })
      return b
    },
    eq: (...args) => {
      calls.push({ method: "eq", args })
      return b
    },
    lt: (...args) => {
      calls.push({ method: "lt", args })
      return b
    },
    select: (...args) => {
      calls.push({ method: "select", args })
      const result = updateResults.shift() ?? { data: [], error: null }
      return Promise.resolve({
        data: result.data ?? [],
        error: result.error ?? null,
      })
    },
  }
  return b
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => makeBuilder(),
  }),
}))

beforeEach(() => {
  sentryCaptureMessage.mockReset()
  loggerError.mockReset()
  loggerInfo.mockReset()
  loggerFlush.mockClear()
  calls.length = 0
  updateResults.length = 0
  process.env.CRON_SECRET = "cron-secret"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key"
})

function makeRequest(auth: string | null = "Bearer cron-secret"): Request {
  const headers: Record<string, string> = {}
  if (auth !== null) headers.authorization = auth
  return new Request("http://localhost/api/cron/apify-zombie-cleanup", {
    headers,
  })
}

describe("/api/cron/apify-zombie-cleanup GET", () => {
  it("rejects unauthorized requests", async () => {
    const { GET } = await import("../route")
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it("filters BOTH 'pending' (30min cutoff) AND 'processing' (10min cutoff)", async () => {
    updateResults.push({ data: [] }, { data: [] })
    const { GET } = await import("../route")
    const before = Date.now()
    const res = await GET(makeRequest())
    const after = Date.now()
    expect(res.status).toBe(200)

    const eqStatusCalls = calls.filter(
      (c) => c.method === "eq" && c.args[0] === "status",
    )
    const ltCalls = calls.filter((c) => c.method === "lt")

    // First UPDATE filter on status='pending', then status='processing'.
    expect(eqStatusCalls).toHaveLength(2)
    expect(eqStatusCalls[0].args).toEqual(["status", "pending"])
    expect(eqStatusCalls[1].args).toEqual(["status", "processing"])

    expect(ltCalls).toHaveLength(2)
    expect(ltCalls[0].args[0]).toBe("started_at")
    expect(ltCalls[1].args[0]).toBe("started_at")

    // Pending cutoff ~30 min, processing cutoff ~10 min. 1s skew tolerance.
    const pendingCutoff = Date.parse(ltCalls[0].args[1] as string)
    const processingCutoff = Date.parse(ltCalls[1].args[1] as string)
    expect(pendingCutoff).toBeGreaterThanOrEqual(before - 30 * 60_000 - 1000)
    expect(pendingCutoff).toBeLessThanOrEqual(after - 30 * 60_000 + 1000)
    expect(processingCutoff).toBeGreaterThanOrEqual(before - 10 * 60_000 - 1000)
    expect(processingCutoff).toBeLessThanOrEqual(after - 10 * 60_000 + 1000)
  })

  it("reports expiredCount=0 and skips Sentry when no zombies match", async () => {
    updateResults.push({ data: [] }, { data: [] })
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.expiredCount).toBe(0)
    expect(body.pendingExpired).toBe(0)
    expect(body.processingExpired).toBe(0)
    expect(sentryCaptureMessage).not.toHaveBeenCalled()
  })

  it("fires Sentry warning with byPlatform breakdown when only pending zombies", async () => {
    updateResults.push({
      data: [
        {
          run_id: "r1",
          user_id: "u1",
          platform: "reddit",
          started_at: "2026-01-01",
        },
        {
          run_id: "r2",
          user_id: "u1",
          platform: "reddit",
          started_at: "2026-01-01",
        },
        {
          run_id: "r3",
          user_id: "u2",
          platform: "linkedin",
          started_at: "2026-01-01",
        },
      ],
    })
    updateResults.push({ data: [] })
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.expiredCount).toBe(3)
    expect(body.pendingExpired).toBe(3)
    expect(body.processingExpired).toBe(0)
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("pending=3"),
      expect.objectContaining({
        level: "warning",
        fingerprint: ["apify_zombie_runs"],
        extra: expect.objectContaining({
          expiredCount: 3,
          byPlatform: {
            reddit: { pending: 2, processing: 0 },
            linkedin: { pending: 1, processing: 0 },
          },
        }),
      }),
    )
  })

  it("escalates to error severity when processing zombies are present", async () => {
    updateResults.push({ data: [] }) // no pending zombies
    updateResults.push({
      data: [
        {
          run_id: "r4",
          user_id: "u1",
          platform: "reddit",
          started_at: "2026-01-01",
        },
      ],
    })
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.processingExpired).toBe(1)
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("processing=1"),
      expect.objectContaining({
        level: "error",
        fingerprint: ["apify_zombie_runs_processing"],
      }),
    )
  })

  it("returns 500 when the pending update errors", async () => {
    updateResults.push({ data: [], error: { message: "permission denied" } })
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    expect(loggerError).toHaveBeenCalled()
  })
})
