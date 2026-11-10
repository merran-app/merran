import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldContent, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { listQuery } from "@/features/list/queries"
import { pantryQuery } from "@/features/pantry/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { householdQuery } from "./queries"

/**
 * Settings → Shopping and stores → Pantry: whether checking a row off the list puts
 * it in the pantry. Household admins only; the change saves straight away.
 */
export function PantryCard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: household } = useQuery(householdQuery)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()

  async function save(putAwayWhenChecked: boolean) {
    setSaving(true)
    try {
      queryClient.setQueryData(
        householdQuery.queryKey,
        await unwrap(
          api.PATCH("/api/households/current", {
            body: { putAwayWhenChecked },
          })
        )
      )
      // Turning it on puts away the rows that are already checked, so the
      // pantry and the list have both changed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pantryQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: listQuery.queryKey }),
      ])
      toast.success(t("settings.household.pantry.saved"))
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
        <CardTitle>{t("settings.household.pantry.title")}</CardTitle>
        <CardDescription>
          {t("settings.household.pantry.putAwayHint")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!household ? (
          <Skeleton className="h-10" />
        ) : (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel id={`${id}-label`} htmlFor={id}>
                {t("settings.household.pantry.putAway")}
              </FieldLabel>
            </FieldContent>
            {saving && <Spinner />}
            <Switch
              id={id}
              aria-labelledby={`${id}-label`}
              checked={household.putAwayWhenChecked}
              onCheckedChange={(on) => void save(on)}
              disabled={saving}
            />
          </Field>
        )}
      </CardContent>
    </Card>
  )
}
