"use client"

import { Download, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export interface ResultsCardStats {
  scanned: number
  signals: number
  dms: number
  replies: number
  replyRate: number
  conversions: number
}

interface ShareButtonsProps {
  imageUrl: string
  stats: ResultsCardStats
}

function buildAbsoluteUrl(relativeOrAbsolute: string): string {
  if (typeof window === "undefined") return relativeOrAbsolute
  try {
    return new URL(relativeOrAbsolute, window.location.origin).toString()
  } catch {
    return relativeOrAbsolute
  }
}

function todayStamp(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function ShareButtons({ imageUrl, stats }: ShareButtonsProps) {
  const absoluteImageUrl = buildAbsoluteUrl(imageUrl)
  const shareUrl = buildAbsoluteUrl("/")

  async function handleDownload() {
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) throw new Error("Image fetch failed")
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = blobUrl
      link.download = `repco-weekly-${todayStamp()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      toast.error("Could not download image. Please try again.")
      console.error("share-buttons download error", err)
    }
  }

  function handleShareToX() {
    const text = `This week repco found ${stats.signals} people looking for my product and sent ${stats.dms} DMs with a ${stats.replyRate}% reply rate`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(absoluteImageUrl)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  function handleShareToLinkedIn() {
    const text = `This week my AI sales rep found ${stats.signals} potential customers and achieved a ${stats.replyRate}% reply rate. Fully automated.`
    // LinkedIn's share endpoint ignores text params, but we include for legacy/fallback
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&summary=${encodeURIComponent(text)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={handleDownload}>
        <Download className="mr-2 h-4 w-4" />
        Download image
      </Button>
      <Button variant="secondary" onClick={handleShareToX}>
        <Share2 className="mr-2 h-4 w-4" />
        Share to X
      </Button>
      <Button variant="secondary" onClick={handleShareToLinkedIn}>
        <Share2 className="mr-2 h-4 w-4" />
        Share to LinkedIn
      </Button>
    </div>
  )
}
