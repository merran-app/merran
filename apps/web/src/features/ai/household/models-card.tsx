import { AI_TASKS, TASK_SIZES } from "@merran/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { CardActions } from "@/features/settings/card-actions"
import { api, ApiError, unwrap } from "@/lib/api/client"

import { ModelRow } from "../model-row"
import { ModelSelect } from "../model-select"
import {
  formatMoney,
  householdAiQuery,
  type HouseholdAi,
  type HouseholdAiSettings,
} from "../queries"
import { StatusLine } from "./status"

type AiTask = (typeof AI_TASKS)[number]
type Size = "large" | "small"

/**
 * Settings → AI: which model each task uses, a limit on the household's own
 * keys, and tidying up new recipes. Tasks sit under the model for their
 * size and follow it unless changed, so only the exceptions take room.
 * Household admins only.
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
  const anyPicked =
    picked.large ||
    picked.small ||
    picked.vision ||
    Object.keys(picked.tasks).length > 0

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: householdAiQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
      ])
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
            <div className="grid divide-y rounded-2xl border">
              {(["large", "small"] as const).map((size) => (
                <SizeGroup
                  key={size}
                  size={size}
                  id={`${id}-${size}`}
                  data={data}
                  picked={picked}
                  change={change}
                />
              ))}
              <ModelRow
                id={`${id}-vision`}
                label={t("ai.models.vision")}
                hint={t("ai.models.visionShortHint")}
                className="px-4 py-3"
              >
                <ModelSelect
                  id={`${id}-vision`}
                  value={picked.vision}
                  options={data.models}
                  noneLabel={t("ai.models.visionDefault")}
                  showSource
                  task="import"
                  onChange={(vision) => change({ vision })}
                />
              </ModelRow>
            </div>
          )}

          {data.keys.length > 0 && (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-limit`}>
                  {t("ai.household.ownLimit")}
                </FieldLabel>
                <FieldDescription>
                  {own.limit === null
                    ? t("ai.household.ownSpent", { spent: money(own.spent) })
                    : t("ai.household.ownSpentOf", {
                        spent: money(own.spent),
                        limit: money(own.limit),
                      })}
                </FieldDescription>
              </FieldContent>
              <Input
                id={`${id}-limit`}
                inputMode="decimal"
                className="w-28 shrink-0"
                placeholder={t("ai.policy.noLimit")}
                value={
                  limitText ??
                  (picked.monthlyLimit === null
                    ? ""
                    : String(picked.monthlyLimit))
                }
                onChange={(event) => setLimitText(event.target.value)}
              />
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
          {anyPicked && data.models.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                change({ large: null, small: null, tasks: {}, vision: null })
              }
            >
              {t("ai.models.useSuggested")}
            </Button>
          )}
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

/**
 * The model for big or small tasks, and under it the tasks of that size.
 * Folded to one line while none of them is changed; a changed task always
 * shows, marked, so the exceptions are what you see.
 */
function SizeGroup({
  size,
  id,
  data,
  picked,
  change,
}: {
  size: Size
  id: string
  data: HouseholdAi
  picked: HouseholdAiSettings
  change: (next: Partial<HouseholdAiSettings>) => void
}) {
  const { t } = useTranslation()
  const tasks = AI_TASKS.filter((task) => TASK_SIZES[task] === size)
  const changed = tasks.some((task) => picked.tasks[task])
  const [open, setOpen] = React.useState(changed)
  const showTasks = open || changed

  function pickForTask(task: AiTask, ref: string | null) {
    const next = { ...picked.tasks }
    if (ref) next[task] = ref
    else delete next[task]
    change({ tasks: next })
  }

  return (
    <div className="grid">
      <ModelRow
        id={id}
        label={t(`ai.models.${size}`)}
        hint={t(`ai.models.${size}ShortHint`)}
        className="px-4 py-3"
      >
        <ModelSelect
          id={id}
          value={picked[size]}
          options={data.models}
          noneLabel={t("ai.models.default")}
          showSource
          task={size === "large" ? "import" : "swaps"}
          onChange={(ref) => change({ [size]: ref })}
        />
      </ModelRow>
      {showTasks ? (
        <ul className="grid border-t bg-muted/30">
          {tasks.map((task) => (
            <li key={task} className="border-b last:border-b-0">
              <ModelRow
                id={`${id}-${task}`}
                label={
                  <span className="inline-flex flex-wrap items-center gap-2 font-normal">
                    {t(`ai.tasks.${task}`)}
                    {picked.tasks[task] && (
                      <Badge variant="secondary">
                        {t("ai.models.changed")}
                      </Badge>
                    )}
                  </span>
                }
                className="py-2 ps-8 pe-4"
              >
                <ModelSelect
                  id={`${id}-${task}`}
                  value={picked.tasks[task] ?? null}
                  options={data.models}
                  noneLabel={t(`ai.models.${size}Default`)}
                  showSource
                  task={task}
                  onChange={(ref) => pickForTask(task, ref)}
                />
              </ModelRow>
            </li>
          ))}
          {!changed && (
            <li className="flex justify-end px-4 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setOpen(false)}
              >
                {t("ai.models.hideTasks")}
              </Button>
            </li>
          )}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 py-2 ps-8 pe-4 text-sm text-muted-foreground">
          <span className="min-w-0">
            {t("ai.models.tasksUse", {
              count: tasks.length,
              tasks: tasks.map((task) => t(`ai.tasks.${task}`)).join(", "),
            })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            {t("ai.models.changeOne")}
          </Button>
        </div>
      )}
    </div>
  )
}
