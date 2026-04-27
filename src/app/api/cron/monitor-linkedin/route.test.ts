import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// --- Mocks --------------------------------------------------------------
const canaryMock = vi.fn()
const ingestionMock = vi.fn()
const classifyMock = vi.fn()
const sentryCaptureMock = vi.fn()

vi.mock("@/features/monitoring/lib/linkedin-canary", () => ({
  runCanaryCheck: (...args: unknown[]) => canaryMock(...args),
  LINKEDIN_CANARY_KEYWORD: "hiring",
  CANARY_MIN_RESULTS: 3,
}))

vi.mock("@/features/monitoring/lib/linkedin-ingestion-pipeline", () => ({
  runLinkedInIngestionForUser: (...args: unknown[]) => ingestionMock(...args),
  FRESHNESS_CUTOFF_SECONDS: 48 * 3600,
}))

vi.mock("@/features/monitoring/lib/classification-pipeline", () => ({
  classifyPendingSignals: (...args: unknown[]) => classifyMock(...args),
}))

vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => sentryCaptureMock(...args),
  setTag: () => {},
  captureException: () => {},
}))

// --- Supabase chainable stub -------------------------------------------
interface QueryState {
  lastTable?: string
  eqFilters: Array<[string, unknown]>
  insertedRows: unknown[]
  userKeywordValues?: Array<{ signal_type: string; value: string }>
  activeUsers?: Array<{ user_id: string }>
  productProfile?: Array<{ name: string; description: string }>
}

function makeSupabaseMock(state: QueryState) {
  const query = (table: string) => {
    state.lastTable = table

    const chain: Record<string, unknown> = {}
    chain.select = (_cols: string) => chain
    chain.eq = (col: string, val: unknown) => {
      state.eqFilters.push([col, val])
      return chain
    }
    // The route now uses .in("signal_type", [...linkedin_*]) instead of a
    // single .eq filter to discover users with any linkedin source type.
    chain.in = (col: string, vals: unknown[]) => {
      state.eqFilters.push([col, vals])
      return chain
    }
    chain.contains = (_col: string, _val: unknown) => chain
    chain.order = (_col: string, _opts: unknown) => chain
    chain.limit = (_n: number) => {
      // Return a thenable so callers can `await` the promise-like
      let data: unknown[] = []
      if (table === "product_profiles") data = state.productProfile ?? []
      return {
        then(resolve: (val: { data: unknown[]; error: null }) => void) {
          resolve({ data, error: null })
        },
      }
    }
    // Default terminal: resolve to appropriate rows for this table.
    chain.then = (resolve: (val: { data: unknown[]; error: null }) => void) => {
      if (table === "monitoring_signals") {
        // The active-users discovery query uses .in("signal_type", [...]),
        // the per-user follow-up uses .eq("user_id", x).
        const isUserQuery = state.eqFilters.some(
          ([c, v]) =>
            c === "signal_type" &&
            (v === "linkedin_keyword" ||
              (Array.isArray(v) && v.includes("linkedin_keyword"))),
        )
        const isAllSignalTypes = state.eqFilters.some(
          ([c]) => c === "user_id",
        )
        if (isAllSignalTypes) {
          resolve({
            data: (state.userKeywordValues ?? []) as unknown[],
            error: null,
          })
        } else if (isUserQuery) {
          resolve({
            data: (state.activeUsers ?? []) as unknown[],
            error: null,
          })
        } else {
          resolve({ data: [], error: null })
        }
      } else {
        resolve({ data: [], error: null })
      }
      state.eqFilters = []
    }

    chain.insert = (row: unknown) => {
      state.insertedRows.push(row)
      return Promise.resolve({ data: null, error: null })
    }

    return chain
  }

  const client = { from: query } as unknown as import("@supabase/supabase-js").SupabaseClient
  return client
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => {
    return state.supabaseStub
  },
}))

// Shared mutable state between test cases (re-assigned in beforeEach)
const state: { supabaseStub: unknown; queryState: QueryState } = {
  supabaseStub: null,
  queryState: { eqFilters: [], insertedRows: [] },
}

describe("monitor-linkedin cron route", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    canaryMock.mockReset()
    ingestionMock.mockReset()
    classifyMock.mockReset()
    sentryCaptureMock.mockReset()
    state.queryState = { eqFilters: [], insertedRows: [] }
    state.supabaseStub = makeSupabaseMock(state.queryState)
    process.env.CRON_SECRET = "test-secret"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk"
    vi.resetModules()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns 401 when bearer token missing", async () => {
    const { GET } = await import("./route")
    const res = await GET(
      new Request("http://localhost/api/cron/monitor-linkedin"),
    )
    expect(res.status).toBe(401)
    expect(canaryMock).not.toHaveBeenCalled()
  })

  it("canary failure: 500 + failed job_logs row + ingestion NOT called", async () => {
    canaryMock.mockResolvedValue({
      ok: false,
      resultCount: 0,
      apifyRunId: null,
      reason: "empty",
    })

    const { GET } = await import("./route")
    const res = await GET(
      new Request("http://localhost/api/cron/monitor-linkedin", {
        headers: { authorization: "Bearer test-secret" },
      }),
    )

    expect(res.status).toBe(500)
    expect(ingestionMock).not.toHaveBeenCalled()

    // Sentry fingerprint check
    expect(sentryCaptureMock).toHaveBeenCalledTimes(1)
    const sentryOpts = sentryCaptureMock.mock.calls[0][1] as {
      fingerprint: string[]
    }
    expect(sentryOpts.fingerprint).toEqual(["linkedin_canary_failure"])

    // job_logs failed row with silent_failure=true
    const failedRow = state.queryState.insertedRows[0] as {
      status: string
      metadata: { silent_failure: boolean; cron: string }
    }
    expect(failedRow.status).toBe("failed")
    expect(failedRow.metadata.cron).toBe("monitor-linkedin")
    expect(failedRow.metadata.silent_failure).toBe(true)
  })

  it("happy path: canary ok + one user with 2 keywords -> ingestion called + completed job_logs row", async () => {
    canaryMock.mockResolvedValue({
      ok: true,
      resultCount: 10,
      apifyRunId: "run-canary",
    })
    ingestionMock.mockResolvedValue({
      signalCount: 3,
      skippedCount: 0,
      apifyRunId: "run-ingest",
    })
    classifyMock.mockResolvedValue({ classified: 3, errors: 0 })

    state.queryState.activeUsers = [{ user_id: "u-1" }]
    state.queryState.userKeywordValues = [
      { signal_type: "linkedin_keyword", value: "hiring" },
      { signal_type: "linkedin_keyword", value: "ai" },
    ]

    const { GET } = await import("./route")
    const res = await GET(
      new Request("http://localhost/api/cron/monitor-linkedin", {
        headers: { authorization: "Bearer test-secret" },
      }),
    )

    expect(res.status).toBe(200)
    expect(ingestionMock).toHaveBeenCalledTimes(1)
    const [configArg] = ingestionMock.mock.calls[0] as [
      { userId: string; keywords: string[] },
    ]
    expect(configArg.userId).toBe("u-1")
    expect(configArg.keywords).toEqual(["hiring", "ai"])

    // Completed job_logs row is the last inserted row
    const completedRow = state.queryState.insertedRows[
      state.queryState.insertedRows.length - 1
    ] as {
      status: string
      metadata: { cron: string; total_signals: number }
    }
    expect(completedRow.status).toBe("completed")
    expect(completedRow.metadata.cron).toBe("monitor-linkedin")
    expect(completedRow.metadata.total_signals).toBe(3)
  })
})
