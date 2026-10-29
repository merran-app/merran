import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { SettingInput } from "@/features/settings/setting-fields"
import { useSettingsForm } from "@/features/settings/use-settings-form"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { serverSettingsQuery, useSaveServerSettings } from "./queries"

const KEYS = ["flaresolverr.url"] as const

/**
 * FlareSolverr: the server admin's own, for importing links from sites
 * that turn servers away, with a test that it answers.
 */
export function FlareSolverrCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const [testing, setTesting] = React.useState(false)
  const settings = useSettingsForm(data.settings, KEYS, async (changes) => {
    await save(changes)
    toast.success(t("settings.server.flaresolverr.saved"))
  })
  const { errors, isDirty, isSubmitting } = settings.form.formState
  const address = settings.stateOf("flaresolverr.url")
  const on = Boolean(address.value)

  async function test() {
    setTesting(true)
    try {
      const { version } = await unwrap(
        api.POST("/api/settings/server/flaresolverr/test")
      )
      toast.success(
        version
          ? t("settings.server.flaresolverr.ready", { version })
          : t("settings.server.flaresolverr.readyNoVersion")
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.server.flaresolverr.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.flaresolverr.description")}
        </CardDescription>
        <CardAction>
          <Badge variant={on ? "default" : "secondary"}>
            {on ? t("common.on") : t("common.off")}
          </Badge>
        </CardAction>
      </CardHeader>
      <form onSubmit={settings.onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <SettingInput
              settings={settings}
              settingKey="flaresolverr.url"
              label={t("settings.server.flaresolverr.url")}
              description={t("settings.server.flaresolverr.urlHint")}
              placeholder="http://flaresolverr:8191"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-wrap justify-between gap-x-4 gap-y-3">
          {/* Beside Test, which it explains, rather than on a line of its own. */}
          <p className="text-sm text-muted-foreground">
            {t("settings.server.flaresolverr.testHint")}
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!on || isDirty || isSubmitting || testing}
              onClick={() => void test()}
            >
              {testing && <Spinner />}
              {t("settings.server.flaresolverr.test")}
            </Button>
            {!address.lockedBy && (
              <Button
                type="submit"
                disabled={!isDirty || isSubmitting || testing}
              >
                {isSubmitting && <Spinner />}
                {t("common.save")}
              </Button>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
