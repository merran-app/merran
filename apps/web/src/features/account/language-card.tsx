import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { LOCALES, type Locale } from "@merran/shared"
import { useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { meQuery } from "@/features/auth/queries"
import { useMe } from "@/features/auth/use-me"
import { useIsMobile } from "@/hooks/use-mobile"
import { applyLanguage } from "@/i18n"
import { api, ApiError, unwrap } from "@/lib/api/client"

/** The choice that follows the browser, rather than naming a language. */
const BROWSER = "browser"

/**
 * Settings → Profile: the language Merran shows, saved for the person on every
 * device, or the browser's. Hidden while English is the only language, as
 * settings that can't be used yet are (Household AI's model pickers, say).
 */
export function LanguageCard() {
  if (LOCALES.length < 2) return null
  return <LanguageChoice />
}

function LanguageChoice() {
  const { t } = useTranslation()
  const me = useMe()
  const queryClient = useQueryClient()
  const phone = useIsMobile()
  const id = React.useId()
  const value: string = me.language ?? BROWSER
  // Each language by its own name, so anyone can find theirs.
  const options = [
    { value: BROWSER, label: t("settings.you.language.browser") },
    ...LOCALES.map((locale) => ({ value: locale.code, label: locale.name })),
  ]

  async function choose(next: string) {
    if (next === value) return
    const language = next === BROWSER ? null : (next as Locale)
    try {
      const updated = await unwrap(
        api.PATCH("/api/auth/me/language", { body: { language } })
      )
      queryClient.setQueryData(meQuery.queryKey, updated)
      await applyLanguage(updated.language)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <label htmlFor={id}>{t("settings.you.language.title")}</label>
        </CardTitle>
        <CardDescription>
          {t("settings.you.language.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {phone ? (
          <LanguageDrawer
            id={id}
            value={value}
            options={options}
            onChoose={choose}
          />
        ) : (
          <Select
            items={options}
            value={value}
            onValueChange={(next) => void choose(String(next))}
          >
            <SelectTrigger id={id} className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  )
}

/** On a phone: the choice as a button, opening the languages in a drawer. */
function LanguageDrawer({
  id,
  value,
  options,
  onChoose,
}: {
  id: string
  value: string
  options: { value: string; label: string }[]
  onChoose: (value: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const current = options.find((option) => option.value === value)

  async function pick(next: string) {
    setOpen(false)
    await onChoose(next)
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <Button id={id} variant="outline" className="w-full justify-start" />
        }
      >
        {current?.label}
      </DrawerTrigger>
      <DrawerContent className="max-h-[80dvh]">
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <DrawerTitle>{t("settings.you.language.title")}</DrawerTitle>
          <div className="grid gap-1 overflow-y-auto">
            {options.map((option) => (
              <Button
                key={option.value}
                variant={option.value === value ? "secondary" : "ghost"}
                className="w-full justify-between"
                aria-pressed={option.value === value}
                onClick={() => void pick(option.value)}
              >
                {option.label}
                {option.value === value && (
                  <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />
                )}
              </Button>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
