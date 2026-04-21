import { describe, it, expect } from "vitest"
import { getRedditDMPrompt } from "../actions/reddit-dm"
import { getRedditLikePrompt, getRedditFollowPrompt } from "../actions/reddit-engage"

describe("getRedditDMPrompt — ACTN-05 DM execution prompt", () => {
  it("includes the recipient handle in the prompt", () => {
    const prompt = getRedditDMPrompt("u_test_user", "Hello world")
    expect(prompt).toContain("u_test_user")
  })

  it("includes the exact message content in the prompt", () => {
    const message = "I saw your post about sprint planning — we can help."
    const prompt = getRedditDMPrompt("someone", message)
    expect(prompt).toContain(message)
  })

  it("instructs to click the message/chat icon", () => {
    const prompt = getRedditDMPrompt("user1", "hi")
    const lower = prompt.toLowerCase()
    expect(lower).toContain("message")
  })

  it("instructs to send the message", () => {
    const prompt = getRedditDMPrompt("user1", "test message")
    const lower = prompt.toLowerCase()
    expect(lower).toContain("send")
  })
})

describe("getRedditLikePrompt — ACTN-01 auto-engage like action", () => {
  it("includes the post URL in the prompt", () => {
    const url = "https://reddit.com/r/test/comments/abc123"
    const prompt = getRedditLikePrompt(url)
    expect(prompt).toContain(url)
  })

  it("instructs to click the upvote button", () => {
    const prompt = getRedditLikePrompt("https://reddit.com/r/test/comments/xyz")
    const lower = prompt.toLowerCase()
    expect(lower).toContain("upvote")
  })
})

describe("getRedditFollowPrompt — ACTN-01 auto-engage follow action", () => {
  it("includes the user handle in the prompt", () => {
    const prompt = getRedditFollowPrompt("cool_user")
    expect(prompt).toContain("cool_user")
  })

  it("includes navigation to the user profile URL", () => {
    const prompt = getRedditFollowPrompt("cool_user")
    expect(prompt).toContain("reddit.com/user/cool_user")
  })

  it("instructs to click the Follow button", () => {
    const prompt = getRedditFollowPrompt("someone")
    const lower = prompt.toLowerCase()
    expect(lower).toContain("follow")
  })
})
