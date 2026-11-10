import { DirectionProvider } from "@base-ui/react/direction-provider"
import { isLocale, localeDirection } from "@merran/shared"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

/**
 * Tells Base UI's components which way the language runs, as `<html dir>`
 * tells the page. Without it they assume left to right: in Arabic or Hebrew
 * a menu's submenu would open off the wrong edge, and arrow keys would move
 * through tabs and toggles backwards.
 */
export function LanguageDirection({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()
  const direction = isLocale(i18n.language)
    ? localeDirection(i18n.language)
    : "ltr"

  return <DirectionProvider direction={direction}>{children}</DirectionProvider>
}
