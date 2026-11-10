import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AI_TASKS, TASK_SIZES } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { CardActions, SectionActions } from "@/features/settings/card-actions"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ModelSelect } from "../model-select"
import {
  formatMoney,
  householdAiQuery,
  type HouseholdAiSettings,
} from "../queries"
import { StatusLine } from "./status"

/**
 * Settings → AI: which model each task uses, a limit on the household's own
 * keys, and tidying up new recipes. Household admins only.
 */
export function HouseholdAiModelsCard() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data } = useQuery(householdAiQuery)
  const [draft, setDraft] = React.useState<HouseholdAiSettings | null>(null)
  const [limitText, setLimitText] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const money = (dollars: number) => formatMoney(dollars, i18n.language)
  // A household's first key can turn AI on for the server.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: householdAiQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
    ])

  if (!data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    )
  }
  const picked = draft ?? data.settings
  const change = (next: Partial<HouseholdAiSettings>) =>
    setDraft({ ...picked, ...next })
  const { own } = data.status

  async function save() {
    setSaving(true)
    try {
      const text = limitText
      const limit =
        text === null
          ? picked.monthlyLimit
          : text.trim() === ""
            ? null
            : Number(text.replace(/[^0-9.]/g, ""))
      await unwrap(
        api.PUT("/api/households/current/ai", {
          body: { ...picked, monthlyLimit: limit },
        })
      )
      await refresh()
      setDraft(null)
      setLimitText(null)
      toast.success(t("ai.household.saved"))
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
        <CardTitle>{t("ai.household.modelsTitle")}</CardTitle>
        <CardDescription>{t("ai.household.modelsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <StatusLine data={data} />

          {data.models.length > 0 && (
            <>
              <Field>
                <FieldLabel htmlFor={`${id}-large`}>
                  {t("ai.models.large")}
                </FieldLabel>
                <ModelSelect
                  id={`${id}-large`}
                  value={picked.large}
                  options={data.models}
                  noneLabel={t("ai.models.default")}
                  showSource
                  task="import"
                  onChange={(large) => change({ large })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-small`}>
                  {t("ai.models.small")}
                </FieldLabel>
                <ModelSelect
                  id={`${id}-small`}
                  value={picked.small}
                  options={data.models}
                  noneLabel={t("ai.models.default")}
                  showSource
                  task="swaps"
                  onChange={(small) => change({ small })}
                />
                <FieldDescription>{t("ai.models.sizesHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-vision`}>
                  {t("ai.models.vision")}
                </FieldLabel>
                <ModelSelect
                  id={`${id}-vision`}
                  value={picked.vision}
                  options={data.models}
                  noneLabel={t("ai.models.visionDefault")}
                  showSource
                  task="import"
                  onChange={(vision) => change({ vision })}
                />
                <FieldDescription>{t("ai.models.visionHint")}</FieldDescription>
              </Field>
              {(picked.large ||
                picked.small ||
                picked.vision ||
                Object.keys(picked.tasks).length > 0) && (
                <SectionActions>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      change({
                        large: null,
                        small: null,
                        tasks: {},
                        vision: null,
                      })
                    }
                  >
                    {t("ai.models.useSuggested")}
                  </Button>
                </SectionActions>
              )}
              <Collapsible>
                <CollapsibleTrigger
                  render={
                    <Button variant="ghost" size="sm" className="group -ms-3" />
                  }
                >
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    strokeWidth={2}
                    className="transition-transform group-data-[panel-open]:rotate-180"
                  />
                  {t("ai.models.perTask")}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 grid gap-4">
                  {AI_TASKS.map((task) => (
                    <Field key={task}>
                      <FieldLabel htmlFor={`${id}-${task}`}>
                        {t(`ai.tasks.${task}`)}
                      </FieldLabel>
                      <ModelSelect
                        id={`${id}-${task}`}
                        value={picked.tasks[task] ?? null}
                        options={data.models}
                        noneLabel={t(`ai.models.${TASK_SIZES[task]}Default`)}
                        showSource
                        task={task}
                        onChange={(ref) => {
                          const tasks = { ...picked.tasks }
                          if (ref) tasks[task] = ref
                          else delete tasks[task]
                          change({ tasks })
                        }}
                      />
                    </Field>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {data.keys.length > 0 && (
            <Field>
              <FieldLabel htmlFor={`${id}-limit`}>
                {t("ai.household.ownLimit")}
              </FieldLabel>
              <Input
                id={`${id}-limit`}
                inputMode="decimal"
                className="max-w-40"
                placeholder={t("ai.policy.noLimit")}
                value={
                  limitText ??
                  (picked.monthlyLimit === null
                    ? ""
                    : String(picked.monthlyLimit))
                }
                onChange={(event) => setLimitText(event.target.value)}
              />
              <FieldDescription>
                {own.limit === null
                  ? t("ai.household.ownSpent", { spent: money(own.spent) })
                  : t("ai.household.ownSpentOf", {
                      spent: money(own.spent),
                      limit: money(own.limit),
                    })}
              </FieldDescription>
            </Field>
          )}

          {data.status.available && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-tidy`}>
                  {t("ai.household.autoTidy")}
                </FieldLabel>
                <FieldDescription>
                  {t("ai.household.autoTidyHint")}
                </FieldDescription>
              </FieldContent>
              <Switch
                id={`${id}-tidy`}
                checked={picked.autoTidy}
                onCheckedChange={(autoTidy) => change({ autoTidy })}
              />
            </Field>
          )}
        </FieldGroup>
      </CardContent>
      {/* Something to save: models to pick, or a limit on its own keys. */}
      {(data.models.length > 0 || data.keys.length > 0) && (
        <CardActions>
          <Button
            disabled={(draft === null && limitText === null) || saving}
            onClick={() => void save()}
          >
            {saving && <Spinner data-icon="inline-start" />}
            {t("ai.household.save")}
          </Button>
        </CardActions>
      )}
    </Card>
  )
}
