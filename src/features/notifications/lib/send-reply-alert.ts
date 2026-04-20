import { createElement } from "react"
import { ReplyAlertEmail } from "../emails/reply-alert"
import { resend } from "./resend-client"

export async function sendReplyAlert(
  to: string,
  prospectHandle: string,
  platform: string,
) {
  const { data, error } = await resend.emails.send({
    from: "repco <notifications@repco.ai>",
    to,
    subject: `u/${prospectHandle} replied on ${platform}`,
    react: createElement(ReplyAlertEmail, { prospectHandle, platform }),
  })
  if (error) throw error
  return data
}
