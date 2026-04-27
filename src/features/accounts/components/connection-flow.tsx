"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  startAccountBrowser,
  stopAccountBrowser,
  verifyAccountSession,
} from "@/features/accounts/actions/account-actions"

interface ConnectionFlowProps {
  accountId: string
  profileId: string | null
  platform: "reddit" | "linkedin"
  onComplete: () => void
  onCancel: () => void
}

type FlowStep = 1 | 2 | 3

export function ConnectionFlow({
  accountId,
  platform,
  onComplete,
  onCancel,
}: ConnectionFlowProps) {
  const platformLabel = platform === "linkedin" ? "LinkedIn" : "Reddit"
  const [step, setStep] = useState<FlowStep>(1)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [startingBrowser, setStartingBrowser] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function start() {
      setStartingBrowser(true)
      setError(null)
      const result = await startAccountBrowser(accountId)
      if (cancelled) return

      setStartingBrowser(false)
      if (result.success && result.url) {
        setBrowserUrl(result.url)
        setLoginUrl(result.loginUrl ?? null)
      } else {
        setError(result.error ?? "Could not start the remote browser")
      }
    }

    start()

    return () => {
      cancelled = true
    }
  }, [accountId])

  async function handleCancel() {
    await stopAccountBrowser(accountId)
    onCancel()
  }

  async function handleVerify() {
    setStep(2)
    setError(null)

    try {
      const result = await verifyAccountSession(accountId)
      setStep(3)
      if (result.success && result.verified) {
        setVerified(true)
        await stopAccountBrowser(accountId)
        setTimeout(() => onComplete(), 2000)
      } else {
        setVerified(false)
        setError(result.error ?? "Could not verify login")
      }
    } catch {
      setStep(3)
      setVerified(false)
      setError("Verification failed unexpectedly")
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <span className="text-sm text-muted-foreground">
          Step {step} of 3
        </span>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            {startingBrowser && (
              <div className="flex items-center gap-2 text-base">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span>Starting a remote browser for this account...</span>
              </div>
            )}

            {!startingBrowser && error && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-base text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Could not start remote browser</span>
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null)
                      setStartingBrowser(true)
                      startAccountBrowser(accountId).then((r) => {
                        setStartingBrowser(false)
                        if (r.success && r.url) setBrowserUrl(r.url)
                        else
                          setError(
                            r.error ?? "Could not start the remote browser",
                          )
                      })
                    }}
                  >
                    Retry
                  </Button>
                  <Button variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!startingBrowser && browserUrl && (
              <>
                <ol className="flex flex-col gap-2 pl-4 text-base [list-style:decimal]">
                  <li>
                    Click{" "}
                    <span className="font-semibold">
                      Open remote browser
                    </span>{" "}
                    below — a new tab opens with the GoLogin cloud browser.
                  </li>
                  <li>
                    Paste this URL into that browser&apos;s address bar and
                    press Enter:
                    {loginUrl && (
                      <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                        <code className="flex-1 break-all text-sm">
                          {loginUrl}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(loginUrl)
                            toast.success("Copied")
                          }}
                          aria-label="Copy login URL"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </li>
                  <li>
                    Log into your account. repco never sees your password.
                  </li>
                  {platform === "linkedin" && (
                    <li>
                      If LinkedIn asks for 2FA or email verification, complete
                      it in the remote browser before clicking below.
                    </li>
                  )}
                  <li>
                    Come back here and click{" "}
                    <span className="font-semibold">
                      I&apos;ve logged in
                    </span>
                    .
                  </li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a
                      href={browserUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open remote browser
                    </a>
                  </Button>
                  <Button variant="outline" onClick={handleVerify}>
                    I&apos;ve logged in
                  </Button>
                  <Button variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-base">Verifying your session...</p>
            <p className="text-sm text-muted-foreground">
              Checking {platformLabel} login status
            </p>
          </div>
        )}

        {step === 3 && verified && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="text-base font-semibold">Account connected</p>
          </div>
        )}

        {step === 3 && !verified && (
          <div className="flex flex-col items-center gap-3 py-4">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-base font-semibold">
              Could not verify login
            </p>
            {error && (
              <p className="text-sm text-muted-foreground">{error}</p>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setStep(1)
                setError(null)
              }}
            >
              Try logging in again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
