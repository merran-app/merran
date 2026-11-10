import { HugeiconsIcon } from "@hugeicons/react"
import { RoboticIcon } from "@hugeicons/core-free-icons"
import { AI_TASKS } from "@merran/shared"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

import { householdAiQuery, type HouseholdAi } from "../queries"
import { BarList, Initials } from "../spend/bar-list"
import { lastSixMonths, type SpendMonth } from "../spend/months"
import { MonthsChart } from "../spend/months-chart"
import { SpendMeter } from "../spend/spend-meter"
import { SpendTotal } from "../spend/spend-total"

/**
 * Settings → AI: what AI has cost the household this month and before, on
 * whose keys, against which limits, and on what and for whom.
 */
export function HouseholdAiSpendCard() {
  const { t } = useTranslation()
  const { data } = useQuery(householdAiQuery)

  if (!data) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    )
  }

  const current = data.status.month
  const months = lastSixMonths(spendMonths(data), current)
  const { server, own } = data.status
  const coveredByServer = server.hasKeys && server.covers
  const ownKeys = data.keys.length > 0 || own.spent > 0
  const nothingYet = months.every((month) => month.calls === 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("ai.spend.householdTitle")}</CardTitle>
        <CardDescription>{t("ai.spend.householdDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-8">
        <SpendTotal months={months} current={current} />

        {(coveredByServer || ownKeys) && (
          <div className="grid gap-6 sm:grid-cols-2">
            {coveredByServer && (
              <SpendMeter
                label={t("ai.household.serverKeys")}
                spent={server.spent}
                limit={server.limit}
                series="server"
                near={server.near}
              />
            )}
            {ownKeys && (
              <SpendMeter
                label={t("ai.household.ownKeys")}
                spent={own.spent}
                limit={own.limit}
                series="own"
                near={own.near}
              />
            )}
          </div>
        )}

        {nothingYet ? (
          <p className="text-sm text-muted-foreground">
            {t("ai.spend.nothingYet")}
          </p>
        ) : (
          <>
            <MonthsChart months={months} current={current} showOwn={ownKeys} />
            <div className="grid gap-8 sm:grid-cols-2">
              <BarList
                title={t("ai.spend.byTask")}
                items={data.usage.tasks.map((task) => ({
                  key: task.task,
                  label: t(
                    `ai.tasks.${task.task as (typeof AI_TASKS)[number]}`
                  ),
                  cost: task.cost,
                }))}
              />
              <BarList
                title={t("ai.spend.byPerson")}
                items={data.usage.people.map((person) => ({
                  key: person.userId ?? "background",
                  label: person.name ?? t("ai.spend.background"),
                  cost: person.cost,
                  lead: person.name ? (
                    <Initials name={person.name} />
                  ) : (
                    <BackgroundWork />
                  ),
                }))}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** The household's months, in the shape the spend pieces share. */
function spendMonths(data: HouseholdAi): SpendMonth[] {
  return data.usage.months.map((month) => ({
    month: month.month,
    server: month.server,
    own: month.household,
    calls: month.calls,
  }))
}

/** In place of initials, for AI no one asked for directly. */
function BackgroundWork() {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted"
    >
      <HugeiconsIcon icon={RoboticIcon} strokeWidth={2} className="size-3.5" />
    </span>
  )
}
