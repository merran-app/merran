import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useCapability } from "@/features/capabilities/queries"
import { CardActions } from "@/features/settings/card-actions"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { webhookScheduleQuery } from "./queries"

/**
 * Daily summary at: when the household's webhooks that want the daily
 * summary, or things to use soon, hear about the day. One time for the
 * household, on its own clock.
 */
export function DailySummaryCard() {
  const on = useCapability("webhooks")
  if (!on) return null
  return <DailySummaryForm />
}

function DailySummaryForm() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useSuspenseQuery(webhookScheduleQuery)
  // Null until it's changed, so a save elsewhere shows straight away.
  const [summaryAt, setSummaryAt] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const picked = summaryAt ?? data.summaryAt

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = await unwrap(
        api.PUT("/api/households/current/webhooks/schedule", {
          body: { summaryAt: picked },
        })
      )
      queryClient.setQueryData(webhookScheduleQuery.queryKey, saved)
      setSummaryAt(null)
      toast.success(t("settings.household.webhooks.schedule.saved"))
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.household.webhooks.schedule.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.webhooks.schedule.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void save(event)}>
        <CardContent>
          <Field>
            <FieldLabel htmlFor={id}>
              {t("settings.household.webhooks.schedule.summaryAt")}
            </FieldLabel>
            {/* A field stretches what's directly in it; a time needs only a little room. */}
            <div>
              <Input
                id={id}
                type="time"
                required
                className="w-40"
                value={picked}
                onChange={(event) => setSummaryAt(event.target.value)}
              />
            </div>
            <FieldDescription>
              {t("settings.household.webhooks.schedule.summaryAtHint")}
            </FieldDescription>
          </Field>
        </CardContent>
        <CardActions>
          <Button type="submit" disabled={saving || picked === data.summaryAt}>
            {saving && <Spinner data-icon="inline-start" />}
            {t("settings.household.webhooks.schedule.save")}
          </Button>
        </CardActions>
      </form>
    </Card>
  )
}
