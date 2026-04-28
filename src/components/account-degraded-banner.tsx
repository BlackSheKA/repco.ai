import Link from "next/link"
import { Warning, WarningOctagon, ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { HealthBadge } from "@/features/accounts/components/health-badge"

export type DegradedAccount = {
  id: string
  handle: string
  platform: "reddit" | "linkedin"
  health_status:
    | "warning"
    | "cooldown"
    | "banned"
    | "needs_reconnect"
    | "captcha_required"
}

const REASON_COPY: Record<DegradedAccount["health_status"], string> = {
  banned: "Account suspended on the platform.",
  warning: "Recent failures — slowing down.",
  cooldown: "Cooling down after a failure.",
  needs_reconnect: "Logged out — please sign back in.",
  captcha_required: "Captcha is blocking actions.",
}

const BUTTON_LABEL: Record<DegradedAccount["health_status"], string> = {
  banned: "View",
  warning: "View",
  cooldown: "View",
  needs_reconnect: "Reconnect",
  captcha_required: "Reconnect",
}

export function AccountDegradedBanner({
  accounts,
}: {
  accounts: DegradedAccount[]
}) {
  if (accounts.length === 0) return null

  const hasBanned = accounts.some((a) => a.health_status === "banned")
  const variant = hasBanned ? "destructive" : "default"
  const heading =
    accounts.length === 1
      ? "1 account needs attention"
      : "Some accounts need attention"
  const Icon = hasBanned ? WarningOctagon : Warning

  return (
    <Alert variant={variant} className="mb-6">
      <Icon className="h-4 w-4" />
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription>
        <p className="mb-2 text-sm">
          These accounts are paused until you fix them:
        </p>
        <ul className="space-y-2">
          {accounts.map((a) => {
            const handleDisplay =
              a.platform === "reddit" ? `u/${a.handle}` : a.handle
            return (
              <li key={a.id} className="flex items-center gap-2">
                <span className="text-sm font-medium">{handleDisplay}</span>
                <HealthBadge status={a.health_status} />
                <span className="text-sm text-muted-foreground">
                  {REASON_COPY[a.health_status]}
                </span>
                <Button asChild variant="default" size="sm" className="ml-auto">
                  <Link
                    href={`/accounts#${a.id}`}
                    aria-label={`${BUTTON_LABEL[a.health_status]} ${handleDisplay}`}
                  >
                    {BUTTON_LABEL[a.health_status]}
                    <ArrowSquareOut className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
