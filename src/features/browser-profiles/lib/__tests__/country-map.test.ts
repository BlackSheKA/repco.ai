import { describe, it, expect } from "vitest"
import { COUNTRY_MAP, mapForCountry } from "../country-map"
import type { SupportedCountry } from "../country-map"

describe("COUNTRY_MAP", () => {
  it("has exactly 7 keys: US, GB, DE, PL, FR, CA, AU", () => {
    const keys = Object.keys(COUNTRY_MAP)
    expect(keys).toHaveLength(7)
    expect(keys).toContain("US")
    expect(keys).toContain("GB")
    expect(keys).toContain("DE")
    expect(keys).toContain("PL")
    expect(keys).toContain("FR")
    expect(keys).toContain("CA")
    expect(keys).toContain("AU")
  })
})

describe("mapForCountry", () => {
  it("returns the correct timezone/locale/language for each country (D-12 verbatim)", () => {
    expect(mapForCountry("US").timezone).toBe("America/New_York")
    expect(mapForCountry("US").locale).toBe("en-US")
    expect(mapForCountry("US").language).toBe("en-US,en")

    expect(mapForCountry("GB").timezone).toBe("Europe/London")
    expect(mapForCountry("GB").locale).toBe("en-GB")
    expect(mapForCountry("GB").language).toBe("en-GB,en")

    expect(mapForCountry("DE").timezone).toBe("Europe/Berlin")
    expect(mapForCountry("DE").locale).toBe("de-DE")
    expect(mapForCountry("DE").language).toBe("de-DE,de")

    expect(mapForCountry("PL").timezone).toBe("Europe/Warsaw")
    expect(mapForCountry("PL").locale).toBe("pl-PL")
    expect(mapForCountry("PL").language).toBe("pl-PL,pl")

    expect(mapForCountry("FR").timezone).toBe("Europe/Paris")
    expect(mapForCountry("FR").locale).toBe("fr-FR")
    expect(mapForCountry("FR").language).toBe("fr-FR,fr")

    expect(mapForCountry("CA").timezone).toBe("America/Toronto")
    expect(mapForCountry("CA").locale).toBe("en-CA")
    expect(mapForCountry("CA").language).toBe("en-CA,en")

    expect(mapForCountry("AU").timezone).toBe("Australia/Sydney")
    expect(mapForCountry("AU").locale).toBe("en-AU")
    expect(mapForCountry("AU").language).toBe("en-AU,en")
  })

  it("every userAgent contains Chrome/130.0.0.0 and Win64; x64 (D-08 single-major rule)", () => {
    const countries: SupportedCountry[] = ["US", "GB", "DE", "PL", "FR", "CA", "AU"]
    for (const code of countries) {
      const { userAgent } = mapForCountry(code)
      expect(userAgent).toContain("Chrome/130.0.0.0")
      expect(userAgent).toContain("Win64; x64")
    }
  })

  it("throws an Error with message 'Unsupported country_code: XX' for unknown code", () => {
    expect(() => mapForCountry("XX")).toThrow("Unsupported country_code: XX")
  })

  it("throws for lowercase 'us' (case-sensitive — uppercase ISO required)", () => {
    expect(() => mapForCountry("us")).toThrow()
  })
})
