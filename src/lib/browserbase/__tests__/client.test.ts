import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// IMPORTANT: DO NOT add `vi.mock("@browserbasehq/sdk", ...)`. The env-var guard
// (`throw new Error("BROWSERBASE_API_KEY not set")`) must fire BEFORE the SDK
// constructor runs. Mocking the SDK would bypass the guard and invalidate this test.

describe("browserbase client env-var guards", () => {
  let originalKey: string | undefined
  let originalProjectId: string | undefined

  beforeEach(() => {
    originalKey = process.env.BROWSERBASE_API_KEY
    originalProjectId = process.env.BROWSERBASE_PROJECT_ID
    vi.resetModules()
  })

  afterEach(() => {
    process.env.BROWSERBASE_API_KEY = originalKey
    process.env.BROWSERBASE_PROJECT_ID = originalProjectId
  })

  it("createContext throws when BROWSERBASE_API_KEY missing", async () => {
    delete process.env.BROWSERBASE_API_KEY
    const { createContext } = await import("../client")
    await expect(createContext()).rejects.toThrow("BROWSERBASE_API_KEY not set")
  })

  it("deleteContext throws when BROWSERBASE_API_KEY missing", async () => {
    delete process.env.BROWSERBASE_API_KEY
    const { deleteContext } = await import("../client")
    await expect(deleteContext("ctx_x")).rejects.toThrow(
      "BROWSERBASE_API_KEY not set",
    )
  })

  it("createSession throws when BROWSERBASE_PROJECT_ID missing", async () => {
    process.env.BROWSERBASE_API_KEY = "bb_test_x"
    delete process.env.BROWSERBASE_PROJECT_ID
    const { createSession } = await import("../client")
    await expect(
      createSession({
        contextId: "ctx_x",
        country: "US",
        timeoutSeconds: 300,
      }),
    ).rejects.toThrow("BROWSERBASE_PROJECT_ID not set")
  })
})
