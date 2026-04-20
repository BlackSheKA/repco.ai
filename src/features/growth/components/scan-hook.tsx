"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface SimplifiedSignal {
  id: string
  platform: "reddit"
  subreddit: string
  title: string
  excerpt: string
  post_url: string
  intent_strength: number
  intent_type: "direct" | "competitive" | "problem" | "engagement"
  detected_at: string
}

type ScanState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "results"; signals: SimplifiedSignal[] }

const TIMEOUT_MS = 10000

export function ScanHook() {
  const [productDescription, setProductDescription] = useState("")
  const [competitor, setCompetitor] = useState("")
  const [state, setState] = useState<ScanState>({ kind: "idle" })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (productDescription.trim().length < 5) {
      toast.error("Describe your product in a few words.")
      return
    }

    setState({ kind: "loading" })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productDescription: productDescription.trim(),
          competitor: competitor.trim() || undefined,
        }),
        signal: controller.signal,
      })

      if (res.status === 429) {
        toast.error("Try again in a few minutes")
        setState({
          kind: "error",
          message: "Try again in a few minutes",
        })
        return
      }

      if (!res.ok) {
        setState({
          kind: "error",
          message: "Could not complete the scan. Please try again in a moment.",
        })
        return
      }

      const data = (await res.json()) as { signals: SimplifiedSignal[] }
      setState({ kind: "results", signals: data.signals ?? [] })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setState({
          kind: "error",
          message: "Could not complete the scan. Please try again in a moment.",
        })
      } else {
        setState({
          kind: "error",
          message: "Could not complete the scan. Please try again in a moment.",
        })
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  const loading = state.kind === "loading"

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border bg-card p-6"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-product">What does your product do?</Label>
          <Input
            id="scan-product"
            placeholder="e.g., AI-powered CRM for freelancers"
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            required
            minLength={5}
            maxLength={500}
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-competitor">Competitor (optional)</Label>
          <Input
            id="scan-competitor"
            placeholder="e.g., HubSpot"
            value={competitor}
            onChange={(e) => setCompetitor(e.target.value)}
            maxLength={100}
            disabled={loading}
          />
        </div>
        <Button type="submit" disabled={loading} className="self-start">
          {loading ? "Scanning Reddit..." : "Scan now"}
        </Button>
      </form>

      {state.kind === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {state.kind === "results" && (
        <ScanResults signals={state.signals} />
      )}
    </div>
  )
}

function ScanResults({ signals }: { signals: SimplifiedSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No signals found right now. Try broader keywords or sign up -- repco
          scans every 15 minutes.
        </p>
        <Button asChild className="self-center">
          <Link href="/login">Sign up free</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      <h3 className="text-xl font-semibold">
        Found {signals.length}{" "}
        {signals.length === 1 ? "person" : "people"} looking for something like
        yours
      </h3>
      <div className="flex flex-col gap-3">
        {signals.map((s) => (
          <SignalPreview key={s.id} signal={s} />
        ))}
      </div>
      <Button asChild className="self-center">
        <Link href="/login">Sign up to contact them</Link>
      </Button>
    </div>
  )
}

function SignalPreview({ signal }: { signal: SimplifiedSignal }) {
  let tone = "text-zinc-500"
  if (signal.intent_strength >= 7) tone = "text-[#4338CA]"
  else if (signal.intent_strength >= 4) tone = "text-amber-500"

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className="h-6 rounded-full bg-[#FF4500] text-sm font-medium text-white hover:bg-[#FF4500]/90">
            Reddit
          </Badge>
          {signal.subreddit && (
            <span className="text-sm font-medium text-muted-foreground">
              {signal.subreddit}
            </span>
          )}
        </div>
        <span className={`text-sm font-medium ${tone}`}>
          {signal.intent_strength}/10
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-base font-medium">{signal.title}</p>
      {signal.excerpt && signal.excerpt !== signal.title && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {signal.excerpt}
        </p>
      )}
    </div>
  )
}
