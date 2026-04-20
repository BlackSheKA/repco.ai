import { createElement } from "react"
import { AccountWarningEmail } from "../emails/account-warning"
import { resend } from "./resend-client"

export async function sendAccountWarning(
  to: string,
  accountHandle: string,
  status: "warning" | "banned",
) {
  const { data, error } = await resend.emails.send({
    from: "repco <notifications@repco.ai>",
    to,
    subject: `Account @${accountHandle} needs attention`,
    react: createElement(AccountWarningEmail, { accountHandle, status }),
  })
  if (error) throw error
  return data
}
