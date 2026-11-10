import {
  DEFAULT_LOCALE,
  isLocale,
  localeDirection,
  matchLocale,
  type Locale,
} from "@merran/shared"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { I18N_OPTIONS } from "@/lib/i18n-options"
import { loadLocale } from "@/lib/locale-files"
import { switchLanguage } from "@/lib/switch-language"

import en from "./locales/en.json"

// Every word the app shows comes from a locale file, so Merran can be
// translated. English is bundled, and is what any missing string falls
// back to; other languages load when they're chosen, from whatever files
// are in ./locales, so adding a language needs no change here.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  ...I18N_OPTIONS,
})

const otherLocales = import.meta.glob([
  "./locales/*.json",
  "!./locales/en.json",
])

/** The browser's languages, most wanted first. */
function browserLanguages() {
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language]
}

/** Shows the app in a language, unless it's already showing. */
function switchTo(code: Locale) {
  return switchLanguage(
    i18n,
    document.documentElement,
    code,
    localeDirection(code)
  )
}

/**
 * Shows the app in the person's language, or their browser's when they
 * haven't chosen, loading it first if it isn't loaded. A language that
 * won't load leaves the app in English.
 */
export async function applyLanguage(preference: string | null) {
  const code = isLocale(preference)
    ? preference
    : matchLocale(browserLanguages())
  if (code !== DEFAULT_LOCALE && !i18n.hasResourceBundle(code, "translation")) {
    const strings = await loadLocale(code, otherLocales)
    if (!strings) return switchTo(DEFAULT_LOCALE)
    i18n.addResourceBundle(code, "translation", strings)
  }
  await switchTo(code)
}

/** The language to start in, before anyone's signed in: the browser's. */
export function startLanguage() {
  return applyLanguage(null)
}

// Makes t("…") check its keys against the English file: a missing string is
// a type error.
declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}

export default i18n
