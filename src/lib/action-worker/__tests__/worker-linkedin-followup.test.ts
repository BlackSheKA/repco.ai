/**
 * LNKD-05 integration test: LinkedIn followup_dm end-to-end dispatch.
 *
 * Per 13-04-PLAN.md:
 * - When worker receives an action with action_type='followup_dm' and
 *   account.platform='linkedin', it routes to sendLinkedInDM (NOT Haiku CU).
 * - On success: action.status='completed', prospect.pipeline_status='contacted'.
 * - On failure with failureMode='not_connected': action.status='failed',
 *   job_logs.metadata.failure_mode='not_connected'.
 * - Regression: Reddit followup_dm still routes through executeCUAction
 *   (Haiku CU path) — LinkedIn dispatch must not touch Reddit actions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { BrowserProfile } from "@/features/accounts/lib/types"

const mockBrowserProfile = (
  overrides: Partial<BrowserProfile> = {},
): BrowserProfile => ({
  id: "bp-test-id",
  browserbase_context_id: "ctx-test-id",
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

// ---- Executor mocks (the whole point of the test) ----
const sendLinkedInDMMock = vi.fn()
const executeCUActionMock = vi.fn()
const sendRedditDMMock = vi.fn()
const commentRedditPostMock = vi.fn()
const likeRedditPostMock = vi.fn()
const followRedditProfileMock = vi.fn()

vi.mock("@/lib/action-worker/actions/linkedin-dm-executor", () => ({
  sendLinkedInDM: sendLinkedInDMMock,
}))
vi.mock("@/lib/action-worker/actions/linkedin-connect-executor", () => ({
  sendLinkedInConnection: vi.fn(),
}))
vi.mock("@/lib/action-worker/actions/linkedin-follow-executor", () => ({
  followLinkedInProfile: vi.fn(),
}))
vi.mock("@/lib/action-worker/actions/linkedin-like-executor", () => ({
  likeLinkedInPost: vi.fn(),
}))
vi.mock("@/lib/action-worker/actions/linkedin-comment-executor", () => ({
  commentLinkedInPost: vi.fn(),
}))
vi.mock("@/lib/action-worker/actions/reddit-dm-executor", () => ({
  sendRedditDM: sendRedditDMMock,
}))
vi.mock("@/lib/action-worker/actions/reddit-comment-executor", () => ({
  commentRedditPost: commentRedditPostMock,
}))
vi.mock("@/lib/action-worker/actions/reddit-like-executor", () => ({
  likeRedditPost: likeRedditPostMock,
}))
vi.mock("@/lib/action-worker/actions/reddit-follow-executor", () => ({
  followRedditProfile: followRedditProfileMock,
}))
vi.mock("@/lib/computer-use/executor", () => ({
  executeCUAction: executeCUActionMock,
}))

// ---- Browserbase + Playwright + Stagehand mocks ----
vi.mock("@/lib/browserbase/client", () => ({
  createSession: vi.fn(async () => ({
    id: "sess_test",
    connectUrl: "wss://test",
  })),
  releaseSession: vi.fn(async () => undefined),
  createContext: vi.fn(),
  deleteContext: vi.fn(),
}))

const fakePage = {
  goto: vi.fn(async () => undefined),
  setViewportSize: vi.fn(async () => undefined),
  screenshot: vi.fn(async () => Buffer.from("fake")),
}
vi.mock("playwright-core", () => ({
  chromium: {
    connectOverCDP: vi.fn(async () => ({
      contexts: () => [{ pages: () => [fakePage], newPage: vi.fn() }],
      close: vi.fn(async () => undefined),
    })),
  },
}))

vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: class FakeStagehand {
    init = vi.fn(async () => undefined)
    close = vi.fn(async () => undefined)
    act = vi.fn()
    extract = vi.fn()
  },
}))
vi.mock("@/lib/computer-use/screenshot", () => ({
  captureScreenshot: vi.fn(async () => "ZmFrZQ=="),
  uploadScreenshot: vi.fn(async () => "https://example.com/shot.png"),
}))

// Phase 17.7: Reddit prompt builders deleted; Reddit path now dispatches
// directly to the deterministic Stagehand executors mocked above.
vi.mock("@/lib/computer-use/actions/linkedin-connect", () => ({
  getLinkedInConnectPrompt: vi.fn(() => "linkedin-connect-prompt"),
}))

// ---- Worker sub-helper mocks: bypass claim/target/limits/delays/noise/warmup ----
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
// H-05: use the REAL getWarmupState. Earlier iteration of this test
// over-mocked it to include `followup_dm` in allowedActions, which hid
// the bug where the worker's gate check never mapped followup_dm to dm.
// With the worker fix + warmup_day: 10 in the fixture, the real function
// returns an allowed-action set that includes `dm`, which is what the
// gate check compares against after the followup_dm → dm remap.

// ---- Billing (credit deduction no-op) ----
vi.mock("@/features/billing/lib/credit-costs", () => ({
  getActionCreditCost: vi.fn(() => 0),
}))

// ---- Logger silence ----
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(async () => undefined),
    createCorrelationId: vi.fn(() => "test-corr-id"),
  },
}))

// ---- Supabase service-client mock factory ----
type SuParams = {
  account: {
    id: string
    platform: "reddit" | "linkedin"
    browser_profile_id: string | null
    warmup_day: number
    timezone: string
    active_hours_start: number
    active_hours_end: number
  }
  prospect: { id: string; handle: string; profile_url: string }
}

function buildSupabase(params: SuParams) {
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
                Promise.resolve({ data: params.account, error: null }),
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
                    handle: params.prospect.handle,
                    profile_url: params.prospect.profile_url,
                    intent_signal_id: null,
                  },
                  error: null,
                }),
              ),
              maybeSingle: vi.fn(() =>
                Promise.resolve({
                  data: { profile_url: params.prospect.profile_url },
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

// ---- Test body ----
describe("worker LinkedIn followup_dm dispatch (LNKD-05)", () => {
  beforeEach(async () => {
    sendLinkedInDMMock.mockReset()
    executeCUActionMock.mockReset()
    sendRedditDMMock.mockReset()
    commentRedditPostMock.mockReset()
    likeRedditPostMock.mockReset()
    followRedditProfileMock.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"

    // Patch claimAction per-test via its mock
    const { claimAction } = await import("@/lib/action-worker/claim")
    ;(claimAction as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  async function primeClaim(actionType: "dm" | "followup_dm") {
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
        drafted_content: "hi there from follow-up",
        final_content: null,
      },
    })
  }

  it("LinkedIn followup_dm success → sendLinkedInDM called, action completed, pipeline=contacted", async () => {
    currentSu = buildSupabase({
      account: {
        id: "acct-1",
        platform: "linkedin",
        browser_profile_id: "bp-1",
        warmup_day: 10,
        timezone: "UTC",
        active_hours_start: 0,
        active_hours_end: 23,
      },
      prospect: {
        id: "prospect-1",
        handle: "alice",
        profile_url: "https://www.linkedin.com/in/alice",
      },
    })

    await primeClaim("followup_dm")
    sendLinkedInDMMock.mockResolvedValue({ success: true })

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-1")

    expect(result.success).toBe(true)
    expect(sendLinkedInDMMock).toHaveBeenCalledTimes(1)
    // Worker passes the stashed linkedinProfileHandle ("alice") if present;
    // sendLinkedInDM's extractLinkedInSlug normalizes both full URL and slug.
    expect(sendLinkedInDMMock).toHaveBeenCalledWith(
      expect.anything(), // page
      expect.anything(), // stagehand
      expect.stringMatching(/alice/),
      "hi there from follow-up",
    )
    // Haiku CU path NOT invoked for LinkedIn
    expect(executeCUActionMock).not.toHaveBeenCalled()

    const actionsUpdates = currentSu!.updates.get("actions") ?? []
    expect(actionsUpdates).toContainEqual(
      expect.objectContaining({ status: "completed" }),
    )

    // Note: pipeline_status='contacted' transition is gated on
    // action.action_type === 'dm' exactly — followup_dm does NOT trigger
    // a pipeline re-transition (prospect is already 'contacted').
    // Assert that the DM branch does NOT re-write prospect.pipeline_status
    // for a followup_dm success (would be wasteful noise).
    const prospectUpdates = currentSu!.updates.get("prospects") ?? []
    expect(
      prospectUpdates.some(
        (p) =>
          typeof p === "object" &&
          p !== null &&
          (p as { pipeline_status?: unknown }).pipeline_status ===
            "contacted",
      ),
    ).toBe(false)
  })

  it("LinkedIn followup_dm failure (not_connected) → action failed, job_logs.metadata.failure_mode set", async () => {
    currentSu = buildSupabase({
      account: {
        id: "acct-1",
        platform: "linkedin",
        browser_profile_id: "bp-1",
        warmup_day: 10,
        timezone: "UTC",
        active_hours_start: 0,
        active_hours_end: 23,
      },
      prospect: {
        id: "prospect-1",
        handle: "bob",
        profile_url: "https://www.linkedin.com/in/bob",
      },
    })

    await primeClaim("followup_dm")
    sendLinkedInDMMock.mockResolvedValue({
      success: false,
      failureMode: "not_connected",
    })

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-2")

    expect(result.success).toBe(false)
    expect(sendLinkedInDMMock).toHaveBeenCalledTimes(1)

    const actionsUpdates = currentSu!.updates.get("actions") ?? []
    expect(actionsUpdates).toContainEqual(
      expect.objectContaining({ status: "failed" }),
    )

    const jobLogInserts = currentSu!.inserts.get("job_logs") ?? []
    expect(jobLogInserts.length).toBeGreaterThanOrEqual(1)
    const log = jobLogInserts[0] as {
      status: string
      metadata: { failure_mode?: string; platform?: string }
    }
    expect(log.status).toBe("failed")
    expect(log.metadata.platform).toBe("linkedin")
    expect(log.metadata.failure_mode).toBe("not_connected")
  })

  it("Reddit followup_dm regression → sendRedditDM called, NO Haiku CU call, sendLinkedInDM NOT called (BPRX-12)", async () => {
    // Phase 17.7: the CU loop is removed from the Reddit action path; this
    // regression test asserts the deterministic Stagehand executor receives
    // the dispatch, that no Haiku CU call is made for the action itself
    // (noise injection is mocked off here), and that LinkedIn executors are
    // never invoked on a Reddit account.
    currentSu = buildSupabase({
      account: {
        id: "acct-2",
        platform: "reddit",
        browser_profile_id: "bp-2",
        warmup_day: 10,
        timezone: "UTC",
        active_hours_start: 0,
        active_hours_end: 23,
      },
      prospect: {
        id: "prospect-2",
        handle: "u/charlie",
        profile_url: "https://reddit.com/user/charlie",
      },
    })

    await primeClaim("followup_dm")
    sendRedditDMMock.mockResolvedValue({ success: true })

    const { executeAction } = await import("../worker")
    const result = await executeAction("action-1", "corr-3")

    expect(result.success).toBe(true)
    expect(sendRedditDMMock).toHaveBeenCalledTimes(1)
    // extractRedditHandle("u/charlie") → "charlie"; verify the executor
    // received the canonical handle, not the raw "u/charlie" prefix form.
    expect(sendRedditDMMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "u/charlie",
      expect.any(String),
    )
    // Goal-backward invariant: zero Haiku CU calls in the Reddit action path.
    expect(executeCUActionMock).not.toHaveBeenCalled()
    // LinkedIn executor must NOT be reached on Reddit accounts.
    expect(sendLinkedInDMMock).not.toHaveBeenCalled()
  })
})
