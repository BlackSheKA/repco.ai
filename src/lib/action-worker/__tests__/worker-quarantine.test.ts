/**
 * Phase 14 — Account Quarantine Enforcement (LNKD-02, LNKD-06).
 *
 * Verifies executeAction's defense-in-depth quarantine guard:
 *   - health_status='warning' OR 'banned'  => block, failure_mode='account_quarantined'
 *   - cooldown_until > now()               => block, failure_mode='account_quarantined'
 *   - cooldown_until <= now() OR null      => proceed (green path)
 *
 * Both Reddit and LinkedIn accounts are gated identically (guard runs
 * before the platform branch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { BrowserProfile } from "@/features/accounts/lib/types"

const mockBrowserProfile = (
  overrides: Partial<BrowserProfile> = {},
): BrowserProfile => ({
  id: "bp-test-id",
  gologin_profile_id: "gp-test-id",
  gologin_proxy_id: "proxy-test-id",
  country_code: "PL",
  timezone: "Europe/Warsaw",
  locale: "pl-PL",
  display_name: null,
  ...overrides,
})

vi.mock("@/features/browser-profiles/lib/get-browser-profile", () => ({
  getBrowserProfileForAccount: vi.fn(async () => mockBrowserProfile()),
  getBrowserProfileById: vi.fn(async () => mockBrowserProfile()),
}))

// ---- Executor mocks ----
const sendLinkedInDMMock = vi.fn()
const sendLinkedInConnectionMock = vi.fn()
const followLinkedInProfileMock = vi.fn()
const likeLinkedInPostMock = vi.fn()
const commentLinkedInPostMock = vi.fn()
const executeCUActionMock = vi.fn()

vi.mock("@/lib/action-worker/actions/linkedin-dm-executor", () => ({
  sendLinkedInDM: sendLinkedInDMMock,
}))
vi.mock("@/lib/action-worker/actions/linkedin-connect-executor", () => ({
  sendLinkedInConnection: sendLinkedInConnectionMock,
}))
vi.mock("@/lib/action-worker/actions/linkedin-follow-executor", () => ({
  followLinkedInProfile: followLinkedInProfileMock,
}))
vi.mock("@/lib/action-worker/actions/linkedin-like-executor", () => ({
  likeLinkedInPost: likeLinkedInPostMock,
}))
vi.mock("@/lib/action-worker/actions/linkedin-comment-executor", () => ({
  commentLinkedInPost: commentLinkedInPostMock,
}))
vi.mock("@/lib/computer-use/executor", () => ({
  executeCUAction: executeCUActionMock,
}))

// ---- GoLogin + screenshot mocks ----
const connectToProfileMock = vi.fn(async () => ({
  browser: { close: vi.fn() },
  page: {
    goto: vi.fn(async () => undefined),
    setViewportSize: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from("fake")),
  },
  profileId: "test-profile",
}))

vi.mock("@/lib/gologin/adapter", () => ({
  connectToProfile: connectToProfileMock,
  disconnectProfile: vi.fn(async () => undefined),
  releaseProfile: vi.fn(async () => undefined),
}))
vi.mock("@/lib/computer-use/screenshot", () => ({
  captureScreenshot: vi.fn(async () => "ZmFrZQ=="),
  uploadScreenshot: vi.fn(async () => "https://example.com/shot.png"),
}))

vi.mock("@/lib/computer-use/actions/reddit-dm", () => ({
  getRedditDMPrompt: vi.fn(() => "reddit-dm-prompt"),
}))
vi.mock("@/lib/computer-use/actions/reddit-engage", () => ({
  getRedditLikePrompt: vi.fn(() => "reddit-like-prompt"),
  getRedditFollowPrompt: vi.fn(() => "reddit-follow-prompt"),
}))
vi.mock("@/lib/computer-use/actions/linkedin-connect", () => ({
  getLinkedInConnectPrompt: vi.fn(() => "linkedin-connect-prompt"),
}))

// ---- Worker sub-helper mocks ----
vi.mock("@/lib/action-worker/claim", () => ({
  claimAction: vi.fn(),
}))
vi.mock("@/lib/action-worker/limits", () => ({
  checkAndIncrementLimit: vi.fn(async () => true),
}))
vi.mock("@/lib/action-worker/target-isolation", () => ({
  checkAndAssignTarget: vi.fn(async () => ({ allowed: true })),
}))
vi.mock("@/lib/action-worker/delays", () => ({
  randomDelay: vi.fn(() => 0),
  sleep: vi.fn(async () => undefined),
  isWithinActiveHours: vi.fn(() => true),
}))
vi.mock("@/lib/action-worker/noise", () => ({
  shouldInjectNoise: vi.fn(() => false),
  generateNoiseActions: vi.fn(() => []),
}))

vi.mock("@/features/billing/lib/credit-costs", () => ({
  getActionCreditCost: vi.fn(() => 0),
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(async () => undefined),
    createCorrelationId: vi.fn(() => "test-corr-id"),
  },
}))

// ---- Supabase mock factory ----
type AccountRow = {
  id: string
  platform: "reddit" | "linkedin"
  browser_profile_id: string | null
  warmup_day: number
  timezone: string
  active_hours_start: number
  active_hours_end: number
  health_status: "warmup" | "healthy" | "warning" | "cooldown" | "banned"
  cooldown_until: string | null
}

function buildSupabase(account: AccountRow) {
  const updates = new Map<string, unknown[]>()
  const inserts = new Map<string, unknown[]>()
  const capture = (table: string, map: Map<string, unknown[]>, v: unknown) => {
    if (!map.has(table)) map.set(table, [])
    map.get(table)!.push(v)
  }

  const client = {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from: vi.fn((table: string) => {
      if (table === "social_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: account, error: null }),
              ),
            })),
          })),
          update: vi.fn((p: unknown) => {
            capture("social_accounts", updates, p)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }
      if (table === "prospects") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    handle: "alice",
                    profile_url: "https://www.linkedin.com/in/alice",
                    intent_signal_id: null,
                  },
                  error: null,
                }),
              ),
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: {
                    profile_url: "https://www.linkedin.com/in/alice",
                  },
                  error: null,
                }),
              ),
            })),
          })),
          update: vi.fn((p: unknown) => {
            capture("prospects", updates, p)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }
      if (table === "actions") {
        return {
          update: vi.fn((p: unknown) => {
            capture("actions", updates, p)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }
      if (table === "job_logs") {
        return {
          insert: vi.fn((p: unknown) => {
            capture("job_logs", inserts, p)
            return Promise.resolve({ error: null })
          }),
        }
      }
      if (table === "intent_signals") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null }),
              ),
            })),
          })),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
    }),
  }

  return { client, updates, inserts }
}

let currentSu: ReturnType<typeof buildSupabase> | null = null
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => currentSu!.client),
}))

function makeAccount(overrides: Partial<AccountRow>): AccountRow {
  return {
    id: "acct-1",
    platform: "linkedin",
    browser_profile_id: "bp-test-id",
    warmup_day: 10,
    timezone: "UTC",
    active_hours_start: 0,
    active_hours_end: 23,
    health_status: "healthy",
    cooldown_until: null,
    ...overrides,
  }
}

async function primeClaim(actionType: string) {
  const { claimAction } = await import("@/lib/action-worker/claim")
  ;(claimAction as ReturnType<typeof vi.fn>).mockResolvedValue({
    claimed: true,
    error: null,
    action: {
      id: "action-1",
      user_id: "user-1",
      prospect_id: "prospect-1",
      account_id: "acct-1",
      action_type: actionType,
      status: "approved",
      drafted_content: "hello",
      final_content: null,
    },
  })
}

describe("executeAction quarantine guard (Phase 14)", () => {
  beforeEach(async () => {
    sendLinkedInDMMock.mockReset()
    sendLinkedInConnectionMock.mockReset()
    followLinkedInProfileMock.mockReset()
    likeLinkedInPostMock.mockReset()
    commentLinkedInPostMock.mockReset()
    executeCUActionMock.mockReset()
    connectToProfileMock.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
    const { claimAction } = await import("@/lib/action-worker/claim")
    ;(claimAction as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("blocks dispatch when account.health_status='warning' (linkedin)", async () => {
    currentSu = buildSupabase(makeAccount({ health_status: "warning" }))
    await primeClaim("connection_request")

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-warn-li")

    expect(result).toEqual({
      success: false,
      error: "account_quarantined",
    })
    expect(connectToProfileMock).not.toHaveBeenCalled()

    const actionsUpdates = currentSu!.updates.get("actions") ?? []
    expect(actionsUpdates).toContainEqual(
      expect.objectContaining({
        status: "failed",
        error: "account_quarantined",
      }),
    )

    const jobLogInserts = currentSu!.inserts.get("job_logs") ?? []
    expect(jobLogInserts.length).toBeGreaterThanOrEqual(1)
    const log = jobLogInserts[0] as {
      job_type: string
      status: string
      metadata: { failure_mode?: string; platform?: string }
    }
    expect(log.job_type).toBe("action")
    expect(log.status).toBe("failed")
    expect(log.metadata.failure_mode).toBe("account_quarantined")
    expect(log.metadata.platform).toBe("linkedin")
  })

  it("blocks dispatch when account.health_status='banned' (linkedin)", async () => {
    currentSu = buildSupabase(makeAccount({ health_status: "banned" }))
    await primeClaim("dm")

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-ban-li")

    expect(result).toEqual({
      success: false,
      error: "account_quarantined",
    })
    expect(connectToProfileMock).not.toHaveBeenCalled()

    const jobLogInserts = currentSu!.inserts.get("job_logs") ?? []
    const log = jobLogInserts[0] as {
      metadata: { failure_mode?: string }
    }
    expect(log.metadata.failure_mode).toBe("account_quarantined")
  })

  it("blocks dispatch when account.cooldown_until is in the future (linkedin)", async () => {
    const futureCooldown = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    currentSu = buildSupabase(
      makeAccount({ health_status: "healthy", cooldown_until: futureCooldown }),
    )
    await primeClaim("follow")

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-cd-future")

    expect(result).toEqual({
      success: false,
      error: "account_quarantined",
    })
    expect(connectToProfileMock).not.toHaveBeenCalled()
  })

  it("blocks dispatch when account.health_status='warning' (reddit)", async () => {
    currentSu = buildSupabase(
      makeAccount({ platform: "reddit", health_status: "warning" }),
    )
    await primeClaim("dm")

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-warn-rd")

    expect(result).toEqual({
      success: false,
      error: "account_quarantined",
    })
    expect(connectToProfileMock).not.toHaveBeenCalled()
    expect(executeCUActionMock).not.toHaveBeenCalled()

    const jobLogInserts = currentSu!.inserts.get("job_logs") ?? []
    const log = jobLogInserts[0] as {
      metadata: { failure_mode?: string; platform?: string }
    }
    expect(log.metadata.failure_mode).toBe("account_quarantined")
    expect(log.metadata.platform).toBe("reddit")
  })

  it("does NOT block when account.cooldown_until is in the past", async () => {
    const pastCooldown = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    currentSu = buildSupabase(
      makeAccount({
        platform: "linkedin",
        health_status: "healthy",
        cooldown_until: pastCooldown,
      }),
    )
    await primeClaim("connection_request")
    sendLinkedInConnectionMock.mockResolvedValue({ success: true })

    const { executeAction } = await import("../worker")
    await executeAction("action-1", "corr-cd-past")

    expect(connectToProfileMock).toHaveBeenCalledTimes(1)
  })

  it("does NOT block when account is healthy with no cooldown", async () => {
    currentSu = buildSupabase(
      makeAccount({
        platform: "reddit",
        health_status: "healthy",
        cooldown_until: null,
      }),
    )
    await primeClaim("dm")
    executeCUActionMock.mockResolvedValue({
      success: true,
      steps: 1,
      screenshots: ["shot"],
      stepLog: [],
    })

    const { executeAction } = await import("../worker")
    await executeAction("action-1", "corr-green-rd")

    expect(connectToProfileMock).toHaveBeenCalledTimes(1)
  })
})
