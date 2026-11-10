import { describe, expect, test } from "vitest"
import {
  DEFAULT_LOCALE,
  isLocale,
  localeDirection,
  LOCALES,
  matchLanguage,
  matchLocale,
} from "./locales.ts"

describe("matchLanguage", () => {
  const codes = ["en", "pt", "pt-BR", "pl", "zh-Hant"]
  const match = (languages: string[], available = codes) =>
    matchLanguage(languages, available, "en")

  test("an exact match, whatever its case", () => {
    expect(match(["PT-br"])).toBe("pt-BR")
  })

  test("then the base language", () => {
    expect(match(["pt-PT"])).toBe("pt")
  })

  test("or a regional code for a base language", () => {
    expect(match(["pt"], ["en", "pt-BR"])).toBe("pt-BR")
  })

  test("the first preference that matches at all, not the first exact one", () => {
    expect(match(["pt-PT", "pl"])).toBe("pt")
  })

  test("a script subtag shares its base", () => {
    expect(match(["zh-Hant-TW"])).toBe("zh-Hant")
  })

  test("then the fallback", () => {
    expect(match(["de-DE"])).toBe("en")
    expect(match([])).toBe("en")
    expect(match(["*"])).toBe("en")
    expect(match([""])).toBe("en")
  })
})

describe("locales", () => {
  test("English is the default, and every code is a locale", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("xx")).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(3)).toBe(false)
    expect(DEFAULT_LOCALE).toBe("en")
    expect(localeDirection("en")).toBe("ltr")
  })

  test("each locale names itself and says its direction", () => {
    for (const locale of LOCALES) {
      expect(locale.name.length).toBeGreaterThan(0)
      expect(["ltr", "rtl"]).toContain(locale.dir)
      expect(Intl.getCanonicalLocales(locale.code)).toEqual([locale.code])
    }
  })

  test("a browser's languages match the list", () => {
    expect(matchLocale(["pt-BR"])).toBe("en")
  })
})
