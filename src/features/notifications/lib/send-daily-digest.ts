import { createElement } from "react"
import { DailyDigestEmail } from "../emails/daily-digest"
import { resend } from "./resend-client"

export interface DailyDigestData {
  signalCount: number
  pendingCount: number
  replyCount: number
  topSignals: Array<{
    excerpt: string
    subreddit: string
    intentStrength: number
  }>
  productName: string
}

export async function sendDailyDigest(to: string, data: DailyDigestData) {
  const { data: result, error } = await resend.emails.send({
    from: "repco <notifications@repco.ai>",
    to,
    subject: `${data.signalCount} people looking for ${data.productName} yesterday`,
    react: createElement(DailyDigestEmail, data),
  })
  if (error) throw error
  return result
}
