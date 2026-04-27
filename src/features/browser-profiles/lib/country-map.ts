export type SupportedCountry = "US" | "GB" | "DE" | "PL" | "FR" | "CA" | "AU"

const UA_CHROME_130_WIN64 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

export interface CountryProfile {
  timezone: string
  locale: string
  userAgent: string
  language: string
}

export const COUNTRY_MAP: Record<SupportedCountry, CountryProfile> = {
  US: {
    timezone: "America/New_York",
    locale: "en-US",
    language: "en-US,en",
    userAgent: UA_CHROME_130_WIN64,
  },
  GB: {
    timezone: "Europe/London",
    locale: "en-GB",
    language: "en-GB,en",
    userAgent: UA_CHROME_130_WIN64,
  },
  DE: {
    timezone: "Europe/Berlin",
    locale: "de-DE",
    language: "de-DE,de",
    userAgent: UA_CHROME_130_WIN64,
  },
  PL: {
    timezone: "Europe/Warsaw",
    locale: "pl-PL",
    language: "pl-PL,pl",
    userAgent: UA_CHROME_130_WIN64,
  },
  FR: {
    timezone: "Europe/Paris",
    locale: "fr-FR",
    language: "fr-FR,fr",
    userAgent: UA_CHROME_130_WIN64,
  },
  CA: {
    timezone: "America/Toronto",
    locale: "en-CA",
    language: "en-CA,en",
    userAgent: UA_CHROME_130_WIN64,
  },
  AU: {
    timezone: "Australia/Sydney",
    locale: "en-AU",
    language: "en-AU,en",
    userAgent: UA_CHROME_130_WIN64,
  },
}

export function mapForCountry(code: string): CountryProfile {
  if (!(code in COUNTRY_MAP)) {
    throw new Error(`Unsupported country_code: ${code}`)
  }
  return COUNTRY_MAP[code as SupportedCountry]
}
