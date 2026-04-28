import { Resend } from "resend"

let _client: Resend | undefined

function getClient(): Resend {
  if (!_client) {
    _client = new Resend(process.env.RESEND_API_KEY)
  }
  return _client
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    return getClient()[prop as keyof Resend]
  },
})
