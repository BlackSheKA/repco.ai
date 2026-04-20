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

interface ReplyAlertEmailProps {
  prospectHandle: string
  platform: string
}

const INTER_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const colors = {
  brand: "#4338CA",
  brandFg: "#EEF2FF",
  text: "#1C1917",
  muted: "#78716C",
  bg: "#FFFFFF",
}

export function ReplyAlertEmail({
  prospectHandle,
  platform,
}: ReplyAlertEmailProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://repco.ai"
  const subject = `u/${prospectHandle} replied on ${platform}`

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
              u/{prospectHandle} replied on {platform}
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontFamily: INTER_FONT,
                fontSize: "16px",
                lineHeight: "24px",
                marginTop: "12px",
                marginBottom: 0,
              }}
            >
              View the conversation in your repco dashboard.
            </Text>
          </Section>

          <Section style={{ paddingTop: "28px" }}>
            <Button
              href={siteUrl}
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
              View in repco
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

export default ReplyAlertEmail
