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

interface AccountWarningEmailProps {
  accountHandle: string
  status: "warning" | "banned"
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
}

const WARNING_TEXT =
  "Your account has entered a 48-hour cooldown. repco has paused all actions for this account. No action needed -- it will resume automatically."

const BANNED_TEXT =
  "Reddit may have restricted this account. Log into Reddit directly to check for messages from the admins. You may need to connect a different account."

export function AccountWarningEmail({
  accountHandle,
  status,
}: AccountWarningEmailProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://repco.ai"
  const subject = `Account @${accountHandle} needs attention`

  const badgeBg = status === "banned" ? colors.bannedBg : colors.warningBg
  const badgeFg = status === "banned" ? colors.bannedFg : colors.warningFg
  const badgeLabel = status === "banned" ? "Banned" : "Warning"
  const description = status === "banned" ? BANNED_TEXT : WARNING_TEXT

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
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
              Account @{accountHandle} needs attention
            </Text>
            <Section style={{ paddingTop: "12px" }}>
              <span
                style={{
                  backgroundColor: badgeBg,
                  color: badgeFg,
                  fontFamily: INTER_FONT,
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "9999px",
                  display: "inline-block",
                }}
              >
                {badgeLabel}
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
              View account
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
