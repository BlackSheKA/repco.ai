import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock supabase-js before importing the route.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}))

// Mock GoLogin adapter to avoid any real Playwright/CDP connection.
vi.mock("@/lib/gologin/adapter", () => ({
  connectToProfile: vi.fn(async () => ({
    browser: { close: async () => {} },
    context: {},
    page: { goto: async () => {}, url: () => "about:blank" },
    profileId: "test-profile",
  })),
  disconnectProfile: vi.fn(async () => {}),
  releaseProfile: vi.fn(async () => {}),
}))

// Fluent Supabase query mock — chainable no-ops that return empty data.
function makeEmptyQuery() {
  const chain: Record<string, unknown> = {}
  const noop = () => chain
  chain.select = noop
  chain.eq = noop
  chain.neq = noop
  chain.not = noop
  chain.or = noop
  chain.is = noop
  chain.gt = noop
  chain.lt = noop
  chain.lte = noop
  chain.gte = noop
  chain.match = noop
  chain.in = noop
  chain.order = noop
  chain.limit = () => Promise.resolve({ data: [], error: null })
  chain.single = () => Promise.resolve({ data: null, error: null })
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null })
  chain.update = noop
  chain.insert = () => Promise.resolve({ data: null, error: null })
  ;(chain as { then?: unknown }).then = undefined
  return chain
}

const mockSupabase = {
  from: vi.fn(() => makeEmptyQuery()),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
}

describe("/api/cron/linkedin-prescreen GET — auth + happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "test-secret"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://x"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role"
  })

  it("returns 401 when Authorization header is missing", async () => {
    const { GET } = await import("../route")
    const res = await GET(new Request("http://x/api/cron/linkedin-prescreen"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when Bearer secret is wrong", async () => {
    const { GET } = await import("../route")
    const res = await GET(
      new Request("http://x/api/cron/linkedin-prescreen", {
        headers: { authorization: "Bearer wrong" },
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns 200 with screened:0 when no healthy LinkedIn account", async () => {
    const { GET } = await import("../route")
    const res = await GET(
      new Request("http://x/api/cron/linkedin-prescreen", {
        headers: { authorization: "Bearer test-secret" },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.screened).toBe(0)
  })
})

describe("classifyPrescreenResult — DOM signal priority order", () => {
  it("security_checkpoint wins over everything", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: true,
        isAuthwall: true,
        is404: true,
        hasMessageSidebar: true,
        hasConnectButton: true,
        hasFollowButton: true,
      }),
    ).toBe("security_checkpoint")
  })

  it("account_logged_out wins over 404 / button signals (but not checkpoint)", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: true,
        is404: true,
        hasMessageSidebar: false,
        hasConnectButton: false,
        hasFollowButton: false,
      }),
    ).toBe("account_logged_out")
    // Classifier never emits account_logged_out when checkpoint wins — that
    // case is tested above.
  })

  it("profile_unreachable on 404", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: false,
        is404: true,
        hasMessageSidebar: false,
        hasConnectButton: false,
        hasFollowButton: false,
      }),
    ).toBe("profile_unreachable")
  })

  it("already_connected when Message sidebar visible", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: false,
        is404: false,
        hasMessageSidebar: true,
        hasConnectButton: false,
        hasFollowButton: false,
      }),
    ).toBe("already_connected")
  })

  it("creator_mode_no_connect when Follow present but no Connect", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: false,
        is404: false,
        hasMessageSidebar: false,
        hasConnectButton: false,
        hasFollowButton: true,
      }),
    ).toBe("creator_mode_no_connect")
  })

  it("returns null (leave as new) when Connect button visible and no auth wall", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: false,
        is404: false,
        hasMessageSidebar: false,
        hasConnectButton: true,
        hasFollowButton: false,
      }),
    ).toBeNull()
  })

  it("returns null only when NO signals present and NOT authwalled (belt-and-braces)", async () => {
    const { classifyPrescreenResult } = await import("../route")
    expect(
      classifyPrescreenResult({
        urlContainsCheckpoint: false,
        isAuthwall: false,
        is404: false,
        hasMessageSidebar: false,
        hasConnectButton: false,
        hasFollowButton: false,
      }),
    ).toBeNull()
  })
})
