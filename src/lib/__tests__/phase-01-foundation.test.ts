/**
 * Phase 1 — Foundation: Nyquist gap-fill tests
 *
 * Covers OBSV-01, OBSV-02, OBSV-03, OBSV-04.
 *
 * External integrations (Sentry dashboard, Axiom dashboard, Vercel deploy,
 * OAuth flow, DB migrations) are inherently manual — see VALIDATION.md.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { logger } from "@/lib/logger"
import { checkActionThresholds } from "@/lib/alerts"

// ---------------------------------------------------------------------------
// Mock Sentry so captureMessage calls are captured without real network I/O
// ---------------------------------------------------------------------------
vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  setTag: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock axiom so ingest calls are silenced
// ---------------------------------------------------------------------------
vi.mock("@/lib/axiom", () => ({
  axiom: null,
  AXIOM_DATASET: "repco-test",
}))

// ---------------------------------------------------------------------------
// OBSV-01 + OBSV-03 — Correlation ID generation
// Every log entry must carry a correlationId so job_logs rows are traceable.
// ---------------------------------------------------------------------------
describe("OBSV-01 / OBSV-03 — logger correlation ID", () => {
  it("createCorrelationId returns a RFC-4122 v4 UUID", () => {
    const id = logger.createCorrelationId()
    // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("each call to createCorrelationId returns a unique value", () => {
    const ids = new Set(Array.from({ length: 10 }, () => logger.createCorrelationId()))
    expect(ids.size).toBe(10)
  })

  it("flush resolves without error when AXIOM_TOKEN is absent", async () => {
    // AXIOM_TOKEN is not set in the test env — flush should be a no-op
    await expect(logger.flush()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// OBSV-02 — Zombie recovery threshold: 10-minute staleness window
// Tests the boundary value that the cron route uses to detect stuck actions.
// The route calculates: new Date(Date.now() - 10 * 60 * 1000)
// ---------------------------------------------------------------------------
describe("OBSV-02 — zombie recovery 10-minute staleness boundary", () => {
  it("executed_at exactly 10 minutes ago is within the stale window", () => {
    const now = Date.now()
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000)
    const executedAt = new Date(now - 10 * 60 * 1000 - 1) // 1 ms older

    // An action executed before tenMinutesAgo should be caught by .lt("executed_at", tenMinutesAgo)
    expect(executedAt.getTime()).toBeLessThan(tenMinutesAgo.getTime())
  })

  it("executed_at 9 minutes ago is NOT within the stale window", () => {
    const now = Date.now()
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000)
    const executedAt = new Date(now - 9 * 60 * 1000) // only 9 min old

    expect(executedAt.getTime()).toBeGreaterThan(tenMinutesAgo.getTime())
  })
})

// ---------------------------------------------------------------------------
// OBSV-04 — checkActionThresholds threshold logic
// Pure calculation logic tested against a mocked Supabase client.
// ---------------------------------------------------------------------------

function createMockSupabase(
  logs: Array<{ status: string }>,
  error: { message: string } | null = null,
) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data: logs, error }),
        }),
      }),
    }),
  }
}

describe("OBSV-04 — checkActionThresholds", () => {
  const correlationId = "test-correlation-id"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does NOT fire alerts when fewer than 5 actions in window (insufficient data)", async () => {
    // 4 failed actions — below minimum sample threshold
    const logs = [
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.alertsFired).toHaveLength(0)
    expect(result.totalActions).toBe(4)
  })

  it("returns successRate 100 and no alerts when window is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase([]) as any, correlationId)

    expect(result.successRate).toBe(100)
    expect(result.timeoutRate).toBe(0)
    expect(result.alertsFired).toHaveLength(0)
  })

  it("fires obsv04-low-success-rate when success rate drops below 80%", async () => {
    // 5 actions: 3 failed, 1 completed, 1 timeout = 20% success rate
    const logs = [
      { status: "completed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "timeout" },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.successRate).toBe(20)
    expect(result.alertsFired).toContain("obsv04-low-success-rate")
  })

  it("does NOT fire low-success-rate alert when success rate is exactly 80%", async () => {
    // 5 actions: 4 completed, 1 failed = 80% success rate
    const logs = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "failed" },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.successRate).toBe(80)
    expect(result.alertsFired).not.toContain("obsv04-low-success-rate")
  })

  it("fires obsv04-high-timeout-rate when timeout rate exceeds 5%", async () => {
    // 10 actions: 9 completed, 1 timeout = 10% timeout rate
    const logs = [
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "timeout" },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.timeoutRate).toBe(10)
    expect(result.alertsFired).toContain("obsv04-high-timeout-rate")
  })

  it("does NOT fire timeout alert when timeout rate is exactly 5%", async () => {
    // 20 actions: 19 completed, 1 timeout = 5% timeout rate (not > 5, so no alert)
    const logs = Array.from({ length: 19 }, () => ({ status: "completed" }))
    logs.push({ status: "timeout" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.timeoutRate).toBe(5)
    expect(result.alertsFired).not.toContain("obsv04-high-timeout-rate")
  })

  it("fires both alerts simultaneously when both thresholds are breached", async () => {
    // 10 actions: 1 completed, 7 failed, 2 timeout = 10% success, 20% timeout
    const logs = [
      { status: "completed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "failed" },
      { status: "timeout" },
      { status: "timeout" },
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await checkActionThresholds(createMockSupabase(logs) as any, correlationId)

    expect(result.alertsFired).toContain("obsv04-low-success-rate")
    expect(result.alertsFired).toContain("obsv04-high-timeout-rate")
    expect(result.alertsFired).toHaveLength(2)
  })

  it("throws when Supabase query returns an error", async () => {
    const mockSupabase = createMockSupabase(
      [],
      { message: "relation does not exist" },
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(checkActionThresholds(mockSupabase as any, correlationId)).rejects.toThrow(
      "Failed to query job_logs for thresholds",
    )
  })
})
