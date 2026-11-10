/** What switching needs of i18next: its language, and a way to change it. */
type Translator = {
  language: string
  changeLanguage(code: string): Promise<unknown>
}

/**
 * Shows the app in a language, and tells the page which, for screen
 * readers and text direction. Nothing happens for the language already
 * showing: it's applied on every navigation, and switching again would
 * redraw the whole app and re-run every effect that depends on `t`.
 */
export async function switchLanguage(
  i18n: Translator,
  page: { lang: string; dir: string },
  code: string,
  dir: "ltr" | "rtl"
) {
  if (i18n.language !== code) await i18n.changeLanguage(code)
  if (page.lang !== code) page.lang = code
  if (page.dir !== dir) page.dir = dir
}
