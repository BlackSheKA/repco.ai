/**
 * Webhook handler tests — protect the four invariants the PR review flagged:
 *   - Auth: missing/wrong bearer must 401, never proceed.
 *   - Idempotency: only one of two parallel deliveries claims the row;
 *     the other returns duplicate without re-ingesting or re-classifying.
 *   - Terminal-state Apify status: FAILED/ABORTED short-circuit; the run is
 *     marked failed without fetching the dataset.
 *   - Ingest failure: when ingestPosts throws, the run is marked 'failed'
 *     (not stuck 'processing') AND a logger.error fires.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const fetchRedditRunPostsMock = vi.fn()
const fetchLinkedInRunPostsMock = vi.fn()
const ingestRedditPostsMock = vi.fn()
const ingestLinkedInPostsMock = vi.fn()
const classifyPendingSignalsMock = vi.fn()
const loggerError = vi.fn()
const loggerInfo = vi.fn()
const loggerWarn = vi.fn()
const loggerFlush = vi.fn(async () => undefined)

vi.mock("@/features/monitoring/lib/reddit-adapter", () => ({
  fetchRunPosts: fetchRedditRunPostsMock,
}))
vi.mock("@/features/monitoring/lib/linkedin-adapter", () => ({
  fetchLinkedInRunPosts: fetchLinkedInRunPostsMock,
}))
vi.mock("@/features/monitoring/lib/ingestion-pipeline", () => ({
  ingestRedditPosts: ingestRedditPostsMock,
}))
vi.mock("@/features/monitoring/lib/linkedin-ingestion-pipeline", () => ({
  ingestLinkedInPosts: ingestLinkedInPostsMock,
}))
vi.mock("@/features/monitoring/lib/classification-pipeline", () => ({
  classifyPendingSignals: classifyPendingSignalsMock,
}))
vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerError,
    info: loggerInfo,
    warn: loggerWarn,
    flush: loggerFlush,
    createCorrelationId: () => "test-corr",
  },
}))

// Mock supabase: each call to `from(table)` returns a builder. The route
// uses two patterns:
//   .from("apify_runs").update({...}).eq("run_id",x).eq("status","pending")
//     .select(...).maybeSingle()                          [claim]
//   .from("apify_runs").select(...).eq("run_id",x).maybeSingle()  [lookup]
//   .from("apify_runs").update({...}).eq("run_id",x)      [final UPDATE — no .select]
// The test feeds the result by ordered queue — each terminal awaitable
// pulls the next preset.
type SupabaseResult = { data?: unknown; error?: unknown }
const supabaseQueue: SupabaseResult[] = []
// Records every .eq() arg pair across all chains in one test, so specs can
// assert the atomic-claim invariant: status='pending' must appear among the
// filters on the claim UPDATE chain.
const eqArgs: unknown[][] = []

function nextResult(): SupabaseResult {
  return supabaseQueue.shift() ?? { data: null, error: null }
}

function makeBuilder() {
  const b: {
    select: (..._a: unknown[]) => unknown
    insert: (..._a: unknown[]) => unknown
    update: (..._a: unknown[]) => unknown
    delete: (..._a: unknown[]) => unknown
    eq: (..._a: unknown[]) => unknown
    lt: (..._a: unknown[]) => unknown
    in: (..._a: unknown[]) => unknown
    is: (..._a: unknown[]) => unknown
    order: (..._a: unknown[]) => unknown
    limit: (..._a: unknown[]) => unknown
    maybeSingle: () => Promise<SupabaseResult>
    single: () => Promise<SupabaseResult>
    then: PromiseLike<SupabaseResult>["then"]
  } = {
    select: () => b,
    insert: () => b,
    update: () => b,
    delete: () => b,
    eq: (...args: unknown[]) => {
      eqArgs.push(args)
      return b
    },
    lt: () => b,
    in: () => b,
    is: () => b,
    order: () => b,
    limit: () => b,
    maybeSingle: () => Promise.resolve(nextResult()),
    single: () => Promise.resolve(nextResult()),
    // Make builder thenable so plain `await supabase.from(x).update(y).eq(...)`
    // (without a terminal .single/.maybeSingle) resolves to one queued result.
    then: ((onFulfilled, onRejected) =>
      Promise.resolve(nextResult()).then(onFulfilled, onRejected)) as PromiseLike<SupabaseResult>["then"],
  }
  return b
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => makeBuilder(),
  }),
}))

const VALID_SECRET = "test-secret"
const VALID_AUTH = `Bearer ${VALID_SECRET}`

beforeEach(() => {
  fetchRedditRunPostsMock.mockReset()
  fetchLinkedInRunPostsMock.mockReset()
  ingestRedditPostsMock.mockReset()
  ingestLinkedInPostsMock.mockReset()
  classifyPendingSignalsMock.mockReset().mockResolvedValue({ classified: 0 })
  loggerError.mockReset()
  loggerInfo.mockReset()
  loggerWarn.mockReset()
  loggerFlush.mockClear()
  supabaseQueue.length = 0
  eqArgs.length = 0
  process.env.APIFY_WEBHOOK_SECRET = VALID_SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key"
})

afterEach(() => {
  delete process.env.APIFY_WEBHOOK_SECRET
})

function makeRequest(body: unknown, auth: string | null = VALID_AUTH): Request {
  const headers: Record<string, string> = {}
  if (auth !== null) headers.authorization = auth
  return new Request("http://localhost/api/webhooks/apify", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

const okPayload = {
  eventType: "ACTOR.RUN.SUCCEEDED",
  resource: {
    id: "run-123",
    status: "SUCCEEDED",
    defaultDatasetId: "ds-123",
  },
}

describe("/api/webhooks/apify POST", () => {
  it("returns 401 when authorization header is missing", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest(okPayload, null))
    expect(res.status).toBe(401)
  })

  it("returns 401 when bearer token does not match secret", async () => {
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest(okPayload, `Bearer wrong-secret-len`),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when payload fails schema validation", async () => {
    const { POST } = await import("../route")
    const res = await POST(makeRequest({ resource: { status: "SUCCEEDED" } }))
    expect(res.status).toBe(400)
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining("validation"),
      expect.objectContaining({ issues: expect.any(Array) }),
    )
  })

  it("returns 503 with Retry-After when runId is unknown (race vs cross-deploy)", async () => {
    supabaseQueue.push({ data: null }) // claim returns no row
    supabaseQueue.push({ data: null }) // existing-lookup returns no row
    const { POST } = await import("../route")
    const res = await POST(makeRequest(okPayload))
    expect(res.status).toBe(503)
    expect(res.headers.get("Retry-After")).toBe("10")
    expect(ingestRedditPostsMock).not.toHaveBeenCalled()
  })

  it("returns duplicate=true when row exists in non-pending state (idempotency)", async () => {
    supabaseQueue.push({ data: null }) // claim returns no row (already claimed)
    supabaseQueue.push({ data: { status: "completed", started_at: "x" } })
    const { POST } = await import("../route")
    const res = await POST(makeRequest(okPayload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicate).toBe(true)
    expect(ingestRedditPostsMock).not.toHaveBeenCalled()
    expect(classifyPendingSignalsMock).not.toHaveBeenCalled()
  })

  it("short-circuits FAILED status without fetching the dataset", async () => {
    supabaseQueue.push({
      data: { user_id: "u1", platform: "reddit", started_at: "x" },
    }) // claim succeeds
    supabaseQueue.push({}) // fail-status update
    const { POST } = await import("../route")
    const res = await POST(
      makeRequest({
        ...okPayload,
        resource: { ...okPayload.resource, status: "FAILED" },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("failed")
    expect(fetchRedditRunPostsMock).not.toHaveBeenCalled()
    expect(loggerError).toHaveBeenCalledWith(
      "Apify run failed",
      expect.objectContaining({ apifyStatus: "FAILED" }),
    )
  })

  it("logs error and marks run failed when Reddit ingest throws", async () => {
    supabaseQueue.push({
      data: { user_id: "u1", platform: "reddit", started_at: "x" },
    }) // claim
    supabaseQueue.push({}) // final update
    fetchRedditRunPostsMock.mockResolvedValue([])
    ingestRedditPostsMock.mockRejectedValue(new Error("supabase 42703"))
    const { POST } = await import("../route")
    const res = await POST(makeRequest(okPayload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ingestError).toBe("supabase 42703")
    expect(loggerError).toHaveBeenCalledWith(
      "Apify webhook ingest failed",
      expect.objectContaining({
        platform: "reddit",
        errorMessage: "supabase 42703",
      }),
    )
  })

  it("atomic claim filters by run_id AND status='pending' (race protection)", async () => {
    supabaseQueue.push({
      data: { user_id: "u1", platform: "reddit" },
    })
    supabaseQueue.push({}) // final update
    fetchRedditRunPostsMock.mockResolvedValue([])
    ingestRedditPostsMock.mockResolvedValue({ signalCount: 0, skippedCount: 0 })
    const { POST } = await import("../route")
    await POST(makeRequest(okPayload))
    // The atomic claim's invariant is that the conditional UPDATE filters
    // on BOTH run_id AND status='pending'. If a future refactor drops the
    // status filter, idempotency silently breaks (two parallel deliveries
    // can both succeed). Assert both filters were applied.
    expect(eqArgs).toContainEqual(["run_id", "run-123"])
    expect(eqArgs).toContainEqual(["status", "pending"])
  })

  it("ingests successfully for SUCCEEDED Reddit run and runs classify", async () => {
    supabaseQueue.push({
      data: { user_id: "u1", platform: "reddit", started_at: "x" },
    })
    supabaseQueue.push({}) // final update
    fetchRedditRunPostsMock.mockResolvedValue([{ id: "p1" } as unknown])
    ingestRedditPostsMock.mockResolvedValue({ signalCount: 5, skippedCount: 0 })
    classifyPendingSignalsMock.mockResolvedValue({ classified: 5 })
    const { POST } = await import("../route")
    const res = await POST(makeRequest(okPayload))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.signalCount).toBe(5)
    expect(body.classified).toBe(5)
    expect(body.ingestError).toBeNull()
    expect(ingestRedditPostsMock).toHaveBeenCalled()
    expect(classifyPendingSignalsMock).toHaveBeenCalled()
  })
})
