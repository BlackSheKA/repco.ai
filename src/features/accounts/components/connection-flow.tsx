"use client"

import { useState } from "react"
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { verifyAccountSession } from "@/features/accounts/actions/account-actions"

interface ConnectionFlowProps {
  accountId: string
  profileId: string
  onComplete: () => void
  onCancel: () => void
}

type FlowStep = 1 | 2 | 3

export function ConnectionFlow({
  accountId,
  profileId,
  onComplete,
  onCancel,
}: ConnectionFlowProps) {
  const [step, setStep] = useState<FlowStep>(1)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleVerify() {
    setStep(2)
    setError(null)

    try {
      const result = await verifyAccountSession(accountId)
      setStep(3)
      if (result.success && result.verified) {
        setVerified(true)
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
            <p className="text-base">
              Log into Reddit using the GoLogin browser window that just
              opened.
            </p>
            <p className="text-sm text-muted-foreground">
              Use your Reddit credentials. repco never sees your
              password.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleVerify}>
                I&apos;ve logged in
              </Button>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-base">Verifying your session...</p>
            <p className="text-sm text-muted-foreground">
              Checking Reddit login status
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
