import * as React from "react"
import { DEFAULT_MEALS, MEALS, type Meal } from "@merran/shared"
import { weekdayNames } from "@/lib/format"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SelectField } from "@/components/form/select-field"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { householdQuery } from "@/features/household/queries"
import { api, unwrap } from "@/lib/api/client"
import { useOnboarding } from "./onboarding-context"

export function HouseholdReview() {
  const { t } = useTranslation()
  const household = useQuery(householdQuery)
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        {t("onboarding.review")}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("onboarding.review")}</DialogTitle>
          <DialogDescription>{t("onboarding.reviewHint")}</DialogDescription>
        </DialogHeader>
        {household.data ? (
          <ReviewForm close={() => setOpen(false)} />
        ) : (
          <Button onClick={() => void household.refetch()}>
            {t("onboarding.retry")}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReviewForm({ close }: { close: () => void }) {
  const { t, i18n } = useTranslation()
  const { data } = useQuery(householdQuery)
  const { data: onboarding, update } = useOnboarding()
  const client = useQueryClient()
  const [zone, setZone] = React.useState(() => {
    if (data && (onboarding?.reviewed || data.timeZone !== "UTC"))
      return data.timeZone
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    } catch {
      return "UTC"
    }
  })
  const [week, setWeek] = React.useState(data?.weekStartsOn ?? 1)
  const [meals, setMeals] = React.useState<Meal[]>(
    data?.meals ?? [...DEFAULT_MEALS]
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const zones = React.useMemo(() => {
    let supported: string[] = []
    try {
      supported = Intl.supportedValuesOf("timeZone")
    } catch {
      /* The detected and existing zones still work on older browsers. */
    }
    return [...new Set(["UTC", zone, data?.timeZone ?? "UTC", ...supported])]
      .sort()
      .map((value) => ({ value, label: value.replaceAll("_", " ") }))
  }, [zone, data?.timeZone])
  async function save() {
    setBusy(true)
    setError("")
    try {
      const saved = await unwrap(
        api.PATCH("/api/households/current", {
          body: { timeZone: zone, weekStartsOn: week, meals },
        })
      )
      client.setQueryData(householdQuery.queryKey, saved)
      await client.invalidateQueries({ queryKey: ["plan"] })
      if (await update({ reviewed: true })) close()
    } catch {
      setError(t("onboarding.saveFailed"))
    } finally {
      setBusy(false)
    }
  }
  if (!data) return <p>{t("settings.household.details.title")}</p>
  return (
    <div className="grid gap-5">
      <SelectField
        label={t("settings.household.details.timeZone")}
        description={t("onboarding.zoneHint")}
        value={zone}
        onChange={setZone}
        options={zones}
      />
      <SelectField
        label={t("settings.household.details.weekStartsOn")}
        value={week}
        onChange={setWeek}
        options={weekdayNames(i18n.language).map((label, value) => ({
          value,
          label,
        }))}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-medium">
          {t("settings.household.planning.meals")}
        </legend>
        {MEALS.map((meal) => (
          <Field key={meal} orientation="horizontal">
            <Checkbox
              id={`review-${meal}`}
              checked={meals.includes(meal)}
              disabled={meals.length === 1 && meals.includes(meal)}
              onCheckedChange={(checked) =>
                setMeals(
                  MEALS.filter((option) =>
                    option === meal ? checked : meals.includes(option)
                  )
                )
              }
            />
            <FieldLabel htmlFor={`review-${meal}`}>
              {t(`plan.meals.${meal}`)}
            </FieldLabel>
          </Field>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        {t("onboarding.unitsHint")}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={busy}>
          {t("common.save")}
        </Button>
        <Button variant="ghost" onClick={close} disabled={busy}>
          {t("onboarding.later")}
        </Button>
      </div>
    </div>
  )
}
