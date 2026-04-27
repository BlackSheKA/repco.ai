import { describe, it, expect, vi, beforeEach } from "vitest"

// Must stub fetch BEFORE importing the module that uses it
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Set required env var before importing module
process.env.GOLOGIN_API_TOKEN = "test-token-for-tests"

// Dynamic import after stubbing globals
// Note: createProfile was removed in Phase 17 (D-15). Tests removed with it.
const { getProfile, deleteProfile } = await import("../client")

describe("getProfile — ABAN-01 GoLogin profile lookup", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("returns null for 404 (profile not found)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    })

    const result = await getProfile("missing-id")
    expect(result).toBeNull()
  })

  it("returns profile object on success", async () => {
    const profile = { id: "p1", name: "repco-myuser", os: "win" }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => profile,
      text: async () => "",
    })

    const result = await getProfile("p1")
    expect(result).toEqual(profile)
  })

  it("throws on unexpected non-OK (not 404) response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    })

    await expect(getProfile("p1")).rejects.toThrow("getProfile failed")
  })
})

describe("deleteProfile — ACCT-04 GoLogin profile cleanup", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it("sends DELETE to /browser/{profileId}", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    })

    await deleteProfile("profile-to-delete")
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain("/browser/profile-to-delete")
    expect(init.method).toBe("DELETE")
  })

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    })

    await expect(deleteProfile("pid")).rejects.toThrow("deleteProfile failed")
  })
})
