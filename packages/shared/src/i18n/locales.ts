// The languages Merran speaks. Adding one is a line here and a file in the
// web app's locales folder; CI checks the two agree, and says how much of
// the file is translated. English is the base every other falls back to.

/** A language Merran has: its code, its own name for itself, its direction. */
export type LocaleInfo = {
  /** BCP 47, like "en" or "pt-BR": the name of its file in the web app. */
  code: string
  /** Its name in itself, "Polski" not "Polish", so anyone can find theirs. */
  name: string
  dir: "ltr" | "rtl"
}

export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
] as const satisfies readonly LocaleInfo[]

export type Locale = (typeof LOCALES)[number]["code"]

/** The codes, in order, for checking a code in a schema. */
export const LOCALE_CODES = LOCALES.map((locale) => locale.code) as [
  Locale,
  ...Locale[],
]

export const DEFAULT_LOCALE: Locale = "en"

export function isLocale(value: unknown): value is Locale {
  return LOCALE_CODES.some((code) => code === value)
}

/** Which way a language's text runs, for `<html dir>`. */
export function localeDirection(code: Locale): "ltr" | "rtl" {
  return LOCALES.find((locale) => locale.code === code)?.dir ?? "ltr"
}

/** A language tag's first part: "pt" for "pt-BR", "zh" for "zh-Hant-TW". */
const baseOf = (tag: string) => tag.split("-")[0]!.toLowerCase()

/**
 * The code to use for a browser's languages, most wanted first: for each
 * in turn, the same code (ignoring case), or else one for the same base
 * language ("pt-PT" finds "pt", "pt" finds "pt-BR"). The first of the
 * browser's languages that matches at all wins, so someone who wants
 * Portuguese before Polish gets Portuguese. The fallback when none match.
 */
export function matchLanguage(
  languages: readonly string[],
  codes: readonly string[],
  fallback: string
): string {
  for (const language of languages) {
    if (!/^[a-z]{2,3}(-|$)/i.test(language)) continue
    const exact = codes.find(
      (code) => code.toLowerCase() === language.toLowerCase()
    )
    if (exact) return exact
    const base = baseOf(language)
    const sameBase =
      codes.find((code) => code.toLowerCase() === base) ??
      codes.find((code) => baseOf(code) === base)
    if (sameBase) return sameBase
  }
  return fallback
}

/** Merran's language for a browser's languages, English when it has none of them. */
export function matchLocale(languages: readonly string[]): Locale {
  return matchLanguage(languages, LOCALE_CODES, DEFAULT_LOCALE) as Locale
}
