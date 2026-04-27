"use client"

import { Badge } from "@/components/ui/badge"
import type { HealthStatus } from "@/features/accounts/lib/types"

const HEALTH_STYLES: Record<
  HealthStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  warmup: {
    label: "Warming up",
    bg: "rgba(245, 158, 11, 0.15)",
    text: "#F59E0B",
    border: "rgba(245, 158, 11, 0.3)",
  },
  healthy: {
    label: "Healthy",
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#22C55E",
    border: "rgba(34, 197, 94, 0.3)",
  },
  warning: {
    label: "Warning",
    bg: "rgba(245, 158, 11, 0.15)",
    text: "#F59E0B",
    border: "rgba(245, 158, 11, 0.3)",
  },
  cooldown: {
    label: "Cooldown",
    bg: "rgba(234, 179, 8, 0.15)",
    text: "#EAB308",
    border: "rgba(234, 179, 8, 0.3)",
  },
  banned: {
    label: "Banned",
    bg: "rgba(220, 38, 38, 0.15)",
    text: "#DC2626",
    border: "rgba(220, 38, 38, 0.3)",
  },
  needs_reconnect: {
    label: "Needs reconnect",
    bg: "rgba(59, 130, 246, 0.15)",
    text: "#3B82F6",
    border: "rgba(59, 130, 246, 0.3)",
  },
  captcha_required: {
    label: "Captcha needed",
    bg: "rgba(139, 92, 246, 0.15)",
    text: "#8B5CF6",
    border: "rgba(139, 92, 246, 0.3)",
  },
}

interface HealthBadgeProps {
  status: HealthStatus
}

export function HealthBadge({ status }: HealthBadgeProps) {
  const style = HEALTH_STYLES[status]

  return (
    <Badge
      variant="outline"
      aria-label={`Health status: ${status}`}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      {style.label}
    </Badge>
  )
}
