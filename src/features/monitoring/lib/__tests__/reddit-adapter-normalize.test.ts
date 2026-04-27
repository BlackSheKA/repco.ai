import { describe, it, expect, vi } from "vitest"

// The normalizer doesn't touch the Apify client, but the module-level client
// cache + getClient() check still fire on import side-effects in some test
// runners — keep the mock minimal so the unit-under-test (pure function)
// runs without env setup.
vi.mock("apify-client", () => {
  class FakeApifyClient {
    actor() {
      return { call: vi.fn(), start: vi.fn() }
    }
    dataset() {
      return { listItems: vi.fn() }
    }
    run() {
      return { get: vi.fn() }
    }
  }
  return { ApifyClient: FakeApifyClient }
})

const baseRaw = {
  kind: "post",
  url: "https://www.reddit.com/r/SaaS/comments/abc/hello/",
  title: "Hello",
  body: "world",
  username: "alice",
  parsedId: "abc",
  subreddit: "SaaS",
  permalink: "/r/SaaS/comments/abc/hello/",
}

describe("normalizeFatihtahtaPost", () => {
  it("normalizes numeric created_utc (epoch seconds)", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const post = normalizeFatihtahtaPost({ ...baseRaw, created_utc: 1714000000 })
    expect(post).not.toBeNull()
    expect(post!.created_utc).toBe(1714000000)
    expect(post!.title).toBe("Hello")
    expect(post!.author.name).toBe("alice")
    expect(post!.subreddit.display_name).toBe("SaaS")
  })

  it("normalizes ISO created_utc string into seconds", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const post = normalizeFatihtahtaPost({
      ...baseRaw,
      created_utc: "2026-04-25T20:10:07.000Z",
    })
    expect(post).not.toBeNull()
    expect(post!.created_utc).toBe(
      Math.floor(Date.parse("2026-04-25T20:10:07.000Z") / 1000),
    )
  })

  it("returns null when kind is not 'post'", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    expect(
      normalizeFatihtahtaPost({ ...baseRaw, kind: "user", created_utc: 1 }),
    ).toBeNull()
  })

  it("returns null when url is missing (schema drift)", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const { url, ...rest } = baseRaw
    void url
    expect(
      normalizeFatihtahtaPost({ ...rest, created_utc: 1 }),
    ).toBeNull()
  })

  it("returns null when title is missing (schema drift)", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const { title, ...rest } = baseRaw
    void title
    expect(
      normalizeFatihtahtaPost({ ...rest, created_utc: 1 }),
    ).toBeNull()
  })

  it("returns null when created_utc cannot be parsed", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    expect(
      normalizeFatihtahtaPost({ ...baseRaw, created_utc: "not-a-date" }),
    ).toBeNull()
  })

  it("falls back to subreddit_name_prefixed when subreddit is missing", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const { subreddit, ...rest } = baseRaw
    void subreddit
    const post = normalizeFatihtahtaPost({
      ...rest,
      subreddit_name_prefixed: "r/Other",
      created_utc: 1,
    })
    expect(post!.subreddit.display_name).toBe("Other")
  })

  it("derives permalink from url when permalink is missing", async () => {
    const { normalizeFatihtahtaPost } = await import("../reddit-adapter")
    const { permalink, ...rest } = baseRaw
    void permalink
    const post = normalizeFatihtahtaPost({ ...rest, created_utc: 1 })
    expect(post!.permalink).toBe("/r/SaaS/comments/abc/hello/")
  })
})
