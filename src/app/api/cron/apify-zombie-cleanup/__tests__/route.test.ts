/**
 * Zombie cleanup test — pin the filter chain. The whole point of this cron
 * is to flip status='pending' AND started_at < cutoff. If a future refactor
 * drops the status filter, the cleanup nukes recently-started healthy runs;
 * if it drops the time filter, no zombies ever get cleared.
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

// Capture the chain so the test can assert what was actually called.
const calls: { method: string; args: unknown[] }[] = []
const updateResult = { data: [] as unknown[], error: null as unknown }

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
      return Promise.resolve(updateResult)
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
  updateResult.data = []
  updateResult.error = null
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

  it("filters by status='pending' AND started_at < cutoff (~30 min ago)", async () => {
    const { GET } = await import("../route")
    const before = Date.now()
    const res = await GET(makeRequest())
    const after = Date.now()
    expect(res.status).toBe(200)

    const eqCalls = calls.filter((c) => c.method === "eq")
    const ltCalls = calls.filter((c) => c.method === "lt")

    expect(eqCalls).toContainEqual({ method: "eq", args: ["status", "pending"] })
    expect(ltCalls).toHaveLength(1)
    expect(ltCalls[0].args[0]).toBe("started_at")

    // Cutoff should be ~30 minutes before "now". Allow 1 second of clock skew.
    const cutoffIso = ltCalls[0].args[1] as string
    const cutoffMs = Date.parse(cutoffIso)
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 30 * 60 * 1000 - 1000)
    expect(cutoffMs).toBeLessThanOrEqual(after - 30 * 60 * 1000 + 1000)
  })

  it("reports expiredCount=0 and skips Sentry when no zombies match", async () => {
    updateResult.data = []
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.expiredCount).toBe(0)
    expect(sentryCaptureMessage).not.toHaveBeenCalled()
  })

  it("fires Sentry warning with byPlatform breakdown when zombies are found", async () => {
    updateResult.data = [
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
    ]
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.expiredCount).toBe(3)
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining("3"),
      expect.objectContaining({
        level: "warning",
        fingerprint: ["apify_zombie_runs"],
        extra: expect.objectContaining({
          expiredCount: 3,
          byPlatform: { reddit: 2, linkedin: 1 },
        }),
      }),
    )
  })

  it("returns 500 when the supabase update errors", async () => {
    updateResult.error = { message: "permission denied" }
    const { GET } = await import("../route")
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    expect(loggerError).toHaveBeenCalled()
  })
})
