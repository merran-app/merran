import {
  AI_TASKS,
  catalogModel,
  SERVER_KEYS_FOR,
  type AiTask,
} from "@merran/shared"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { capabilitiesQuery } from "@/features/capabilities/queries"
import { api, ApiError, unwrap } from "@/lib/api/client"
import { CardActions } from "@/features/settings/card-actions"

import { AiKeys } from "./ai-keys"
import { ModelSelect } from "./model-select"
import {
  householdAiQuery,
  serverAiQuery,
  type AiPolicy,
  type ServerAi,
} from "./queries"
import { BarList } from "./spend/bar-list"
import { lastSixMonths, thisMonth } from "./spend/months"
import { MonthsChart } from "./spend/months-chart"
import { SpendMeter } from "./spend/spend-meter"
import { SpendTotal } from "./spend/spend-total"

/** Reads a money field: blank for none. */
const dollars = (text: string) => {
  const value = Number(text.replace(/[^0-9.]/g, ""))
  return text.trim() === "" || Number.isNaN(value) ? null : value
}

function useRefreshAi() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: serverAiQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: householdAiQuery.queryKey }),
      queryClient.invalidateQueries({ queryKey: capabilitiesQuery.queryKey }),
    ])
}

/** Settings → AI → Whole server → AI keys: the server's keys and addresses. */
export function ServerAiKeysCard() {
  const { t } = useTranslation()
  const { data } = useQuery(serverAiQuery)
  const refresh = useRefreshAi()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.server.keysTitle")}</CardTitle>
        <CardDescription>{t("ai.server.keysDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {data?.keys.some((key) => key.outOfCreditAt) && (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("ai.server.outOfCredit")}
          </p>
        )}
        {data?.keys.some((key) => key.lowOnCredit) && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-sm">
            {t("ai.server.lowOnCredit")}
          </p>
        )}
        {!data ? (
          <Skeleton className="h-24" />
        ) : (
          <AiKeys
            keys={data.keys}
            canAddKeys
            canAddAddresses
            onAdd={async (key) => {
              const added = await unwrap(
                api.POST("/api/settings/server/ai/keys", { body: key })
              )
              await refresh()
              return added
            }}
            onRemove={async (key) => {
              await unwrap(
                api.DELETE("/api/settings/server/ai/keys/{keyId}", {
                  params: { path: { keyId: key.id } },
                })
              )
              await refresh()
            }}
            onTest={async (key) => {
              const tested = await unwrap(
                api.POST("/api/settings/server/ai/keys/{keyId}/test", {
                  params: { path: { keyId: key.id } },
                })
              )
              await refresh()
              return tested
            }}
            onSetCredit={async (key, amount) => {
              await unwrap(
                api.PUT("/api/settings/server/ai/keys/{keyId}/credit", {
                  params: { path: { keyId: key.id } },
                  body: { amount },
                })
              )
              await refresh()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Settings → AI → Whole server → Who may use the server's AI: which households,
 * how much a month, which tasks and models, and whether households may
 * bring keys and addresses of their own.
 */
export function ServerAiPolicyCard() {
  const { t } = useTranslation()
  const { data } = useQuery(serverAiQuery)
  const refresh = useRefreshAi()
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState<AiPolicy | null>(null)
  const [limitText, setLimitText] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  if (!data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    )
  }
  const policy = draft ?? data.policy
  const change = (next: Partial<AiPolicy>) => setDraft({ ...policy, ...next })
  const who = SERVER_KEYS_FOR.map((value) => ({
    value,
    label: t(`ai.policy.who.${value}`),
  }))

  async function save() {
    setSaving(true)
    try {
      const body: AiPolicy = {
        ...policy,
        monthlyLimit:
          limitText === null ? policy.monthlyLimit : dollars(limitText),
      }
      queryClient.setQueryData(
        serverAiQuery.queryKey,
        await unwrap(api.PUT("/api/settings/server/ai/policy", { body }))
      )
      await refresh()
      setDraft(null)
      setLimitText(null)
      toast.success(t("ai.policy.saved"))
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
        <CardTitle>{t("ai.policy.title")}</CardTitle>
        <CardDescription>{t("ai.policy.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-who`}>
              {t("ai.policy.whoLabel")}
            </FieldLabel>
            <Select
              items={who}
              value={policy.serverKeysFor}
              onValueChange={(value) => {
                if (value)
                  change({ serverKeysFor: value as AiPolicy["serverKeysFor"] })
              }}
            >
              <SelectTrigger id={`${id}-who`} className="w-full sm:w-96">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {who.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {policy.serverKeysFor === "chosen" && (
              <ul className="mt-1 grid gap-2">
                {data.households.map((household) => (
                  <li key={household.id}>
                    <Field orientation="horizontal">
                      <Checkbox
                        id={`${id}-h-${household.id}`}
                        checked={policy.households.includes(household.id)}
                        onCheckedChange={(checked) =>
                          change({
                            households: checked
                              ? [...policy.households, household.id]
                              : policy.households.filter(
                                  (h) => h !== household.id
                                ),
                          })
                        }
                      />
                      <FieldLabel
                        htmlFor={`${id}-h-${household.id}`}
                        className="font-normal"
                      >
                        {household.name}
                      </FieldLabel>
                    </Field>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-limit`}>
              {t("ai.policy.limit")}
            </FieldLabel>
            <Input
              id={`${id}-limit`}
              inputMode="decimal"
              className="max-w-40"
              placeholder={t("ai.policy.noLimit")}
              value={
                limitText ??
                (policy.monthlyLimit === null
                  ? ""
                  : String(policy.monthlyLimit))
              }
              onChange={(event) => setLimitText(event.target.value)}
            />
            <FieldDescription>{t("ai.policy.limitHint")}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>{t("ai.policy.tasks")}</FieldLabel>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              value={policy.tasks}
              onValueChange={(value) => change({ tasks: value as AiTask[] })}
              className="flex-wrap justify-start"
            >
              {AI_TASKS.map((task) => (
                <ToggleGroupItem key={task} value={task}>
                  {t(`ai.tasks.${task}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel>{t("ai.policy.models")}</FieldLabel>
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-any`}
                checked={policy.models.length === 0}
                onCheckedChange={(checked) =>
                  change({
                    models: checked
                      ? []
                      : data.models.map((model) => model.ref),
                  })
                }
              />
              <FieldLabel htmlFor={`${id}-any`} className="font-normal">
                {t("ai.policy.anyModel")}
              </FieldLabel>
            </Field>
            {policy.models.length > 0 && (
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={policy.models}
                onValueChange={(value) => {
                  if (value.length) change({ models: value })
                }}
                className="flex-wrap justify-start"
              >
                {data.models.map((model) => (
                  <ToggleGroupItem key={model.ref} value={model.ref}>
                    {model.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-large`}>
              {t("ai.models.large")}
            </FieldLabel>
            <ModelSelect
              id={`${id}-large`}
              value={policy.large}
              options={data.models}
              task="import"
              noneLabel={t("ai.models.keyDefault")}
              onChange={(large) => change({ large })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-small`}>
              {t("ai.models.small")}
            </FieldLabel>
            <ModelSelect
              id={`${id}-small`}
              value={policy.small}
              options={data.models}
              task="swaps"
              noneLabel={t("ai.models.keyDefault")}
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
              value={policy.vision}
              options={data.models}
              task="import"
              noneLabel={t("ai.models.visionDefault")}
              onChange={(vision) => change({ vision })}
            />
            <FieldDescription>{t("ai.models.visionHint")}</FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-keys`}>
                {t("ai.policy.householdKeys")}
              </FieldLabel>
              <FieldDescription>
                {t("ai.policy.householdKeysHint")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${id}-keys`}
              checked={policy.householdKeys}
              onCheckedChange={(householdKeys) => change({ householdKeys })}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-addresses`}>
                {t("ai.policy.householdAddresses")}
              </FieldLabel>
              <FieldDescription>
                {t("ai.policy.householdAddressesHint")}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${id}-addresses`}
              checked={policy.householdAddresses}
              onCheckedChange={(householdAddresses) =>
                change({ householdAddresses })
              }
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardActions>
        <Button
          disabled={(draft === null && limitText === null) || saving}
          onClick={() => void save()}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {t("ai.policy.save")}
        </Button>
      </CardActions>
    </Card>
  )
}

/** Settings → AI → Whole server → AI spend: on the server's keys, by household, month and model. */
export function ServerAiSpendCard() {
  const { t } = useTranslation()
  const { data } = useQuery(serverAiQuery)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.spend.serverTitle")}</CardTitle>
        <CardDescription>{t("ai.spend.serverDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        {!data ? <Skeleton className="h-40" /> : <ServerSpend data={data} />}
      </CardContent>
    </Card>
  )
}

function ServerSpend({ data }: { data: ServerAi }) {
  const { t } = useTranslation()
  const current = thisMonth()
  const months = lastSixMonths(
    data.usage.months.map((month) => ({
      month: month.month,
      server: month.cost,
      own: 0,
      calls: month.calls,
    })),
    current
  )
  const nothingYet = months.every((month) => month.calls === 0)

  return (
    <>
      <SpendTotal months={months} current={current} />

      {data.households.length > 0 && (
        <section className="grid gap-4">
          <h3 className="font-sans text-sm font-medium">
            {t("ai.spend.byHousehold")}
          </h3>
          <div className="grid gap-6 sm:grid-cols-2">
            {data.households.map((household) => (
              <SpendMeter
                key={household.id}
                label={household.name}
                spent={household.spent}
                // A household the server's keys don't cover has no limit on them.
                limit={household.covered ? household.limit : null}
                series="server"
                near={household.covered && household.near}
                status={
                  !household.covered && (
                    <Badge variant="outline">{t("ai.spend.notCovered")}</Badge>
                  )
                }
              />
            ))}
          </div>
        </section>
      )}

      {nothingYet ? (
        <p className="text-sm text-muted-foreground">
          {t("ai.spend.nothingYet")}
        </p>
      ) : (
        <>
          <MonthsChart months={months} current={current} showOwn={false} />
          <BarList
            title={t("ai.spend.byModel")}
            items={data.usage.models.map((model) => ({
              key: `${model.provider} ${model.model}`,
              label:
                catalogModel(model.provider, model.model)?.name ?? model.model,
              cost: model.cost,
            }))}
          />
        </>
      )}
    </>
  )
}
