import type { InitOptions } from "i18next"

/** How i18next reads the app's strings, kept apart so it can be tested. */
export const I18N_OPTIONS: InitOptions = {
  // React already escapes what it renders.
  interpolation: { escapeValue: false },
  // A translation left empty shows English, as check:locales tells
  // translators, rather than a blank label.
  returnEmptyString: false,
}
