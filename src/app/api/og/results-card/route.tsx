import { ImageResponse } from "next/og"

export const runtime = "nodejs"

function parseIntParam(
  value: string | null,
  fallback: number,
): number {
  if (!value) return fallback
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const scanned = parseIntParam(searchParams.get("scanned"), 0)
  const signals = parseIntParam(searchParams.get("signals"), 0)
  const dms = parseIntParam(searchParams.get("dms"), 0)
  const replies = parseIntParam(searchParams.get("replies"), 0)
  const replyRate = parseIntParam(searchParams.get("replyRate"), 0)
  const conversions = parseIntParam(searchParams.get("conversions"), 0)

  const stats: Array<{ label: string; value: string }> = [
    { label: "Posts scanned", value: String(scanned) },
    { label: "Signals", value: String(signals) },
    { label: "DMs sent", value: String(dms) },
    { label: "Replies", value: String(replies) },
    { label: "Reply rate", value: `${replyRate}%` },
    { label: "Conversions", value: String(conversions) },
  ]

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
          padding: "64px",
          color: "#ffffff",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Indigo accent line at top */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "#4338CA",
          }}
        />

        {/* Title row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "48px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "36px",
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            repco weekly
          </div>
        </div>

        {/* 2 rows of 3 stat boxes using flex-wrap */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            width: "100%",
            gap: "24px",
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: "flex",
                flexDirection: "column",
                width: "340px",
                padding: "32px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: "48px",
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1.1,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: "16px",
                  fontWeight: 500,
                  color: "#a8a29e",
                  marginTop: "8px",
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom row: watermark */}
        <div
          style={{
            display: "flex",
            marginTop: "auto",
            justifyContent: "flex-end",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "14px",
              color: "#78716c",
            }}
          >
            repco.ai
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    },
  )
}
