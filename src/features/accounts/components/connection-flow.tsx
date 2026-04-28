"use client"

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react"

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

// D-11 user-facing copy (locked). Never render the server `error` field.
const D11_COPY =
  "Could not set up the account right now — please try again in a moment."

export function ConnectionFlow({
  accountId,
  platform,
  onComplete,
  onCancel,
}: ConnectionFlowProps) {
  const platformLabel = platform === "linkedin" ? "LinkedIn" : "Reddit"
  const [step, setStep] = useState<FlowStep>(1)
  const [verified, setVerified] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [debuggerFullscreenUrl, setDebuggerFullscreenUrl] = useState<
    string | null
  >(null)
  const [startingBrowser, setStartingBrowser] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const loggedInButtonRef = useRef<HTMLButtonElement | null>(null)

  const [startNonce, setStartNonce] = useState(0)
  const startedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    // React 19 dev StrictMode double-invokes effects. Guard against double
    // server-action call — each call creates a real (billable) Browserbase
    // session. Key on accountId+startNonce so retry() still works.
    //
    // We deliberately do NOT use a `cancelled` flag in cleanup, because the
    // cleanup function fires on the StrictMode unmount before the in-flight
    // server action returns — that would silently drop the first response
    // and leave the UI stuck on "starting…". Instead the ref tracks the
    // current desired key; state writes are gated by ref equality.
    const key = `${accountId}:${startNonce}`
    if (startedKeyRef.current === key) return
    startedKeyRef.current = key

    void (async () => {
      const result = await startAccountBrowser(accountId)
      // If retry() bumped startNonce while we were in flight, abandon this
      // result. Otherwise apply it regardless of mount/unmount churn.
      if (startedKeyRef.current !== key) return
      setStartingBrowser(false)
      if (result.success && result.debuggerFullscreenUrl) {
        setDebuggerFullscreenUrl(result.debuggerFullscreenUrl)
      } else {
        setHasError(true)
      }
    })()
  }, [accountId, startNonce])

  // Intentionally NOT auto-scrolling when the iframe arrives — that pushed
  // the instructions above the viewport. Trust the user's existing scroll
  // position; iframe slots in below the instructions in document flow.

  function retry() {
    setStartingBrowser(true)
    setHasError(false)
    setIframeLoaded(false)
    setDebuggerFullscreenUrl(null)
    setStartNonce((n) => n + 1)
  }

  // Focus the primary CTA once the iframe is ready (a11y per UI-SPEC).
  useEffect(() => {
    if (!iframeLoaded) return
    const raf = requestAnimationFrame(() => {
      loggedInButtonRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [iframeLoaded])

  async function handleCancel() {
    await stopAccountBrowser(accountId)
    onCancel()
  }

  async function handleVerify() {
    setStep(2)
    setHasError(false)

    try {
      const result = await verifyAccountSession(accountId)
      setStep(3)
      if (result.success && result.verified) {
        setVerified(true)
        await stopAccountBrowser(accountId)
        setTimeout(() => onComplete(), 2000)
      } else {
        setVerified(false)
        setHasError(true)
      }
    } catch {
      setStep(3)
      setVerified(false)
      setHasError(true)
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
                <span>Starting a remote browser for this account…</span>
              </div>
            )}

            {!startingBrowser && hasError && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-base text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Could not start remote browser</span>
                </div>
                <p className="text-sm text-muted-foreground">{D11_COPY}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={retry}>
                    Retry
                  </Button>
                  <Button variant="ghost" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {!startingBrowser && !hasError && debuggerFullscreenUrl && (
              <>
                <ol className="flex flex-col gap-2 pl-4 text-base [list-style:decimal]">
                  <li>
                    Log into your {platformLabel} account in the browser below.
                  </li>
                  {platform === "linkedin" && (
                    <li>
                      If LinkedIn asks for 2FA or email verification, complete
                      it here before clicking below.
                    </li>
                  )}
                  <li>
                    Once you see your home feed, click{" "}
                    <span className="font-semibold">I&apos;ve logged in</span>.
                  </li>
                </ol>
                <p className="text-sm text-muted-foreground">
                  repco never sees your password.
                </p>

                <div className="relative">
                  <iframe
                    src={debuggerFullscreenUrl}
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    allow="clipboard-read; clipboard-write"
                    className="h-[480px] w-full rounded-md border bg-muted/30"
                    title={`${platformLabel} login session`}
                    onLoad={() => setIframeLoaded(true)}
                  />
                  {!iframeLoaded && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="absolute inset-0 flex items-center justify-center rounded-md bg-muted/50 backdrop-blur-sm"
                    >
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="sr-only">Loading login screen…</span>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex flex-wrap gap-2">
                  <Button
                    ref={loggedInButtonRef}
                    variant="default"
                    disabled={!iframeLoaded}
                    aria-disabled={!iframeLoaded}
                    onClick={handleVerify}
                  >
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
            <p className="text-base">Verifying your session…</p>
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
            <p className="text-base font-semibold">Could not verify login</p>
            <p className="text-sm text-muted-foreground">{D11_COPY}</p>
            <Button
              variant="outline"
              onClick={() => {
                setStep(1)
                setHasError(false)
                retry()
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
