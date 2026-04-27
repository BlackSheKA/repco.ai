import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

type WarningStatus =
  | "warning"
  | "banned"
  | "needs_reconnect"
  | "captcha_required"

type Platform = "reddit" | "linkedin"

interface AccountWarningEmailProps {
  accountHandle: string
  status: WarningStatus
  platform?: Platform
}

const INTER_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const colors = {
  brand: "#4338CA",
  brandFg: "#EEF2FF",
  text: "#1C1917",
  muted: "#78716C",
  bg: "#FFFFFF",
  warningBg: "#FEF3C7",
  warningFg: "#92400E",
  bannedBg: "#FEE2E2",
  bannedFg: "#991B1B",
  reconnectBg: "rgba(59,130,246,0.15)",
  reconnectFg: "#1D4ED8",
  captchaBg: "rgba(139,92,246,0.15)",
  captchaFg: "#6D28D9",
}

type Copy = {
  badgeBg: string
  badgeFg: string
  badgeLabel: string
  headline: (handleDisplay: string, platformLabel: string) => string
  body: (handleDisplay: string, platformLabel: string) => string
  cta: string
}

const STATUS_COPY: Record<WarningStatus, Copy> = {
  warning: {
    badgeBg: colors.warningBg,
    badgeFg: colors.warningFg,
    badgeLabel: "Warning",
    headline: (h) => `Account ${h} needs attention`,
    body: () =>
      "Your account has entered a 48-hour cooldown. repco has paused all actions for this account. No action needed -- it will resume automatically.",
    cta: "View account",
  },
  banned: {
    badgeBg: colors.bannedBg,
    badgeFg: colors.bannedFg,
    badgeLabel: "Banned",
    headline: (h, p) => `Your ${p} account ${h} was suspended`,
    body: (h, p) =>
      `${p} restricted ${h} and we've stopped sending actions through it. If this looks like a mistake, you can appeal directly with ${p}. Otherwise, connect a different account to keep your campaigns running.`,
    cta: "View account",
  },
  needs_reconnect: {
    badgeBg: colors.reconnectBg,
    badgeFg: colors.reconnectFg,
    badgeLabel: "Needs reconnect",
    headline: (h) => `Reconnect needed for ${h}`,
    body: (h) =>
      `${h} got logged out and we can't recover the session automatically. Open your dashboard and click Reconnect to sign back in -- takes about a minute.`,
    cta: "Reconnect",
  },
  captcha_required: {
    badgeBg: colors.captchaBg,
    badgeFg: colors.captchaFg,
    badgeLabel: "Captcha needed",
    headline: (h, p) => `Captcha is blocking ${h} -- quick fix`,
    body: (h, p) =>
      `${p} is showing a captcha for ${h}, so we've paused its actions. Open your dashboard and click Reconnect to solve the captcha in the cloud browser.`,
    cta: "Fix it",
  },
}

export function AccountWarningEmail({
  accountHandle,
  status,
  platform = "reddit",
}: AccountWarningEmailProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://repco.ai"
  const platformLabel = platform === "reddit" ? "Reddit" : "LinkedIn"
  const handleDisplay =
    platform === "reddit" ? `u/${accountHandle}` : accountHandle
  const copy = STATUS_COPY[status] ?? STATUS_COPY.warning
  const headline = copy.headline(handleDisplay, platformLabel)
  const description = copy.body(handleDisplay, platformLabel)

  return (
    <Html>
      <Head />
      <Preview>{headline}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: INTER_FONT,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: colors.bg,
            padding: "32px 24px",
          }}
        >
          <Section style={{ paddingTop: "32px" }}>
            <Heading
              as="h1"
              style={{
                color: colors.brand,
                fontFamily: INTER_FONT,
                fontSize: "28px",
                fontWeight: 700,
                margin: 0,
                lineHeight: "32px",
              }}
            >
              repco
            </Heading>
          </Section>

          <Section style={{ paddingTop: "32px" }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: INTER_FONT,
                fontSize: "20px",
                fontWeight: 600,
                lineHeight: "28px",
                margin: 0,
              }}
            >
              {headline}
            </Text>
            <Section style={{ paddingTop: "12px" }}>
              <span
                style={{
                  backgroundColor: copy.badgeBg,
                  color: copy.badgeFg,
                  fontFamily: INTER_FONT,
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  display: "inline-block",
                }}
              >
                {copy.badgeLabel}
              </span>
            </Section>
            <Text
              style={{
                color: colors.muted,
                fontFamily: INTER_FONT,
                fontSize: "16px",
                lineHeight: "24px",
                marginTop: "16px",
                marginBottom: 0,
              }}
            >
              {description}
            </Text>
          </Section>

          <Section style={{ paddingTop: "28px" }}>
            <Button
              href={`${siteUrl}/accounts`}
              style={{
                backgroundColor: colors.brand,
                color: colors.brandFg,
                fontFamily: INTER_FONT,
                fontSize: "16px",
                fontWeight: 600,
                borderRadius: "6px",
                padding: "12px 20px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {copy.cta}
            </Button>
          </Section>

          <Section style={{ paddingTop: "48px" }}>
            <Text
              style={{
                color: colors.muted,
                fontFamily: INTER_FONT,
                fontSize: "14px",
                textAlign: "center" as const,
                margin: 0,
              }}
            >
              repco -- Your AI sales rep
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export default AccountWarningEmail
