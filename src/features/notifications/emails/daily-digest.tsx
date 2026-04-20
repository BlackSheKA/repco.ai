import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"

interface TopSignal {
  excerpt: string
  subreddit: string
  intentStrength: number
}

interface DailyDigestEmailProps {
  signalCount: number
  pendingCount: number
  replyCount: number
  topSignals: TopSignal[]
  productName: string
}

const INTER_FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

const colors = {
  brand: "#4338CA",
  brandFg: "#EEF2FF",
  text: "#1C1917",
  muted: "#78716C",
  bg: "#FFFFFF",
  green: "#22C55E",
  border: "#E7E5E4",
}

export function DailyDigestEmail({
  signalCount,
  pendingCount,
  replyCount,
  topSignals,
  productName,
}: DailyDigestEmailProps) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://repco.ai"
  const subject = `${signalCount} people looking for ${productName} yesterday`

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

          <Section style={{ paddingTop: "24px" }}>
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
              {signalCount} people looking for {productName} yesterday
            </Text>
          </Section>

          <Section style={{ paddingTop: "24px" }}>
            <Row>
              <Column style={{ width: "33.3%", verticalAlign: "top" as const }}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: INTER_FONT,
                    fontSize: "28px",
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: "32px",
                  }}
                >
                  {signalCount}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: INTER_FONT,
                    fontSize: "14px",
                    margin: 0,
                    marginTop: "4px",
                  }}
                >
                  detected
                </Text>
              </Column>
              <Column style={{ width: "33.3%", verticalAlign: "top" as const }}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: INTER_FONT,
                    fontSize: "28px",
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: "32px",
                  }}
                >
                  {pendingCount}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: INTER_FONT,
                    fontSize: "14px",
                    margin: 0,
                    marginTop: "4px",
                  }}
                >
                  awaiting approval
                </Text>
              </Column>
              <Column style={{ width: "33.3%", verticalAlign: "top" as const }}>
                <Text
                  style={{
                    color: replyCount > 0 ? colors.green : colors.text,
                    fontFamily: INTER_FONT,
                    fontSize: "28px",
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: "32px",
                  }}
                >
                  {replyCount}
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: INTER_FONT,
                    fontSize: "14px",
                    margin: 0,
                    marginTop: "4px",
                  }}
                >
                  received
                </Text>
              </Column>
            </Row>
          </Section>

          {topSignals.length > 0 && (
            <Section style={{ paddingTop: "32px" }}>
              <Hr
                style={{
                  borderColor: colors.border,
                  margin: "0 0 24px 0",
                }}
              />
              <Text
                style={{
                  color: colors.text,
                  fontFamily: INTER_FONT,
                  fontSize: "16px",
                  fontWeight: 600,
                  margin: 0,
                  marginBottom: "12px",
                }}
              >
                Top signals
              </Text>
              {topSignals.slice(0, 3).map((signal, idx) => (
                <Section key={idx} style={{ paddingBottom: "16px" }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontFamily: INTER_FONT,
                      fontSize: "15px",
                      lineHeight: "22px",
                      margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }}
                  >
                    {signal.excerpt}
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontFamily: INTER_FONT,
                      fontSize: "13px",
                      margin: 0,
                      marginTop: "4px",
                    }}
                  >
                    r/{signal.subreddit} -- {signal.intentStrength}/10 intent
                  </Text>
                </Section>
              ))}
            </Section>
          )}

          <Section style={{ paddingTop: "16px" }}>
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
              Open repco
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

export default DailyDigestEmail
