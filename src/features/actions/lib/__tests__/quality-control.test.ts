import { describe, it, expect } from "vitest"
import { runQualityControl } from "../quality-control"

const POST =
  "Looking for a project management tool that handles sprint planning well"

describe("runQualityControl", () => {
  it("passes a 3-sentence DM that references a post word", () => {
    const dm =
      "Your sprint planning pain is real. We built something that handles exactly that workflow. Want me to show you how it works?"
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({ passed: true })
  })

  it("fails a 4+ sentence DM with too_many_sentences", () => {
    const dm =
      "Hey there. I totally get the struggle with sprint planning. We built a tool for that. It also does roadmaps. Want to check it out?"
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({
      passed: false,
      reason: "too_many_sentences",
    })
  })

  it('fails a DM containing "https://" with contains_url', () => {
    const dm =
      "We handle sprint planning really well. Check us out at https://example.com for more info."
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({ passed: false, reason: "contains_url" })
  })

  it('fails a DM containing "www." with contains_url', () => {
    const dm =
      "Sprint planning is tough. Visit www.example for a better solution."
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({ passed: false, reason: "contains_url" })
  })

  it('fails a DM mentioning "discount" with mentions_price', () => {
    const dm =
      "We have a great sprint planning tool. We offer a discount for early users. Want to try it?"
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({ passed: false, reason: "mentions_price" })
  })

  it('fails a DM mentioning "free trial" with mentions_price', () => {
    const dm =
      "Sprint planning can be easier. We have a free trial you might like. Interested?"
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({ passed: false, reason: "mentions_price" })
  })

  it("fails a DM sharing no 5+ char words with the post", () => {
    const dm = "Hey, I can help you out. Want to chat about it? Let me know."
    const result = runQualityControl(dm, POST)
    expect(result).toEqual({
      passed: false,
      reason: "no_post_reference",
    })
  })

  it("fails an empty DM with empty reason", () => {
    const result = runQualityControl("", POST)
    expect(result).toEqual({ passed: false, reason: "empty" })
  })
})
