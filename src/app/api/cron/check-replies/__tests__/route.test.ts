import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Integration test for the check-replies cron route.
 *
 * Asserts the full reply-detection cascade end-to-end when an unread inbox
 * message from "alice" (CU sender — no prefix) matches a stored prospect
 * with production-shaped handle "u/alice":
 *   - RPLY-02  matchReplyToProspect returns non-null → totalReplies=1
 *   - FLLW-04  actions UPDATE called with status='cancelled'
 *   - RPLY-04  prospects UPDATE flips pipeline_status to 'replied'
 *              (Supabase Realtime listens to this UPDATE — actual WS frame
 *              verified manually per 07-VALIDATION.md)
 *   - RPLY-03  sendReplyAlert called with ('user@example.com','u/alice','Reddit')
 *
 * Mocks all external integrations (Sentry, Axiom, Anthropic, GoLogin,
 * screenshot, Resend) but exercises the REAL matchReplyToProspect +
 * handleReplyDetected so the mid-layer glue is under test.
 */

// Capture Resend/reply-alert call — declared outside mock factory so the
// test body can assert against it without re-imports.
const sendReplyAlertMock = vi.fn(async () => undefined)
const sendAccountWarningMock = vi.fn(async () => undefined)

// Mock Sentry to avoid init/network noise
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  withScope: vi.fn((cb: (s: unknown) => void) =>
    cb({ setContext: vi.fn(), setTag: vi.fn() }),
  ),
}))

// Mock GoLogin adapter — return a fake browser+page so the route proceeds
vi.mock("@/lib/gologin/adapter", () => ({
  connectToProfile: vi.fn(async () => ({
    browser: { close: vi.fn() },
    page: {
      goto: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => Buffer.from("fake")),
    },
  })),
  disconnectProfile: vi.fn(async () => undefined),
}))

// Mock screenshot util — Haiku only needs a non-empty base64 string
vi.mock("@/lib/computer-use/screenshot", () => ({
  captureScreenshot: vi.fn(async () => "ZmFrZQ=="),
}))

// Mock Anthropic SDK — return a text block with ONE unread message from "alice"
vi.mock("@anthropic-ai/sdk", () => {
  class Anthropic {
    messages = {
      create: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              messages: [
                {
                  sender: "alice",
                  preview: "thanks for reaching out!",
                  unread: true,
                },
              ],
            }),
          },
        ],
      }),
    }
  }
  return { default: Anthropic }
})

// Mock notifications
vi.mock("@/features/notifications/lib/send-reply-alert", () => ({
  sendReplyAlert: sendReplyAlertMock,
}))
vi.mock("@/features/notifications/lib/send-account-warning", () => ({
  sendAccountWarning: sendAccountWarningMock,
}))

// Mock logger to silence output (keep createCorrelationId so route gets a string)
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(async () => undefined),
    createCorrelationId: vi.fn(() => "test-correlation-id"),
  },
}))

/**
 * Build a stateful Supabase service-client mock that captures every UPDATE
 * payload per table so the test can assert what the route actually wrote.
 *
 * Covers every chain the route exercises:
 *   social_accounts: select().eq().eq().in()   + update().eq()
 *   prospects:       select().eq().eq().neq()  (matchReplyToProspect)
 *                    select().eq().single()    (handleReplyDetected probe)
 *                    update().eq()             (handleReplyDetected write)
 *   actions:         update().eq().eq().in()   (follow-up cancel)
 *   users:           select().eq().single()
 *   job_logs:        insert()
 */
function buildRouteSupabase() {
  const updates = new Map<string, unknown[]>()
  const captureUpdate = (table: string, payload: unknown) => {
    if (!updates.has(table)) updates.set(table, [])
    updates.get(table)!.push(payload)
  }

  const client = {
    from: vi.fn((table: string) => {
      if (table === "social_accounts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: "acct-1",
                        user_id: "user-1",
                        handle: "u/myaccount",
                        gologin_profile_id: "gp-1",
                        consecutive_inbox_failures: 0,
                      },
                    ],
                    error: null,
                  }),
                ),
              })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            captureUpdate("social_accounts", payload)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }

      if (table === "prospects") {
        // Two read patterns exercised by the route:
        //   matchReplyToProspect:  .select(...).eq().eq().neq()
        //   handleReplyDetected:   .select('pipeline_status').eq().single()
        // Both share the same leaf data, so one chain builder handles both.
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                neq: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: "prospect-1",
                        handle: "u/alice",
                        user_id: "user-1",
                        pipeline_status: "contacted",
                      },
                    ],
                    error: null,
                  }),
                ),
              })),
              single: vi.fn(() =>
                Promise.resolve({
                  data: { pipeline_status: "contacted" },
                  error: null,
                }),
              ),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            captureUpdate("prospects", payload)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        }
      }

      if (table === "actions") {
        return {
          update: vi.fn((payload: unknown) => {
            captureUpdate("actions", payload)
            // update().eq().eq().in() chain
            const eqChain: {
              eq: ReturnType<typeof vi.fn>
              in: ReturnType<typeof vi.fn>
            } = {
              eq: vi.fn(() => eqChain),
              in: vi.fn(() => Promise.resolve({ error: null })),
            }
            return eqChain
          }),
        }
      }

      if (table === "users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: { email: "user@example.com" },
                  error: null,
                }),
              ),
            })),
          })),
        }
      }

      if (table === "job_logs") {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null })),
        }
      }

      // Fallback so unexpected tables don't blow up the chain
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
    }),
  }

  return { client, updates }
}

// Wire createClient (called inline in the route) to return our stateful mock.
// Redeclared per-test via mockReturnValueOnce so each test gets a fresh capture.
let currentSupabase: ReturnType<typeof buildRouteSupabase> | null = null
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => currentSupabase!.client),
}))

describe("check-replies cron — full reply cascade (RPLY-02/03/04 + FLLW-04)", () => {
  beforeEach(() => {
    sendReplyAlertMock.mockClear()
    sendAccountWarningMock.mockClear()
    currentSupabase = buildRouteSupabase()
    process.env.CRON_SECRET = "test-secret"
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co"
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key"
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("matches u/-prefixed prospect to bare-sender inbox reply and fires the full cascade", async () => {
    const { GET } = await import("../route")

    const request = new Request("http://localhost/api/cron/check-replies", {
      headers: { authorization: "Bearer test-secret" },
    })

    const response = await GET(request)
    const body = (await response.json()) as {
      ok: boolean
      accountsChecked: number
      totalReplies: number
      totalFailures: number
    }

    // RPLY-02: cascade reached completion
    expect(response.status).toBe(200)
    expect(body.accountsChecked).toBe(1)
    expect(body.totalReplies).toBe(1)
    expect(body.totalFailures).toBe(0)

    const updates = currentSupabase!.updates

    // FLLW-04: pending follow-ups cancelled
    const actionsUpdates = updates.get("actions") ?? []
    expect(actionsUpdates).toContainEqual(
      expect.objectContaining({ status: "cancelled" }),
    )

    // RPLY-04 trigger: prospects.pipeline_status flipped to 'replied'
    // (Supabase Realtime listens to this UPDATE — actual WS verified
    // manually per 07-VALIDATION.md)
    const prospectsUpdates = updates.get("prospects") ?? []
    expect(prospectsUpdates).toContainEqual(
      expect.objectContaining({ pipeline_status: "replied" }),
    )
    expect(prospectsUpdates).toContainEqual(
      expect.objectContaining({ sequence_stopped: true }),
    )

    // RPLY-03: email alert dispatched with stored display handle + 'Reddit'
    expect(sendReplyAlertMock).toHaveBeenCalledTimes(1)
    expect(sendReplyAlertMock).toHaveBeenCalledWith(
      "user@example.com",
      "u/alice",
      "Reddit",
    )
  })
})
