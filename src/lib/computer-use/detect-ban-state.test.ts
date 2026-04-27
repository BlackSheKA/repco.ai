import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import path from "node:path"

vi.mock("@anthropic-ai/sdk", () => {
  const messagesCreate = vi.fn()
  function Anthropic() {
    return { messages: { create: messagesCreate } }
  }
  return {
    default: Anthropic,
    __mock: { messagesCreate },
  }
})

import * as sdk from "@anthropic-ai/sdk"
import { detectBanState } from "./detect-ban-state"

const mock = (sdk as unknown as { __mock: { messagesCreate: ReturnType<typeof vi.fn> } })
  .__mock

beforeEach(() => mock.messagesCreate.mockReset())

function ok(json: string) {
  return { content: [{ type: "text", text: json }] }
}

describe("detectBanState", () => {
  it("V-15: API error returns all-false (does NOT throw)", async () => {
    mock.messagesCreate.mockImplementationOnce(async () => {
      throw new Error("network")
    })
    const v = await detectBanState("base64data")
    expect(v).toEqual({ banned: false, suspended: false, captcha: false })
  })

  it("parses well-formed JSON", async () => {
    mock.messagesCreate.mockResolvedValue(
      ok('{"banned":true,"suspended":false,"captcha":false}'),
    )
    const v = await detectBanState("data")
    expect(v).toEqual({ banned: true, suspended: false, captcha: false })
  })

  it("malformed text returns all-false", async () => {
    mock.messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
    })
    expect(await detectBanState("data")).toEqual({
      banned: false,
      suspended: false,
      captcha: false,
    })
  })

  it("missing key in JSON treated as false", async () => {
    mock.messagesCreate.mockResolvedValue(ok('{"banned":true}'))
    expect(await detectBanState("data")).toEqual({
      banned: true,
      suspended: false,
      captcha: false,
    })
  })

  it("JSON with extra keys tolerated", async () => {
    mock.messagesCreate.mockResolvedValue(
      ok('{"banned":false,"suspended":true,"captcha":false,"reason":"x"}'),
    )
    expect(await detectBanState("data")).toEqual({
      banned: false,
      suspended: true,
      captcha: false,
    })
  })

  it("non-boolean values coerce to false", async () => {
    mock.messagesCreate.mockResolvedValue(
      ok('{"banned":"yes","suspended":1,"captcha":null}'),
    )
    expect(await detectBanState("data")).toEqual({
      banned: false,
      suspended: false,
      captcha: false,
    })
  })

  it("missing text block returns all-false", async () => {
    mock.messagesCreate.mockResolvedValue({ content: [] })
    expect(await detectBanState("data")).toEqual({
      banned: false,
      suspended: false,
      captcha: false,
    })
  })
})

// ---------------------------------------------------------------------------
// Fixture-based ML tests (V-11 through V-14) — gated behind INTEGRATION=1.
// Default suite skips them so the file always exits green without real API.
// ---------------------------------------------------------------------------

const fixturesDir = path.join(process.cwd(), "__tests__", "fixtures")
const fixturesPresent = fs.existsSync(
  path.join(fixturesDir, "banned-rules.png"),
)

const itFixture =
  process.env.INTEGRATION === "1" && fixturesPresent ? it : it.skip

describe("detectBanState — fixture-based ML tests (INTEGRATION=1 + fixtures)", () => {
  beforeEach(() => vi.doUnmock("@anthropic-ai/sdk"))

  itFixture(
    "V-11: banned-rules.png → banned:true",
    async () => {
      const real = (
        await vi.importActual<typeof import("./detect-ban-state")>(
          "./detect-ban-state",
        )
      ).detectBanState
      const png = fs.readFileSync(path.join(fixturesDir, "banned-rules.png"))
      const v = await real(png.toString("base64"))
      expect(v.banned).toBe(true)
    },
  )

  itFixture(
    "V-12: account-suspended.png → suspended:true",
    async () => {
      const real = (
        await vi.importActual<typeof import("./detect-ban-state")>(
          "./detect-ban-state",
        )
      ).detectBanState
      const png = fs.readFileSync(
        path.join(fixturesDir, "account-suspended.png"),
      )
      const v = await real(png.toString("base64"))
      expect(v.suspended).toBe(true)
    },
  )

  itFixture(
    "V-13: cloudflare-captcha.png → captcha:true",
    async () => {
      const real = (
        await vi.importActual<typeof import("./detect-ban-state")>(
          "./detect-ban-state",
        )
      ).detectBanState
      const png = fs.readFileSync(
        path.join(fixturesDir, "cloudflare-captcha.png"),
      )
      const v = await real(png.toString("base64"))
      expect(v.captcha).toBe(true)
    },
  )

  itFixture(
    "V-14: clean-feed.png → all false",
    async () => {
      const real = (
        await vi.importActual<typeof import("./detect-ban-state")>(
          "./detect-ban-state",
        )
      ).detectBanState
      const png = fs.readFileSync(path.join(fixturesDir, "clean-feed.png"))
      const v = await real(png.toString("base64"))
      expect(v).toEqual({ banned: false, suspended: false, captcha: false })
    },
  )

  it("skip-mode guard: when INTEGRATION env is unset, fixture tests do NOT execute", () => {
    // Protects against a future change that drops the env check and tries to
    // read fixture PNGs unconditionally (which would ENOENT on dev machines
    // without curated fixtures). Asserts the gate value the file uses.
    const integrationActive =
      process.env.INTEGRATION === "1" && fixturesPresent
    if (!integrationActive) {
      // Confirm fixture tests above were registered as skipped: itFixture must
      // not be the runnable `it` when the gate is off.
      expect(itFixture).not.toBe(it)
    } else {
      expect(itFixture).toBe(it)
    }
  })
})
