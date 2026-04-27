/**
 * startAsyncSearch contract tests — pin the StartedRun discriminated union
 * + Promise.allSettled isolation. The cron consumer relies on partial-success
 * semantics: a single subreddit start failing must NOT poison the others.
 * If a future refactor reverts to Promise.all (a classic LLM footgun), this
 * test goes red.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

const startMock = vi.fn()
const datasetListItems = vi.fn()
const runGet = vi.fn()

vi.mock("apify-client", () => {
  class FakeApifyClient {
    actor() {
      return { start: startMock, call: vi.fn() }
    }
    dataset() {
      return { listItems: datasetListItems }
    }
    run() {
      return { get: runGet }
    }
  }
  return { ApifyClient: FakeApifyClient }
})

async function loadAdapter() {
  const mod = await import("../reddit-adapter")
  mod.__resetRedditAdapterClient()
  return mod
}

beforeEach(() => {
  startMock.mockReset()
  datasetListItems.mockReset()
  runGet.mockReset()
  vi.resetModules()
  process.env.APIFY_API_TOKEN = "test-token"
})

describe("startAsyncSearch", () => {
  it("returns one fulfilled + one rejected when one subreddit start fails", async () => {
    startMock
      .mockResolvedValueOnce({ id: "run-ok" })
      .mockRejectedValueOnce(new Error("Apify 429"))

    const { startAsyncSearch } = await loadAdapter()
    const result = await startAsyncSearch(
      ["SaaS", "indiehackers"],
      ["pricing"],
      "https://r.ai/h",
      "secret",
    )

    expect(result).toHaveLength(2)
    const fulfilled = result.filter((r) => r.status === "fulfilled")
    const rejected = result.filter((r) => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(fulfilled[0]).toMatchObject({
      status: "fulfilled",
      subreddit: "SaaS",
      runId: "run-ok",
    })
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      subreddit: "indiehackers",
    })
    if (rejected[0].status === "rejected") {
      expect(rejected[0].error).toContain("429")
    }
  })

  it("returns empty when subreddits or keywords are empty (no actor calls)", async () => {
    const { startAsyncSearch } = await loadAdapter()
    expect(
      await startAsyncSearch([], ["x"], "https://r.ai/h", "s"),
    ).toEqual([])
    expect(
      await startAsyncSearch(["r/saas"], [], "https://r.ai/h", "s"),
    ).toEqual([])
    expect(startMock).not.toHaveBeenCalled()
  })

  it("strips r/ prefix when passing subredditName to Apify", async () => {
    startMock.mockResolvedValue({ id: "run-x" })
    const { startAsyncSearch } = await loadAdapter()
    await startAsyncSearch(["r/saas"], ["pricing"], "https://r.ai/h", "s")
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({ subredditName: "saas" }),
      expect.any(Object),
    )
  })

  it("registers a webhook with the four terminal event types and bearer auth", async () => {
    startMock.mockResolvedValue({ id: "run-x" })
    const { startAsyncSearch } = await loadAdapter()
    await startAsyncSearch(
      ["saas"],
      ["pricing"],
      "https://r.ai/api/webhooks/apify",
      "shh",
    )
    const opts = startMock.mock.calls[0][1] as {
      webhooks: Array<{
        eventTypes: string[]
        requestUrl: string
        headersTemplate: string
      }>
    }
    expect(opts.webhooks).toHaveLength(1)
    expect(opts.webhooks[0].eventTypes).toEqual(
      expect.arrayContaining([
        "ACTOR.RUN.SUCCEEDED",
        "ACTOR.RUN.FAILED",
        "ACTOR.RUN.TIMED_OUT",
        "ACTOR.RUN.ABORTED",
      ]),
    )
    expect(opts.webhooks[0].requestUrl).toBe("https://r.ai/api/webhooks/apify")
    const headers = JSON.parse(opts.webhooks[0].headersTemplate)
    expect(headers.Authorization).toBe("Bearer shh")
  })
})

describe("fetchRunPosts", () => {
  it("throws when run is not found (cross-tenant or invalid runId)", async () => {
    runGet.mockResolvedValue(null)
    const { fetchRunPosts } = await loadAdapter()
    await expect(fetchRunPosts("missing")).rejects.toThrow(
      /Apify run not found/,
    )
  })

  it("throws when run is in FAILED state (vs silently returning [])", async () => {
    runGet.mockResolvedValue({ status: "FAILED", id: "run-bad" })
    const { fetchRunPosts } = await loadAdapter()
    await expect(fetchRunPosts("run-bad")).rejects.toThrow(/FAILED/)
  })

  it("throws when run lacks defaultDatasetId", async () => {
    runGet.mockResolvedValue({ status: "SUCCEEDED", id: "x" })
    const { fetchRunPosts } = await loadAdapter()
    await expect(fetchRunPosts("x")).rejects.toThrow(/no dataset/)
  })
})
