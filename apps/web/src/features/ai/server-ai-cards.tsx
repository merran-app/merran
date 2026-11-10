import {
  AI_TASKS,
  catalogModel,
  PROVIDER_NAMES,
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
import { ModelRow } from "./model-row"
import { ModelSelect } from "./model-select"
import {
  formatMoney,
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
  const { t, i18n } = useTranslation()
  const { data } = useQuery(serverAiQuery)
  const refresh = useRefreshAi()
  const queryClient = useQueryClient()
  const [draft, setDraft] = React.useState<AiPolicy | null>(null)
  const [limitText, setLimitText] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [tasksOpen, setTasksOpen] = React.useState(false)
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
  const limit = limitText === null ? policy.monthlyLimit : dollars(limitText)
  const anyModel = policy.models.length === 0
  const groups = groupModels(data.models, t("ai.keys.address"))

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

  /** Picks within one provider's models, keeping the others as they are. */
  function pickInGroup(refs: string[], picked: string[]) {
    const others = policy.models.filter((ref) => !refs.includes(ref))
    const next = [...others, ...picked]
    if (next.length) change({ models: next })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.policy.title")}</CardTitle>
        <CardDescription>{t("ai.policy.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid">
        <PolicySection
          title={t("ai.policy.covered")}
          summary={[
            t("ai.policy.coveredCount", {
              count: coveredCount(policy, data.households),
              total: data.households.length,
            }),
            limit === null
              ? t("ai.policy.noLimit")
              : t("ai.policy.upToEach", {
                  limit: formatMoney(limit, i18n.language),
                }),
          ].join(" · ")}
          control={
            <Select
              items={who}
              value={policy.serverKeysFor}
              onValueChange={(value) => {
                if (value)
                  change({ serverKeysFor: value as AiPolicy["serverKeysFor"] })
              }}
            >
              <SelectTrigger
                id={`${id}-who`}
                aria-label={t("ai.policy.whoLabel")}
                className="w-full sm:w-64"
              >
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
          }
        >
          {policy.serverKeysFor === "chosen" && (
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              aria-label={t("ai.policy.who.chosen")}
              value={policy.households}
              onValueChange={(households) => change({ households })}
              className="flex-wrap justify-start"
            >
              {data.households.map((household) => (
                <ToggleGroupItem key={household.id} value={household.id}>
                  {household.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`${id}-limit`}>
                {t("ai.policy.limit")}
              </FieldLabel>
              <FieldDescription>{t("ai.policy.limitHint")}</FieldDescription>
            </FieldContent>
            <Input
              id={`${id}-limit`}
              inputMode="decimal"
              className="w-28 shrink-0"
              placeholder={t("ai.policy.noLimit")}
              value={
                limitText ??
                (policy.monthlyLimit === null
                  ? ""
                  : String(policy.monthlyLimit))
              }
              onChange={(event) => setLimitText(event.target.value)}
            />
          </Field>
        </PolicySection>

        <PolicySection
          title={t("ai.policy.tasks")}
          summary={
            policy.tasks.length === AI_TASKS.length
              ? t("ai.policy.allOf", { count: AI_TASKS.length })
              : t("ai.policy.someOf", {
                  count: policy.tasks.length,
                  total: AI_TASKS.length,
                })
          }
          control={
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={tasksOpen}
              onClick={() => setTasksOpen(!tasksOpen)}
            >
              {tasksOpen ? t("ai.policy.done") : t("ai.policy.change")}
            </Button>
          }
        >
          {tasksOpen && (
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              aria-label={t("ai.policy.tasks")}
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
          )}
        </PolicySection>

        <PolicySection
          title={t("ai.policy.models")}
          summary={
            anyModel
              ? t("ai.policy.anyModel")
              : t("ai.policy.pickedOf", {
                  count: policy.models.length,
                  total: data.models.length,
                })
          }
          control={
            <span className="flex items-center gap-2 text-sm">
              <Switch
                id={`${id}-any`}
                checked={anyModel}
                onCheckedChange={(any) =>
                  change({
                    models: any ? [] : data.models.map((model) => model.ref),
                  })
                }
              />
              <label htmlFor={`${id}-any`}>{t("ai.policy.anyModel")}</label>
            </span>
          }
        >
          {!anyModel && (
            <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-4">
              {groups.map((group) => (
                <React.Fragment key={group.name}>
                  <span className="pt-1 text-sm text-muted-foreground">
                    {group.name}
                  </span>
                  <ToggleGroup
                    multiple
                    variant="outline"
                    size="sm"
                    aria-label={group.name}
                    value={policy.models.filter((ref) =>
                      group.models.some((model) => model.ref === ref)
                    )}
                    onValueChange={(picked) =>
                      pickInGroup(
                        group.models.map((model) => model.ref),
                        picked
                      )
                    }
                    className="flex-wrap justify-start"
                  >
                    {group.models.map((model) => (
                      <ToggleGroupItem key={model.ref} value={model.ref}>
                        {model.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </React.Fragment>
              ))}
            </div>
          )}
        </PolicySection>

        <PolicySection
          title={t("ai.policy.startWith")}
          summary={t("ai.policy.startWithHint")}
        >
          <div className="grid gap-3">
            <ModelRow id={`${id}-large`} label={t("ai.models.large")}>
              <ModelSelect
                id={`${id}-large`}
                value={policy.large}
                options={data.models}
                task="import"
                noneLabel={t("ai.models.keyDefault")}
                onChange={(large) => change({ large })}
              />
            </ModelRow>
            <ModelRow id={`${id}-small`} label={t("ai.models.small")}>
              <ModelSelect
                id={`${id}-small`}
                value={policy.small}
                options={data.models}
                task="swaps"
                noneLabel={t("ai.models.keyDefault")}
                onChange={(small) => change({ small })}
              />
            </ModelRow>
            <ModelRow id={`${id}-vision`} label={t("ai.models.vision")}>
              <ModelSelect
                id={`${id}-vision`}
                value={policy.vision}
                options={data.models}
                task="import"
                noneLabel={t("ai.models.visionDefault")}
                onChange={(vision) => change({ vision })}
              />
            </ModelRow>
          </div>
        </PolicySection>

        <PolicySection title={t("ai.policy.ownKeysTitle")}>
          <FieldGroup>
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
        </PolicySection>
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

/**
 * One part of the policy: its title and a line saying how it's set, so the
 * card reads without opening anything, a control beside it, and the detail
 * under it.
 */
function PolicySection({
  title,
  summary,
  control,
  children,
}: {
  title: string
  summary?: string
  control?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section className="grid gap-4 border-t py-5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-sans text-sm font-medium">{title}</h3>
          {summary && (
            <p className="text-xs text-muted-foreground">{summary}</p>
          )}
        </div>
        {control}
      </div>
      {children}
    </section>
  )
}

/** How many households the server's keys cover, as the policy stands. */
function coveredCount(policy: AiPolicy, households: ServerAi["households"]) {
  switch (policy.serverKeysFor) {
    case "all":
      return households.length
    case "none":
      return 0
    case "chosen":
      return policy.households.length
    case "admins":
      return households.filter((household) => household.serverAdmin).length
  }
}

/**
 * The models on offer by provider, in the order they come: Claude, OpenAI
 * and Gemini by their provider's name, and a model on an address under the
 * address's name, labelled by the model alone.
 */
function groupModels(models: ServerAi["models"], addressName: string) {
  const groups: { name: string; models: { ref: string; label: string }[] }[] =
    []
  for (const model of models) {
    const provider = model.ref.split(":")[0] as keyof typeof PROVIDER_NAMES
    const known = provider !== "openai-compatible" && provider in PROVIDER_NAMES
    const at = model.name.indexOf(": ")
    const name = known
      ? PROVIDER_NAMES[provider]
      : at > 0
        ? model.name.slice(0, at)
        : addressName
    const label = !known && at > 0 ? model.name.slice(at + 2) : model.name
    let group = groups.find((each) => each.name === name)
    if (!group) {
      group = { name, models: [] }
      groups.push(group)
    }
    group.models.push({ ref: model.ref, label })
  }
  return groups
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
