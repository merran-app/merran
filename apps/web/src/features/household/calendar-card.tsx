import { MEALS } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { CopyField } from "@/components/form/copy-field"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { calendarSettingsQuery } from "@/features/plan/calendar-queries"
import { api, ApiError, unwrap, type Schemas } from "@/lib/api/client"

type Times = Schemas["CalendarMealTimes"]

/** Household calendar timing and each person's private subscription links. */
export function CalendarCard({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: settings } = useQuery(calendarSettingsQuery)
  const [times, setTimes] = React.useState<Times | null>(null)
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [newUrl, setNewUrl] = React.useState<string | null>(null)

  if (!settings) return null
  const pickedTimes = times ?? settings.times
  const pickedEnabled = enabled ?? settings.enabled

  function changeTime(
    meal: (typeof MEALS)[number],
    field: "start" | "minutes",
    value: string
  ) {
    setTimes({
      ...pickedTimes,
      [meal]: {
        ...pickedTimes[meal],
        [field]: field === "minutes" ? Number(value) : value,
      },
    })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const saved = await unwrap(
        api.PATCH("/api/plan/calendar", {
          body: { enabled: pickedEnabled, times: pickedTimes },
        })
      )
      queryClient.setQueryData(calendarSettingsQuery.queryKey, saved)
      setEnabled(null)
      setTimes(null)
      if (!saved.enabled) setNewUrl(null)
      toast.success(t("settings.household.calendar.saved"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function createLink() {
    setBusy(true)
    try {
      const link = await unwrap(api.POST("/api/plan/calendar/links"))
      setNewUrl(link.url)
      await queryClient.invalidateQueries({
        queryKey: calendarSettingsQuery.queryKey,
      })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(linkId: string) {
    setBusy(true)
    try {
      await unwrap(
        api.DELETE("/api/plan/calendar/links/{linkId}", {
          params: { path: { linkId } },
        })
      )
      setNewUrl(null)
      await queryClient.invalidateQueries({
        queryKey: calendarSettingsQuery.queryKey,
      })
      toast.success(t("settings.household.calendar.revoked"))
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      toast.error(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.calendar.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.calendar.description")}
        </CardDescription>
      </CardHeader>
      {canManage && (
        <form onSubmit={(event) => void save(event)}>
          <CardContent className="space-y-5">
            <Field orientation="horizontal">
              <Checkbox
                id="calendar-enabled"
                checked={pickedEnabled}
                onCheckedChange={(checked) => setEnabled(checked === true)}
              />
              <FieldLabel htmlFor="calendar-enabled">
                {t("settings.household.calendar.enable")}
              </FieldLabel>
            </Field>
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">
                  {t("settings.household.calendar.usualTimes")}
                </h3>
                <FieldDescription>
                  {t("settings.household.calendar.timeZoneHint")}
                </FieldDescription>
              </div>
              <div className="@container divide-y rounded-lg border">
                {MEALS.map((meal) => (
                  <div
                    key={meal}
                    role="group"
                    aria-labelledby={`calendar-${meal}-label`}
                    className="flex flex-col gap-3 p-4 @lg:flex-row @lg:items-center @lg:gap-6"
                  >
                    <h4
                      id={`calendar-${meal}-label`}
                      className="text-sm font-medium @lg:w-28 @lg:shrink-0"
                    >
                      {t(`plan.meals.${meal}`)}
                    </h4>
                    <div className="flex flex-col gap-3 @md:flex-row">
                      <Field className="@md:w-40">
                        <FieldLabel htmlFor={`calendar-${meal}-start`}>
                          {t("settings.household.calendar.startTime")}
                        </FieldLabel>
                        <Input
                          id={`calendar-${meal}-start`}
                          type="time"
                          required
                          value={pickedTimes[meal].start}
                          onChange={(event) =>
                            changeTime(meal, "start", event.target.value)
                          }
                        />
                      </Field>
                      <Field className="@md:w-40">
                        <FieldLabel htmlFor={`calendar-${meal}-duration`}>
                          {t("settings.household.calendar.duration")}
                        </FieldLabel>
                        <Input
                          id={`calendar-${meal}-duration`}
                          type="number"
                          min={15}
                          max={240}
                          required
                          value={pickedTimes[meal].minutes}
                          onChange={(event) =>
                            changeTime(meal, "minutes", event.target.value)
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {!pickedEnabled && settings.enabled && (
              <FieldDescription>
                {t("settings.household.calendar.disableWarning")}
              </FieldDescription>
            )}
          </CardContent>
          <CardFooter className="mt-6">
            <Button
              type="submit"
              disabled={busy || (times === null && enabled === null)}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t("settings.household.calendar.save")}
            </Button>
          </CardFooter>
        </form>
      )}
      {settings.enabled && (
        <CardContent className="space-y-4 border-t pt-5">
          <p className="text-sm text-muted-foreground">
            {t("settings.household.calendar.privacy")}
          </p>
          {!settings.publicUrlReady && (
            <p className="text-sm text-muted-foreground">
              {t("settings.household.calendar.publicUrlNeeded")}
            </p>
          )}
          <Button
            variant="outline"
            disabled={busy || !settings.publicUrlReady}
            onClick={() => void createLink()}
          >
            {t("settings.household.calendar.createLink")}
          </Button>
          {newUrl && (
            <CopyField
              label={t("settings.household.calendar.newLink")}
              value={newUrl}
              description={t("settings.household.calendar.shownOnce")}
            />
          )}
          {settings.links.length > 0 && (
            <ul className="divide-y rounded-2xl border">
              {settings.links.map((link) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <span className="text-sm text-muted-foreground">
                    {t("settings.household.calendar.created", {
                      date: new Date(link.createdAt).toLocaleDateString(
                        i18n.language
                      ),
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void revoke(link.id)}
                  >
                    {t("settings.household.calendar.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t("settings.household.calendar.refreshHint")}
          </p>
        </CardContent>
      )}
    </Card>
  )
}
