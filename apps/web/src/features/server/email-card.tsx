import { useSuspenseQuery } from "@tanstack/react-query"
import * as React from "react"
import { Controller } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { LockedNote, SettingInput } from "@/features/settings/setting-fields"
import { SetupHelp } from "@/features/settings/setup-help"
import {
  fieldName,
  useSettingsForm,
} from "@/features/settings/use-settings-form"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { serverSettingsQuery, useSaveServerSettings } from "./queries"
import { ServerSwitch } from "./server-switch"

const KEYS = [
  "email.host",
  "email.port",
  "email.security",
  "email.username",
  "email.password",
  "email.from",
] as const

export function EmailCard() {
  const { t } = useTranslation()
  const { data } = useSuspenseQuery(serverSettingsQuery)
  const save = useSaveServerSettings()
  const [testing, setTesting] = React.useState(false)
  const securityId = React.useId()
  const settings = useSettingsForm(data.settings, KEYS, async (changes) => {
    await save(changes)
    settings.form.reset({
      ...settings.form.getValues(),
      [fieldName("email.password")]: "",
    })
    toast.success(t("settings.server.email.saved"))
  })
  const { isDirty, isSubmitting, errors } = settings.form.formState
  const security = settings.stateOf("email.security")
  const password = settings.stateOf("email.password")
  const enabled =
    data.settings.find((s) => s.key === "email.enabled")?.value === true
  const allLocked = KEYS.every((key) => settings.stateOf(key).lockedBy)

  async function test() {
    setTesting(true)
    try {
      await unwrap(api.POST("/api/settings/server/email/test"))
      toast.success(t("settings.server.email.accepted"))
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
        <CardTitle>{t("settings.server.email.title")}</CardTitle>
        <CardDescription>
          {t("settings.server.email.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={settings.onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            <ServerSwitch
              settingKey="email.enabled"
              label={t("settings.server.email.enabled")}
              description={t("settings.server.email.enabledHint")}
            />
            <SetupHelp
              title={t("settings.server.email.setup.title")}
              steps={[
                t("settings.server.email.setup.provider"),
                t("settings.server.email.setup.resend"),
                t("settings.server.email.setup.test"),
              ]}
              links={[
                {
                  label: t("settings.server.email.setup.link"),
                  href: "https://resend.com/docs/send-with-smtp",
                },
              ]}
            />
            {errors.root && (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-6 sm:grid-cols-2">
              <SettingInput
                settings={settings}
                settingKey="email.host"
                label={t("settings.server.email.host")}
                placeholder="smtp.resend.com"
                autoComplete="off"
              />
              <SettingInput
                settings={settings}
                settingKey="email.port"
                label={t("settings.server.email.port")}
                min={1}
                max={65535}
                step={1}
              />
            </div>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={securityId}>
                  {t("settings.server.email.tls")}
                </FieldLabel>
                <FieldDescription>
                  {security.lockedBy ? (
                    <LockedNote state={security} />
                  ) : (
                    t("settings.server.email.tlsHint")
                  )}
                </FieldDescription>
              </FieldContent>
              <Controller
                name={fieldName("email.security")}
                control={settings.form.control}
                render={({ field }) => (
                  <Switch
                    id={securityId}
                    checked={field.value === "tls"}
                    onCheckedChange={(value) =>
                      field.onChange(value ? "tls" : "starttls")
                    }
                    disabled={security.lockedBy !== null}
                  />
                )}
              />
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <SettingInput
                settings={settings}
                settingKey="email.username"
                label={t("settings.server.email.username")}
                description={t("settings.server.email.usernameHint")}
                autoComplete="off"
              />
              <SettingInput
                settings={settings}
                settingKey="email.password"
                label={t("settings.server.email.password")}
                description={
                  password.secret?.set
                    ? t("settings.server.email.passwordSet")
                    : t("settings.server.email.passwordHint")
                }
                type="password"
                autoComplete="new-password"
              />
            </div>
            <SettingInput
              settings={settings}
              settingKey="email.from"
              label={t("settings.server.email.from")}
              type="email"
              placeholder="invites@example.com"
            />
            <p className="text-sm text-muted-foreground">
              {t("settings.server.email.testHint")}
            </p>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex-wrap justify-end gap-2">
          {password.secret?.set &&
            !password.lockedBy &&
            !settings.stateOf("email.username").lockedBy && (
              <Button
                type="button"
                variant="outline"
                disabled={isDirty || isSubmitting || testing}
                onClick={async () => {
                  try {
                    await save({
                      "email.username": null,
                      "email.password": null,
                    })
                    toast.success(t("settings.server.email.saved"))
                  } catch (error) {
                    if (!(error instanceof ApiError)) throw error
                    toast.error(error.message)
                  }
                }}
              >
                {t("settings.server.email.removeCredentials")}
              </Button>
            )}
          <Button
            type="button"
            variant="outline"
            disabled={!enabled || isDirty || isSubmitting || testing}
            onClick={() => void test()}
          >
            {testing && <Spinner />}
            {t("settings.server.email.test")}
          </Button>
          {!allLocked && (
            <Button
              type="submit"
              disabled={!isDirty || isSubmitting || testing}
            >
              {isSubmitting && <Spinner />}
              {t("common.save")}
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  )
}
